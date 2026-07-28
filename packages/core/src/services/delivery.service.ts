/**
 * Delivery Service — hybrid (Engine + local)
 *
 * The delivery *record* lifecycle (create / fetch / status / confirm) runs on
 * the Yaatal Engine via `client.delivery` — one delivery row per order, with the
 * Engine owning the status state machine and escrow release on confirmation.
 *
 * Marketplace features that the Engine does not model yet stay on their current
 * (PocketBase) backing until the Engine delivery-marketplace lands:
 *   - merchant delivery preferences        (getMerchantPreferences/update…)
 *   - individual driver pool + signup       (getAvailableDeliveryPersons,
 *                                            registerDeliveryPerson)
 *   - quotes / distance pricing             (getDeliveryQuote)
 *   - driver assignment                     (assignDelivery)
 * These are the seams that become Engine capabilities (provider registry,
 * driver entity + KYC, assignment, quotes) — see the delivery-marketplace plan.
 */

import { pb } from '../lib/pocketbase'
import { getYaatalClient } from './engine.client'
import type {
  Delivery as EngineDelivery,
  DeliveryStatus as EngineDeliveryStatus,
} from '@yaatal/client'
import type {
  DeliveryRequest,
  DeliveryMethod,
  DeliveryStatus,
  DeliveryPerson,
  DeliveryQuote,
  MerchantDeliveryPreferences,
} from '../types/delivery'

// ---------------------------------------------------------------------------
// Engine <-> BOBO mapping
// ---------------------------------------------------------------------------

const toEngineStatus = (status: DeliveryStatus): EngineDeliveryStatus => {
  switch (status) {
    case 'pending_dispatch':
      return 'requested'
    case 'assigned':
    case 'customer_pickup_scheduled':
      return 'accepted'
    case 'picked_up':
      return 'picked_up'
    case 'in_transit':
      return 'in_transit'
    case 'delivered':
    case 'customer_pickup_completed':
      return 'delivered'
    case 'failed':
      return 'failed'
    case 'cancelled':
      return 'cancelled'
    default:
      return 'requested'
  }
}

const fromEngineStatus = (status: EngineDeliveryStatus): DeliveryStatus => {
  switch (status) {
    case 'requested':
      return 'pending_dispatch'
    case 'accepted':
      return 'assigned'
    case 'picked_up':
      return 'picked_up'
    case 'in_transit':
      return 'in_transit'
    case 'delivered':
      return 'delivered'
    case 'failed':
      return 'failed'
    case 'cancelled':
      return 'cancelled'
    default:
      return 'pending_dispatch'
  }
}

const mapEngineDelivery = (d: EngineDelivery): DeliveryRequest => ({
  id: d.id,
  order_id: d.order_id,
  // Engine models seller_id; BOBO's DeliveryRequest calls it merchant_id.
  merchant_id: d.seller_id,
  delivery_method: (d.method as DeliveryMethod) || 'bobo_managed',
  delivery_status: fromEngineStatus(d.status),
  pickup_address: d.pickup_address || '',
  dropoff_address: d.dropoff_address || '',
  dropoff_coordinates:
    d.dropoff_lat != null && d.dropoff_lng != null
      ? { lat: d.dropoff_lat, lng: d.dropoff_lng }
      : undefined,
  delivery_notes: d.notes || undefined,
  delivered_at: d.confirmed_at || undefined,
  created_at: d.created_at,
  updated_at: d.updated_at,
})

export class DeliveryService {
  // -------------------------------------------------------------------------
  // Delivery record lifecycle — ENGINE-backed (client.delivery)
  // -------------------------------------------------------------------------

  /**
   * Create the Engine delivery record for an order. The delivery method is
   * still chosen from the merchant's (local) preferences; the record itself is
   * persisted on the Engine, which owns status + escrow release.
   */
  async createDeliveryRequest(
    orderId: string,
    merchantId: string,
    orderDetails: {
      pickupAddress: string
      dropoffAddress: string
      pickupCoordinates?: { lat: number; lng: number }
      dropoffCoordinates?: { lat: number; lng: number }
      deliveryNotes?: string
      phoneNumber?: string
    }
  ): Promise<{ success: boolean; deliveryRequest?: DeliveryRequest; error?: string }> {
    try {
      const preferences = await this.getMerchantPreferences(merchantId)
      const deliveryMethod = this.determineDeliveryMethod(preferences, orderDetails)

      const engineDelivery = await getYaatalClient().delivery.create({
        order_id: orderId,
        method: deliveryMethod,
        pickup_address: orderDetails.pickupAddress,
        dropoff_address: orderDetails.dropoffAddress,
        dropoff_lat: orderDetails.dropoffCoordinates?.lat,
        dropoff_lng: orderDetails.dropoffCoordinates?.lng,
        phone_number: orderDetails.phoneNumber,
        notes: orderDetails.deliveryNotes,
      })

      return { success: true, deliveryRequest: mapEngineDelivery(engineDelivery) }
    } catch (error) {
      console.error('Create delivery request error:', error)
      return {
        success: false,
        error: 'Erreur lors de la création de la demande de livraison',
      }
    }
  }

  /**
   * Update the Engine delivery status. Live GPS location is not persisted by
   * the Engine yet (marketplace phase); the `location` arg is accepted for
   * call-site compatibility but not sent.
   */
  async updateDeliveryStatus(
    deliveryId: string,
    status: 'picked_up' | 'in_transit' | 'delivered' | 'failed',
    _location?: { lat: number; lng: number }
  ): Promise<{ success: boolean; error?: string }> {
    try {
      await getYaatalClient().delivery.updateStatus(deliveryId, {
        status: toEngineStatus(status),
      })
      return { success: true }
    } catch (error) {
      console.error('Update delivery status error:', error)
      return {
        success: false,
        error: 'Erreur lors de la mise à jour du statut de livraison',
      }
    }
  }

  /**
   * Confirm receipt (buyer or delivery-code flow). On the Engine this closes
   * the order and releases escrow to the merchant.
   */
  async confirmDelivery(
    deliveryId: string,
    proofNote?: string
  ): Promise<{ success: boolean; deliveryRequest?: DeliveryRequest; error?: string }> {
    try {
      const confirmed = await getYaatalClient().delivery.confirm(
        deliveryId,
        proofNote ? { proof_note: proofNote } : {}
      )
      return { success: true, deliveryRequest: mapEngineDelivery(confirmed) }
    } catch (error) {
      console.error('Confirm delivery error:', error)
      return { success: false, error: 'Erreur lors de la confirmation de la livraison' }
    }
  }

  /**
   * Get the delivery record for an order (Engine).
   */
  async getDeliveryByOrder(orderId: string): Promise<DeliveryRequest | null> {
    try {
      const list = await getYaatalClient().delivery.list({ order_id: orderId, limit: 1 })
      return list.length ? mapEngineDelivery(list[0]) : null
    } catch (error) {
      console.error('Get delivery by order error:', error)
      return null
    }
  }

  /**
   * Get delivery status for an order (Engine).
   */
  async getDeliveryStatus(orderId: string): Promise<DeliveryRequest | null> {
    return this.getDeliveryByOrder(orderId)
  }

  // -------------------------------------------------------------------------
  // Merchant preferences — LOCAL (pending Engine support)
  // -------------------------------------------------------------------------

  async getMerchantPreferences(merchantId: string): Promise<MerchantDeliveryPreferences> {
    try {
      const profile = await pb.collection('profiles').getOne(merchantId)
      return {
        default_method: profile.delivery_method || 'bobo_managed',
        preferred_carriers: profile.preferred_carriers || [],
        delivery_zones: profile.delivery_zones || [],
        pickup_available: profile.pickup_available || false,
        delivery_cost_markup: profile.delivery_cost_markup || 0,
        allow_customer_pickup: profile.allow_customer_pickup || false,
        allow_self_delivery: profile.allow_self_delivery || false,
        allow_third_party: profile.allow_third_party || false,
        pickup_location: profile.pickup_location,
        pickup_instructions: profile.pickup_instructions,
      }
    } catch (error) {
      console.error('Get merchant preferences error:', error)
      return {
        default_method: 'bobo_managed',
        preferred_carriers: [],
        delivery_zones: [],
        pickup_available: false,
        delivery_cost_markup: 0,
        allow_customer_pickup: false,
        allow_self_delivery: false,
        allow_third_party: false,
        pickup_location: undefined,
        pickup_instructions: undefined,
      }
    }
  }

  async updateMerchantPreferences(
    merchantId: string,
    preferences: Partial<MerchantDeliveryPreferences>
  ): Promise<boolean> {
    try {
      await pb.collection('profiles').update(merchantId, {
        delivery_method: preferences.default_method,
        preferred_carriers: preferences.preferred_carriers,
        delivery_zones: preferences.delivery_zones,
        pickup_available: preferences.pickup_available,
        delivery_cost_markup: preferences.delivery_cost_markup,
        allow_customer_pickup: preferences.allow_customer_pickup,
        allow_self_delivery: preferences.allow_self_delivery,
        allow_third_party: preferences.allow_third_party,
        pickup_location: preferences.pickup_location,
        pickup_instructions: preferences.pickup_instructions,
      })
      return true
    } catch (error) {
      console.error('Update merchant preferences error:', error)
      return false
    }
  }

  private determineDeliveryMethod(
    preferences: MerchantDeliveryPreferences,
    _orderDetails: unknown
  ): DeliveryMethod {
    if (
      preferences.allow_self_delivery &&
      preferences.default_method === 'merchant_self'
    ) {
      return 'merchant_self'
    }
    if (preferences.allow_third_party && preferences.preferred_carriers.length > 0) {
      return 'third_party'
    }
    return preferences.default_method || 'bobo_managed'
  }

  // -------------------------------------------------------------------------
  // Quotes — LOCAL (pending Engine support)
  // -------------------------------------------------------------------------

  async getDeliveryQuote(deliveryRequest: DeliveryRequest): Promise<DeliveryQuote | null> {
    try {
      const { dropoff_coordinates, delivery_method } = deliveryRequest
      const pickup = deliveryRequest.pickup_coordinates
      if (!pickup || !dropoff_coordinates) {
        return null
      }

      const distance = this.calculateDistance(
        pickup.lat,
        pickup.lng,
        dropoff_coordinates.lat,
        dropoff_coordinates.lng
      )

      let cost = 500 // Base cost in CFA
      let time = 30 // Base time in minutes

      switch (delivery_method) {
        case 'bobo_managed':
          cost += Math.round(distance * 10)
          time += Math.round(distance * 2)
          break
        case 'merchant_self':
          cost = 0
          time += Math.round(distance * 2)
          break
        case 'third_party':
          cost += Math.round(distance * 12)
          time += Math.round(distance * 2)
          break
        case 'customer_pickup':
          cost = 0
          time = 5
          break
      }

      return { delivery_method, estimated_cost: cost, estimated_time: time }
    } catch (error) {
      console.error('Get delivery quote error:', error)
      return null
    }
  }

  private calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371
    const dLat = this.toRad(lat2 - lat1)
    const dLon = this.toRad(lon2 - lon1)
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRad(lat1)) *
        Math.cos(this.toRad(lat2)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2)
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
    return R * c
  }

  private toRad(degrees: number): number {
    return (degrees * Math.PI) / 180
  }

  // -------------------------------------------------------------------------
  // Driver pool + assignment — LOCAL (pending Engine driver entity)
  //
  // These operate on the local driver pool. They are NOT yet linked to the
  // Engine delivery record — assignment/driver-KYC become Engine capabilities
  // in the delivery-marketplace phase, at which point these re-point at the SDK.
  // -------------------------------------------------------------------------

  async assignDelivery(
    deliveryId: string,
    deliveryPersonId: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const deliveryPerson = (await pb
        .collection('delivery_persons')
        .getOne(deliveryPersonId)) as unknown as DeliveryPerson

      // Reflect the assignment on the Engine delivery record (status -> accepted).
      // The person link itself is not persisted by the Engine yet.
      await getYaatalClient().delivery.updateStatus(deliveryId, { status: 'accepted' })

      await this.notifyDeliveryPerson(deliveryPerson, { id: deliveryId })
      return { success: true }
    } catch (error) {
      console.error('Assign delivery error:', error)
      return { success: false, error: "Erreur lors de l'assignation de la livraison" }
    }
  }

  private async notifyDeliveryPerson(deliveryPerson: DeliveryPerson, delivery: { id: string }) {
    // TODO: real SMS/WhatsApp notification (Africa's Talking / Twilio / WhatsApp Business).
    console.log(
      `Notifying delivery person ${deliveryPerson.name} about delivery ${delivery.id}`
    )
  }

  async getAvailableDeliveryPersons(zone: string): Promise<DeliveryPerson[]> {
    try {
      const result = await pb.collection('delivery_persons').getFullList({
        filter: `zone = "${zone}" && active = true`,
      })
      return result as unknown as DeliveryPerson[]
    } catch (error) {
      console.error('Get available delivery persons error:', error)
      return []
    }
  }

  /**
   * Individual driver self-signup. Local for now; becomes an Engine driver
   * entity (with KYC + approval) in the delivery-marketplace phase.
   */
  async registerDeliveryPerson(
    personData: Omit<DeliveryPerson, 'id' | 'created_at' | 'updated_at' | 'rating' | 'active'>
  ): Promise<{ success: boolean; deliveryPerson?: DeliveryPerson; error?: string }> {
    try {
      const deliveryPersonData = {
        ...personData,
        rating: 0,
        active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
      const result = await pb.collection('delivery_persons').create(deliveryPersonData)
      return { success: true, deliveryPerson: result as unknown as DeliveryPerson }
    } catch (error) {
      console.error('Register delivery person error:', error)
      return { success: false, error: "Erreur lors de l'enregistrement du livreur" }
    }
  }
}

// Export singleton instance
export const deliveryService = new DeliveryService()

/**
 * Delivery Service — hybrid (Engine + stubs)
 *
 * The delivery *record* lifecycle (create / fetch / status / confirm) runs on
 * the Yaatal Engine via `client.delivery` — one delivery row per order, with the
 * Engine owning the status state machine and escrow release on confirmation.
 *
 * Marketplace features that the Engine does not model yet are stubbed:
 *   - merchant delivery preferences        (getMerchantPreferences/update…)
 *   - individual driver pool + signup       (getAvailableDeliveryPersons,
 *                                            registerDeliveryPerson)
 *   - quotes / distance pricing             (getDeliveryQuote)
 *   - driver assignment                     (assignDelivery)
 * These are the seams that become Engine capabilities (provider registry,
 * driver entity + KYC, assignment, quotes) — see the delivery-marketplace plan.
 */

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

function toEngineStatus(
  status: 'picked_up' | 'in_transit' | 'delivered' | 'failed'
): EngineDeliveryStatus {
  const map: Record<string, EngineDeliveryStatus> = {
    picked_up: 'picked_up',
    in_transit: 'in_transit',
    delivered: 'delivered',
    failed: 'failed',
  }
  return map[status] ?? 'pending'
}

function mapEngineDelivery(d: EngineDelivery): DeliveryRequest {
  return {
    id: d.id,
    order_id: d.order_id,
    merchant_id: d.merchant_id ?? '',
    delivery_method: (d.method ?? 'bobo_managed') as DeliveryMethod,
    delivery_status: (d.status ?? 'pending_dispatch') as DeliveryStatus,
    delivery_person_id: d.delivery_person_id,
    delivery_person_name: d.delivery_person_name,
    delivery_person_phone: d.delivery_person_phone,
    pickup_address: d.pickup_address,
    dropoff_address: d.dropoff_address,
    pickup_coordinates: d.pickup_coordinates,
    dropoff_coordinates: d.dropoff_coordinates,
    delivery_cost: d.delivery_cost,
    delivery_notes: d.notes,
    assigned_at: d.assigned_at,
    picked_up_at: d.picked_up_at,
    delivered_at: d.delivered_at,
    delivery_tracking_url: d.delivery_tracking_url,
    created_at: d.created_at,
    updated_at: d.updated_at,
  } as DeliveryRequest
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class DeliveryService {
  // -------------------------------------------------------------------------
  // Delivery record lifecycle — ENGINE-backed (client.delivery)
  // -------------------------------------------------------------------------

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
      const engineDelivery = await getYaatalClient().delivery.create({
        order_id: orderId,
        method: 'bobo_managed',
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

  async getDeliveryByOrder(orderId: string): Promise<DeliveryRequest | null> {
    try {
      const list = await getYaatalClient().delivery.list({ order_id: orderId, limit: 1 })
      return list.length ? mapEngineDelivery(list[0]) : null
    } catch (error) {
      console.error('Get delivery by order error:', error)
      return null
    }
  }

  async getDeliveryStatus(orderId: string): Promise<DeliveryRequest | null> {
    return this.getDeliveryByOrder(orderId)
  }

  // -------------------------------------------------------------------------
  // Merchant preferences — STUB (pending Engine support)
  // -------------------------------------------------------------------------

  async getMerchantPreferences(_merchantId: string): Promise<MerchantDeliveryPreferences> {
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

  async updateMerchantPreferences(
    _merchantId: string,
    _preferences: Partial<MerchantDeliveryPreferences>
  ): Promise<boolean> {
    throw new Error('DeliveryService.updateMerchantPreferences: pending Engine integration')
  }

  // -------------------------------------------------------------------------
  // Quotes — STUB (pending Engine support)
  // -------------------------------------------------------------------------

  async getDeliveryQuote(_deliveryRequest: DeliveryRequest): Promise<DeliveryQuote | null> {
    throw new Error('DeliveryService.getDeliveryQuote: pending Engine integration')
  }

  // -------------------------------------------------------------------------
  // Driver pool + assignment — STUB (pending Engine driver entity)
  // -------------------------------------------------------------------------

  async assignDelivery(
    _deliveryId: string,
    _deliveryPersonId: string
  ): Promise<{ success: boolean; error?: string }> {
    throw new Error('DeliveryService.assignDelivery: pending Engine integration')
  }

  async getAvailableDeliveryPersons(_zone: string): Promise<DeliveryPerson[]> {
    return []
  }

  async registerDeliveryPerson(
    _personData: Omit<DeliveryPerson, 'id' | 'created_at' | 'updated_at' | 'rating' | 'active'>
  ): Promise<{ success: boolean; deliveryPerson?: DeliveryPerson; error?: string }> {
    throw new Error('DeliveryService.registerDeliveryPerson: pending Engine integration')
  }
}

// Export singleton instance
export const deliveryService = new DeliveryService()
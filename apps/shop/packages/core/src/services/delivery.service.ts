/**
 * Delivery Service
 * Hybrid delivery system for BOBO platform
 */

import { pb } from '../lib/pocketbase'
import type {
  DeliveryRequest,
  DeliveryPerson,
  DeliveryZone,
  DeliveryAssignment,
  DeliveryQuote,
  MerchantDeliveryPreferences,
  Order
} from '../types/delivery'
import type { Profile } from '../types/models'

export class DeliveryService {
  /**
   * Get merchant delivery preferences
   */
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
      // Default preferences
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

  /**
   * Update merchant delivery preferences
   */
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

  /**
   * Create delivery request based on order and merchant preferences
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
    }
  ): Promise<{ success: boolean; deliveryRequest?: DeliveryRequest; error?: string }> {
    try {
      // Get merchant preferences to determine delivery method
      const preferences = await this.getMerchantPreferences(merchantId)

      // Determine delivery method based on preferences and order details
      const deliveryMethod = this.determineDeliveryMethod(preferences, orderDetails)

      // Create delivery request
      const deliveryRequest: Partial<DeliveryRequest> = {
        order_id: orderId,
        merchant_id: merchantId,
        delivery_method: deliveryMethod,
        delivery_status: 'pending_dispatch',
        pickup_address: orderDetails.pickupAddress,
        dropoff_address: orderDetails.dropoffAddress,
        pickup_coordinates: orderDetails.pickupCoordinates,
        dropoff_coordinates: orderDetails.dropoffCoordinates,
        delivery_notes: orderDetails.deliveryNotes,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }

      // Calculate delivery cost based on method
      const quote = await this.getDeliveryQuote(deliveryRequest as DeliveryRequest)
      if (quote) {
        deliveryRequest.delivery_cost = quote.estimated_cost
      }

      const result = await pb.collection('delivery_requests').create(deliveryRequest)

      // Update order with delivery information
      await pb.collection('orders').update(orderId, {
        delivery_method: deliveryMethod,
        delivery_status: 'pending_dispatch',
        delivery_cost: deliveryRequest.delivery_cost,
      })

      return {
        success: true,
        deliveryRequest: result as unknown as DeliveryRequest,
      }
    } catch (error) {
      console.error('Create delivery request error:', error)
      return {
        success: false,
        error: 'Erreur lors de la création de la demande de livraison',
      }
    }
  }

  /**
   * Determine delivery method based on merchant preferences and order details
   */
  private determineDeliveryMethod(
    preferences: MerchantDeliveryPreferences,
    orderDetails: any
  ): 'bobo_managed' | 'merchant_self' | 'third_party' | 'customer_pickup' {
    // If customer pickup is allowed and requested
    if (preferences.allow_customer_pickup) {
      // Could be based on customer selection or order type
      // For now, default to merchant preference
    }

    // If merchant prefers self delivery and is allowed
    if (preferences.allow_self_delivery && preferences.default_method === 'merchant_self') {
      return 'merchant_self'
    }

    // If merchant has preferred carriers and allows third party
    if (preferences.allow_third_party && preferences.preferred_carriers.length > 0) {
      return 'third_party'
    }

    // Default to BOBO managed
    return preferences.default_method || 'bobo_managed'
  }

  /**
   * Get delivery quote based on delivery method and locations
   */
  async getDeliveryQuote(deliveryRequest: DeliveryRequest): Promise<DeliveryQuote | null> {
    try {
      const { pickup_coordinates, dropoff_coordinates, delivery_method } = deliveryRequest

      if (!pickup_coordinates || !dropoff_coordinates) {
        return null
      }

      // Calculate distance (simplified)
      const distance = this.calculateDistance(
        pickup_coordinates.lat,
        pickup_coordinates.lng,
        dropoff_coordinates.lat,
        dropoff_coordinates.lng
      )

      // Base pricing
      let cost = 500 // Base cost in CFA
      let time = 30 // Base time in minutes

      switch (delivery_method) {
        case 'bobo_managed':
          // BOBO managed delivery pricing
          cost += Math.round(distance * 10) // 10 CFA per km
          time += Math.round(distance * 2) // 2 mins per km
          break

        case 'merchant_self':
          // Merchant self-delivery (no platform fee, but may have markup)
          cost = 0
          time += Math.round(distance * 2)
          break

        case 'third_party':
          // Third-party carrier pricing (may vary)
          cost += Math.round(distance * 12)
          time += Math.round(distance * 2)
          break

        case 'customer_pickup':
          // Customer pickup (minimal cost)
          cost = 0
          time = 5 // Just time to prepare
          break
      }

      return {
        delivery_method,
        estimated_cost: cost,
        estimated_time: time,
      }
    } catch (error) {
      console.error('Get delivery quote error:', error)
      return null
    }
  }

  /**
   * Calculate distance between two points (Haversine formula)
   */
  private calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371 // Earth's radius in km
    const dLat = this.toRad(lat2 - lat1)
    const dLon = this.toRad(lon2 - lon1)
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(this.toRad(lat1)) * Math.cos(this.toRad(lat2)) *
              Math.sin(dLon/2) * Math.sin(dLon/2)
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
    return R * c // Distance in km
  }

  private toRad(degrees: number): number {
    return degrees * Math.PI / 180
  }

  /**
   * Assign delivery to a delivery person (for BOBO managed deliveries)
   */
  async assignDelivery(
    deliveryId: string,
    deliveryPersonId: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // Get delivery person details
      const deliveryPerson = await pb.collection('delivery_persons').getOne(deliveryPersonId) as unknown as DeliveryPerson

      // Update delivery request
      await pb.collection('delivery_requests').update(deliveryId, {
        delivery_person_id: deliveryPersonId,
        delivery_person_name: deliveryPerson.name,
        delivery_person_phone: deliveryPerson.phone,
        delivery_status: 'assigned',
        assigned_at: new Date().toISOString(),
      })

      // Update order status
      const deliveryRequest = await pb.collection('delivery_requests').getOne(deliveryId)
      await pb.collection('orders').update(deliveryRequest.order_id, {
        delivery_status: 'assigned',
        delivery_person_id: deliveryPersonId,
        delivery_person_name: deliveryPerson.name,
        delivery_person_phone: deliveryPerson.phone,
      })

      // Send notification to delivery person (via SMS/WhatsApp)
      await this.notifyDeliveryPerson(deliveryPerson, deliveryRequest)

      return { success: true }
    } catch (error) {
      console.error('Assign delivery error:', error)
      return { success: false, error: 'Erreur lors de l\'assignation de la livraison' }
    }
  }

  /**
   * Notify delivery person about new delivery
   */
  private async notifyDeliveryPerson(deliveryPerson: DeliveryPerson, deliveryRequest: any) {
    // In a real implementation, this would send SMS/WhatsApp notification
    console.log(`Notifying delivery person ${deliveryPerson.name} about delivery ${deliveryRequest.id}`)

    // TODO: Implement actual SMS/WhatsApp notification
    // This could use Africa's Talking, Twilio, or WhatsApp Business API
  }

  /**
   * Update delivery status
   */
  async updateDeliveryStatus(
    deliveryId: string,
    status: 'picked_up' | 'in_transit' | 'delivered' | 'failed',
    location?: { lat: number; lng: number }
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const updates: any = {
        delivery_status: status,
        updated_at: new Date().toISOString(),
      }

      // Set specific timestamps based on status
      switch (status) {
        case 'picked_up':
          updates.picked_up_at = new Date().toISOString()
          break
        case 'delivered':
          updates.delivered_at = new Date().toISOString()
          break
      }

      // Add location if provided
      if (location) {
        updates.current_location = JSON.stringify(location)
      }

      // Update delivery request
      const deliveryRequest = await pb.collection('delivery_requests').update(deliveryId, updates)

      // Update corresponding order
      await pb.collection('orders').update(deliveryRequest.order_id, {
        delivery_status: status,
        ...(status === 'delivered' && { status: 'delivered' }),
        ...(status === 'delivered' && { delivered_at: new Date().toISOString() }),
      })

      return { success: true }
    } catch (error) {
      console.error('Update delivery status error:', error)
      return { success: false, error: 'Erreur lors de la mise à jour du statut de livraison' }
    }
  }

  /**
   * Get available delivery persons in a zone
   */
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
   * Register a new delivery person
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

      return {
        success: true,
        deliveryPerson: result as unknown as DeliveryPerson,
      }
    } catch (error) {
      console.error('Register delivery person error:', error)
      return {
        success: false,
        error: 'Erreur lors de l\'enregistrement du livreur',
      }
    }
  }

  /**
   * Get delivery request by order ID
   */
  async getDeliveryByOrder(orderId: string): Promise<DeliveryRequest | null> {
    try {
      const result = await pb.collection('delivery_requests').getFirstListItem(`order_id="${orderId}"`)
      return result as unknown as DeliveryRequest
    } catch (error) {
      console.error('Get delivery by order error:', error)
      return null
    }
  }

  /**
   * Get delivery status for an order
   */
  async getDeliveryStatus(orderId: string): Promise<DeliveryRequest | null> {
    return await this.getDeliveryByOrder(orderId)
  }
}

// Export singleton instance
export const deliveryService = new DeliveryService()
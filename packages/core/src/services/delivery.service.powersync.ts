/**
 * Delivery Service - PowerSync Version
 * Hybrid delivery system for BOBO platform with offline capability
 */

import { powerSyncService } from '../lib/powersync/service';
import type {
  DeliveryRequest,
  DeliveryPerson,
  DeliveryZone,
  DeliveryAssignment,
  DeliveryQuote,
  MerchantDeliveryPreferences,
  Order
} from '../types/delivery';
import type { Profile } from '../types/models';

export class DeliveryServicePowerSync {
  /**
   * Get merchant delivery preferences from local SQLite
   */
  async getMerchantPreferences(merchantId: string): Promise<MerchantDeliveryPreferences> {
    try {
      const query = 'SELECT * FROM profiles WHERE id = ?';
      const profiles = await powerSyncService.executeQuery<Profile>(query, [merchantId]);

      if (!profiles.length) {
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
        };
      }

      const profile = profiles[0];

      // Parse JSON fields if they exist
      const preferredCarriers = profile.preferred_carriers
        ? JSON.parse(profile.preferred_carriers as any)
        : [];
      const deliveryZones = profile.delivery_zones
        ? JSON.parse(profile.delivery_zones as any)
        : [];

      return {
        default_method: (profile.delivery_method as any) || 'bobo_managed',
        preferred_carriers: preferredCarriers,
        delivery_zones: deliveryZones,
        pickup_available: profile.pickup_available || false,
        delivery_cost_markup: profile.delivery_cost_markup || 0,
        allow_customer_pickup: profile.allow_customer_pickup || false,
        allow_self_delivery: profile.allow_self_delivery || false,
        allow_third_party: profile.allow_third_party || false,
        pickup_location: profile.pickup_location,
        pickup_instructions: profile.pickup_instructions,
      };
    } catch (error) {
      console.error('Get merchant preferences error:', error);
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
      };
    }
  }

  /**
   * Update merchant delivery preferences in local SQLite
   */
  async updateMerchantPreferences(
    merchantId: string,
    preferences: Partial<MerchantDeliveryPreferences>
  ): Promise<boolean> {
    try {
      // Build dynamic update query
      const updateFields: string[] = [];
      const updateValues: any[] = [];

      if (preferences.default_method !== undefined) {
        updateFields.push('delivery_method = ?');
        updateValues.push(preferences.default_method);
      }
      if (preferences.preferred_carriers !== undefined) {
        updateFields.push('preferred_carriers = ?');
        updateValues.push(JSON.stringify(preferences.preferred_carriers));
      }
      if (preferences.delivery_zones !== undefined) {
        updateFields.push('delivery_zones = ?');
        updateValues.push(JSON.stringify(preferences.delivery_zones));
      }
      if (preferences.pickup_available !== undefined) {
        updateFields.push('pickup_available = ?');
        updateValues.push(preferences.pickup_available ? 1 : 0);
      }
      if (preferences.delivery_cost_markup !== undefined) {
        updateFields.push('delivery_cost_markup = ?');
        updateValues.push(preferences.delivery_cost_markup);
      }
      if (preferences.allow_customer_pickup !== undefined) {
        updateFields.push('allow_customer_pickup = ?');
        updateValues.push(preferences.allow_customer_pickup ? 1 : 0);
      }
      if (preferences.allow_self_delivery !== undefined) {
        updateFields.push('allow_self_delivery = ?');
        updateValues.push(preferences.allow_self_delivery ? 1 : 0);
      }
      if (preferences.allow_third_party !== undefined) {
        updateFields.push('allow_third_party = ?');
        updateValues.push(preferences.allow_third_party ? 1 : 0);
      }
      if (preferences.pickup_location !== undefined) {
        updateFields.push('pickup_location = ?');
        updateValues.push(preferences.pickup_location);
      }
      if (preferences.pickup_instructions !== undefined) {
        updateFields.push('pickup_instructions = ?');
        updateValues.push(preferences.pickup_instructions);
      }

      if (updateFields.length === 0) {
        return true; // Nothing to update
      }

      updateFields.push('updated_at = ?');
      updateValues.push(new Date().toISOString());
      updateValues.push(merchantId); // For WHERE clause

      const query = `UPDATE profiles SET ${updateFields.join(', ')} WHERE id = ?`;
      await powerSyncService.executeWrite(query, updateValues);

      return true;
    } catch (error) {
      console.error('Update merchant preferences error:', error);
      return false;
    }
  }

  /**
   * Create delivery request based on order and merchant preferences
   */
  async createDeliveryRequest(
    orderId: string,
    merchantId: string,
    orderDetails: {
      pickupAddress: string;
      dropoffAddress: string;
      pickupCoordinates?: { lat: number; lng: number };
      dropoffCoordinates?: { lat: number; lng: number };
      deliveryNotes?: string;
    }
  ): Promise<{ success: boolean; deliveryRequest?: DeliveryRequest; error?: string }> {
    try {
      // Get merchant preferences to determine delivery method
      const preferences = await this.getMerchantPreferences(merchantId);

      // Determine delivery method based on preferences and order details
      const deliveryMethod = this.determineDeliveryMethod(preferences, orderDetails);

      // Create delivery request in local SQLite
      const deliveryId = this.generateUUID();
      const now = new Date().toISOString();

      // Calculate delivery cost based on method
      const quote = await this.getDeliveryQuote({} as DeliveryRequest);

      const insertQuery = `
        INSERT INTO delivery_requests (
          id, order_id, merchant_id, delivery_method, delivery_status,
          delivery_person_id, delivery_person_name, delivery_person_phone,
          pickup_address, dropoff_address, pickup_coordinates, dropoff_coordinates,
          delivery_cost, delivery_notes, assigned_at, picked_up_at, delivered_at,
          delivery_tracking_url, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

      await powerSyncService.executeWrite(insertQuery, [
        deliveryId,
        orderId,
        merchantId,
        deliveryMethod,
        'pending_dispatch',
        null,
        null,
        null,
        orderDetails.pickupAddress,
        orderDetails.dropoffAddress,
        orderDetails.pickupCoordinates ? JSON.stringify(orderDetails.pickupCoordinates) : null,
        orderDetails.dropoffCoordinates ? JSON.stringify(orderDetails.dropoffCoordinates) : null,
        quote?.estimated_cost || null,
        orderDetails.deliveryNotes || null,
        null,
        null,
        null,
        null,
        now,
        now,
      ]);

      // Update order with delivery information
      await powerSyncService.executeWrite(
        'UPDATE orders SET delivery_method = ?, delivery_status = ?, delivery_cost = ?, updated_at = ? WHERE id = ?',
        [deliveryMethod, 'pending_dispatch', quote?.estimated_cost || null, new Date().toISOString(), orderId]
      );

      const deliveryRequest: DeliveryRequest = {
        id: deliveryId,
        order_id: orderId,
        merchant_id: merchantId,
        delivery_method: deliveryMethod,
        delivery_status: 'pending_dispatch',
        pickup_address: orderDetails.pickupAddress,
        dropoff_address: orderDetails.dropoffAddress,
        pickup_coordinates: orderDetails.pickupCoordinates,
        dropoff_coordinates: orderDetails.dropoffCoordinates,
        delivery_cost: quote?.estimated_cost || undefined,
        delivery_notes: orderDetails.deliveryNotes,
        created_at: now,
        updated_at: now,
      };

      return {
        success: true,
        deliveryRequest,
      };
    } catch (error) {
      console.error('Create delivery request error:', error);
      return {
        success: false,
        error: 'Erreur lors de la création de la demande de livraison',
      };
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
      return 'merchant_self';
    }

    // If merchant has preferred carriers and allows third party
    if (preferences.allow_third_party && preferences.preferred_carriers.length > 0) {
      return 'third_party';
    }

    // Default to BOBO managed
    return preferences.default_method || 'bobo_managed';
  }

  /**
   * Get delivery quote based on delivery method and locations
   */
  async getDeliveryQuote(deliveryRequest: DeliveryRequest): Promise<DeliveryQuote | null> {
    try {
      const { pickup_coordinates, dropoff_coordinates, delivery_method } = deliveryRequest;

      if (!pickup_coordinates || !dropoff_coordinates) {
        return null;
      }

      // Calculate distance (simplified)
      const distance = this.calculateDistance(
        pickup_coordinates.lat,
        pickup_coordinates.lng,
        dropoff_coordinates.lat,
        dropoff_coordinates.lng
      );

      // Base pricing
      let cost = 500; // Base cost in CFA
      let time = 30; // Base time in minutes

      switch (delivery_method) {
        case 'bobo_managed':
          // BOBO managed delivery pricing
          cost += Math.round(distance * 10); // 10 CFA per km
          time += Math.round(distance * 2); // 2 mins per km
          break;

        case 'merchant_self':
          // Merchant self-delivery (no platform fee, but may have markup)
          cost = 0;
          time += Math.round(distance * 2);
          break;

        case 'third_party':
          // Third-party carrier pricing (may vary)
          cost += Math.round(distance * 12);
          time += Math.round(distance * 2);
          break;

        case 'customer_pickup':
          // Customer pickup (minimal cost)
          cost = 0;
          time = 5; // Just time to prepare
          break;
      }

      return {
        delivery_method,
        estimated_cost: cost,
        estimated_time: time,
      };
    } catch (error) {
      console.error('Get delivery quote error:', error);
      return null;
    }
  }

  /**
   * Calculate distance between two points (Haversine formula)
   */
  private calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371; // Earth's radius in km
    const dLat = this.toRad(lat2 - lat1);
    const dLon = this.toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRad(lat1)) * Math.cos(this.toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; // Distance in km
  }

  private toRad(degrees: number): number {
    return degrees * Math.PI / 180;
  }

  /**
   * Assign delivery to a delivery person (for BOBO managed deliveries)
   */
  async assignDelivery(
    deliveryId: string,
    deliveryPersonId: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // Get delivery person details from local SQLite
      const query = 'SELECT * FROM delivery_persons WHERE id = ?';
      const deliveryPersons = await powerSyncService.executeQuery(query, [deliveryPersonId]);

      if (!deliveryPersons.length) {
        return { success: false, error: 'Livreur non trouvé' };
      }

      const deliveryPerson = deliveryPersons[0];

      // Update delivery request
      await powerSyncService.executeWrite(
        'UPDATE delivery_requests SET delivery_person_id = ?, delivery_person_name = ?, delivery_person_phone = ?, delivery_status = ?, assigned_at = ?, updated_at = ? WHERE id = ?',
        [
          deliveryPersonId,
          deliveryPerson.name,
          deliveryPerson.phone,
          'assigned',
          new Date().toISOString(),
          new Date().toISOString(),
          deliveryId,
        ]
      );

      // Update order status
      await powerSyncService.executeWrite(
        'UPDATE orders SET delivery_status = ?, delivery_person_id = ?, delivery_person_name = ?, delivery_person_phone = ?, updated_at = ? WHERE id = ?',
        [
          'assigned',
          deliveryPersonId,
          deliveryPerson.name,
          deliveryPerson.phone,
          new Date().toISOString(),
          deliveryPerson.order_id,
        ]
      );

      // Send notification to delivery person (via SMS/WhatsApp)
      await this.notifyDeliveryPerson(deliveryPerson, deliveryId);

      return { success: true };
    } catch (error) {
      console.error('Assign delivery error:', error);
      return { success: false, error: "Erreur lors de l'assignation de la livraison" };
    }
  }

  /**
   * Notify delivery person about new delivery
   */
  private async notifyDeliveryPerson(deliveryPerson: any, deliveryId: string) {
    // In a real implementation, this would send SMS/WhatsApp notification
    console.log(`Notifying delivery person ${deliveryPerson.name} about delivery ${deliveryId}`);

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
      const updates: string[] = ['delivery_status = ?', 'updated_at = ?'];
      const updateValues: any[] = [status, new Date().toISOString()];

      // Set specific timestamps based on status
      switch (status) {
        case 'picked_up':
          updates.push('picked_up_at = ?');
          updateValues.push(new Date().toISOString());
          break;
        case 'delivered':
          updates.push('delivered_at = ?');
          updateValues.push(new Date().toISOString());
          break;
      }

      // Add location if provided
      if (location) {
        updates.push('current_location = ?');
        updateValues.push(JSON.stringify(location));
      }

      // Update delivery request
      const updateQuery = `UPDATE delivery_requests SET ${updates.join(', ')} WHERE id = ?`;
      await powerSyncService.executeWrite(updateQuery, [...updateValues, deliveryId]);

      // Update corresponding order
      if (status === 'delivered') {
        await powerSyncService.executeWrite(
          'UPDATE orders SET delivery_status = ?, status = ?, delivered_at = ?, updated_at = ? WHERE id = (SELECT order_id FROM delivery_requests WHERE id = ?)',
          [status, 'delivered', new Date().toISOString(), new Date().toISOString(), deliveryId]
        );
      } else {
        await powerSyncService.executeWrite(
          'UPDATE orders SET delivery_status = ?, updated_at = ? WHERE id = (SELECT order_id FROM delivery_requests WHERE id = ?)',
          [status, new Date().toISOString(), deliveryId]
        );
      }

      return { success: true };
    } catch (error) {
      console.error('Update delivery status error:', error);
      return { success: false, error: "Erreur lors de la mise à jour du statut de livraison" };
    }
  }

  /**
   * Get available delivery persons in a zone
   */
  async getAvailableDeliveryPersons(zone: string): Promise<DeliveryPerson[]> {
    try {
      const query = 'SELECT * FROM delivery_persons WHERE zone = ? AND active = 1';
      const result = await powerSyncService.executeQuery(query, [zone]);

      return result as unknown as DeliveryPerson[];
    } catch (error) {
      console.error('Get available delivery persons error:', error);
      return [];
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
      };

      const insertQuery = `
        INSERT INTO delivery_persons (
          name, phone, email, zone, vehicle_type, license_plate,
          id_number, rating, active, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

      const deliveryPersonId = this.generateUUID();
      await powerSyncService.executeWrite(insertQuery, [
        deliveryPersonData.name,
        deliveryPersonData.phone,
        deliveryPersonData.email || null,
        deliveryPersonData.zone,
        deliveryPersonData.vehicle_type,
        deliveryPersonData.license_plate,
        deliveryPersonData.id_number,
        deliveryPersonData.rating,
        deliveryPersonData.active ? 1 : 0,
        deliveryPersonData.created_at,
        deliveryPersonData.updated_at,
      ]);

      const deliveryPerson: DeliveryPerson = {
        id: deliveryPersonId,
        ...deliveryPersonData,
        active: true, // Convert from integer
      };

      return {
        success: true,
        deliveryPerson,
      };
    } catch (error) {
      console.error('Register delivery person error:', error);
      return {
        success: false,
        error: "Erreur lors de l'enregistrement du livreur",
      };
    }
  }

  /**
   * Get delivery request by order ID
   */
  async getDeliveryByOrder(orderId: string): Promise<DeliveryRequest | null> {
    try {
      const query = 'SELECT * FROM delivery_requests WHERE order_id = ?';
      const result = await powerSyncService.executeQuery(query, [orderId]);

      if (!result.length) {
        return null;
      }

      const delivery = result[0];
      return {
        id: delivery.id,
        order_id: delivery.order_id,
        merchant_id: delivery.merchant_id,
        delivery_method: delivery.delivery_method,
        delivery_status: delivery.delivery_status,
        pickup_address: delivery.pickup_address,
        dropoff_address: delivery.dropoff_address,
        pickup_coordinates: delivery.pickup_coordinates ? JSON.parse(delivery.pickup_coordinates as any) : undefined,
        dropoff_coordinates: delivery.dropoff_coordinates ? JSON.parse(delivery.dropoff_coordinates as any) : undefined,
        delivery_cost: delivery.delivery_cost,
        delivery_notes: delivery.delivery_notes,
        delivery_person_id: delivery.delivery_person_id,
        delivery_person_name: delivery.delivery_person_name,
        delivery_person_phone: delivery.delivery_person_phone,
        assigned_at: delivery.assigned_at,
        picked_up_at: delivery.picked_up_at,
        delivered_at: delivery.delivered_at,
        delivery_tracking_url: delivery.delivery_tracking_url,
        created_at: delivery.created_at,
        updated_at: delivery.updated_at,
      };
    } catch (error) {
      console.error('Get delivery by order error:', error);
      return null;
    }
  }

  /**
   * Get delivery status for an order
   */
  async getDeliveryStatus(orderId: string): Promise<DeliveryRequest | null> {
    return await this.getDeliveryByOrder(orderId);
  }

  /**
   * Watch delivery by order (real-time updates)
   */
  watchDeliveryByOrder(orderId: string) {
    return powerSyncService.watchQuery(
      'SELECT * FROM delivery_requests WHERE order_id = ?',
      [orderId]
    );
  }

  /**
   * Watch deliveries by merchant (real-time updates)
   */
  watchDeliveriesByMerchant(merchantId: string) {
    return powerSyncService.watchQuery(
      'SELECT * FROM delivery_requests WHERE merchant_id = ? ORDER BY created_at DESC',
      [merchantId]
    );
  }

  /**
   * Helper to generate UUID
   */
  private generateUUID(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }
}

// Export singleton instance
export const deliveryServicePowerSync = new DeliveryServicePowerSync();
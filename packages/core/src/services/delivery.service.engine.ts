/**
 * Delivery Service - Engine SDK Version
 *
 * The delivery record lifecycle (create / fetch / status / confirm) runs on
 * the Yaatal Engine via REST endpoints:
 *   POST /api/deliveries — create delivery
 *   GET  /api/deliveries — list deliveries (supports ?order_id= filter)
 *   PATCH /api/deliveries/{id}/status — update status
 *   POST /api/deliveries/confirm-by-code — confirm by NFC code
 *
 * Marketplace features that the Engine does not model yet are stubbed:
 *   - merchant delivery preferences
 *   - individual driver pool + signup
 *   - quotes / distance pricing
 *   - driver assignment
 */

import type {
  DeliveryRequest,
  DeliveryMethod,
  DeliveryStatus,
  DeliveryPerson,
  DeliveryQuote,
  MerchantDeliveryPreferences,
} from '../types/delivery'
import { engineRequest, getYaatalClient } from './engine.client'

// ---------------------------------------------------------------------------
// Engine response shapes
// ---------------------------------------------------------------------------

interface EngineDelivery {
  id: string
  order_id: string
  merchant_id?: string
  method?: string
  status?: string
  delivery_person_id?: string
  delivery_person_name?: string
  delivery_person_phone?: string
  pickup_address?: string
  dropoff_address?: string
  pickup_coordinates?: { lat: number; lng: number }
  dropoff_coordinates?: { lat: number; lng: number }
  delivery_cost?: number
  notes?: string
  assigned_at?: string
  picked_up_at?: string
  delivered_at?: string
  confirmed_at?: string
  delivery_tracking_url?: string
  created_at: string
  updated_at: string
}

interface EngineDeliveryListResponse {
  deliveries?: EngineDelivery[]
  total?: number
}

interface EngineConfirmByCodeResponse {
  confirmed: boolean
  delivery?: EngineDelivery
  message?: string
}

// ---------------------------------------------------------------------------
// Engine <-> BOBO mapping
// ---------------------------------------------------------------------------

const mapEngineDelivery = (d: EngineDelivery): DeliveryRequest => {
  return {
    id: d.id,
    order_id: d.order_id,
    merchant_id: d.merchant_id ?? '',
    delivery_method: (d.method ?? 'bobo_managed') as DeliveryMethod,
    delivery_status: (d.status ?? 'pending_dispatch') as DeliveryStatus,
    delivery_person_id: d.delivery_person_id,
    delivery_person_name: d.delivery_person_name,
    delivery_person_phone: d.delivery_person_phone,
    pickup_address: d.pickup_address ?? '',
    dropoff_address: d.dropoff_address ?? '',
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

export class DeliveryServiceEngine {
  // -------------------------------------------------------------------------
  // Delivery record lifecycle — ENGINE-backed
  // -------------------------------------------------------------------------

  async createDeliveryRequest(
    orderId: string,
    address: string,
    phone: string
  ): Promise<DeliveryRequest | null> {
    try {
      // Try SDK first
      const client = getYaatalClient()
      if ((client as any).delivery?.create) {
        const created = await (client as any).delivery.create({
          order_id: orderId,
          dropoff_address: address,
          phone_number: phone,
        })
        return mapEngineDelivery(created as EngineDelivery)
      }

      // Fallback to direct HTTP
      const response = await engineRequest<EngineDelivery>('/api/deliveries', {
        method: 'POST',
        body: JSON.stringify({
          order_id: orderId,
          dropoff_address: address,
          phone_number: phone,
        }),
      })
      return mapEngineDelivery(response)
    } catch (error) {
      console.warn('DeliveryService.createDeliveryRequest: Engine unreachable', error)
      return null
    }
  }

  async getDeliveryByOrder(orderId: string): Promise<DeliveryRequest | null> {
    try {
      // Try SDK first
      const client = getYaatalClient()
      if ((client as any).delivery?.list) {
        const list = await (client as any).delivery.list({
          order_id: orderId,
          limit: 1,
        })
        if (Array.isArray(list) && list.length > 0) {
          return mapEngineDelivery(list[0] as EngineDelivery)
        }
        return null
      }

      // Fallback to direct HTTP
      const params = new URLSearchParams({ order_id: orderId })
      const response = await engineRequest<EngineDeliveryListResponse>(
        `/api/deliveries?${params.toString()}`
      )
      const deliveries = response.deliveries || []
      if (deliveries.length > 0) {
        return mapEngineDelivery(deliveries[0])
      }
      return null
    } catch (error) {
      console.warn('DeliveryService.getDeliveryByOrder: Engine unreachable', error)
      return null
    }
  }

  async updateDeliveryStatus(
    id: string,
    status: DeliveryStatus
  ): Promise<DeliveryRequest | null> {
    try {
      // Try SDK first
      const client = getYaatalClient()
      if ((client as any).delivery?.updateStatus) {
        const updated = await (client as any).delivery.updateStatus(id, {
          status,
        })
        return mapEngineDelivery(updated as EngineDelivery)
      }

      // Fallback to direct HTTP
      const response = await engineRequest<EngineDelivery>(
        `/api/deliveries/${id}/status`,
        {
          method: 'PATCH',
          body: JSON.stringify({ status }),
        }
      )
      return mapEngineDelivery(response)
    } catch (error) {
      console.warn('DeliveryService.updateDeliveryStatus: Engine unreachable', error)
      return null
    }
  }

  async confirmDelivery(code: string): Promise<{
    confirmed: boolean
    delivery?: DeliveryRequest
    message?: string
  }> {
    try {
      // Try SDK first
      const client = getYaatalClient()
      if ((client as any).delivery?.confirmByCode) {
        const result = await (client as any).delivery.confirmByCode({
          delivery_code: code,
        })
        const response = result as EngineConfirmByCodeResponse
        return {
          confirmed: response.confirmed,
          delivery: response.delivery
            ? mapEngineDelivery(response.delivery)
            : undefined,
          message: response.message,
        }
      }

      // Fallback to direct HTTP
      const response = await engineRequest<EngineConfirmByCodeResponse>(
        '/api/deliveries/confirm-by-code',
        {
          method: 'POST',
          body: JSON.stringify({ delivery_code: code }),
        }
      )
      return {
        confirmed: response.confirmed,
        delivery: response.delivery
          ? mapEngineDelivery(response.delivery)
          : undefined,
        message: response.message,
      }
    } catch (error) {
      console.warn('DeliveryService.confirmDelivery: Engine unreachable', error)
      return { confirmed: false }
    }
  }

  async getDeliveryStatus(orderId: string): Promise<DeliveryRequest | null> {
    return this.getDeliveryByOrder(orderId)
  }

  // -------------------------------------------------------------------------
  // Marketplace stubs — pending Engine marketplace
  // -------------------------------------------------------------------------

  async getMerchantPreferences(): Promise<MerchantDeliveryPreferences> {
    throw new Error('DeliveryService.getMerchantPreferences: pending Engine marketplace')
  }

  async updateMerchantPreferences(): Promise<boolean> {
    throw new Error('DeliveryService.updateMerchantPreferences: pending Engine marketplace')
  }

  async getDeliveryQuote(): Promise<DeliveryQuote | null> {
    throw new Error('DeliveryService.getDeliveryQuote: pending Engine marketplace')
  }

  async getAvailableDeliveryPersons(): Promise<DeliveryPerson[]> {
    throw new Error('DeliveryService.getAvailableDeliveryPersons: pending Engine marketplace')
  }

  async registerDeliveryPerson(): Promise<{
    success: boolean
    deliveryPerson?: DeliveryPerson
    error?: string
  }> {
    throw new Error('DeliveryService.registerDeliveryPerson: pending Engine marketplace')
  }

  async assignDelivery(): Promise<{ success: boolean; error?: string }> {
    throw new Error('DeliveryService.assignDelivery: pending Engine marketplace')
  }
}

export const deliveryServiceEngine = new DeliveryServiceEngine()
export const deliveryService = deliveryServiceEngine
export default deliveryServiceEngine
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
 * The marketplace half runs on the Engine too, at `/api/delivery/*` (singular
 * — the plural path above is the per-package lifecycle): driver signup, the
 * driver pool, assignment, and merchant preferences. Those used to throw
 * "pending Engine marketplace" because the SDK did not expose the endpoints,
 * not because the Engine lacked them.
 *
 * Still not modelled anywhere: quotes / distance pricing. `getDeliveryQuote`
 * is the one method that still throws, and it says so.
 */

import type {
  DeliveryRequest,
  DeliveryMethod,
  DeliveryStatus,
  DeliveryPerson,
  DeliveryQuote,
  MerchantDeliveryPreferences,
} from '../types/delivery'
import type {
  DeliveryDriver as EngineDeliveryDriver,
  MerchantDeliveryPreferences as EnginePreferences,
} from '@yaatal/client'
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

  async getMerchantPreferences(): Promise<MerchantDeliveryPreferences | null> {
    const p = await getYaatalClient().delivery.preferences()
    return fromEnginePreferences(p)
  }

  async updateMerchantPreferences(
    preferences: Partial<MerchantDeliveryPreferences>,
  ): Promise<boolean> {
    // Lists are comma-joined on the wire: the Engine stores them as TEXT.
    const body: Record<string, unknown> = { ...preferences }
    if (preferences.preferred_carriers) {
      body.preferred_carriers = preferences.preferred_carriers.join(',')
    }
    if (preferences.delivery_zones) {
      body.delivery_zones = preferences.delivery_zones.join(',')
    }
    await getYaatalClient().delivery.updatePreferences(body)
    return true
  }

  /**
   * Not modelled by the Engine — there is no distance/pricing surface yet, so
   * there is nothing to call. Throws rather than returning a made-up number:
   * a quote a merchant quotes to a buyer must not be invented here.
   */
  async getDeliveryQuote(): Promise<DeliveryQuote | null> {
    throw new Error('DeliveryService.getDeliveryQuote: no Engine pricing surface yet')
  }

  async getAvailableDeliveryPersons(zone?: string): Promise<DeliveryPerson[]> {
    const { drivers } = await getYaatalClient().delivery.listDrivers(
      zone ? { zone } : {},
    )
    return drivers.map(toDeliveryPerson)
  }

  async registerDeliveryPerson(
    person: Omit<DeliveryPerson, 'id' | 'rating' | 'active' | 'created_at' | 'updated_at'>,
  ): Promise<{ success: boolean; deliveryPerson?: DeliveryPerson; error?: string }> {
    try {
      const created = await getYaatalClient().delivery.registerDriver({
        name: person.name,
        phone: person.phone,
        zone: person.zone,
        vehicle_type: person.vehicle_type,
        ...(person.email ? { email: person.email } : {}),
        ...(person.license_plate ? { license_plate: person.license_plate } : {}),
        ...(person.id_number ? { id_number: person.id_number } : {}),
      })
      return { success: true, deliveryPerson: toDeliveryPerson(created) }
    } catch (error: any) {
      return { success: false, error: error?.message ?? 'Inscription impossible' }
    }
  }

  async assignDelivery(
    deliveryId: string,
    driverId: string,
  ): Promise<{ success: boolean; error?: string }> {
    try {
      await getYaatalClient().delivery.assign({
        delivery_id: deliveryId,
        driver_id: driverId,
      })
      return { success: true }
    } catch (error: any) {
      return { success: false, error: error?.message ?? 'Assignation impossible' }
    }
  }
}


// ---------------------------------------------------------------------------
// Engine ⇄ BOBO shape mapping
// ---------------------------------------------------------------------------

/** The Engine's driver row is BOBO's `DeliveryPerson` with looser typing. */
function toDeliveryPerson(d: EngineDeliveryDriver): DeliveryPerson {
  return {
    id: d.id,
    name: d.name,
    phone: d.phone,
    ...(d.email ? { email: d.email } : {}),
    ...(d.license_plate ? { license_plate: d.license_plate } : {}),
    ...(d.id_number ? { id_number: d.id_number } : {}),
    zone: d.zone,
    rating: d.rating,
    active: d.active,
    vehicle_type: d.vehicle_type as DeliveryPerson['vehicle_type'],
    created_at: d.created_at,
    updated_at: d.updated_at,
  }
}

/** Carriers and zones are comma-joined TEXT on the wire, arrays in the app. */
function fromEnginePreferences(p: EnginePreferences): MerchantDeliveryPreferences {
  const split = (v: string) =>
    v.split(',').map((x) => x.trim()).filter(Boolean)
  return {
    default_method: p.default_method as MerchantDeliveryPreferences['default_method'],
    preferred_carriers: split(p.preferred_carriers),
    delivery_zones: split(p.delivery_zones),
    pickup_available: p.pickup_available,
    delivery_cost_markup: p.delivery_cost_markup,
    allow_customer_pickup: p.allow_customer_pickup,
    allow_self_delivery: p.allow_self_delivery,
    allow_third_party: p.allow_third_party,
    ...(p.pickup_location ? { pickup_location: p.pickup_location } : {}),
    ...(p.pickup_instructions ? { pickup_instructions: p.pickup_instructions } : {}),
  }
}

export const deliveryServiceEngine = new DeliveryServiceEngine()
export const deliveryService = deliveryServiceEngine
export default deliveryServiceEngine
/**
 * Delivery Types
 * Defines all delivery-related types for the hybrid delivery system
 */

// Re-export Order from models for convenience
export type { Order } from './models'

export type DeliveryMethod =
  | 'bobo_managed'      // BOBO's moto riders
  | 'merchant_self'     // Merchant handles delivery
  | 'third_party'       // Third-party carrier
  | 'customer_pickup'   // Customer picks up from merchant

export type DeliveryStatus =
  | 'pending_dispatch'
  | 'assigned'
  | 'picked_up'
  | 'in_transit'
  | 'delivered'
  | 'failed'
  | 'cancelled'
  | 'customer_pickup_scheduled'
  | 'customer_pickup_completed'

export interface DeliveryPerson {
  id: string
  name: string
  phone: string
  email?: string
  license_plate?: string
  id_number?: string
  zone: string
  rating: number
  active: boolean
  vehicle_type: 'moto' | 'car' | 'truck' | 'bicycle'
  created_at: string
  updated_at: string
}

export interface DeliveryZone {
  id: string
  name: string
  coordinates: { lat: number; lng: number }[] // Polygon coordinates
  active: boolean
}

export interface DeliveryRequest {
  id: string
  order_id: string
  merchant_id: string
  delivery_method: DeliveryMethod
  delivery_status: DeliveryStatus
  delivery_person_id?: string
  delivery_person_name?: string
  delivery_person_phone?: string
  pickup_address: string
  dropoff_address: string
  pickup_coordinates?: { lat: number; lng: number }
  dropoff_coordinates?: { lat: number; lng: number }
  delivery_cost?: number
  delivery_notes?: string
  assigned_at?: string
  picked_up_at?: string
  delivered_at?: string
  delivery_tracking_url?: string
  created_at: string
  updated_at: string
}

export interface DeliveryAssignment {
  delivery_id: string
  delivery_person_id: string
  assigned_at: string
  accepted_at?: string
  rejected_at?: string
  status: 'pending' | 'accepted' | 'rejected'
}

export interface DeliveryQuote {
  delivery_method: DeliveryMethod
  estimated_cost: number
  estimated_time: number // in minutes
  carrier_name?: string
  carrier_phone?: string
}

export interface MerchantDeliveryPreferences {
  default_method: DeliveryMethod
  preferred_carriers: string[]
  delivery_zones: string[]
  pickup_available: boolean
  delivery_cost_markup: number
  allow_customer_pickup: boolean
  allow_self_delivery: boolean
  allow_third_party: boolean
  pickup_location?: string
  pickup_instructions?: string
}

// Livestream QR scan tracking
export interface QRScanRecord {
  id: string
  merchant_id: string
  product_id: string
  scanned_at: string
  converted_to_sale: boolean
  order_id?: string
}

export interface ScanAnalytics {
  total_scans: number
  converted_count: number
  conversion_rate: number
  top_products: {
    product_id: string
    product_name: string
    scan_count: number
  }[]
  scans_by_date: {
    date: string
    scan_count: number
  }[]
}
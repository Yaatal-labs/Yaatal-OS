/**
 * Delivery Utilities
 * Helper functions for delivery operations
 */

import type { Product } from '../types/models'

/**
 * Get seller pickup address from product or profile
 */
export function getSellerPickupAddress(product: Product): string {
  // First try to get from product expand (if seller profile is expanded)
  if (product.expand?.seller_id) {
    const seller = product.expand.seller_id
    return `${seller.username}'s location, ${seller.phone_number || 'Dakar'}`
  }

  // Fallback to a default format
  return `Seller location for ${product.title}, Dakar`
}

/**
 * Format delivery address from shipping info
 */
export function formatDeliveryAddress(
  address: string,
  city: string,
  region: string,
  zipCode?: string
): string {
  return `${address}, ${city}, ${region}${zipCode ? `, ${zipCode}` : ''}`
}

/**
 * Calculate delivery cost based on distance and method
 */
export function calculateDeliveryCost(
  distanceKm: number,
  method: 'bobo_managed' | 'merchant_self' | 'third_party' | 'customer_pickup' = 'bobo_managed'
): number {
  switch (method) {
    case 'bobo_managed':
      return Math.round(500 + (distanceKm * 10)) // Base 500 + 10 CFA per km
    case 'merchant_self':
      return 0 // No platform fee for merchant self-delivery
    case 'third_party':
      return Math.round(500 + (distanceKm * 12)) // Base 500 + 12 CFA per km
    case 'customer_pickup':
      return 0 // No delivery cost for pickup
    default:
      return Math.round(500 + (distanceKm * 10))
  }
}

/**
 * Validate delivery coordinates
 */
export function validateCoordinates(lat: number, lng: number): boolean {
  // Basic validation for coordinates
  return (
    typeof lat === 'number' &&
    typeof lng === 'number' &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  )
}

/**
 * Get estimated delivery time based on distance
 */
export function getEstimatedDeliveryTime(distanceKm: number): number {
  // Base time + time per km (2 minutes per km in Dakar traffic)
  return Math.round(15 + (distanceKm * 2)) // 15 min base + 2 min per km
}

/**
 * Get delivery status display text
 */
export function getDeliveryStatusText(status: string): string {
  const statusMap: Record<string, string> = {
    pending_dispatch: 'En attente de livraison',
    assigned: 'Assigné au livreur',
    picked_up: 'Récupéré par le livreur',
    in_transit: 'En cours de livraison',
    delivered: 'Livrée',
    failed: 'Échec de la livraison',
    customer_pickup_scheduled: 'Prêt pour retrait',
    customer_pickup_completed: 'Retiré par client',
  }

  return statusMap[status] || status
}

/**
 * Get delivery status color
 */
export function getDeliveryStatusColor(status: string): string {
  const colorMap: Record<string, string> = {
    pending_dispatch: '#F2A541', // Orange
    assigned: '#3B82F6',         // Blue
    picked_up: '#1D4ED8',        // Dark blue
    in_transit: '#2563EB',       // Blue
    delivered: '#10B981',        // Green
    failed: '#EF4444',           // Red
    customer_pickup_scheduled: '#8B5CF6', // Purple
    customer_pickup_completed: '#A78BFA', // Light purple
  }

  return colorMap[status] || '#6B7280' // Gray default
}

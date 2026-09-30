/**
 * Formatting Utilities
 * Format currency, dates, numbers for BOBO
 */

import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import 'dayjs/locale/fr'

// Configure dayjs
dayjs.extend(relativeTime)
dayjs.locale('fr')

// Format CFA currency
export const formatCFA = (amount: number, showSymbol: boolean = true): string => {
  const formatted = new Intl.NumberFormat('fr-SN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)

  return showSymbol ? `${formatted} CFA` : formatted
}

// Format price with discount
export const formatPriceWithDiscount = (
  price: number,
  discountPrice?: number
): {
  original: string
  discounted?: string
  hasDiscount: boolean
  savings?: string
  savingsPercent?: number
} => {
  const hasDiscount = discountPrice != null && discountPrice < price

  if (!hasDiscount) {
    return {
      original: formatCFA(price),
      hasDiscount: false,
    }
  }

  const savings = price - discountPrice!
  const savingsPercent = Math.round((savings / price) * 100)

  return {
    original: formatCFA(price),
    discounted: formatCFA(discountPrice!),
    hasDiscount: true,
    savings: formatCFA(savings),
    savingsPercent,
  }
}

// Format relative time (e.g., "il y a 2 heures")
export const formatRelativeTime = (date: string | Date): string => {
  return dayjs(date).fromNow()
}

// Format absolute date
export const formatDate = (
  date: string | Date,
  format: string = 'DD MMM YYYY'
): string => {
  return dayjs(date).format(format)
}

// Format date and time
export const formatDateTime = (
  date: string | Date,
  format: string = 'DD MMM YYYY à HH:mm'
): string => {
  return dayjs(date).format(format)
}

// Format phone number for display
export const formatPhoneNumber = (phone: string): string => {
  // Remove all non-digit characters
  const cleaned = phone.replace(/\D/g, '')

  // Senegal format: +221 XX XXX XX XX
  if (cleaned.startsWith('221')) {
    const withoutCode = cleaned.substring(3)
    return `+221 ${withoutCode.substring(0, 2)} ${withoutCode.substring(
      2,
      5
    )} ${withoutCode.substring(5, 7)} ${withoutCode.substring(7)}`
  }

  // Local format: XX XXX XX XX
  if (cleaned.length === 9) {
    return `${cleaned.substring(0, 2)} ${cleaned.substring(
      2,
      5
    )} ${cleaned.substring(5, 7)} ${cleaned.substring(7)}`
  }

  return phone
}

// Format number with abbreviation (e.g., 1000 -> 1K)
export const formatNumberAbbreviated = (num: number): string => {
  if (num >= 1000000) {
    return `${(num / 1000000).toFixed(1)}M`
  }
  if (num >= 1000) {
    return `${(num / 1000).toFixed(1)}K`
  }
  return num.toString()
}

// Format duration (for voice messages)
export const formatDuration = (seconds: number): string => {
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

// Format file size
export const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// Truncate text with ellipsis
export const truncateText = (
  text: string,
  maxLength: number,
  suffix: string = '...'
): string => {
  if (text.length <= maxLength) return text
  return text.substring(0, maxLength - suffix.length) + suffix
}

// Pluralize (French)
export const pluralize = (
  count: number,
  singular: string,
  plural: string
): string => {
  return count <= 1 ? singular : plural
}

// Format order status for display
export const formatOrderStatus = (
  status: string
): { label: string; color: string } => {
  const statusMap: Record<string, { label: string; color: string }> = {
    pending_payment: { label: 'En attente de paiement', color: '#F2A541' },
    paid: { label: 'Payé', color: '#1B4D3E' },
    processing: { label: 'En préparation', color: '#2D3561' },
    shipped: { label: 'Expédié', color: '#2D3561' },
    delivered: { label: 'Livré', color: '#1B4D3E' },
    cancelled: { label: 'Annulé', color: '#B8563E' },
    disputed: { label: 'Litige', color: '#B8563E' },
  }

  return statusMap[status] || { label: status, color: '#A0AEC0' }
}

// Format payment method
export const formatPaymentMethod = (method: string): string => {
  const methodMap: Record<string, string> = {
    // PI-SPI reaches every UEMOA wallet, so it is named for what the buyer
    // recognises rather than for the rail.
    pispi: 'Mobile money',
    wave: 'Wave',
    cash: 'Paiement à la livraison',
  }

  return methodMap[method] || method
}

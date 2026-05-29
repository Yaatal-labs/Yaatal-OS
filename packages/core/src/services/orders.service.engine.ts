/**
 * Orders Service - Engine HTTP Version
 */

import { validatePhoneNumber } from '../utils/validation'
import type { Order, Product } from '../types/models'
import { engineRequest } from './engine.client'

export interface ShippingInfo {
  address: string
  city: string
  region: string
  zipCode?: string
  phoneNumber: string
}

type EngineOrderItem = {
  id: string
  product_id: string
  quantity: number
  unit_price_cents: number
}

type EngineOrder = {
  id: string
  buyer_id: string
  seller_id: string
  status: string
  payment_method: string
  payment_status: string
  delivery_method: string
  total_cents: number
  items: EngineOrderItem[]
  created_at: string
  updated_at?: string | null
}

type EngineOrderList = {
  orders: EngineOrder[]
  total: number
  page: number
  per_page: number
}

type BoboOrderDto = {
  id: string
  engine_order_id: string
  bobo_order_id: number
  buyer_id: string
  seller_id: string
  product_id: string
  quantity: number
  unit_price: number
  total_price: number
  status: Order['status']
  payment_method: 'wave' | 'cash'
  payment_reference?: string
  shipping_address?: string
  phone_number?: string
  created: string
  updated: string
}

export type EngineCheckoutPayment = {
  method: string
  status: string
  rail: string
  provider_ref: string
  idempotency_key: string
  amount_xof: number
  redirect_url?: string | null
}

type CheckoutResponse = {
  success: boolean
  order: BoboOrderDto
  payment: EngineCheckoutPayment
}

const formatShippingAddress = (shippingInfo: ShippingInfo): string => {
  return `${shippingInfo.address}, ${shippingInfo.city}, ${shippingInfo.region}${
    shippingInfo.zipCode ? `, ${shippingInfo.zipCode}` : ''
  }`
}

const mapEngineStatusToBobo = (
  status: string,
  paymentStatus: string
): Order['status'] => {
  if (status === 'cancelled' || paymentStatus === 'failed') return 'cancelled'
  if (status === 'shipped') return 'shipped'
  if (status === 'delivered') return 'delivered'
  if (status === 'confirmed') return 'processing'
  if (paymentStatus === 'paid') return 'paid'
  return 'pending_payment'
}

const minimalProduct = (item?: EngineOrderItem): Product | undefined => {
  if (!item) return undefined
  const now = new Date().toISOString()

  return {
    id: item.product_id,
    seller_id: '',
    sku: `ENGINE-${item.product_id.slice(0, 8)}`,
    title: 'Produit BOBO',
    description: '',
    price: item.unit_price_cents,
    category: 'other',
    image_url: '',
    stock_quantity: 0,
    upvotes: 0,
    view_count: 0,
    is_featured: false,
    is_active: true,
    created: now,
    updated: now,
  }
}

export const mapEngineOrderToOrder = (engineOrder: EngineOrder): Order => {
  const item = engineOrder.items[0]
  const quantity = item?.quantity || 0
  const unitPrice = item?.unit_price_cents || engineOrder.total_cents
  const updated = engineOrder.updated_at || engineOrder.created_at

  return {
    id: engineOrder.id,
    buyer_id: engineOrder.buyer_id,
    seller_id: engineOrder.seller_id,
    product_id: item?.product_id || '',
    quantity,
    unit_price: unitPrice,
    total_price: engineOrder.total_cents,
    status: mapEngineStatusToBobo(engineOrder.status, engineOrder.payment_status),
    payment_method: engineOrder.payment_method as Order['payment_method'],
    shipping_address: undefined,
    phone_number: '',
    delivery_method: engineOrder.delivery_method as Order['delivery_method'],
    delivery_status: engineOrder.status === 'shipped' ? 'in_transit' : 'pending_dispatch',
    created: engineOrder.created_at,
    updated,
    expand: {
      buyer_id: {
        id: engineOrder.buyer_id,
        user_id: engineOrder.buyer_id,
        username: 'Client BOBO',
        is_merchant: false,
        level: 1,
        xp: 0,
        streak_days: 0,
        total_posts: 0,
        total_sales: 0,
        created: engineOrder.created_at,
        updated,
      },
      seller_id: {
        id: engineOrder.seller_id,
        user_id: engineOrder.seller_id,
        username: 'Vendeur BOBO',
        is_merchant: true,
        level: 1,
        xp: 0,
        streak_days: 0,
        total_posts: 0,
        total_sales: 0,
        created: engineOrder.created_at,
        updated,
      },
      product_id: minimalProduct(item),
    },
  }
}

const mapBoboCheckoutOrder = (order: BoboOrderDto): Order => {
  return {
    id: order.id,
    engine_order_id: order.engine_order_id,
    bobo_order_id: order.bobo_order_id,
    buyer_id: order.buyer_id,
    seller_id: order.seller_id,
    product_id: order.product_id,
    quantity: order.quantity,
    unit_price: order.unit_price,
    total_price: order.total_price,
    status: order.status,
    payment_method: order.payment_method,
    payment_reference: order.payment_reference,
    shipping_address: order.shipping_address,
    phone_number: order.phone_number || '',
    delivery_method: 'bobo_managed',
    delivery_status: 'pending_dispatch',
    created: order.created,
    updated: order.updated,
  } as Order
}

const pageFromOrders = (response: EngineOrderList) => ({
  items: response.orders.map(mapEngineOrderToOrder),
  totalItems: response.total,
  totalPages: Math.ceil(response.total / response.per_page),
})

const mapBoboStatusToEngine = (status: Order['status']): string => {
  if (status === 'processing' || status === 'paid') return 'confirmed'
  return status
}

export class OrdersServiceEngine {
  async createOrder(
    buyerId: string,
    sellerId: string,
    productId: string,
    quantity: number,
    shippingInfo: ShippingInfo,
    paymentMethod: 'wave' | 'orange_money' | 'cash'
  ): Promise<{
    success: boolean
    order?: Order
    payment?: EngineCheckoutPayment
    error?: string
  }> {
    try {
      if (!buyerId || !sellerId || !productId) {
        return { success: false, error: 'IDs manquants' }
      }

      if (quantity <= 0) {
        return { success: false, error: 'Quantité invalide' }
      }

      if (paymentMethod === 'orange_money') {
        return { success: false, error: 'Orange Money sera activé dans une prochaine version' }
      }

      const phoneValidation = validatePhoneNumber(shippingInfo.phoneNumber)
      if (!phoneValidation.valid) {
        return { success: false, error: phoneValidation.error }
      }

      if (!shippingInfo.address?.trim()) {
        return { success: false, error: 'Adresse requise' }
      }

      if (!shippingInfo.city?.trim()) {
        return { success: false, error: 'Ville requise' }
      }

      const response = await engineRequest<CheckoutResponse>('/api/bobo/checkout', {
        method: 'POST',
        body: JSON.stringify({
          buyer_id: buyerId,
          seller_id: sellerId,
          product_id: productId,
          quantity,
          payment_method: paymentMethod,
          shipping_address: formatShippingAddress(shippingInfo),
          phone_number: shippingInfo.phoneNumber,
          payer_msisdn: shippingInfo.phoneNumber,
        }),
      })

      return {
        success: response.success,
        order: mapBoboCheckoutOrder(response.order),
        payment: response.payment,
      }
    } catch (error: any) {
      console.error('Create order error:', error)
      return {
        success: false,
        error: error?.message || 'Erreur lors de la création de la commande',
      }
    }
  }

  calculateTotal(product: Product, quantity: number): {
    unitPrice: number
    subtotal: number
    total: number
  } {
    const unitPrice = product.discount_price ?? product.price
    const subtotal = unitPrice * quantity

    return {
      unitPrice,
      subtotal,
      total: subtotal,
    }
  }

  async getOrdersByBuyer(_buyerId: string, page: number = 1, limit: number = 20) {
    try {
      const params = new URLSearchParams({
        page: String(page),
        per_page: String(limit),
      })
      const response = await engineRequest<EngineOrderList>(
        `/api/orders?${params.toString()}`
      )
      return pageFromOrders(response)
    } catch (error) {
      console.error('Get buyer orders error:', error)
      return { items: [], totalItems: 0, totalPages: 0 }
    }
  }

  async getOrdersBySeller(_sellerId: string, page: number = 1, limit: number = 20) {
    try {
      const params = new URLSearchParams({
        page: String(page),
        per_page: String(limit),
      })
      const response = await engineRequest<EngineOrderList>(
        `/api/merchant/orders?${params.toString()}`
      )
      return pageFromOrders(response)
    } catch (error) {
      console.error('Get seller orders error:', error)
      return { items: [], totalItems: 0, totalPages: 0 }
    }
  }

  async getOrderById(orderId: string): Promise<Order | undefined> {
    try {
      const response = await engineRequest<EngineOrder>(
        `/api/orders/${encodeURIComponent(orderId)}`
      )
      return mapEngineOrderToOrder(response)
    } catch (error) {
      console.error('Get order error:', error)
      return undefined
    }
  }

  async updateOrderStatus(
    orderId: string,
    status: Order['status']
  ): Promise<{
    success: boolean
    order?: Order
    error?: string
  }> {
    try {
      const response = await engineRequest<EngineOrder>(
        `/api/orders/${encodeURIComponent(orderId)}/status`,
        {
          method: 'PATCH',
          body: JSON.stringify({ status: mapBoboStatusToEngine(status) }),
        }
      )

      return {
        success: true,
        order: mapEngineOrderToOrder(response),
      }
    } catch (error: any) {
      console.error('Update order status error:', error)
      return {
        success: false,
        error: error?.message || 'Erreur lors de la mise à jour du statut',
      }
    }
  }

  async updatePaymentReference(
    orderId: string,
    paymentReference: string
  ): Promise<{
    success: boolean
    order?: Order
    error?: string
  }> {
    try {
      const response = await engineRequest<EngineOrder>(
        `/api/orders/${encodeURIComponent(orderId)}/payment`,
        {
          method: 'PATCH',
          body: JSON.stringify({ payment_status: 'paid' }),
        }
      )
      const order = mapEngineOrderToOrder(response)
      order.payment_reference = paymentReference

      return {
        success: true,
        order,
      }
    } catch (error: any) {
      console.error('Update payment reference error:', error)
      return {
        success: false,
        error: error?.message || 'Erreur lors de la mise à jour du paiement',
      }
    }
  }

  async addTrackingNumber(
    orderId: string,
    _trackingNumber: string
  ): Promise<{
    success: boolean
    order?: Order
    error?: string
  }> {
    const order = await this.getOrderById(orderId)
    return {
      success: !!order,
      order,
      error: order ? undefined : 'Commande introuvable',
    }
  }

  async cancelOrder(orderId: string, _reason?: string): Promise<{
    success: boolean
    order?: Order
    error?: string
  }> {
    try {
      const response = await engineRequest<EngineOrder>(
        `/api/orders/${encodeURIComponent(orderId)}/cancel`,
        { method: 'POST' }
      )
      return {
        success: true,
        order: mapEngineOrderToOrder(response),
      }
    } catch (error: any) {
      console.error('Cancel order error:', error)
      return {
        success: false,
        error: error?.message || 'Erreur lors de l\'annulation de la commande',
      }
    }
  }

  async getSellerStats(_sellerId: string): Promise<{
    totalOrders: number
    totalRevenue: number
    pendingOrders: number
    shippedOrders: number
  }> {
    const result = await this.getOrdersBySeller(_sellerId, 1, 100)
    const orders = result.items

    return {
      totalOrders: orders.length,
      totalRevenue: orders.reduce((sum, order) => sum + order.total_price, 0),
      pendingOrders: orders.filter((order) => order.status === 'pending_payment').length,
      shippedOrders: orders.filter((order) => order.status === 'shipped').length,
    }
  }

  async getCheckoutPaymentStatus(boboOrderId: number | string) {
    return engineRequest<EngineCheckoutPayment>(
      `/api/bobo/checkout/${encodeURIComponent(String(boboOrderId))}/payment`
    )
  }

  watchOrdersByBuyer(_buyerId: string) {
    return undefined
  }

  watchOrdersBySeller(_sellerId: string) {
    return undefined
  }
}

export const ordersServiceEngine = new OrdersServiceEngine()
export default ordersServiceEngine

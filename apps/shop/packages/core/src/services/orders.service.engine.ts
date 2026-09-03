/**
 * Orders Service - Engine SDK Version
 */

import type {
  BoboCheckoutOrder,
  BoboCheckoutPayment,
  BoboCheckoutResponse,
  Delivery as EngineDelivery,
  Order as EngineOrder,
  OrderItem as EngineOrderItem,
  OrderList as EngineOrderList,
  OrderStatus as EngineOrderStatus,
} from '@yaatal/client'
import { validatePhoneNumber } from '../utils/validation'
import type { Order, Product } from '../types/models'
import { analyticsService } from './analytics.service.engine'
import { engineRequest, getYaatalClient } from './engine.client'
import { mapEngineProductToProduct } from './products.service.engine'

export interface ShippingInfo {
  address: string
  city: string
  region: string
  zipCode?: string
  phoneNumber: string
}

export type EngineCheckoutPayment = BoboCheckoutPayment
type BoboOrderDto = BoboCheckoutOrder
type CheckoutResponse = BoboCheckoutResponse

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

const mapEngineDeliveryStatusToBobo = (
  status: EngineDelivery['status']
): NonNullable<Order['delivery_status']> => {
  if (status === 'accepted') return 'assigned'
  if (status === 'picked_up') return 'picked_up'
  if (status === 'in_transit') return 'in_transit'
  if (status === 'delivered') return 'delivered'
  if (status === 'failed' || status === 'cancelled') return 'failed'
  return 'pending_dispatch'
}

const mapEngineDeliveryMethodToBobo = (
  method?: string | null
): NonNullable<Order['delivery_method']> => {
  if (
    method === 'bobo_managed' ||
    method === 'merchant_self' ||
    method === 'third_party' ||
    method === 'customer_pickup'
  ) {
    return method
  }

  return 'bobo_managed'
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

const mergeDeliveryIntoOrder = (
  order: Order,
  delivery?: EngineDelivery
): Order => {
  if (!delivery) return order

  return {
    ...order,
    shipping_address: delivery.dropoff_address || order.shipping_address,
    phone_number: delivery.phone_number || order.phone_number,
    delivery_method: mapEngineDeliveryMethodToBobo(delivery.method),
    delivery_status: mapEngineDeliveryStatusToBobo(delivery.status),
    delivery_completed_at: delivery.confirmed_at || order.delivery_completed_at,
    delivery_notes: delivery.notes || order.delivery_notes,
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

export const enrichEngineOrderForBobo = async (
  engineOrder: EngineOrder
): Promise<Order> => {
  const order = mapEngineOrderToOrder(engineOrder)
  const client = getYaatalClient()
  const productId = engineOrder.items[0]?.product_id

  const productPromise = productId
    ? client.products.get(productId).then(mapEngineProductToProduct).catch(() => undefined)
    : Promise.resolve(undefined)
  const deliveryPromise = client.delivery
    .list({ order_id: engineOrder.id, limit: 1 })
    .then((deliveries) => deliveries[0])
    .catch(() => undefined)

  const [product, delivery] = await Promise.all([productPromise, deliveryPromise])
  const withProduct = product
    ? {
        ...order,
        product_id: product.id,
        expand: {
          ...order.expand,
          product_id: product,
        },
      }
    : order

  return mergeDeliveryIntoOrder(withProduct, delivery)
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
    status: order.status as Order['status'],
    payment_method: order.payment_method as Order['payment_method'],
    payment_reference: order.payment_reference || undefined,
    shipping_address: order.shipping_address || undefined,
    phone_number: order.phone_number || '',
    delivery_method: 'bobo_managed',
    delivery_status: 'pending_dispatch',
    created: order.created,
    updated: order.updated,
  } as Order
}

const pageFromOrders = async (response: EngineOrderList) => ({
  items: await Promise.all(response.orders.map(enrichEngineOrderForBobo)),
  totalItems: response.total,
  totalPages: Math.ceil(response.total / response.per_page),
})

const mapBoboStatusToEngine = (status: Order['status']): EngineOrderStatus => {
  if (status === 'pending_payment') return 'pending'
  if (status === 'processing' || status === 'paid') return 'confirmed'
  if (status === 'shipped') return 'shipped'
  if (status === 'delivered') return 'delivered'
  if (status === 'cancelled' || status === 'disputed') return 'cancelled'
  return 'pending'
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

      const response: CheckoutResponse = await getYaatalClient().bobo.checkout({
        buyer_id: buyerId,
        seller_id: sellerId,
        product_id: productId,
        quantity,
        payment_method: paymentMethod,
        shipping_address: formatShippingAddress(shippingInfo),
        phone_number: shippingInfo.phoneNumber,
        payer_msisdn: shippingInfo.phoneNumber,
      })
      analyticsService.track({
        event: 'checkout_completed',
        properties: {
          buyerId,
          sellerId,
          productId,
          quantity,
          paymentMethod,
          success: response.success,
          orderId: response.order?.id,
          totalPrice: response.order?.total_price,
        },
      })

      return {
        success: response.success,
        order: mapBoboCheckoutOrder(response.order),
        payment: response.payment,
      }
    } catch (error: any) {
      console.error('Create order error:', error)
      analyticsService.track({
        event: 'checkout_failed',
        properties: {
          buyerId,
          sellerId,
          productId,
          quantity,
          paymentMethod,
          error: error?.message,
        },
      })
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
      const response = await getYaatalClient().orders.me({
        page,
        per_page: limit,
      })
      return await pageFromOrders(response)
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
      return await pageFromOrders(response)
    } catch (error) {
      console.error('Get seller orders error:', error)
      return { items: [], totalItems: 0, totalPages: 0 }
    }
  }

  async getOrderById(orderId: string): Promise<Order | undefined> {
    try {
      const response = await getYaatalClient().orders.get(orderId)
      const order = await enrichEngineOrderForBobo(response)
      analyticsService.track({
        event: 'order_view',
        properties: {
          orderId: order.id,
          status: order.status,
          paymentMethod: order.payment_method,
        },
      })
      return order
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
      const response = await getYaatalClient().orders.updateStatus(orderId, {
        status: mapBoboStatusToEngine(status),
      })

      return {
        success: true,
        order: await enrichEngineOrderForBobo(response),
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
      const response = await getYaatalClient().orders.get(orderId)
      const order = await enrichEngineOrderForBobo(response)
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
      const response = await getYaatalClient().orders.cancel(orderId)
      return {
        success: true,
        order: await enrichEngineOrderForBobo(response),
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
    const numericOrderId = Number(boboOrderId)
    if (Number.isNaN(numericOrderId)) {
      return engineRequest<EngineCheckoutPayment>(
        `/api/bobo/checkout/${encodeURIComponent(String(boboOrderId))}/payment`
      )
    }

    return getYaatalClient().bobo.paymentStatus(numericOrderId)
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

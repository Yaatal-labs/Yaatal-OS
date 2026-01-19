/**
 * Orders Service - PowerSync Version
 * Offline-first CRUD operations for orders and order management
 */

import { powerSyncService } from '../lib/powersync/service';
import { validatePhoneNumber } from '../utils/validation'
import type { Order, Product } from '../types/models'

export interface ShippingInfo {
  address: string
  city: string
  region: string
  zipCode?: string
  phoneNumber: string
}

export class OrdersServicePowerSync {
  /**
   * Create a new order (saves to local SQLite, queues for sync)
   */
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
    error?: string
  }> {
    try {
      // Validate inputs
      if (!buyerId || !sellerId || !productId) {
        return { success: false, error: 'IDs manquants' }
      }

      if (quantity <= 0) {
        return { success: false, error: 'Quantité invalide' }
      }

      // Validate shipping info
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

      // Get product to get price (from local SQLite)
      const productQuery = 'SELECT * FROM products WHERE id = ?';
      const products = await powerSyncService.executeQuery<Product>(productQuery, [productId]);

      if (!products.length) {
        return { success: false, error: 'Produit introuvable' }
      }

      const product = products[0];

      // Calculate prices
      const unitPrice = product.discount_price ?? product.price
      const totalPrice = unitPrice * quantity

      // Check stock (from local SQLite)
      const stockCheckQuery = 'SELECT stock_quantity FROM products WHERE id = ?';
      const stockResults = await powerSyncService.executeQuery<{stock_quantity: number}>(
        stockCheckQuery,
        [productId]
      );

      const currentStock = stockResults[0]?.stock_quantity || 0;
      if (currentStock < quantity) {
        return {
          success: false,
          error: `Stock insuffisant. Disponible: ${currentStock}`,
        }
      }

      // Format shipping address
      const formattedAddress = `${shippingInfo.address}, ${shippingInfo.city}, ${shippingInfo.region}${
        shippingInfo.zipCode ? `, ${shippingInfo.zipCode}` : ''
      }`

      // Create order ID and timestamp
      const orderId = this.generateUUID();
      const now = new Date().toISOString();

      // Insert order into local SQLite
      const insertQuery = `
        INSERT INTO orders (
          id, buyer_id, seller_id, product_id, quantity, unit_price, total_price,
          status, payment_method, payment_reference, shipping_address, phone_number,
          delivery_method, delivery_status, delivery_person_id, delivery_person_name,
          delivery_person_phone, delivery_cost, delivery_completed_at, delivery_tracking_url,
          delivery_notes, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

      await powerSyncService.executeWrite(insertQuery, [
        orderId,
        buyerId,
        sellerId,
        productId,
        quantity,
        unitPrice,
        totalPrice,
        'pending_payment', // Initial status
        paymentMethod,
        null, // payment_reference initially null
        formattedAddress,
        shippingInfo.phoneNumber,
        'bobo_managed', // Default delivery method
        'pending_dispatch', // Initial delivery status
        null, // delivery_person_id
        null, // delivery_person_name
        null, // delivery_person_phone
        null, // delivery_cost
        null, // delivery_completed_at
        null, // delivery_tracking_url
        null, // delivery_notes
        now,
        now
      ]);

      // Update product stock in local SQLite
      await powerSyncService.executeWrite(
        'UPDATE products SET stock_quantity = stock_quantity - ?, updated_at = ? WHERE id = ?',
        [quantity, now, productId]
      );

      // Return the created order
      const order: Order = {
        id: orderId,
        buyer_id: buyerId,
        seller_id: sellerId,
        product_id: productId,
        quantity,
        unit_price: unitPrice,
        total_price: totalPrice,
        status: 'pending_payment',
        payment_method: paymentMethod,
        shipping_address: formattedAddress,
        phone_number: shippingInfo.phoneNumber,
        created: now,
        updated: now,
        // Delivery fields
        delivery_method: 'bobo_managed',
        delivery_status: 'pending_dispatch',
      };

      return {
        success: true,
        order,
      }
    } catch (error: any) {
      console.error('Create order error:', error)
      return {
        success: false,
        error: error.message || 'Erreur lors de la création de la commande',
      }
    }
  }

  /**
   * Calculate order total (includes discounts)
   */
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
      // TODO: Add shipping costs calculation
      // TODO: Add tax calculation
      // TODO: Add promo code support
    }
  }

  /**
   * Get orders by buyer (from local SQLite)
   */
  async getOrdersByBuyer(buyerId: string, page: number = 1, limit: number = 20) {
    try {
      const offset = (page - 1) * limit;
      const query = `
        SELECT * FROM orders
        WHERE buyer_id = ?
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?
      `;

      const items = await powerSyncService.executeQuery<Order>(query, [buyerId, limit, offset]);

      // Get total count
      const countResult = await powerSyncService.executeQuery<{count: number}>(
        'SELECT COUNT(*) as count FROM orders WHERE buyer_id = ?',
        [buyerId]
      );

      const totalItems = countResult[0]?.count || 0;
      const totalPages = Math.ceil(totalItems / limit);

      return {
        items,
        totalItems,
        totalPages,
      }
    } catch (error) {
      console.error('Get buyer orders error:', error)
      return { items: [], totalItems: 0, totalPages: 0 }
    }
  }

  /**
   * Get orders by seller (from local SQLite)
   */
  async getOrdersBySeller(sellerId: string, page: number = 1, limit: number = 20) {
    try {
      const offset = (page - 1) * limit;
      const query = `
        SELECT * FROM orders
        WHERE seller_id = ?
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?
      `;

      const items = await powerSyncService.executeQuery<Order>(query, [sellerId, limit, offset]);

      // Get total count
      const countResult = await powerSyncService.executeQuery<{count: number}>(
        'SELECT COUNT(*) as count FROM orders WHERE seller_id = ?',
        [sellerId]
      );

      const totalItems = countResult[0]?.count || 0;
      const totalPages = Math.ceil(totalItems / limit);

      return {
        items,
        totalItems,
        totalPages,
      }
    } catch (error) {
      console.error('Get seller orders error:', error)
      return { items: [], totalItems: 0, totalPages: 0 }
    }
  }

  /**
   * Get single order by ID (from local SQLite)
   */
  async getOrderById(orderId: string): Promise<Order | undefined> {
    try {
      const query = 'SELECT * FROM orders WHERE id = ?';
      const result = await powerSyncService.executeQuery<Order>(query, [orderId]);

      return result[0] || undefined;
    } catch (error) {
      console.error('Get order error:', error)
      return undefined
    }
  }

  /**
   * Update order status (in local SQLite, queues for sync)
   */
  async updateOrderStatus(
    orderId: string,
    status: Order['status']
  ): Promise<{
    success: boolean
    order?: Order
    error?: string
  }> {
    try {
      // Validate status
      const validStatuses: Order['status'][] = [
        'pending_payment',
        'paid',
        'processing',
        'shipped',
        'delivered',
        'cancelled',
        'disputed',
      ]

      if (!validStatuses.includes(status)) {
        return { success: false, error: 'Statut invalide' }
      }

      const now = new Date().toISOString();

      await powerSyncService.executeWrite(
        'UPDATE orders SET status = ?, updated_at = ? WHERE id = ?',
        [status, now, orderId]
      );

      // Return updated order
      const updatedOrder = await this.getOrderById(orderId);

      return {
        success: true,
        order: updatedOrder,
      }
    } catch (error: any) {
      console.error('Update order status error:', error)
      return {
        success: false,
        error: error.message || 'Erreur lors de la mise à jour du statut',
      }
    }
  }

  /**
   * Update payment reference (after payment)
   */
  async updatePaymentReference(
    orderId: string,
    paymentReference: string
  ): Promise<{
    success: boolean
    order?: Order
    error?: string
  }> {
    try {
      const now = new Date().toISOString();

      await powerSyncService.executeWrite(
        'UPDATE orders SET payment_reference = ?, status = ?, updated_at = ? WHERE id = ?',
        [paymentReference, 'paid', now, orderId]
      );

      // Return updated order
      const updatedOrder = await this.getOrderById(orderId);

      return {
        success: true,
        order: updatedOrder,
      }
    } catch (error: any) {
      console.error('Update payment reference error:', error)
      return {
        success: false,
        error: error.message || 'Erreur lors de la mise à jour du paiement',
      }
    }
  }

  /**
   * Add tracking number to order
   */
  async addTrackingNumber(
    orderId: string,
    trackingNumber: string
  ): Promise<{
    success: boolean
    order?: Order
    error?: string
  }> {
    try {
      await powerSyncService.executeWrite(
        'UPDATE orders SET tracking_number = ?, updated_at = ? WHERE id = ?',
        [trackingNumber, new Date().toISOString(), orderId]
      );

      // Return updated order
      const updatedOrder = await this.getOrderById(orderId);

      return {
        success: true,
        order: updatedOrder,
      }
    } catch (error: any) {
      console.error('Add tracking number error:', error)
      return {
        success: false,
        error: error.message || 'Erreur lors de l\'ajout du numéro de suivi',
      }
    }
  }

  /**
   * Cancel order
   */
  async cancelOrder(orderId: string, reason?: string): Promise<{
    success: boolean
    order?: Order
    error?: string
  }> {
    try {
      const now = new Date().toISOString();

      await powerSyncService.executeWrite(
        'UPDATE orders SET status = ?, updated_at = ? WHERE id = ?',
        ['cancelled', now, orderId]
      );

      // Return updated order
      const updatedOrder = await this.getOrderById(orderId);

      return {
        success: true,
        order: updatedOrder,
      }
    } catch (error: any) {
      console.error('Cancel order error:', error)
      return {
        success: false,
        error: error.message || 'Erreur lors de l\'annulation de la commande',
      }
    }
  }

  /**
   * Get order statistics for seller
   */
  async getSellerStats(sellerId: string): Promise<{
    totalOrders: number
    totalRevenue: number
    pendingOrders: number
    shippedOrders: number
  }> {
    try {
      // Get all orders for seller
      const query = 'SELECT * FROM orders WHERE seller_id = ?';
      const orders = await powerSyncService.executeQuery<Order>(query, [sellerId]);

      const totalRevenue = orders.reduce((sum, order) => sum + order.total_price, 0)
      const pendingOrders = orders.filter((o) => o.status === 'pending_payment').length
      const shippedOrders = orders.filter((o) => o.status === 'shipped').length

      return {
        totalOrders: orders.length,
        totalRevenue,
        pendingOrders,
        shippedOrders,
      }
    } catch (error) {
      console.error('Get seller stats error:', error)
      return {
        totalOrders: 0,
        totalRevenue: 0,
        pendingOrders: 0,
        shippedOrders: 0,
      }
    }
  }

  /**
   * Watch for orders by buyer (real-time updates)
   */
  watchOrdersByBuyer(buyerId: string) {
    return powerSyncService.watchQuery(
      'SELECT * FROM orders WHERE buyer_id = ? ORDER BY created_at DESC',
      [buyerId]
    );
  }

  /**
   * Watch for orders by seller (real-time updates)
   */
  watchOrdersBySeller(sellerId: string) {
    return powerSyncService.watchQuery(
      'SELECT * FROM orders WHERE seller_id = ? ORDER BY created_at DESC',
      [sellerId]
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
export const ordersServicePowerSync = new OrdersServicePowerSync()
/**
 * Orders Service
 * Provides offline-first order management using PowerSync
 * Handles order creation, retrieval, status updates, and real-time watching
 */

import { powerSyncService } from '../lib/powersync/service';

// Type definitions
export type OrderStatus = 'pending' | 'confirmed' | 'shipped' | 'delivered' | 'cancelled';
export type PaymentMethod = 'cash' | 'mobile_money' | 'card';
export type PaymentStatus = 'pending' | 'paid' | 'failed';
export type DeliveryMethod = 'pickup' | 'delivery';

export interface Order {
  id: string;
  buyer_id: string;
  seller_id: string;
  status: OrderStatus;
  payment_method: PaymentMethod;
  payment_status: PaymentStatus;
  subtotal: number;
  shipping_cost: number;
  total: number;
  delivery_method: DeliveryMethod;
  delivery_address: string;
  delivery_phone: string;
  created_at?: string;
  updated_at?: string;
}

export interface OrderInput {
  buyer_id: string;
  seller_id: string;
  payment_method: PaymentMethod;
  delivery_method: DeliveryMethod;
  delivery_address: string;
  delivery_phone: string;
  subtotal: number;
  shipping_cost: number;
  total: number;
}

export interface OrderItem {
  id: string;
  order_id: string;
  product_id: string;
  quantity: number;
  unit_price: number;
  total_price: number;
}

export interface OrderItemInput {
  product_id: string;
  quantity: number;
  unit_price: number;
  total_price: number;
}

export interface OrderWithItems extends Order {
  items: OrderItem[];
}

/**
 * Generate a UUID v4
 */
function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Orders Service Class
 * Manages all order-related operations with offline-first capability
 */
export class OrdersService {
  private static instance: OrdersService;

  private constructor() {}

  public static getInstance(): OrdersService {
    if (!OrdersService.instance) {
      OrdersService.instance = new OrdersService();
    }
    return OrdersService.instance;
  }

  /**
   * Create a new order with its items
   * @param order - The order input data
   * @param items - Array of order items
   * @returns The created order with items
   */
  async create(order: OrderInput, items: OrderItemInput[]): Promise<OrderWithItems> {
    const orderId = generateUUID();
    const now = new Date().toISOString();

    // Insert the order
    await powerSyncService.executeWrite(
      `INSERT INTO orders (
        id, buyer_id, seller_id, status, payment_method, payment_status,
        subtotal, shipping_cost, total, delivery_method, delivery_address, delivery_phone
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        orderId,
        order.buyer_id,
        order.seller_id,
        'pending' as OrderStatus,
        order.payment_method,
        'pending' as PaymentStatus,
        order.subtotal,
        order.shipping_cost,
        order.total,
        order.delivery_method,
        order.delivery_address,
        order.delivery_phone,
      ]
    );

    // Insert order items
    const createdItems: OrderItem[] = [];
    for (const item of items) {
      const itemId = generateUUID();
      await powerSyncService.executeWrite(
        `INSERT INTO order_items (id, order_id, product_id, quantity, unit_price, total_price)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [itemId, orderId, item.product_id, item.quantity, item.unit_price, item.total_price]
      );
      createdItems.push({
        id: itemId,
        order_id: orderId,
        ...item,
      });
    }

    const createdOrder: OrderWithItems = {
      id: orderId,
      buyer_id: order.buyer_id,
      seller_id: order.seller_id,
      status: 'pending',
      payment_method: order.payment_method,
      payment_status: 'pending',
      subtotal: order.subtotal,
      shipping_cost: order.shipping_cost,
      total: order.total,
      delivery_method: order.delivery_method,
      delivery_address: order.delivery_address,
      delivery_phone: order.delivery_phone,
      created_at: now,
      updated_at: now,
      items: createdItems,
    };

    return createdOrder;
  }

  /**
   * Get an order by its ID
   * @param id - The order ID
   * @returns The order or null if not found
   */
  async getById(id: string): Promise<Order | null> {
    const results = await powerSyncService.executeQuery<Order>(
      `SELECT * FROM orders WHERE id = ?`,
      [id]
    );

    return results.length > 0 ? results[0] : null;
  }

  /**
   * Get an order by ID with its items
   * @param id - The order ID
   * @returns The order with items or null if not found
   */
  async getByIdWithItems(id: string): Promise<OrderWithItems | null> {
    const order = await this.getById(id);
    if (!order) return null;

    const items = await this.getOrderItems(id);
    return { ...order, items };
  }

  /**
   * Get all orders for a buyer
   * @param buyerId - The buyer's user ID
   * @returns Array of orders
   */
  async getByBuyer(buyerId: string): Promise<Order[]> {
    return await powerSyncService.executeQuery<Order>(
      `SELECT * FROM orders WHERE buyer_id = ? ORDER BY id DESC`,
      [buyerId]
    );
  }

  /**
   * Get all orders for a seller
   * @param sellerId - The seller's user ID
   * @returns Array of orders
   */
  async getBySeller(sellerId: string): Promise<Order[]> {
    return await powerSyncService.executeQuery<Order>(
      `SELECT * FROM orders WHERE seller_id = ? ORDER BY id DESC`,
      [sellerId]
    );
  }

  /**
   * Get orders by status
   * @param status - The order status to filter by
   * @returns Array of orders with the specified status
   */
  async getByStatus(status: OrderStatus): Promise<Order[]> {
    return await powerSyncService.executeQuery<Order>(
      `SELECT * FROM orders WHERE status = ? ORDER BY id DESC`,
      [status]
    );
  }

  /**
   * Update the status of an order
   * @param id - The order ID
   * @param status - The new status
   * @returns The updated order or null if not found
   */
  async updateStatus(id: string, status: OrderStatus): Promise<Order | null> {
    await powerSyncService.executeWrite(
      `UPDATE orders SET status = ? WHERE id = ?`,
      [status, id]
    );

    return await this.getById(id);
  }

  /**
   * Update the payment status of an order
   * @param id - The order ID
   * @param status - The new payment status
   * @returns The updated order or null if not found
   */
  async updatePaymentStatus(id: string, status: PaymentStatus): Promise<Order | null> {
    await powerSyncService.executeWrite(
      `UPDATE orders SET payment_status = ? WHERE id = ?`,
      [status, id]
    );

    return await this.getById(id);
  }

  /**
   * Get all items for an order
   * @param orderId - The order ID
   * @returns Array of order items
   */
  async getOrderItems(orderId: string): Promise<OrderItem[]> {
    return await powerSyncService.executeQuery<OrderItem>(
      `SELECT * FROM order_items WHERE order_id = ?`,
      [orderId]
    );
  }

  /**
   * Cancel an order
   * Sets the order status to 'cancelled'
   * @param id - The order ID
   * @returns The cancelled order or null if not found
   */
  async cancel(id: string): Promise<Order | null> {
    const order = await this.getById(id);
    if (!order) return null;

    // Only allow cancellation of pending or confirmed orders
    if (order.status !== 'pending' && order.status !== 'confirmed') {
      throw new Error(`Cannot cancel order with status: ${order.status}`);
    }

    return await this.updateStatus(id, 'cancelled');
  }

  /**
   * Watch orders for a user (buyer or seller)
   * Returns an observable that emits whenever orders change
   * @param userId - The user ID to watch orders for
   * @returns Observable-like object with onChange callback
   */
  watchOrders(userId: string) {
    const sql = `
      SELECT * FROM orders
      WHERE buyer_id = ? OR seller_id = ?
      ORDER BY id DESC
    `;

    return powerSyncService.watchQuery(sql, [userId, userId]);
  }

  /**
   * Watch orders for a buyer only
   * @param buyerId - The buyer's user ID
   * @returns Observable-like object with onChange callback
   */
  watchBuyerOrders(buyerId: string) {
    const sql = `SELECT * FROM orders WHERE buyer_id = ? ORDER BY id DESC`;
    return powerSyncService.watchQuery(sql, [buyerId]);
  }

  /**
   * Watch orders for a seller only
   * @param sellerId - The seller's user ID
   * @returns Observable-like object with onChange callback
   */
  watchSellerOrders(sellerId: string) {
    const sql = `SELECT * FROM orders WHERE seller_id = ? ORDER BY id DESC`;
    return powerSyncService.watchQuery(sql, [sellerId]);
  }

  /**
   * Watch a specific order by ID
   * @param orderId - The order ID
   * @returns Observable-like object with onChange callback
   */
  watchOrder(orderId: string) {
    const sql = `SELECT * FROM orders WHERE id = ?`;
    return powerSyncService.watchQuery(sql, [orderId]);
  }

  /**
   * Get order statistics for a seller
   * @param sellerId - The seller's user ID
   * @returns Order statistics
   */
  async getSellerStats(sellerId: string): Promise<{
    totalOrders: number;
    pendingOrders: number;
    completedOrders: number;
    cancelledOrders: number;
    totalRevenue: number;
  }> {
    const orders = await this.getBySeller(sellerId);

    const stats = {
      totalOrders: orders.length,
      pendingOrders: orders.filter((o) => o.status === 'pending').length,
      completedOrders: orders.filter((o) => o.status === 'delivered').length,
      cancelledOrders: orders.filter((o) => o.status === 'cancelled').length,
      totalRevenue: orders
        .filter((o) => o.status === 'delivered' && o.payment_status === 'paid')
        .reduce((sum, o) => sum + o.total, 0),
    };

    return stats;
  }

  /**
   * Get order statistics for a buyer
   * @param buyerId - The buyer's user ID
   * @returns Order statistics
   */
  async getBuyerStats(buyerId: string): Promise<{
    totalOrders: number;
    activeOrders: number;
    completedOrders: number;
    totalSpent: number;
  }> {
    const orders = await this.getByBuyer(buyerId);

    const activeStatuses: OrderStatus[] = ['pending', 'confirmed', 'shipped'];
    const stats = {
      totalOrders: orders.length,
      activeOrders: orders.filter((o) => activeStatuses.includes(o.status)).length,
      completedOrders: orders.filter((o) => o.status === 'delivered').length,
      totalSpent: orders
        .filter((o) => o.status === 'delivered' && o.payment_status === 'paid')
        .reduce((sum, o) => sum + o.total, 0),
    };

    return stats;
  }
}

// Export singleton instance
export const ordersService = OrdersService.getInstance();

import type { EngineHttpClient } from "./http.js";

export type OrderStatus =
  | "pending"
  | "confirmed"
  | "shipped"
  | "delivered"
  | "cancelled";

export type PaymentStatus = "pending" | "paid" | "failed";

export interface OrderItem {
  id: string;
  product_id: string;
  quantity: number;
  unit_price_cents: number;
}

export interface Order {
  id: string;
  buyer_id: string;
  seller_id: string;
  status: OrderStatus;
  payment_method: string;
  payment_status: PaymentStatus;
  delivery_method: string;
  total_cents: number;
  items: OrderItem[];
  created_at: string;
  updated_at: string | null;
}

export interface OrderList {
  orders: Order[];
  total: number;
  page: number;
  per_page: number;
}

export interface ListOrdersParams {
  page?: number;
  per_page?: number;
}

export interface CreateOrderItemRequest {
  product_id: string;
  quantity: number;
}

export interface CreateOrderRequest {
  seller_id: string;
  items: CreateOrderItemRequest[];
  payment_method: string;
  delivery_method: string;
}

export interface UpdateOrderStatusRequest {
  status: OrderStatus;
}

export class OrdersClient {
  constructor(private readonly http: EngineHttpClient) {}

  create(request: CreateOrderRequest): Promise<Order> {
    return this.http.request<Order>("/api/orders", {
      method: "POST",
      body: request,
    });
  }

  list(params: ListOrdersParams = {}): Promise<OrderList> {
    return this.http.request<OrderList>("/api/orders", { query: { ...params } });
  }

  me(params: ListOrdersParams = {}): Promise<OrderList> {
    return this.http.request<OrderList>("/api/orders/me", {
      query: { ...params },
    });
  }

  get(id: string): Promise<Order> {
    return this.http.request<Order>(`/api/orders/${encodeURIComponent(id)}`);
  }

  updateStatus(
    id: string,
    request: UpdateOrderStatusRequest,
  ): Promise<Order> {
    return this.http.request<Order>(
      `/api/orders/${encodeURIComponent(id)}/status`,
      {
        method: "PATCH",
        body: request,
      },
    );
  }

  cancel(id: string): Promise<Order> {
    return this.http.request<Order>(
      `/api/orders/${encodeURIComponent(id)}/cancel`,
      { method: "POST" },
    );
  }
}

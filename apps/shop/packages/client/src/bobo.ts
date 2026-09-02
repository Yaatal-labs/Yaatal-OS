import type { EngineHttpClient } from "./http.js";

export type BoboPaymentMethod = "cash" | "wave";

export type BoboPaymentStatus = "pending" | "succeeded" | "failed" | "reversed";

export type BoboOrderState =
  | "created"
  | "payment_held"
  | "delivery_confirmed"
  | "disputed"
  | "cancelled";

export type BoboEscrowState =
  | "held"
  | "released"
  | "settled"
  | "disputed"
  | "refunded";

export interface BoboCheckoutItem {
  product_id: string;
  quantity: number;
}

export interface BoboCheckoutRequest {
  buyer_id?: string;
  seller_id?: string;
  product_id?: string;
  quantity?: number;
  items?: BoboCheckoutItem[];
  payment_method: BoboPaymentMethod;
  delivery_method?: string;
  shipping_address?: string;
  phone_number?: string;
  payer_msisdn?: string;
  idempotency_key?: string;
}

export interface BoboCheckoutOrder {
  id: string;
  engine_order_id: string;
  bobo_order_id: number;
  buyer_id: string;
  seller_id: string;
  product_id: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  status: string;
  payment_method: string;
  payment_reference: string | null;
  shipping_address: string | null;
  phone_number: string | null;
  created: string;
  updated: string;
}

export interface BoboCheckoutPayment {
  method: string;
  status: BoboPaymentStatus;
  rail: string;
  provider_ref: string;
  idempotency_key: string;
  amount_xof: number;
  redirect_url: string | null;
}

export interface BoboCheckoutResponse {
  success: boolean;
  order: BoboCheckoutOrder;
  payment: BoboCheckoutPayment;
}

export interface BoboOrder {
  id: number;
  engine_order_id: string | null;
  idempotency_key: string | null;
  merchant_id: string;
  buyer_pid: string;
  total_xof: number;
  currency: string;
  state: BoboOrderState | string;
  created_at: string;
  updated_at: string;
}

export interface BoboEscrow {
  order_id: number;
  state: BoboEscrowState | string;
  created_at: string;
  updated_at: string;
}

export type BoboOrderWithEscrow = BoboOrder & {
  escrow: BoboEscrow | null;
};

export interface BoboCreateOrderRequest {
  merchant_id: string;
  total_xof: number;
  delivery_lat?: number;
  delivery_lng?: number;
}

export interface BoboListOrdersParams {
  limit?: number;
}

export interface BoboKyc {
  pid: string;
  status: string;
  provider: string;
  smile_id_ref: string | null;
  verified_at: string | null;
  jurisdiction: string;
  created_at: string;
}

export interface BoboSubmitKycRequest {
  provider: string;
  document_hash_b64: string;
  jurisdiction: string;
}

export class BoboClient {
  constructor(private readonly http: EngineHttpClient) {}

  checkout(request: BoboCheckoutRequest): Promise<BoboCheckoutResponse> {
    return this.http.request<BoboCheckoutResponse>("/api/bobo/checkout", {
      method: "POST",
      body: request,
    });
  }

  paymentStatus(orderId: number): Promise<BoboCheckoutPayment> {
    return this.http.request<BoboCheckoutPayment>(
      `/api/bobo/checkout/${encodeURIComponent(String(orderId))}/payment`,
    );
  }

  createOrder(request: BoboCreateOrderRequest): Promise<BoboOrder> {
    return this.http.request<BoboOrder>("/api/bobo/orders", {
      method: "POST",
      body: request,
    });
  }

  listOrders(params: BoboListOrdersParams = {}): Promise<BoboOrder[]> {
    return this.http.request<BoboOrder[]>("/api/bobo/orders", {
      query: { ...params },
    });
  }

  getOrder(orderId: number): Promise<BoboOrderWithEscrow> {
    return this.http.request<BoboOrderWithEscrow>(
      `/api/bobo/orders/${encodeURIComponent(String(orderId))}`,
    );
  }

  escrow(orderId: number): Promise<BoboEscrow> {
    return this.http.request<BoboEscrow>(
      `/api/bobo/orders/${encodeURIComponent(String(orderId))}/escrow`,
    );
  }

  confirmDelivery(orderId: number): Promise<BoboOrderWithEscrow> {
    return this.http.request<BoboOrderWithEscrow>(
      `/api/bobo/orders/${encodeURIComponent(String(orderId))}/confirm-delivery`,
      { method: "POST" },
    );
  }

  dispute(orderId: number): Promise<BoboOrderWithEscrow> {
    return this.http.request<BoboOrderWithEscrow>(
      `/api/bobo/orders/${encodeURIComponent(String(orderId))}/dispute`,
      { method: "POST" },
    );
  }

  cancel(orderId: number): Promise<BoboOrder> {
    return this.http.request<BoboOrder>(
      `/api/bobo/orders/${encodeURIComponent(String(orderId))}/cancel`,
      { method: "POST" },
    );
  }

  submitKyc(request: BoboSubmitKycRequest): Promise<BoboKyc> {
    return this.http.request<BoboKyc>("/api/bobo/kyc", {
      method: "POST",
      body: request,
    });
  }

  kycStatus(): Promise<BoboKyc> {
    return this.http.request<BoboKyc>("/api/bobo/kyc");
  }
}

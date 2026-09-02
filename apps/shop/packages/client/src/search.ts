import type { EngineHttpClient } from "./http.js";
import type { Order } from "./orders.js";
import type { Product } from "./products.js";

export interface SearchProductsParams {
  q?: string;
  query?: string;
  page?: number;
  per_page?: number;
  limit?: number;
  category?: string;
  merchant_id?: string;
}

export type SearchProduct = Product;

export interface SearchProductsResponse {
  products: SearchProduct[];
  total: number;
  page: number;
  per_page: number;
}

export interface SearchMerchantsParams {
  q?: string;
  query?: string;
  page?: number;
  per_page?: number;
  limit?: number;
}

export interface SearchMerchant {
  id: string;
  username: string | null;
  display_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  created_at: string;
}

export interface SearchMerchantsResponse {
  merchants: SearchMerchant[];
  total: number;
  page: number;
  per_page: number;
}

export interface SearchOrdersParams {
  q?: string;
  query?: string;
  page?: number;
  per_page?: number;
  limit?: number;
  status?: string;
  role?: "buyer" | "seller";
}

export type SearchOrder = Order;

export interface SearchOrdersResponse {
  orders: SearchOrder[];
  total: number;
  page: number;
  per_page: number;
}

export class SearchClient {
  constructor(private readonly http: EngineHttpClient) {}

  products(
    params: SearchProductsParams = {},
  ): Promise<SearchProductsResponse> {
    return this.http.request<SearchProductsResponse>("/api/search/products", {
      query: normalizeSearchParams(params),
    });
  }

  merchants(
    params: SearchMerchantsParams = {},
  ): Promise<SearchMerchantsResponse> {
    return this.http.request<SearchMerchantsResponse>("/api/search/merchants", {
      query: normalizeSearchParams(params),
    });
  }

  orders(params: SearchOrdersParams = {}): Promise<SearchOrdersResponse> {
    return this.http.request<SearchOrdersResponse>("/api/search/orders", {
      query: normalizeSearchParams(params),
    });
  }
}

function normalizeSearchParams<
  T extends {
    q?: string;
    query?: string;
    limit?: number;
    per_page?: number;
  },
>(params: T): Record<string, boolean | number | string | null | undefined> {
  const { query, limit, ...rest } = params;
  return {
    ...rest,
    q: rest.q ?? query,
    per_page: rest.per_page ?? limit,
  };
}

import type { EngineHttpClient } from "./http.js";

export interface CatalogProduct {
  id: string;
  merchant_id: string;
  name: string;
  description: string | null;
  price_cents: number;
  price_display: string;
  discount_price_cents: number | null;
  discount_price_display: string | null;
  stock: number;
  stock_status: string;
  category: string;
  images: string[];
  upvotes: number;
  created_at: string;
  updated_at: string | null;
}

export interface CatalogList {
  products: CatalogProduct[];
  total: number;
  page: number;
  per_page: number;
}

export interface ListCatalogParams {
  page?: number;
  per_page?: number;
  category?: string;
  merchant_id?: string;
}

export class CatalogClient {
  constructor(private readonly http: EngineHttpClient) {}

  list(params: ListCatalogParams = {}): Promise<CatalogList> {
    return this.http.request<CatalogList>("/api/catalog", {
      query: { ...params },
    });
  }

  get(id: string): Promise<CatalogProduct> {
    return this.http.request<CatalogProduct>(
      `/api/catalog/${encodeURIComponent(id)}`,
    );
  }
}

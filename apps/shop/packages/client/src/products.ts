import type { EngineHttpClient } from "./http.js";

export interface Product {
  id: string;
  merchant_id: string;
  name: string;
  description: string | null;
  price_cents: number;
  discount_price_cents: number | null;
  stock: number;
  category: string;
  images: string | null;
  is_active: boolean;
  upvotes: number;
  created_at: string;
  updated_at: string | null;
}

export interface ProductList {
  products: Product[];
  total: number;
  page: number;
  per_page: number;
}

export interface ListProductsParams {
  page?: number;
  per_page?: number;
  category?: string;
  merchant_id?: string;
  search?: string;
}

export interface CreateProductRequest {
  name: string;
  description?: string | null;
  price_cents: number;
  discount_price_cents?: number | null;
  stock: number;
  category: string;
  images?: string | null;
}

export interface UpdateProductRequest {
  name?: string;
  description?: string;
  price_cents?: number;
  discount_price_cents?: number | null;
  stock?: number;
  category?: string;
  images?: string | null;
  is_active?: boolean;
}

export class ProductsClient {
  constructor(private readonly http: EngineHttpClient) {}

  list(params: ListProductsParams = {}): Promise<ProductList> {
    return this.http.request<ProductList>("/api/products", {
      query: { ...params },
    });
  }

  get(id: string): Promise<Product> {
    return this.http.request<Product>(
      `/api/products/${encodeURIComponent(id)}`,
    );
  }

  create(request: CreateProductRequest): Promise<Product> {
    return this.http.request<Product>("/api/products", {
      method: "POST",
      body: request,
    });
  }

  update(id: string, request: UpdateProductRequest): Promise<Product> {
    return this.http.request<Product>(
      `/api/products/${encodeURIComponent(id)}`,
      {
        method: "PUT",
        body: request,
      },
    );
  }

  async remove(id: string): Promise<void> {
    await this.http.request<void>(`/api/products/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
  }

  upvote(id: string): Promise<Product> {
    return this.http.request<Product>(
      `/api/products/${encodeURIComponent(id)}/upvote`,
      { method: "POST" },
    );
  }
}

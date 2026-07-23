import type { CatalogProduct } from "./catalog.js";
import type { EngineHttpClient } from "./http.js";

export interface LiveSession {
  id: string;
  merchant_id: string;
  product_id: string | null;
  status: string;
  started_at: string;
  ended_at: string | null;
  created_at: string;
  updated_at: string | null;
}

export interface CurrentSessionProducts {
  session: LiveSession;
  products: CatalogProduct[];
}

export class LiveSessionsClient {
  constructor(private readonly http: EngineHttpClient) {}

  currentProducts(): Promise<CurrentSessionProducts> {
    return this.http.request<CurrentSessionProducts>(
      "/api/live-sessions/current/products",
    );
  }
}

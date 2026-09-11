/**
 * Renderer-safe workspace DTOs. Native owns credentials, cookies, URLs opened
 * by the operating system, and the authoritative service calls.
 */
export interface CatalogProduct {
  id: string;
  name: string;
  description?: string;
  priceFcfa: number;
  priceDisplay: string;
  stock: number;
  stockStatus: string;
  category?: string;
  images: string[];
  variants?: string[];
}

export interface CatalogPage {
  products: CatalogProduct[];
  total: number;
  page: number;
  perPage: number;
}

export interface StudioSessionState {
  isLive: boolean;
  sessionId: string | null;
  startedAt: number;
  sellerName: string;
}

export interface StudioReadinessStep {
  name: string;
  status: string;
  durationMs?: number;
}

export interface StudioStatus {
  health: "ok";
  ledgerAvailable: boolean;
  readiness: { status: string; steps: StudioReadinessStep[] };
}

export interface ProductQueue {
  products: CatalogProduct[];
  source: string;
}

export interface CommerceIntent {
  intentId: string;
  liveSessionId: string;
  productId: string;
  publicUrl: string;
  livestreamUrl: string;
  whatsappUrl: string;
  telegramUrl: string;
}

export type CommerceChannel = "copy" | "livestream" | "telegram" | "whatsapp";

export interface Conversion {
  version: "yaatal.commerce-receipt.v1";
  orderId: string;
  productId: string;
  productName: string;
  totalFcfa: number;
  paymentProvider: string;
  paymentStatus: "sandbox_paid";
  liveSessionId: string;
  sourceChannel: string;
  deduplicated: boolean;
  quantity: number;
  createdAt: string;
}

export interface CommerceWorkspaceAdapter {
  catalog: {
    list(args?: { page?: number; category?: string }): Promise<CatalogPage>;
    product(productId: string): Promise<CatalogProduct>;
  };
  bootstrap(): Promise<{ authenticated: boolean }>;
  sessionState(): Promise<StudioSessionState>;
  goLive(): Promise<StudioSessionState>;
  stopStream(): Promise<StudioSessionState>;
  productQueue(): Promise<ProductQueue>;
  status(): Promise<StudioStatus>;
  createIntent(productId: string): Promise<CommerceIntent>;
  conversions(liveSessionId: string): Promise<Conversion[]>;
  openLink(intentId: string, channel: CommerceChannel): Promise<void>;
}

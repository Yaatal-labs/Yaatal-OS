import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { sanitizeSidecarStatus, sanitizeProductNavigation, type SidecarStatus, type ProductNavigationRequest } from "@yaatal/os-protocol";
import type { CatalogPage, CatalogProduct, CommerceChannel, CommerceIntent, CommerceWorkspaceAdapter, Conversion, OpenCommerceLinkResult, ProductQueue, StudioSessionState, StudioStatus } from "./contracts";

export interface SanitizedSession { authenticated: boolean; merchant_name: string | null; verified: boolean | null }
export const signedOut: SanitizedSession = { authenticated: false, merchant_name: null, verified: null };
export type RuntimeMode = "native" | "preview";
export type StudioPublicEvent =
  | { version: "yaatal.studio.event.v1"; kind: "studio-invalidated" }
  | { version: "yaatal.studio.event.v1"; kind: "session-state"; isLive: boolean; sessionId?: string }
  | { version: "yaatal.studio.event.v1"; kind: "conversions-changed"; liveSessionId: string }
  | { version: "yaatal.studio.event.v1"; kind: "governed-action"; decision: "allow" | "deny" | "noop"; turnId: string; action: "studio.update_price_overlay" | "studio.mark_sold_out_overlay" | "studio.switch_product" };

const idPattern = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const readinessStatuses = new Set(["pending", "running", "passed", "failed", "skipped", "not_run"]);
const stockStatuses = new Set(["in_stock", "low_stock", "out_of_stock"]);
const queueSources = new Set(["engine_live_session", "engine_catalog_fallback", "mock_fallback"]);
const paymentProviders = new Set(["wave", "orange_money", "free_money", "mixx", "bank"]);
const sourceChannels = new Set(["copy", "livestream", "telegram", "whatsapp", "bobo", "unknown"]);

function record(value: unknown): Record<string, unknown> | null { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null; }
function exact(value: Record<string, unknown>, keys: readonly string[]): boolean { return Object.keys(value).every(key => keys.includes(key)); }
function text(value: unknown, limit: number, allowEmpty = false): string | null { return typeof value === "string" && value.length <= limit && (allowEmpty || value.trim().length > 0) && !/[\u0000-\u001f\u007f]/.test(value) ? value : null; }
function id(value: unknown): string | null { const candidate = text(value, 128); return candidate && idPattern.test(candidate) ? candidate : null; }
function whole(value: unknown, min: number, max: number): number | null { return typeof value === "number" && Number.isSafeInteger(value) && value >= min && value <= max ? value : null; }
function strings(value: unknown, limit: number, textLimit: number): string[] | null { if (!Array.isArray(value) || value.length > limit) return null; const result = value.map(item => text(item, textLimit)); return result.every((item): item is string => item !== null) ? result : null; }
function safeUrl(value: unknown): string | null {
  const candidate = text(value, 2048); if (!candidate) return null;
  try { const url = new URL(candidate); return (url.protocol === "https:" || url.protocol === "http:") && !url.username && !url.password && !url.hash ? candidate : null; } catch { return null; }
}

export function sanitizeSession(value: unknown): SanitizedSession | null {
  const v = record(value);
  if (!v || !exact(v, ["authenticated", "merchant_name", "verified"]) || typeof v.authenticated !== "boolean" || !(v.merchant_name === null || text(v.merchant_name, 200, true) !== null) || !(v.verified === null || typeof v.verified === "boolean")) return null;
  return { authenticated: v.authenticated, merchant_name: v.merchant_name as string | null, verified: v.verified as boolean | null };
}

export function sanitizeStudioEvent(value: unknown): StudioPublicEvent | null {
  const v = record(value);
  if (!v || v.version !== "yaatal.studio.event.v1" || typeof v.kind !== "string") return null;
  if (v.kind === "studio-invalidated") return exact(v, ["version", "kind"]) ? { version: "yaatal.studio.event.v1", kind: "studio-invalidated" } : null;
  if (v.kind === "session-state") {
    if (!exact(v, ["version", "kind", "isLive", "sessionId"]) || typeof v.isLive !== "boolean") return null;
    const sessionId = "sessionId" in v ? id(v.sessionId) : null;
    if (("sessionId" in v && !sessionId) || (v.isLive && !sessionId)) return null;
    return { version: "yaatal.studio.event.v1", kind: "session-state", isLive: v.isLive, ...(sessionId ? { sessionId } : {}) };
  }
  if (v.kind === "conversions-changed" && exact(v, ["version", "kind", "liveSessionId"])) {
    const liveSessionId = id(v.liveSessionId);
    return liveSessionId ? { version: "yaatal.studio.event.v1", kind: "conversions-changed", liveSessionId } : null;
  }
  if (v.kind === "governed-action" && exact(v, ["version", "kind", "decision", "turnId", "action"])) {
    const turnId = id(v.turnId);
    const decisions = ["allow", "deny", "noop"] as const;
    const actions = ["studio.update_price_overlay", "studio.mark_sold_out_overlay", "studio.switch_product"] as const;
    if (!turnId || !decisions.includes(v.decision as typeof decisions[number]) || !actions.includes(v.action as typeof actions[number])) return null;
    return { version: "yaatal.studio.event.v1", kind: "governed-action", decision: v.decision as typeof decisions[number], turnId, action: v.action as typeof actions[number] };
  }
  return null;
}

export function sanitizeCatalogProduct(value: unknown): CatalogProduct | null {
  const v = record(value);
  if (!v || !exact(v, ["id", "name", "description", "priceFcfa", "priceDisplay", "stock", "stockStatus", "category", "images", "variants"])) return null;
  const productId = id(v.id); const name = text(v.name, 200); const priceDisplay = text(v.priceDisplay, 64); const priceFcfa = whole(v.priceFcfa, 0, 100_000_000); const stock = whole(v.stock, 0, 1_000_000); const stockStatus = text(v.stockStatus, 32); const images = strings(v.images, 20, 2048);
  if (!productId || !name || !priceDisplay || priceFcfa === null || stock === null || !stockStatus || !stockStatuses.has(stockStatus) || !images || images.some(image => safeUrl(image) === null)) return null;
  let description: string | undefined; let category: string | undefined; let variants: string[] | undefined;
  if ("description" in v) { description = text(v.description, 4096, true) ?? undefined; if (v.description !== undefined && description === undefined) return null; }
  if ("category" in v) { category = text(v.category, 120, true) ?? undefined; if (v.category !== undefined && category === undefined) return null; }
  if ("variants" in v) { variants = strings(v.variants, 12, 48) ?? undefined; if (variants === undefined) return null; }
  return { id: productId, name, ...(description === undefined ? {} : { description }), priceFcfa, priceDisplay, stock, stockStatus, ...(category === undefined ? {} : { category }), images, ...(variants === undefined ? {} : { variants }) };
}

export function sanitizeCatalogPage(value: unknown): CatalogPage | null {
  const v = record(value);
  if (!v || !exact(v, ["products", "total", "page", "perPage"]) || !Array.isArray(v.products) || v.products.length > 100) return null;
  const products = v.products.map(sanitizeCatalogProduct); const total = whole(v.total, 0, 10_000_000); const page = whole(v.page, 1, 10_000); const perPage = whole(v.perPage, 1, 100);
  return products.every((product): product is CatalogProduct => product !== null) && total !== null && page !== null && perPage !== null ? { products, total, page, perPage } : null;
}

export function sanitizeStudioSession(value: unknown): StudioSessionState | null {
  const v = record(value);
  if (!v || !exact(v, ["isLive", "sessionId", "startedAt", "sellerName"]) || typeof v.isLive !== "boolean" || !(v.sessionId === null || id(v.sessionId)) || typeof v.startedAt !== "number" || !Number.isFinite(v.startedAt) || v.startedAt < 0) return null;
  const sellerName = text(v.sellerName, 200, true);
  return sellerName !== null && (!v.isLive || (v.sessionId !== null && v.startedAt > 0)) ? { isLive: v.isLive, sessionId: v.sessionId as string | null, startedAt: v.startedAt, sellerName } : null;
}

function sanitizeBootstrap(value: unknown): { authenticated: boolean } | null { const v = record(value); return v && exact(v, ["authenticated"]) && typeof v.authenticated === "boolean" ? { authenticated: v.authenticated } : null; }
function sanitizeQueue(value: unknown): ProductQueue | null {
  const v = record(value);
  if (!v || !exact(v, ["products", "source"]) || !Array.isArray(v.products) || v.products.length > 100 || typeof v.source !== "string" || !queueSources.has(v.source)) return null;
  const products = v.products.map(sanitizeCatalogProduct); return products.every((product): product is CatalogProduct => product !== null) ? { products, source: v.source } : null;
}
function sanitizeStatus(value: unknown): StudioStatus | null {
  const v = record(value); const readiness = v && record(v.readiness);
  if (!v || !readiness || !exact(v, ["health", "ledgerAvailable", "readiness"]) || !exact(readiness, ["status", "steps"]) || v.health !== "ok" || typeof v.ledgerAvailable !== "boolean" || typeof readiness.status !== "string" || !readinessStatuses.has(readiness.status) || !Array.isArray(readiness.steps) || readiness.steps.length > 32) return null;
  const steps = readiness.steps.map(step => {
    const entry = record(step); if (!entry || !exact(entry, ["name", "status", "durationMs"])) return null;
    const name = text(entry.name, 128); const status = text(entry.status, 32);
    if (!name || !/^[A-Za-z0-9][A-Za-z0-9_.:-]*$/.test(name) || !status || !readinessStatuses.has(status)) return null;
    if (!("durationMs" in entry)) return { name, status };
    const durationMs = whole(entry.durationMs, 0, 86_400_000); return durationMs === null ? null : { name, status, durationMs };
  });
  return steps.every((step): step is NonNullable<typeof step> => step !== null) ? { health: "ok", ledgerAvailable: v.ledgerAvailable, readiness: { status: readiness.status, steps } } : null;
}
function sanitizeIntent(value: unknown): CommerceIntent | null {
  const v = record(value); if (!v || !exact(v, ["intentId", "liveSessionId", "productId", "publicUrl", "livestreamUrl", "whatsappUrl", "telegramUrl"])) return null;
  const intentId = id(v.intentId); const liveSessionId = id(v.liveSessionId); const productId = id(v.productId); const publicUrl = safeUrl(v.publicUrl); const livestreamUrl = safeUrl(v.livestreamUrl); const whatsappUrl = safeUrl(v.whatsappUrl); const telegramUrl = safeUrl(v.telegramUrl);
  return intentId && liveSessionId && productId && publicUrl && livestreamUrl && whatsappUrl && telegramUrl ? { intentId, liveSessionId, productId, publicUrl, livestreamUrl, whatsappUrl, telegramUrl } : null;
}
function sanitizeOpenCommerceLink(value: unknown): OpenCommerceLinkResult | null {
  const v = record(value);
  if (!v || !exact(v, ["publicUrl", "opened"]) || typeof v.opened !== "boolean") return null;
  const publicUrl = safeUrl(v.publicUrl);
  return publicUrl ? { publicUrl, opened: v.opened } : null;
}
function sanitizeConversion(value: unknown): Conversion | null {
  const v = record(value);
  if (!v || !exact(v, ["version", "orderId", "productId", "productName", "totalFcfa", "paymentProvider", "paymentStatus", "liveSessionId", "sourceChannel", "deduplicated", "quantity", "createdAt"]) || v.version !== "yaatal.commerce-receipt.v1" || v.paymentStatus !== "sandbox_paid" || typeof v.deduplicated !== "boolean") return null;
  const orderId = id(v.orderId); const productId = id(v.productId); const productName = text(v.productName, 200); const totalFcfa = whole(v.totalFcfa, 0, 1_000_000_000); const paymentProvider = text(v.paymentProvider, 32); const liveSessionId = id(v.liveSessionId); const sourceChannel = text(v.sourceChannel, 32); const quantity = whole(v.quantity, 1, 10); const createdAt = text(v.createdAt, 64);
  return orderId && productId && productName && totalFcfa !== null && paymentProvider && paymentProviders.has(paymentProvider) && liveSessionId && sourceChannel && sourceChannels.has(sourceChannel) && quantity !== null && createdAt ? { version: "yaatal.commerce-receipt.v1", orderId, productId, productName, totalFcfa, paymentProvider, paymentStatus: "sandbox_paid", liveSessionId, sourceChannel, deduplicated: v.deduplicated, quantity, createdAt } : null;
}
function sanitizeConversions(value: unknown): Conversion[] | null { if (!Array.isArray(value) || value.length > 1_000) return null; const conversions = value.map(sanitizeConversion); return conversions.every((conversion): conversion is Conversion => conversion !== null) ? conversions : null; }

export interface NativeAdapter {
  runtimeMode(): Promise<RuntimeMode>; sessionStatus(): Promise<SanitizedSession>; login(email: string, password: string): Promise<SanitizedSession>; logout(): Promise<SanitizedSession>; sidecarStatus(): Promise<SidecarStatus>; startSidecar(): Promise<SidecarStatus>; subscribe(onSidecar: (status: SidecarStatus) => void, onProduct: (event: ProductNavigationRequest) => void, onStudio?: (event: StudioPublicEvent) => void): Promise<() => void>;
}
type Invoke = (command: string, args?: Record<string, unknown>) => Promise<unknown>;
type Request = <T>(command: string, parse: (value: unknown) => T | null, args?: Record<string, unknown>) => Promise<T>;
function createRequest(call: Invoke, native: boolean): Request {
  return async function request<T>(command: string, parse: (value: unknown) => T | null, args?: Record<string, unknown>): Promise<T> {
    if (!native) throw new Error("Open the desktop app to use this action.");
    let raw: unknown; try { raw = await call(command, args); } catch (failure) { throw transportError(failure); }
    const result = parse(raw); if (result === null) throw new Error("The desktop service returned an unsupported response."); return result;
  };
}

/**
 * Native failures arrive as fixed-contract snake_case codes (e.g. the Engine's
 * authentication_required). Only those pass through, humanized; anything else —
 * arbitrary text that could carry a credential fragment — stays masked.
 */
export function transportError(failure: unknown): Error {
  const text = (failure instanceof Error ? failure.message : typeof failure === "string" ? failure : "").trim();
  return /^[a-z]+(_[a-z]+)*$/.test(text) ? new Error(text.replace(/_/g, " ")) : new Error("The desktop service could not complete this request. Check the connection and try again.");
}

export function createNativeAdapter(call: Invoke = invoke, native = isTauri()): NativeAdapter {
  const request = createRequest(call, native);
  return {
    async runtimeMode() {
      if (!native) return "preview";
      const result = await request("os_runtime_mode", value => { const v = record(value); return v && Object.keys(v).length === 1 && typeof v.unified === "boolean" ? v.unified : null; });
      if (!result) throw new Error("This desktop build does not support the unified UI. Start a desktop build with unified mode enabled."); return "native";
    },
    sessionStatus: () => request("os_session_status", sanitizeSession), login: (email, password) => request("os_login", sanitizeSession, { email, password }), logout: () => request("os_logout", sanitizeSession), sidecarStatus: () => request("sidecar_status", sanitizeSidecarStatus), startSidecar: () => request("start_sidecar", sanitizeSidecarStatus),
    async subscribe(onSidecar, onProduct, onStudio = () => {}) {
      if (!native) return () => {};
      const failure = () => new Error("The desktop event service could not start. Check the connection and try again.");
      let stopSidecar: () => void;
      try { stopSidecar = await listen("yaatal://sidecar-status", event => { const v = sanitizeSidecarStatus(event.payload); if (v) onSidecar(v); }); } catch { throw failure(); }
      let stopProduct: () => void;
      try { stopProduct = await listen("yaatal://product-navigation", event => { const v = sanitizeProductNavigation(event.payload); if (v) onProduct(v); }); } catch { stopSidecar(); throw failure(); }
      try { const stopStudio = await listen("yaatal://studio-event", event => { const v = sanitizeStudioEvent(event.payload); if (v) onStudio(v); }); return () => { stopSidecar(); stopProduct(); stopStudio(); }; } catch { stopSidecar(); stopProduct(); throw failure(); }
    },
  };
}

/** UIR-01B command transport is pending native registration; this boundary is deliberately typed so feature work uses mocks until then. */
export function createWorkspaceAdapter(call: Invoke = invoke, native = isTauri()): CommerceWorkspaceAdapter {
  const request = createRequest(call, native);
  function requestedId(value: string, label: string): string { if (!id(value)) throw new Error(`The requested ${label} is invalid.`); return value; }
  return {
    catalog: {
      list: (args = {}) => { const commandArgs: Record<string, unknown> = {}; if (args.page !== undefined) { if (whole(args.page, 1, 10_000) === null) throw new Error("The requested catalog page is invalid."); commandArgs.page = args.page; } if (args.category !== undefined) { if (text(args.category, 120) === null) throw new Error("The requested catalog category is invalid."); commandArgs.category = args.category; } return request("catalog_list", sanitizeCatalogPage, commandArgs); },
      product: productId => request("catalog_product", sanitizeCatalogProduct, { productId: requestedId(productId, "product") }),
    },
    bootstrap: () => request("studio_session_bootstrap", sanitizeBootstrap), sessionState: () => request("studio_session_state", sanitizeStudioSession), goLive: () => request("studio_go_live", sanitizeStudioSession), stopStream: () => request("studio_stop_stream", sanitizeStudioSession), productQueue: () => request("studio_product_queue", sanitizeQueue), status: () => request("studio_status", sanitizeStatus), createIntent: productId => request("studio_create_commerce_intent", sanitizeIntent, { productId: requestedId(productId, "product") }), conversions: liveSessionId => request("studio_conversions", sanitizeConversions, { liveSessionId: requestedId(liveSessionId, "live session") }),
    // Native validates the stored intent URL and performs any external open. The renderer
    // never supplies a URL; for copy it receives this retained, validated public URL.
    openLink: (intentId, channel) => { const validChannels: CommerceChannel[] = ["copy", "livestream", "telegram", "whatsapp"]; if (!validChannels.includes(channel)) throw new Error("The requested commerce channel is invalid."); return request("open_commerce_link", sanitizeOpenCommerceLink, { intentId: requestedId(intentId, "commerce link"), channel }); },
  };
}

/**
 * Versioned browser-safe contracts for the Yaatal OS shell.
 *
 * This package deliberately excludes raw audio, transcripts, JWTs, credentials,
 * and token-bearing URLs. Rust validates command input independently before it
 * emits any matching event.
 */
export const OS_PROTOCOL_VERSION = "yaatal-os.v1" as const;

export type SidecarState = "stopped" | "starting" | "ready" | "failed";
export type SidecarErrorCode =
  | "spawn_failed"
  | "startup_timeout"
  | "unexpected_exit";

export interface SidecarStatus {
  version: typeof OS_PROTOCOL_VERSION;
  kind: "sidecar-status";
  state: SidecarState;
  isRunning: boolean;
  port: number;
  errorCode?: SidecarErrorCode;
}

export interface ProductNavigationRequest {
  version: typeof OS_PROTOCOL_VERSION;
  kind: "product-navigation";
  productId: string;
  /**
   * Originator of the navigation. Only "studio" is valid today: the operator
   * (or a governed agent action) put a product on air in the Studio cockpit.
   * The Shop window never originates product navigation.
   */
  source: ProductNavigationSource;
}

export type ProductNavigationSource = "studio";

export interface ShopRefreshRequest {
  version: typeof OS_PROTOCOL_VERSION;
  kind: "shop-refresh";
  scope: "catalog" | "product";
}

export type ShopEvent = ProductNavigationRequest | ShopRefreshRequest;

const productIdPattern = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const allowedErrorCodes = new Set<SidecarErrorCode>([
  "spawn_failed",
  "startup_timeout",
  "unexpected_exit",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function sanitizeProductNavigation(value: unknown): ProductNavigationRequest | null {
  if (!isRecord(value) || value.kind !== "product-navigation") {
    return null;
  }

  if (value.source !== "studio") {
    return null;
  }

  const productId = typeof value.productId === "string" ? value.productId.trim() : "";
  if (!productIdPattern.test(productId)) {
    return null;
  }

  return {
    version: OS_PROTOCOL_VERSION,
    kind: "product-navigation",
    productId,
    source: "studio",
  };
}

export function sanitizeShopRefresh(value: unknown): ShopRefreshRequest | null {
  if (!isRecord(value) || value.kind !== "shop-refresh") {
    return null;
  }

  const scope = value.scope;
  if (scope !== "catalog" && scope !== "product") {
    return null;
  }

  return { version: OS_PROTOCOL_VERSION, kind: "shop-refresh", scope };
}

export function sanitizeSidecarStatus(value: unknown): SidecarStatus | null {
  if (!isRecord(value) || value.kind !== "sidecar-status") {
    return null;
  }

  const state = value.state;
  const port = value.port;
  if (
    (state !== "stopped" && state !== "starting" && state !== "ready" && state !== "failed") ||
    typeof value.isRunning !== "boolean" ||
    typeof port !== "number" ||
    !Number.isInteger(port) ||
    port < 1 ||
    port > 65535
  ) {
    return null;
  }

  const errorCode = value.errorCode;
  if (errorCode !== undefined && (typeof errorCode !== "string" || !allowedErrorCodes.has(errorCode as SidecarErrorCode))) {
    return null;
  }

  return {
    version: OS_PROTOCOL_VERSION,
    kind: "sidecar-status",
    state,
    isRunning: value.isRunning,
    port,
    ...(errorCode === undefined ? {} : { errorCode: errorCode as SidecarErrorCode }),
  };
}

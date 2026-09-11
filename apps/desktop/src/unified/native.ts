import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { sanitizeSidecarStatus, sanitizeProductNavigation, type SidecarStatus, type ProductNavigationRequest } from "@yaatal/os-protocol";
export interface SanitizedSession { authenticated: boolean; merchant_name: string | null; verified: boolean | null }
export const signedOut: SanitizedSession = { authenticated: false, merchant_name: null, verified: null };
export type RuntimeMode = "native" | "preview";
export function sanitizeSession(value: unknown): SanitizedSession | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (Object.keys(v).some(key => !["authenticated", "merchant_name", "verified"].includes(key)) || typeof v.authenticated !== "boolean" || !(v.merchant_name === null || typeof v.merchant_name === "string" && v.merchant_name.length <= 200) || !(v.verified === null || typeof v.verified === "boolean")) return null;
  return { authenticated: v.authenticated, merchant_name: v.merchant_name as string | null, verified: v.verified as boolean | null };
}
export interface NativeAdapter {
  runtimeMode(): Promise<RuntimeMode>;
  sessionStatus(): Promise<SanitizedSession>;
  login(email: string, password: string): Promise<SanitizedSession>;
  logout(): Promise<SanitizedSession>;
  sidecarStatus(): Promise<SidecarStatus>;
  startSidecar(): Promise<SidecarStatus>;
  subscribe(onSidecar: (status: SidecarStatus) => void, onProduct: (event: ProductNavigationRequest) => void): Promise<() => void>;
}
type Invoke = (command: string, args?: Record<string, unknown>) => Promise<unknown>;
export function createNativeAdapter(call: Invoke = invoke, native = isTauri()): NativeAdapter {
  async function request<T>(command: string, parse: (value: unknown) => T | null, args?: Record<string, unknown>): Promise<T> {
    if (!native) throw new Error("Open the desktop app to use this action.");
    let raw: unknown;
    try { raw = await call(command, args); } catch { throw new Error("The desktop service could not complete this request. Check the connection and try again."); }
    const result = parse(raw);
    if (result === null) throw new Error("The desktop service returned an unsupported response.");
    return result;
  }
  return {
    async runtimeMode() {
      if (!native) return "preview";
      const result = await request("os_runtime_mode", value => {
        if (!value || typeof value !== "object" || Array.isArray(value)) return null;
        const v = value as Record<string, unknown>;
        return Object.keys(v).length === 1 && typeof v.unified === "boolean" ? v.unified : null;
      });
      if (!result) throw new Error("This desktop build does not support the unified UI. Start a desktop build with unified mode enabled.");
      return "native";
    },
    sessionStatus: () => request("os_session_status", sanitizeSession),
    login: (email, password) => request("os_login", sanitizeSession, { email, password }),
    logout: () => request("os_logout", sanitizeSession),
    sidecarStatus: () => request("sidecar_status", sanitizeSidecarStatus),
    startSidecar: () => request("start_sidecar", sanitizeSidecarStatus),
    async subscribe(onSidecar, onProduct) {
      if (!native) return () => {};
      const stopSidecar = await listen("yaatal://sidecar-status", event => { const v = sanitizeSidecarStatus(event.payload); if (v) onSidecar(v); });
      try {
        const stopProduct = await listen("yaatal://product-navigation", event => { const v = sanitizeProductNavigation(event.payload); if (v) onProduct(v); });
        return () => { stopSidecar(); stopProduct(); };
      } catch (error) { stopSidecar(); throw error; }
    },
  };
}

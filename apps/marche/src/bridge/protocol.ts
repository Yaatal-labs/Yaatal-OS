/**
 * The wire format for `window.kairmel` <-> host `postMessage` calls. Both sides validate
 * every message against this before trusting a single field of it — cross-window messages
 * are exactly as trustworthy as input from the network.
 */
export const KAIRMEL_PROTOCOL = "kairmel.bridge.v1";

/** The three calls `window.kairmel` exposes. The host maps these to manifest permissions
 *  of the same name. */
export type KairmelMethod = "identity" | "share" | "pay";

export interface KairmelRequestEnvelope {
  channel: typeof KAIRMEL_PROTOCOL;
  direction: "request";
  id: string;
  /** Left as `string`, not `KairmelMethod`, here: the *shape* check below only proves this is
   *  a well-formed request. Whether the method is one the host understands is a dispatch
   *  decision, not a parsing one — see `host/bridge-host.ts`. */
  method: string;
  params?: Record<string, unknown>;
}

export interface KairmelErrorPayload {
  code: string;
  message: string;
}

export type KairmelResponseEnvelope =
  | { channel: typeof KAIRMEL_PROTOCOL; direction: "response"; id: string; ok: true; result: unknown }
  | { channel: typeof KAIRMEL_PROTOCOL; direction: "response"; id: string; ok: false; error: KairmelErrorPayload };

const MAX_ID_LENGTH = 128;
const MAX_METHOD_LENGTH = 64;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isKairmelRequest(value: unknown): value is KairmelRequestEnvelope {
  if (!isRecord(value)) return false;
  if (value.channel !== KAIRMEL_PROTOCOL) return false;
  if (value.direction !== "request") return false;
  if (typeof value.id !== "string" || value.id.length === 0 || value.id.length > MAX_ID_LENGTH) return false;
  if (typeof value.method !== "string" || value.method.length === 0 || value.method.length > MAX_METHOD_LENGTH) {
    return false;
  }
  if (value.params !== undefined && !isRecord(value.params)) return false;
  return true;
}

export function isKairmelResponse(value: unknown): value is KairmelResponseEnvelope {
  if (!isRecord(value)) return false;
  if (value.channel !== KAIRMEL_PROTOCOL) return false;
  if (value.direction !== "response") return false;
  if (typeof value.id !== "string" || value.id.length === 0 || value.id.length > MAX_ID_LENGTH) return false;
  if (typeof value.ok !== "boolean") return false;
  if (value.ok === false) {
    const error = value.error;
    if (!isRecord(error) || typeof error.code !== "string" || typeof error.message !== "string") return false;
  }
  return true;
}

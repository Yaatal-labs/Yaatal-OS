const DEVICE_ID_STORAGE_KEY = "kairmel.marche.deviceId";

export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/**
 * The host's per-device id: random, generated once, stored locally, no account behind it.
 * `deriveAppUserId` below turns it into a per-app id that never reveals the phone number.
 *
 * This is **not** what `identity()` uses any more — WhatsApp sign-in shipped, and the real
 * identity comes from the signed-in session instead (`host/identity-provider.ts`'s
 * `SessionIdentityProvider`, backed by marche-api's `GET /v1/me/identity`). What's here now
 * backs only the explicit dev-only fallback (`DeviceIdentityProvider` in the same file,
 * gated by `VITE_DEV_PLACEHOLDER_IDENTITY` — see `src/vite-env.d.ts`), kept so `pnpm dev` in
 * this app can still exercise `identity()` without a running marche-api + Engine.
 */
export function getOrCreateDeviceId(storage: KeyValueStorage): string {
  const existing = storage.getItem(DEVICE_ID_STORAGE_KEY);
  if (existing) return existing;
  const generated = crypto.randomUUID();
  storage.setItem(DEVICE_ID_STORAGE_KEY, generated);
  return generated;
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/** HMAC-SHA256(deviceId, appId) — the same device always derives the same id for a given
 *  app, and a different id for every other app, without the app ever seeing the device id. */
export async function deriveAppUserId(deviceId: string, appId: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(deviceId),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(appId));
  return toHex(new Uint8Array(signature));
}

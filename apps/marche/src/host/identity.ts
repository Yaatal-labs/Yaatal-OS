const DEVICE_ID_STORAGE_KEY = "kairmel.marche.deviceId";

export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/**
 * The host's per-device id. It is random, generated once, and stored locally — there is no
 * account behind it yet. `deriveAppUserId` below turns it into a per-app id that never
 * reveals the phone number. Once WhatsApp sign-in ships, this is replaced by the signed-in
 * user's stable account id; every id derived from today's device id changes when that
 * happens, so mini-apps must treat `identity()` as "stable for now", not "permanent".
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

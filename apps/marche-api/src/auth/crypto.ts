// Small, dependency-free crypto helpers shared by the auth modules below. Everything here uses
// the Web Crypto API (available as a global in the Workers runtime, no import needed).

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * A high-entropy, URL- and cookie-safe token: 32 random bytes, base64url-encoded (43 characters,
 * no padding). This is the value that actually goes in the session cookie -- see
 * `src/auth/sessions.ts`, which never stores it, only `hmacHex`'s digest of it.
 */
export function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * hex HMAC-SHA256(key, value). Used for two unrelated things, each with its *own* key:
 *  - `src/auth/sessions.ts` hashes session tokens before storing them, keyed by SESSION_SECRET.
 *  - `src/auth/identity.ts` derives a per-app id from a pid, keyed by IDENTITY_SECRET.
 * Keeping the two keys separate means rotating one (e.g. SESSION_SECRET, to force every session
 * to expire) can never silently change the other's output (a mini-app's "stable" per-app id).
 */
export async function hmacHex(key: string, value: string): Promise<string> {
  const encoder = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(value));
  return toHex(new Uint8Array(signature));
}

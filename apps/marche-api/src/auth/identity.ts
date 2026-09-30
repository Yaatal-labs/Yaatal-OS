import { hmacHex } from "./crypto.js";

/**
 * A signed-in person's per-app id: hex HMAC-SHA256(IDENTITY_SECRET, "<pid>:<appId>"). Stable
 * across devices (it's keyed on the Engine's account `pid`, not a device or session), different
 * for every app (the app id is part of the signed material, same idea as
 * apps/marche's own `deriveAppUserId`), and not reversible to the `pid` without IDENTITY_SECRET.
 * See `GET /v1/me/identity` in src/index.ts.
 */
export async function deriveIdentity(identitySecret: string, pid: string, appId: string): Promise<string> {
  return hmacHex(identitySecret, `${pid}:${appId}`);
}

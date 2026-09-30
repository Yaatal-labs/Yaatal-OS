// The session cookie: a `__Host-` prefixed cookie, which Chrome, Firefox and Safari all refuse
// to set unless it also carries `Secure`, `Path=/` and no `Domain` -- exactly the attributes
// below, so the browser itself enforces the cookie can only ever come from, and be sent back to,
// this exact origin. `Secure` cookies are permitted over plain `http://localhost` in every
// current browser (treated as a secure context), so this also works unmodified under
// `wrangler dev`.
const COOKIE_NAME = "__Host-marche_session";
const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60; // 30 days, matches src/auth/sessions.ts

export function readSessionCookie(request: Request): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const name = part.slice(0, eq).trim();
    if (name !== COOKIE_NAME) continue;
    const value = part.slice(eq + 1).trim();
    try {
      return decodeURIComponent(value);
    } catch {
      return null;
    }
  }
  return null;
}

export function setSessionCookie(token: string): string {
  return `${COOKIE_NAME}=${encodeURIComponent(token)}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${SESSION_MAX_AGE_SECONDS}`;
}

export function clearSessionCookie(): string {
  return `${COOKIE_NAME}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;
}

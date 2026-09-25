/**
 * The Atelier embeds the Yaatal Cloudflare OS (apps/cloudflare-os) in the shell. Its address is
 * build-time configuration, but it is still treated as untrusted: only HTTP(S), plain HTTP only on
 * loopback, no credentials, and no query or fragment (the OS is a single-page app served from its
 * root, so nothing sensitive should ever ride on this URL).
 */
export const DEFAULT_ATELIER_URL = "http://localhost:8787/";

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

export function resolveAtelierUrl(raw: string | undefined | null): string | null {
  const candidate = raw?.trim() || DEFAULT_ATELIER_URL;
  let url: URL;
  try { url = new URL(candidate); } catch { return null; }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (url.username || url.password) return null;
  if (url.protocol === "http:" && !LOOPBACK_HOSTS.has(url.hostname)) return null;
  return `${url.origin}${url.pathname}`;
}

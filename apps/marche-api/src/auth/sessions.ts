// Session storage in D1 -- see migrations/0002_auth.sql. A session is created once, at the end
// of a successful WhatsApp verify (src/index.ts); looked up on every /v1/me and
// /v1/me/identity call; and deleted on logout. The raw token (what the cookie holds) is never
// written to D1 -- only its keyed hash (`hmacHex(sessionSecret, token)`, see src/auth/crypto.ts).
import { hmacHex, randomToken } from "./crypto.js";

const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days, per the spec

export interface CreatedSession {
  /** The raw, high-entropy token -- this, and only this, goes in the cookie. */
  token: string;
  expiresAt: string;
}

export interface Session {
  pid: string;
}

async function hashToken(sessionSecret: string, token: string): Promise<string> {
  return hmacHex(sessionSecret, token);
}

/** Creates a new 30-day session for `pid` and returns the raw token for the cookie. */
export async function createSession(db: D1Database, sessionSecret: string, pid: string): Promise<CreatedSession> {
  const token = randomToken();
  const id = await hashToken(sessionSecret, token);
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000).toISOString();
  await db.prepare("INSERT INTO sessions (id, pid, expires_at) VALUES (?, ?, ?)").bind(id, pid, expiresAt).run();
  return { token, expiresAt };
}

/**
 * Looks up the session for a raw cookie token. `null` both when no such session exists and when
 * it has expired -- callers never need to tell the two apart, and an expired row is simply
 * treated as signed-out rather than actively pruned here (see migrations/0002_auth.sql).
 */
export async function getSession(db: D1Database, sessionSecret: string, token: string): Promise<Session | null> {
  const id = await hashToken(sessionSecret, token);
  const row = await db
    .prepare("SELECT pid, expires_at FROM sessions WHERE id = ?")
    .bind(id)
    .first<{ pid: string; expires_at: string }>();
  if (!row) return null;
  if (Date.parse(row.expires_at) <= Date.now()) return null;
  return { pid: row.pid };
}

/** Deletes the session for a raw cookie token, if any. A no-op for an unknown or already-expired
 *  token -- logout always succeeds from the caller's point of view. */
export async function deleteSession(db: D1Database, sessionSecret: string, token: string): Promise<void> {
  const id = await hashToken(sessionSecret, token);
  await db.prepare("DELETE FROM sessions WHERE id = ?").bind(id).run();
}

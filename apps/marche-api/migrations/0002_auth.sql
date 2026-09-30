-- WhatsApp sign-in sessions and per-IP rate limiting for the /v1/auth/* and /v1/me* routes (see
-- src/auth/*.ts and src/index.ts). Neither table ever stores a phone number or the Engine's
-- session token itself -- see the column comments below.

-- One row per signed-in session. The browser's cookie holds a high-entropy random token;
-- `id` here is that token's keyed hash (HMAC-SHA256 with SESSION_SECRET, see src/auth/crypto.ts
-- and src/auth/sessions.ts) -- never the token itself, so a leaked copy of this table cannot be
-- used to sign in as anyone, the same reasoning as storing password hashes instead of passwords.
CREATE TABLE sessions (
  id TEXT PRIMARY KEY, -- hex HMAC-SHA256(SESSION_SECRET, session token)
  pid TEXT NOT NULL, -- the Yaatal Engine's stable user id for this person -- never a phone number
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  expires_at TEXT NOT NULL
);
CREATE INDEX sessions_expires ON sessions (expires_at);

-- Per-IP, fixed-window rate limiting for the two WhatsApp sign-in calls that take a guess
-- (start: opens a nonce; verify: guesses a 6-digit code) -- see src/auth/rate-limit.ts. `bucket`
-- already encodes the route, the IP and the current window, so one counter row is all one
-- (route, ip, window) triple ever needs.
CREATE TABLE rate_limits (
  bucket TEXT PRIMARY KEY, -- "<route>:<ip>:<windowStartUnixSeconds>"
  count INTEGER NOT NULL DEFAULT 0
);

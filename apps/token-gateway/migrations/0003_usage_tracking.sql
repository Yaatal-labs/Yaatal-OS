-- Requests the gateway turned away. Usage and credits are already in the ledger; these are the calls
-- that never became a ledger row, so demand lost to an empty balance or an upstream outage is visible.
CREATE TABLE request_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id TEXT NOT NULL REFERENCES accounts(id),
  kind TEXT NOT NULL CHECK (kind IN ('insufficient_balance', 'upstream_error', 'no_upstream')),
  model TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX request_events_time ON request_events (created_at);

-- The usage report reads the ledger by time across all accounts.
CREATE INDEX ledger_time ON ledger (created_at);

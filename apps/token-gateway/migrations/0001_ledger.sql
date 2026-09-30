-- Balances are integers in micro-FCFA (1 FCFA = 1,000,000). A price in FCFA per million tokens is
-- therefore exactly the cost in micro-FCFA per token, so no floating point touches money.
CREATE TABLE accounts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  balance_ufcfa INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Only the SHA-256 of a key is stored; the key itself is shown once, at creation.
CREATE TABLE api_keys (
  key_hash TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id),
  label TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  revoked_at TEXT
);

-- Every balance change is a ledger row: usage debits and admin credits alike.
CREATE TABLE ledger (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id TEXT NOT NULL REFERENCES accounts(id),
  kind TEXT NOT NULL CHECK (kind IN ('usage', 'credit')),
  amount_ufcfa INTEGER NOT NULL,
  model TEXT,
  input_tokens INTEGER,
  output_tokens INTEGER,
  estimated INTEGER NOT NULL DEFAULT 0,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX ledger_account_time ON ledger (account_id, id DESC);

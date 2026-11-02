-- Durable, account-scoped idempotency and prepayment holds for bounded Boo model calls.
CREATE TABLE ledger_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id TEXT NOT NULL REFERENCES accounts(id),
  kind TEXT NOT NULL CHECK (kind IN ('usage', 'credit', 'reservation')),
  amount_uxof INTEGER NOT NULL,
  model TEXT,
  input_tokens INTEGER,
  output_tokens INTEGER,
  estimated INTEGER NOT NULL DEFAULT 0,
  note TEXT,
  payment_ref TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
INSERT INTO ledger_new (id, account_id, kind, amount_uxof, model, input_tokens, output_tokens, estimated, note, payment_ref, created_at)
  SELECT id, account_id, kind, amount_uxof, model, input_tokens, output_tokens, estimated, note, payment_ref, created_at FROM ledger;
DROP TABLE ledger;
ALTER TABLE ledger_new RENAME TO ledger;
CREATE INDEX ledger_account_time ON ledger (account_id, id DESC);
CREATE INDEX ledger_time ON ledger (created_at);
CREATE UNIQUE INDEX ledger_payment_ref_global ON ledger (payment_ref) WHERE payment_ref IS NOT NULL;

CREATE TABLE boo_runs (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id),
  idempotency_key TEXT NOT NULL,
  request_sha256 TEXT NOT NULL,
  model TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('reserved', 'settled', 'failed', 'uncertain')),
  reserved_uxof INTEGER NOT NULL CHECK (reserved_uxof >= 0),
  actual_uxof INTEGER,
  input_tokens INTEGER,
  output_tokens INTEGER,
  completion_json TEXT,
  error_code TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (account_id, idempotency_key)
);
CREATE INDEX boo_runs_account_time ON boo_runs (account_id, created_at DESC);

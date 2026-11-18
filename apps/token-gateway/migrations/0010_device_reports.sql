-- A device report is applied once per account, across all its customer keys.
CREATE TABLE device_reports (
  account_id TEXT NOT NULL REFERENCES accounts(id),
  report_id TEXT NOT NULL,
  turns INTEGER NOT NULL CHECK (turns BETWEEN 1 AND 500),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (account_id, report_id)
);

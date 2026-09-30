-- A published listing: one row per manifest id, holding the manifest exactly as submitted and
-- its review status. Publishing again under the *same* owner overwrites the manifest and puts
-- it back to pending (see src/listings.ts, publishListing); the same id under a *different*
-- owner is refused there rather than silently taking it over.
CREATE TABLE listings (
  id TEXT PRIMARY KEY,
  owner TEXT NOT NULL,
  manifest TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected')) DEFAULT 'pending',
  reason TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX listings_status ON listings (status, updated_at DESC);

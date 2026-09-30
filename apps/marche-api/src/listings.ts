// Listings in D1: one row per manifest id. A listing starts pending, an admin approves or
// rejects it, and a same-owner republish always puts it back to pending for re-review.
import type { AppManifest } from "./manifest.js";

export type ListingStatus = "pending" | "approved" | "rejected";

export interface ListingRow {
  id: string;
  owner: string;
  manifest: AppManifest;
  status: ListingStatus;
  reason: string | null;
  createdAt: string;
  updatedAt: string;
}

/** The id is already published, by an owner other than the one asking to publish over it. */
export class OwnerMismatchError extends Error {
  constructor() {
    super("listing id already published by a different owner");
  }
}

interface ListingDbRow {
  id: string;
  owner: string;
  manifest: string;
  status: string;
  reason: string | null;
  created_at: string;
  updated_at: string;
}

function fromDbRow(row: ListingDbRow): ListingRow {
  return {
    id: row.id,
    owner: row.owner,
    manifest: JSON.parse(row.manifest) as AppManifest,
    status: row.status as ListingStatus,
    reason: row.reason,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface PublishResult {
  id: string;
  status: "pending";
  created: boolean;
}

/**
 * Publishes a manifest. A new `manifest.id` is inserted pending. An existing id owned by the
 * same `owner` is replaced in place and put back to pending (whatever it was before). An
 * existing id owned by a *different* owner throws `OwnerMismatchError` -- nothing is changed.
 */
export async function publishListing(db: D1Database, manifest: AppManifest, owner: string): Promise<PublishResult> {
  const existing = await db.prepare("SELECT owner FROM listings WHERE id = ?").bind(manifest.id).first<{ owner: string }>();
  if (existing) {
    if (existing.owner !== owner) throw new OwnerMismatchError();
    await db
      .prepare(
        `UPDATE listings SET manifest = ?, status = 'pending', reason = NULL,
         updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?`,
      )
      .bind(JSON.stringify(manifest), manifest.id)
      .run();
    return { id: manifest.id, status: "pending", created: false };
  }
  await db
    .prepare("INSERT INTO listings (id, owner, manifest, status) VALUES (?, ?, ?, 'pending')")
    .bind(manifest.id, owner, JSON.stringify(manifest))
    .run();
  return { id: manifest.id, status: "pending", created: true };
}

export async function getListing(db: D1Database, id: string): Promise<ListingRow | null> {
  const row = await db
    .prepare("SELECT id, owner, manifest, status, reason, created_at, updated_at FROM listings WHERE id = ?")
    .bind(id)
    .first<ListingDbRow>();
  return row ? fromDbRow(row) : null;
}

/** All listings, or only those in `status`, most recently updated first. */
export async function listListings(db: D1Database, status?: ListingStatus): Promise<ListingRow[]> {
  const statement = status
    ? db
        .prepare("SELECT id, owner, manifest, status, reason, created_at, updated_at FROM listings WHERE status = ? ORDER BY updated_at DESC")
        .bind(status)
    : db.prepare("SELECT id, owner, manifest, status, reason, created_at, updated_at FROM listings ORDER BY updated_at DESC");
  const { results } = await statement.all<ListingDbRow>();
  return results.map(fromDbRow);
}

/** Approves a listing, clearing any earlier rejection reason. Null when no such id exists. */
export async function approveListing(db: D1Database, id: string): Promise<ListingRow | null> {
  const result = await db
    .prepare("UPDATE listings SET status = 'approved', reason = NULL, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?")
    .bind(id)
    .run();
  if (result.meta.changes === 0) return null;
  return getListing(db, id);
}

/** Rejects a listing with a (required, French) reason. Null when no such id exists. */
export async function rejectListing(db: D1Database, id: string, reason: string): Promise<ListingRow | null> {
  const result = await db
    .prepare("UPDATE listings SET status = 'rejected', reason = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?")
    .bind(reason, id)
    .run();
  if (result.meta.changes === 0) return null;
  return getListing(db, id);
}

/** Every approved manifest, sorted by name -- exactly what GET /v1/catalogue serves. */
export async function approvedCatalogue(db: D1Database): Promise<AppManifest[]> {
  const { results } = await db.prepare("SELECT manifest FROM listings WHERE status = 'approved'").all<{ manifest: string }>();
  const apps = results.map((row) => JSON.parse(row.manifest) as AppManifest);
  return apps.sort((a, b) => a.name.localeCompare(b.name));
}

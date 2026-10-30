// Accounts, keys and balances in D1. Every balance change is one atomic batch: the ledger row and the
// balance update commit together or not at all.

export interface Account {
  id: string;
  name: string;
  balanceUxof: number;
}

export interface UsageRecord {
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUxof: number;
  estimated: boolean;
}

export interface BooRun {
  id: string; accountId: string; idempotencyKey: string; requestHash: string; model: string;
  status: "reserved" | "settled" | "failed" | "uncertain"; reservedUxof: number;
  actualUxof: number | null; inputTokens: number | null; outputTokens: number | null;
  completionJson: string | null; errorCode: string | null;
}

function asBooRun(row: Record<string, unknown> | null): BooRun | null {
  if (!row) return null;
  return {
    id: String(row.id), accountId: String(row.account_id), idempotencyKey: String(row.idempotency_key),
    requestHash: String(row.request_sha256), model: String(row.model), status: row.status as BooRun["status"],
    reservedUxof: Number(row.reserved_uxof), actualUxof: row.actual_uxof === null ? null : Number(row.actual_uxof),
    inputTokens: row.input_tokens === null ? null : Number(row.input_tokens),
    outputTokens: row.output_tokens === null ? null : Number(row.output_tokens),
    completionJson: typeof row.completion_json === "string" ? row.completion_json : null,
    errorCode: typeof row.error_code === "string" ? row.error_code : null,
  };
}

const BOO_RUN_COLUMNS = `id, account_id, idempotency_key, request_sha256, model, status, reserved_uxof,
  actual_uxof, input_tokens, output_tokens, completion_json, error_code`;

export async function booRunByKey(db: D1Database, accountId: string, key: string): Promise<BooRun | null> {
  const row = await db.prepare(`SELECT ${BOO_RUN_COLUMNS} FROM boo_runs WHERE account_id = ? AND idempotency_key = ?`)
    .bind(accountId, key).first<Record<string, unknown>>();
  return asBooRun(row);
}

export async function booRunById(db: D1Database, accountId: string, id: string): Promise<BooRun | null> {
  const row = await db.prepare(`SELECT ${BOO_RUN_COLUMNS} FROM boo_runs WHERE account_id = ? AND id = ?`)
    .bind(accountId, id).first<Record<string, unknown>>();
  return asBooRun(row);
}

/** Reserve balance and create the durable run in one D1 transaction. */
export async function reserveBooRun(db: D1Database, run: {
  id: string; accountId: string; idempotencyKey: string; requestHash: string; model: string; amountUxof: number;
}): Promise<boolean> {
  const [debit, insert] = await db.batch([
    db.prepare("UPDATE accounts SET balance_uxof = balance_uxof - ? WHERE id = ? AND balance_uxof >= ?")
      .bind(run.amountUxof, run.accountId, run.amountUxof),
    db.prepare(`INSERT INTO boo_runs (id, account_id, idempotency_key, request_sha256, model, status, reserved_uxof)
      SELECT ?, ?, ?, ?, ?, 'reserved', ? WHERE changes() = 1`)
      .bind(run.id, run.accountId, run.idempotencyKey, run.requestHash, run.model, run.amountUxof),
    db.prepare(`INSERT INTO ledger (account_id, kind, amount_uxof, model, note)
      SELECT account_id, 'reservation', -reserved_uxof, model, 'Boo inference reservation' FROM boo_runs WHERE id = ? AND status = 'reserved'`)
      .bind(run.id),
  ]);
  if (Number(debit?.meta?.changes) === 1 && Number(insert?.meta?.changes) === 1) return true;
  return false;
}

export async function settleBooRun(db: D1Database, id: string, settlement: {
  actualUxof: number; inputTokens: number; outputTokens: number; estimated: boolean; completionJson: string;
}): Promise<void> {
  await db.batch([
    db.prepare(`INSERT INTO ledger (account_id, kind, amount_uxof, model, note)
      SELECT account_id, 'reservation', reserved_uxof, model, 'Boo inference reservation settled' FROM boo_runs WHERE id = ? AND status = 'reserved'`)
      .bind(id),
    db.prepare(`INSERT INTO ledger (account_id, kind, amount_uxof, model, input_tokens, output_tokens, estimated)
      SELECT account_id, 'usage', ?, model, ?, ?, ? FROM boo_runs WHERE id = ? AND status = 'reserved'`)
      .bind(-settlement.actualUxof, settlement.inputTokens, settlement.outputTokens, settlement.estimated ? 1 : 0, id),
    db.prepare(`UPDATE accounts SET balance_uxof = balance_uxof +
      (SELECT reserved_uxof - ? FROM boo_runs WHERE id = ? AND status = 'reserved')
      WHERE id = (SELECT account_id FROM boo_runs WHERE id = ? AND status = 'reserved')`)
      .bind(settlement.actualUxof, id, id),
    db.prepare(`UPDATE boo_runs SET status = 'settled', actual_uxof = ?, input_tokens = ?, output_tokens = ?,
      completion_json = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ? AND status = 'reserved'`)
      .bind(settlement.actualUxof, settlement.inputTokens, settlement.outputTokens, settlement.completionJson, id),
  ]);
}

export async function releaseBooRun(db: D1Database, id: string, reason: string): Promise<void> {
  await db.batch([
    db.prepare(`INSERT INTO ledger (account_id, kind, amount_uxof, note)
      SELECT account_id, 'reservation', reserved_uxof, ? FROM boo_runs WHERE id = ? AND status = 'reserved'`).bind(`Boo reservation released: ${reason}`, id),
    db.prepare(`UPDATE accounts SET balance_uxof = balance_uxof +
      (SELECT reserved_uxof FROM boo_runs WHERE id = ? AND status = 'reserved')
      WHERE id = (SELECT account_id FROM boo_runs WHERE id = ? AND status = 'reserved')`).bind(id, id),
    db.prepare(`UPDATE boo_runs SET status = 'failed', error_code = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      WHERE id = ? AND status = 'reserved'`).bind(reason, id),
  ]);
}

const KEY_PREFIX = "yk_";

export class UnknownAccountError extends Error {
  constructor() {
    super("unknown account");
  }
}

/** A payment reference already funded a credit on another account: one settlement, one balance. */
export class PaymentRefConflictError extends Error {
  constructor() {
    super("payment_ref already credited to another account");
  }
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

export function newApiKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let text = "";
  for (const byte of bytes) text += String.fromCharCode(byte);
  return KEY_PREFIX + btoa(text).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

/** The account behind a live key, or null. Malformed keys never reach the database. */
export async function accountForKey(db: D1Database, key: string): Promise<Account | null> {
  if (!key.startsWith(KEY_PREFIX) || key.length > 128) return null;
  const row = await db
    .prepare(
      `SELECT a.id, a.name, a.balance_uxof FROM api_keys k JOIN accounts a ON a.id = k.account_id
       WHERE k.key_hash = ? AND k.revoked_at IS NULL`,
    )
    .bind(await sha256Hex(key))
    .first<{ id: string; name: string; balance_uxof: number }>();
  return row ? { id: row.id, name: row.name, balanceUxof: row.balance_uxof } : null;
}

export async function createAccount(db: D1Database, name: string, issuer: string | null = null): Promise<Account> {
  const id = crypto.randomUUID();
  await db.prepare("INSERT INTO accounts (id, name, issuer) VALUES (?, ?, ?)").bind(id, name, issuer).run();
  return { id, name, balanceUxof: 0 };
}

export interface PidAccount {
  id: string;
  issuer: string | null;
  balanceUxof: number;
}

/** The account keyed by this Engine pid, or null. */
export async function accountByPid(db: D1Database, enginePid: string): Promise<PidAccount | null> {
  const row = await db
    .prepare("SELECT id, issuer, balance_uxof FROM accounts WHERE engine_pid = ?")
    .bind(enginePid)
    .first<{ id: string; issuer: string | null; balance_uxof: number }>();
  return row ? { id: row.id, issuer: row.issuer, balanceUxof: row.balance_uxof } : null;
}

/**
 * Creates the account for an Engine pid, or returns the one that already holds it. Safe under a race:
 * the unique index refuses the second insert, and the loser reads the winner's row.
 */
export async function upsertAccountByPid(
  db: D1Database, enginePid: string, name: string, issuer: string | null,
): Promise<{ account: PidAccount; created: boolean }> {
  const existing = await accountByPid(db, enginePid);
  if (existing) return { account: existing, created: false };
  const id = crypto.randomUUID();
  try {
    await db
      .prepare("INSERT INTO accounts (id, name, issuer, engine_pid) VALUES (?, ?, ?, ?)")
      .bind(id, name, issuer, enginePid)
      .run();
  } catch (err) {
    const raced = await accountByPid(db, enginePid);
    if (raced) return { account: raced, created: false };
    throw err;
  }
  return { account: { id, issuer, balanceUxof: 0 }, created: true };
}

/** The account's issuer (null = admin-only), or undefined when no such account exists. */
export async function accountIssuer(db: D1Database, accountId: string): Promise<string | null | undefined> {
  const row = await db.prepare("SELECT issuer FROM accounts WHERE id = ?").bind(accountId).first<{ issuer: string | null }>();
  return row ? row.issuer : undefined;
}

/** Assigns or clears the issuer an account is reachable through. False when no such account exists. */
export async function setAccountIssuer(db: D1Database, accountId: string, issuer: string | null): Promise<boolean> {
  const result = await db.prepare("UPDATE accounts SET issuer = ? WHERE id = ?").bind(issuer, accountId).run();
  return result.meta.changes === 1;
}

export interface CreatedKey {
  /** Stable id for later management (label, revoke) without ever holding the raw key again. */
  id: string;
  /** The raw key. Only its hash is stored, so this is the one time it is visible. */
  key: string;
}

/** Creates a key for an account, which must already exist. An account may hold several keys. */
export async function createKey(db: D1Database, accountId: string, label: string): Promise<CreatedKey> {
  const exists = await db.prepare("SELECT 1 FROM accounts WHERE id = ?").bind(accountId).first();
  if (!exists) throw new UnknownAccountError();
  const id = crypto.randomUUID();
  const key = newApiKey();
  await db
    .prepare("INSERT INTO api_keys (id, key_hash, account_id, label) VALUES (?, ?, ?, ?)")
    .bind(id, await sha256Hex(key), accountId, label)
    .run();
  return { id, key };
}

export async function revokeKey(db: D1Database, key: string): Promise<boolean> {
  const result = await db
    .prepare("UPDATE api_keys SET revoked_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE key_hash = ? AND revoked_at IS NULL")
    .bind(await sha256Hex(key))
    .run();
  return result.meta.changes === 1;
}

export async function revokeKeyById(db: D1Database, id: string): Promise<boolean> {
  const result = await db
    .prepare("UPDATE api_keys SET revoked_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ? AND revoked_at IS NULL")
    .bind(id)
    .run();
  return result.meta.changes === 1;
}

/** The issuer of the account that holds this key, or undefined when no such key exists. */
export async function keyAccountIssuer(db: D1Database, keyId: string): Promise<string | null | undefined> {
  const row = await db
    .prepare("SELECT a.issuer FROM api_keys k JOIN accounts a ON a.id = k.account_id WHERE k.id = ?")
    .bind(keyId)
    .first<{ issuer: string | null }>();
  return row ? row.issuer : undefined;
}

export interface CreditResult {
  /** The balance after the credit. Unchanged when the credit was a replay of one already applied. */
  balanceUxof: number;
  /** False when this payment reference had already been credited: nothing was written. */
  applied: boolean;
}

/**
 * Adds to an account's balance and writes the ledger row, atomically.
 *
 * `paymentRef` names the settlement that funded the credit: a Wave or PI-SPI transaction id, or an
 * operator's receipt when cash closes the sale. The reference is unique across the ledger (the
 * `ledger_payment_ref_global` index), so crediting one settlement twice credits it once -- a replayed
 * webhook, or a bridge that timed out and retried, finds the row already there and reports
 * `applied: false` rather than paying again; the same reference on a different account is refused
 * with `PaymentRefConflictError`. A credit that cites no settlement (an opening balance,
 * a goodwill grant) passes null and is never deduplicated.
 */
export async function credit(
  db: D1Database,
  accountId: string,
  amountUxof: number,
  note: string,
  paymentRef: string | null = null,
): Promise<CreditResult> {
  const exists = await db.prepare("SELECT 1 FROM accounts WHERE id = ?").bind(accountId).first();
  if (!exists) throw new UnknownAccountError();
  if (paymentRef !== null) {
    const owner = await creditedAccount(db, paymentRef);
    if (owner === accountId) return { balanceUxof: await balanceUxof(db, accountId), applied: false };
    if (owner !== null) throw new PaymentRefConflictError();
  }
  try {
    const [, , balance] = await db.batch([
      db.prepare("INSERT INTO ledger (account_id, kind, amount_uxof, note, payment_ref) VALUES (?, 'credit', ?, ?, ?)")
        .bind(accountId, amountUxof, note, paymentRef),
      db.prepare("UPDATE accounts SET balance_uxof = balance_uxof + ? WHERE id = ?").bind(amountUxof, accountId),
      db.prepare("SELECT balance_uxof FROM accounts WHERE id = ?").bind(accountId),
    ]);
    const row = (balance?.results as { balance_uxof: number }[])[0];
    if (!row) throw new Error("unknown account");
    return { balanceUxof: row.balance_uxof, applied: true };
  } catch (err) {
    // The read above happens outside the batch, so two settlements carrying the same reference can
    // both pass it. The index is what actually decides, and the loser of that race lands here: the
    // whole batch rolled back (the balance was not touched), so the answer is the same as for the
    // replay -- already credited. Should D1 ever word that error differently the credit still
    // cannot double, because it never committed; the call only fails to be recognised as a replay.
    if (paymentRef !== null && isDuplicatePaymentRef(err)) {
      const owner = await creditedAccount(db, paymentRef);
      if (owner === accountId) return { balanceUxof: await balanceUxof(db, accountId), applied: false };
      // Only a reference another account visibly holds is a conflict; anything else is the error it is.
      if (owner !== null) throw new PaymentRefConflictError();
    }
    throw err;
  }
}

async function balanceUxof(db: D1Database, accountId: string): Promise<number> {
  const row = await db.prepare("SELECT balance_uxof FROM accounts WHERE id = ?").bind(accountId).first<{ balance_uxof: number }>();
  if (!row) throw new UnknownAccountError();
  return row.balance_uxof;
}

/** The account a payment reference already credited, if any. */
async function creditedAccount(db: D1Database, paymentRef: string): Promise<string | null> {
  const row = await db
    .prepare("SELECT account_id FROM ledger WHERE payment_ref = ? LIMIT 1")
    .bind(paymentRef)
    .first<{ account_id: string }>();
  return row?.account_id ?? null;
}

/** A unique-index violation on the payment reference: the same settlement, arriving a second time. */
function isDuplicatePaymentRef(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /unique/i.test(message) && message.includes("payment_ref");
}

export async function debitUsage(db: D1Database, accountId: string, usage: UsageRecord): Promise<void> {
  await db.batch([
    db.prepare(
      `INSERT INTO ledger (account_id, kind, amount_uxof, model, input_tokens, output_tokens, estimated)
       VALUES (?, 'usage', ?, ?, ?, ?, ?)`,
    ).bind(accountId, -usage.costUxof, usage.model, usage.inputTokens, usage.outputTokens, usage.estimated ? 1 : 0),
    db.prepare("UPDATE accounts SET balance_uxof = balance_uxof - ? WHERE id = ?").bind(usage.costUxof, accountId),
  ]);
}

export async function recentLedger(db: D1Database, accountId: string, limit = 20) {
  const { results } = await db
    .prepare(
      `SELECT kind, amount_uxof, model, input_tokens, output_tokens, estimated, note, payment_ref, created_at
       FROM ledger WHERE account_id = ? ORDER BY id DESC LIMIT ?`,
    )
    .bind(accountId, limit)
    .all();
  return results;
}

/** Positive spend and billed calls per model for this account over the last 30 days. */
export async function usageByModel(db: D1Database, accountId: string) {
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const { results } = await db
    .prepare(
      `SELECT model, -SUM(amount_uxof) AS amount_uxof, COUNT(*) AS calls
       FROM ledger WHERE account_id = ? AND kind = 'usage' AND created_at >= ?
       GROUP BY model ORDER BY amount_uxof DESC, model`,
    )
    .bind(accountId, since)
    .all<{ model: string; amount_uxof: number; calls: number }>();
  return results.map(row => ({ model: row.model, amount_xof: row.amount_uxof / 1_000_000, calls: row.calls }));
}

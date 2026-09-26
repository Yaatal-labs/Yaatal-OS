// Accounts, keys and balances in D1. Every balance change is one atomic batch: the ledger row and the
// balance update commit together or not at all.

export interface Account {
  id: string;
  name: string;
  balanceUfcfa: number;
}

export interface UsageRecord {
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUfcfa: number;
  estimated: boolean;
}

const KEY_PREFIX = "yk_";

export class UnknownAccountError extends Error {
  constructor() {
    super("unknown account");
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
      `SELECT a.id, a.name, a.balance_ufcfa FROM api_keys k JOIN accounts a ON a.id = k.account_id
       WHERE k.key_hash = ? AND k.revoked_at IS NULL`,
    )
    .bind(await sha256Hex(key))
    .first<{ id: string; name: string; balance_ufcfa: number }>();
  return row ? { id: row.id, name: row.name, balanceUfcfa: row.balance_ufcfa } : null;
}

export async function createAccount(db: D1Database, name: string): Promise<Account> {
  const id = crypto.randomUUID();
  await db.prepare("INSERT INTO accounts (id, name) VALUES (?, ?)").bind(id, name).run();
  return { id, name, balanceUfcfa: 0 };
}

/** Creates a key and returns it. Only its hash is stored, so this is the one time it is visible. */
export async function createKey(db: D1Database, accountId: string, label: string): Promise<string> {
  const key = newApiKey();
  await db
    .prepare("INSERT INTO api_keys (key_hash, account_id, label) VALUES (?, ?, ?)")
    .bind(await sha256Hex(key), accountId, label)
    .run();
  return key;
}

export async function revokeKey(db: D1Database, key: string): Promise<boolean> {
  const result = await db
    .prepare("UPDATE api_keys SET revoked_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE key_hash = ? AND revoked_at IS NULL")
    .bind(await sha256Hex(key))
    .run();
  return result.meta.changes === 1;
}

export async function credit(db: D1Database, accountId: string, amountUfcfa: number, note: string): Promise<number> {
  const exists = await db.prepare("SELECT 1 FROM accounts WHERE id = ?").bind(accountId).first();
  if (!exists) throw new UnknownAccountError();
  const [, , balance] = await db.batch([
    db.prepare("INSERT INTO ledger (account_id, kind, amount_ufcfa, note) VALUES (?, 'credit', ?, ?)")
      .bind(accountId, amountUfcfa, note),
    db.prepare("UPDATE accounts SET balance_ufcfa = balance_ufcfa + ? WHERE id = ?").bind(amountUfcfa, accountId),
    db.prepare("SELECT balance_ufcfa FROM accounts WHERE id = ?").bind(accountId),
  ]);
  const row = (balance?.results as { balance_ufcfa: number }[])[0];
  if (!row) throw new Error("unknown account");
  return row.balance_ufcfa;
}

export async function debitUsage(db: D1Database, accountId: string, usage: UsageRecord): Promise<void> {
  await db.batch([
    db.prepare(
      `INSERT INTO ledger (account_id, kind, amount_ufcfa, model, input_tokens, output_tokens, estimated)
       VALUES (?, 'usage', ?, ?, ?, ?, ?)`,
    ).bind(accountId, -usage.costUfcfa, usage.model, usage.inputTokens, usage.outputTokens, usage.estimated ? 1 : 0),
    db.prepare("UPDATE accounts SET balance_ufcfa = balance_ufcfa - ? WHERE id = ?").bind(usage.costUfcfa, accountId),
  ]);
}

export async function recentLedger(db: D1Database, accountId: string, limit = 20) {
  const { results } = await db
    .prepare(
      `SELECT kind, amount_ufcfa, model, input_tokens, output_tokens, estimated, note, created_at
       FROM ledger WHERE account_id = ? ORDER BY id DESC LIMIT ?`,
    )
    .bind(accountId, limit)
    .all();
  return results;
}

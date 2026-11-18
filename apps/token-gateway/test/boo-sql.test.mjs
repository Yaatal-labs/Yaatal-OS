// Small dependency-free SQLite check for the Boo ledger migration and transaction SQL.
// Run from the token-gateway directory: node --experimental-sqlite test/boo-sql.test.mjs
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

const db = new DatabaseSync(":memory:");
db.exec("PRAGMA foreign_keys=ON");
for (const file of readdirSync("migrations").filter(file => file.endsWith(".sql")).sort()) {
  db.exec(readFileSync(join("migrations", file), "utf8"));
}

const accountId = "boo-sql-test-account";
db.prepare("INSERT INTO accounts (id, name, balance_uxof) VALUES (?, ?, ?)")
  .run(accountId, "Boo SQL test", 10_000_000);

function reserve(id, key, amount) {
  db.exec("BEGIN IMMEDIATE");
  try {
    const debit = db.prepare(`UPDATE accounts SET balance_uxof = balance_uxof - ?
      WHERE id = ? AND balance_uxof >= ?`).run(amount, accountId, amount);
    const inserted = db.prepare(`INSERT INTO boo_runs
      (id, account_id, idempotency_key, request_sha256, model, status, reserved_uxof)
      SELECT ?, ?, ?, ?, 'test-model', 'reserved', ? WHERE changes() = 1`)
      .run(id, accountId, key, "test-hash", amount);
    db.prepare(`INSERT INTO ledger (account_id, kind, amount_uxof, model, note)
      SELECT account_id, 'reservation', -reserved_uxof, model, 'Boo reservation'
      FROM boo_runs WHERE id = ? AND status = 'reserved'`).run(id);
    db.exec("COMMIT");
    return { debited: debit.changes, inserted: inserted.changes };
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function settle(id, actual) {
  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare(`INSERT INTO ledger (account_id, kind, amount_uxof, model, note)
      SELECT account_id, 'reservation', reserved_uxof, model, 'Boo reservation settled'
      FROM boo_runs WHERE id = ? AND status = 'reserved'`).run(id);
    db.prepare(`INSERT INTO ledger (account_id, kind, amount_uxof, model, input_tokens, output_tokens)
      SELECT account_id, 'usage', ?, model, 3, 2 FROM boo_runs WHERE id = ? AND status = 'reserved'`)
      .run(-actual, id);
    db.prepare(`UPDATE accounts SET balance_uxof = balance_uxof +
      (SELECT reserved_uxof - ? FROM boo_runs WHERE id = ? AND status = 'reserved')
      WHERE id = (SELECT account_id FROM boo_runs WHERE id = ? AND status = 'reserved')`)
      .run(actual, id, id);
    db.prepare(`UPDATE boo_runs SET status = 'settled', actual_uxof = ?
      WHERE id = ? AND status = 'reserved'`).run(actual, id);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function release(id) {
  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare(`INSERT INTO ledger (account_id, kind, amount_uxof, note)
      SELECT account_id, 'reservation', reserved_uxof, 'Boo reservation released'
      FROM boo_runs WHERE id = ? AND status = 'reserved'`).run(id);
    db.prepare(`UPDATE accounts SET balance_uxof = balance_uxof +
      (SELECT reserved_uxof FROM boo_runs WHERE id = ? AND status = 'reserved')
      WHERE id = (SELECT account_id FROM boo_runs WHERE id = ? AND status = 'reserved')`)
      .run(id, id);
    db.prepare("UPDATE boo_runs SET status = 'failed' WHERE id = ? AND status = 'reserved'").run(id);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

const balance = () => db.prepare("SELECT balance_uxof FROM accounts WHERE id = ?").get(accountId).balance_uxof;

// Reserve and idempotency conflict rollback.
assert.deepEqual(reserve("run-1", "same-key", 4_000_000), { debited: 1, inserted: 1 });
assert.equal(balance(), 6_000_000);
assert.throws(() => reserve("run-2", "same-key", 4_000_000));
assert.equal(balance(), 6_000_000, "duplicate idempotency key must roll back the debit");

// Insufficient balance must not persist a run or ledger row.
const ledgerRows = db.prepare("SELECT COUNT(*) AS n FROM ledger").get().n;
assert.deepEqual(reserve("run-3", "insufficient-key", 7_000_000), { debited: 0, inserted: 0 });
assert.equal(balance(), 6_000_000);
assert.equal(db.prepare("SELECT COUNT(*) AS n FROM boo_runs").get().n, 1);
assert.equal(db.prepare("SELECT COUNT(*) AS n FROM ledger").get().n, ledgerRows);

// Settlement refunds unused reserve exactly once.
settle("run-1", 1_000_000);
assert.equal(balance(), 9_000_000);
settle("run-1", 1_000_000);
assert.equal(balance(), 9_000_000, "settled runs cannot be charged or refunded twice");

// Known rejection releases the complete reserve exactly once.
assert.deepEqual(reserve("run-4", "release-key", 2_000_000), { debited: 1, inserted: 1 });
release("run-4");
assert.equal(balance(), 9_000_000);
release("run-4");
assert.equal(balance(), 9_000_000, "released runs cannot refund twice");

console.log("Boo SQLite billing SQL checks passed: migrations, reservation, idempotency rollback, insufficient balance, settlement, release.");
db.close();

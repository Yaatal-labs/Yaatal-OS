// Usage tracking for the operator: who signed up, who topped up, who spends, on which models, and
// which requests were turned away. Everything is read from the ledger and request_events, so the
// report can never disagree with what was billed.

const UXOF = 1_000_000;

export type RequestEventKind = "insufficient_balance" | "upstream_error" | "no_upstream";

/** Records a request that was refused before it could be billed. Never throws: tracking must not break a call. */
export async function recordEvent(db: D1Database, accountId: string, kind: RequestEventKind, model: string | null) {
  try {
    await db.prepare("INSERT INTO request_events (account_id, kind, model) VALUES (?, ?, ?)").bind(accountId, kind, model).run();
  } catch (err) {
    console.error("request event not recorded", err instanceof Error ? err.message : String(err));
  }
}

const xof = (uxof: unknown) => Number(uxof ?? 0) / UXOF;
const count = (value: unknown) => Number(value ?? 0);

/** Activity over the last `days` days: sign-ups, credits, usage, refusals, per model, per account, per day. */
export async function usageReport(db: D1Database, days: number) {
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const [accounts, credits, usage, byModel, byAccount, events, daily, signups] = await db.batch([
    db.prepare("SELECT COUNT(*) AS total, SUM(created_at >= ?1) AS new FROM accounts").bind(since),
    db.prepare(
      `SELECT COUNT(*) AS count, SUM(amount_uxof) AS uxof, COUNT(DISTINCT account_id) AS accounts
       FROM ledger WHERE kind = 'credit' AND created_at >= ?1`,
    ).bind(since),
    db.prepare(
      `SELECT COUNT(*) AS requests, SUM(input_tokens) AS input_tokens, SUM(output_tokens) AS output_tokens,
              -SUM(amount_uxof) AS spend_uxof, SUM(estimated) AS estimated, COUNT(DISTINCT account_id) AS active
       FROM ledger WHERE kind = 'usage' AND created_at >= ?1`,
    ).bind(since),
    db.prepare(
      `SELECT model, COUNT(*) AS requests, SUM(input_tokens) AS input_tokens, SUM(output_tokens) AS output_tokens,
              -SUM(amount_uxof) AS spend_uxof
       FROM ledger WHERE kind = 'usage' AND created_at >= ?1 GROUP BY model ORDER BY spend_uxof DESC`,
    ).bind(since),
    db.prepare(
      `SELECT a.id, a.name, a.balance_uxof, a.created_at, COUNT(l.id) AS requests,
              COALESCE(-SUM(l.amount_uxof), 0) AS spend_uxof, MAX(l.created_at) AS last_used
       FROM accounts a LEFT JOIN ledger l ON l.account_id = a.id AND l.kind = 'usage' AND l.created_at >= ?1
       GROUP BY a.id ORDER BY spend_uxof DESC, a.created_at DESC LIMIT 50`,
    ).bind(since),
    db.prepare(
      `SELECT kind, COUNT(*) AS count, COUNT(DISTINCT account_id) AS accounts
       FROM request_events WHERE created_at >= ?1 GROUP BY kind`,
    ).bind(since),
    db.prepare(
      `SELECT substr(created_at, 1, 10) AS day, SUM(kind = 'usage') AS requests,
              -SUM(CASE WHEN kind = 'usage' THEN amount_uxof ELSE 0 END) AS spend_uxof,
              SUM(CASE WHEN kind = 'credit' THEN amount_uxof ELSE 0 END) AS credit_uxof
       FROM ledger WHERE created_at >= ?1 GROUP BY day ORDER BY day`,
    ).bind(since),
    db.prepare(
      "SELECT substr(created_at, 1, 10) AS day, COUNT(*) AS count FROM accounts WHERE created_at >= ?1 GROUP BY day",
    ).bind(since),
  ]);

  type Row = Record<string, unknown>;
  const rows = (result: D1Result | undefined) => (result?.results ?? []) as Row[];
  const one = (result: D1Result | undefined) => rows(result)[0] ?? {};
  const totals = one(usage);
  const requests = count(totals.requests);
  const refused = Object.fromEntries(rows(events).map(row => [row.kind, { count: count(row.count), accounts: count(row.accounts) }]));
  const signupsByDay = new Map(rows(signups).map(row => [row.day, count(row.count)]));
  const byDay = new Map<unknown, Row>(rows(daily).map(row => [row.day, row]));
  for (const day of signupsByDay.keys()) if (!byDay.has(day)) byDay.set(day, { day });

  return {
    period: { days, since },
    accounts: {
      total: count(one(accounts).total),
      new: count(one(accounts).new),
      active: count(totals.active),
      topped_up: count(one(credits).accounts),
    },
    credits: { count: count(one(credits).count), xof: xof(one(credits).uxof) },
    usage: {
      requests,
      input_tokens: count(totals.input_tokens),
      output_tokens: count(totals.output_tokens),
      spend_xof: xof(totals.spend_uxof),
      estimated_share: requests ? count(totals.estimated) / requests : 0,
    },
    refused: {
      insufficient_balance: refused.insufficient_balance ?? { count: 0, accounts: 0 },
      upstream_error: refused.upstream_error ?? { count: 0, accounts: 0 },
      no_upstream: refused.no_upstream ?? { count: 0, accounts: 0 },
    },
    by_model: rows(byModel).map(row => ({
      model: row.model,
      requests: count(row.requests),
      input_tokens: count(row.input_tokens),
      output_tokens: count(row.output_tokens),
      spend_xof: xof(row.spend_uxof),
    })),
    by_account: rows(byAccount).map(row => ({
      id: row.id,
      name: row.name,
      created_at: row.created_at,
      balance_xof: xof(row.balance_uxof),
      requests: count(row.requests),
      spend_xof: xof(row.spend_uxof),
      last_used: row.last_used ?? null,
    })),
    daily: [...byDay.values()]
      .sort((a, b) => String(a.day).localeCompare(String(b.day)))
      .map(row => ({
        day: row.day,
        new_accounts: signupsByDay.get(row.day) ?? 0,
        requests: count(row.requests),
        spend_xof: xof(row.spend_uxof),
        credits_xof: xof(row.credit_uxof),
      })),
  };
}

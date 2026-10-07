// The control board's server side. Everything the sandboxed page cannot do lives here: holding the
// credentials, reaching the two upstreams, and reducing their answers to the shape in
// ./board-types.d.ts before anything crosses the port.
//
// Two upstreams, two seams:
//   - the token rail reads GET /admin/usage on api.kairmel.com, the same report the gateway already
//     computes from its D1 ledger, so the board can never disagree with what was billed;
//   - the commerce rail reads the Engine's PostHog project, which is the only place the Engine's
//     events land. The Engine itself exposes no aggregate of them.
//
// Both reads are for the operator: they are handed out solely from GatekeeperUser.startAppUi() and
// gated on isAdmin on every call, not once at open.

import { RpcTarget } from "cloudflare:workers";
import type {
  BoardViewerInfo,
  CommerceDay,
  CommerceReport,
  ControlBoard,
  HealthReport,
  ModelUsage,
  RefusalKind,
  ServiceHealth,
  TokenRailDay,
  TokenRailReport,
} from "./board-types.js";

// Where each leg reads from.
//
// These are source constants rather than wrangler.jsonc vars on purpose:
// scripts/deploy.ts assigns `customGatekeeper.vars = { CUSTOM_NAME, CUSTOM_MESSAGE }` wholesale, so
// any var declared in this package's wrangler.jsonc is discarded at deploy time. A var here would
// look configured in local dev and be silently absent in production, which is the worst of both.
// Changing an upstream is a one-line source change and a redeploy.
const TOKEN_GATEWAY_URL = "https://api.kairmel.com";
const ENGINE_URL = "https://engine.njooba.com";
const POSTHOG_HOST = "https://eu.i.posthog.com";

const DEFAULT_DAYS = 30;
const MIN_DAYS = 1;
const MAX_DAYS = 90;
const PROBE_TIMEOUT_MS = 8_000;

/**
 * The board's entire PostHog query vocabulary.
 *
 * This is a fixed constant, not a parameter: no caller input reaches it beyond the clamped day
 * count, and no HogQL is accepted from anywhere else. Keeping the whole vocabulary in one place is
 * what stops a read-only dashboard from becoming an arbitrary-query endpoint against the Engine's
 * analytics project.
 *
 * The five counts are one query rather than five, so the totals the board derives are sums of the
 * same rows it displays. Two queries could disagree about a boundary second; one cannot.
 *
 * `properties.trigger` and `properties.provider` are the property names the Engine actually sends:
 * `bobo.escrow.transitioned` carries `trigger: "confirm_delivery" | "dispute"`, and
 * `payment.webhook_received` carries `provider: "wave"`. Wave is the only rail the Engine accepts.
 */
function commerceHogQL(days: number): string {
  return [
    "SELECT",
    "  toDate(timestamp) AS day,",
    "  countIf(event = 'user.registered') AS registrations,",
    "  countIf(event = 'bobo.escrow.transitioned' AND properties.trigger = 'confirm_delivery') AS confirm_delivery,",
    "  countIf(event = 'bobo.escrow.transitioned' AND properties.trigger = 'dispute') AS dispute,",
    "  countIf(event = 'payment.webhook_received' AND properties.provider = 'wave') AS payments",
    "FROM events",
    `WHERE timestamp >= now() - INTERVAL ${days} DAY`,
    "GROUP BY day",
    "ORDER BY day",
  ].join("\n");
}

/** Clamps a caller-supplied window. RPC input is untrusted, so nothing else reads it directly. */
function windowDays(days: number | undefined): number {
  if (typeof days !== "number" || !Number.isFinite(days)) return DEFAULT_DAYS;
  return Math.min(MAX_DAYS, Math.max(MIN_DAYS, Math.trunc(days)));
}

/** A number from an upstream we do not control. Anything unusable becomes 0, never NaN. */
function num(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** Whole francs. The ledger stores micro-XOF and the report divides; a board shows francs. */
function francs(value: unknown): number {
  return Math.round(num(value));
}

// --- the gateway's report, as it arrives -------------------------------------------------------
//
// Local, and deliberately lenient: every field is optional and every value is unknown, because this
// describes someone else's JSON. Nothing else in the file trusts a shape it did not build.

interface RawUsage {
  period?: { days?: unknown; since?: unknown };
  accounts?: { total?: unknown; new?: unknown; active?: unknown; topped_up?: unknown };
  credits?: { count?: unknown; xof?: unknown };
  usage?: {
    requests?: unknown;
    input_tokens?: unknown;
    output_tokens?: unknown;
    spend_xof?: unknown;
    estimated_share?: unknown;
  };
  refused?: Record<string, { count?: unknown; accounts?: unknown } | undefined>;
  by_model?: { model?: unknown; requests?: unknown; input_tokens?: unknown; output_tokens?: unknown; spend_xof?: unknown }[];
  daily?: { day?: unknown; new_accounts?: unknown; requests?: unknown; spend_xof?: unknown; credits_xof?: unknown }[];
  // `by_account` also arrives in this payload and is deliberately not declared here. See the mapper.
}

class BoardError extends Error {}

export class ControlBoardImpl extends RpcTarget implements ControlBoard {
  readonly #env: Cloudflare.Env;
  readonly #isAdmin: boolean;

  constructor(env: Cloudflare.Env, isAdmin: boolean) {
    super();
    this.#env = env;
    this.#isAdmin = isAdmin;
  }

  /** Re-checked on every call: a session opened as an admin does not stay privileged by inertia. */
  #requireAdmin(): void {
    if (!this.#isAdmin) throw new BoardError("Admin access required.");
  }

  /**
   * Not admin-gated, so the page can decide to refuse. It answers with two booleans and nothing else,
   * and a non-admin gets both false: whether an internal secret happens to be set is not a
   * non-admin's business, and the page will not render a panel either way.
   */
  async getViewerInfo(): Promise<BoardViewerInfo> {
    if (!this.#isAdmin) {
      return { isAdmin: false, configured: { gateway: false, posthog: false } };
    }
    return {
      isAdmin: true,
      configured: {
        gateway: Boolean(this.#env.TOKEN_GATEWAY_ADMIN_TOKEN),
        posthog: Boolean(this.#env.POSTHOG_PERSONAL_API_KEY && this.#env.POSTHOG_PROJECT_ID),
      },
    };
  }

  async tokenRail(days?: number): Promise<TokenRailReport> {
    this.#requireAdmin();
    const window = windowDays(days);

    const token = this.#env.TOKEN_GATEWAY_ADMIN_TOKEN;
    if (!token) {
      throw new BoardError(
        "Rail jetons non configuré : le secret TOKEN_GATEWAY_ADMIN_TOKEN est absent de ce déploiement.",
      );
    }

    const at = new Date();
    const response = await fetch(`${TOKEN_GATEWAY_URL}/admin/usage?days=${window}`, {
      method: "GET",
      headers: { authorization: `Bearer ${token}`, accept: "application/json" },
      // The report is a fresh read of a live ledger. Without this a subrequest to a cacheable GET can
      // be served from the edge, and the board would show yesterday's revenue with today's timestamp.
      cache: "no-store",
    });

    if (!response.ok) {
      throw new BoardError(`La passerelle a refusé la lecture des chiffres (HTTP ${response.status}).`);
    }

    let raw: RawUsage;
    try {
      raw = (await response.json()) as RawUsage;
    } catch {
      throw new BoardError("Réponse illisible de la passerelle de jetons.");
    }

    return {
      window: {
        days: window,
        since: text(raw.period?.since),
        at: at.toISOString(),
      },
      accounts: {
        total: num(raw.accounts?.total),
        new: num(raw.accounts?.new),
        active: num(raw.accounts?.active),
        toppedUp: num(raw.accounts?.topped_up),
      },
      credits: { count: num(raw.credits?.count), xof: francs(raw.credits?.xof) },
      usage: {
        requests: num(raw.usage?.requests),
        inputTokens: num(raw.usage?.input_tokens),
        outputTokens: num(raw.usage?.output_tokens),
        spendXof: francs(raw.usage?.spend_xof),
        estimatedShare: num(raw.usage?.estimated_share),
      },
      refused: refusalCounts(raw.refused),
      byModel: (raw.by_model ?? []).map((row): ModelUsage => ({
        model: text(row.model),
        requests: num(row.requests),
        inputTokens: num(row.input_tokens),
        outputTokens: num(row.output_tokens),
        spendFcfa: francs(row.spend_xof),
      })),
      daily: (raw.daily ?? []).map((row): TokenRailDay => ({
        day: text(row.day),
        newAccounts: num(row.new_accounts),
        requests: num(row.requests),
        spendFcfa: francs(row.spend_xof),
        creditsFcfa: francs(row.credits_xof),
      })),
    };

    // The gateway returns a per-account breakdown (`by_account`: id, name, balance, last_used) inside
    // this same payload. It is dropped here, by construction rather than by filtering: the object
    // above is written out field by field, so there is no path by which a per-merchant row could ride
    // along with the ones that are declared. This deployment's OS states "Sur invitation, sans
    // données clients réelles ni paiement", and a revenue board must not contradict it. Adding a
    // per-account field would be a boundary change, not an enhancement.
  }

  async commerce(days?: number): Promise<CommerceReport> {
    this.#requireAdmin();
    const window = windowDays(days);

    const key = this.#env.POSTHOG_PERSONAL_API_KEY;
    const project = this.#env.POSTHOG_PROJECT_ID;
    if (!key || !project) {
      throw new BoardError(
        "Rail commerce non configuré : POSTHOG_PERSONAL_API_KEY ou POSTHOG_PROJECT_ID est absent. " +
          "La clé attendue est une clé personnelle (phx_…, portée query:read), distincte de la clé de projet " +
          "avec laquelle le moteur ingère ses événements.",
      );
    }

    const at = new Date();
    const response = await fetch(`${POSTHOG_HOST}/api/projects/${encodeURIComponent(project)}/query/`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${key}`,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({ query: { kind: "HogQLQuery", query: commerceHogQL(window) } }),
    });

    if (!response.ok) {
      throw new BoardError(`PostHog a refusé la requête (HTTP ${response.status}).`);
    }

    let result: { columns?: unknown[]; results?: unknown[][] };
    try {
      result = (await response.json()) as typeof result;
    } catch {
      throw new BoardError("Réponse illisible de PostHog.");
    }

    const columns = (result.columns ?? []).map((name) => String(name));
    const column = (name: string): number => {
      const index = columns.indexOf(name);
      // A missing column means the query and the project have drifted apart. Fail: reporting zeros
      // would read as "no commerce activity", which is the one conclusion this panel must not fake.
      if (index < 0) throw new BoardError(`PostHog n'a pas renvoyé la colonne « ${name} ».`);
      return index;
    };

    const index = {
      day: column("day"),
      registrations: column("registrations"),
      confirmDelivery: column("confirm_delivery"),
      dispute: column("dispute"),
      payments: column("payments"),
    };

    const daily = (result.results ?? []).map((row): CommerceDay => ({
      day: text(row[index.day]).slice(0, 10),
      registrations: num(row[index.registrations]),
      confirmDelivery: num(row[index.confirmDelivery]),
      dispute: num(row[index.dispute]),
      payments: num(row[index.payments]),
    }));

    // Totals are sums of the rows above, not a second query, so the headline and the series that
    // justifies it are always the same instant of the same data.
    const total = (pick: (day: CommerceDay) => number) => daily.reduce((sum, day) => sum + pick(day), 0);

    return {
      window: { days: window, since: sinceFromDays(window, at), at: at.toISOString() },
      registrations: total((day) => day.registrations),
      escrowTransitions: {
        confirmDelivery: total((day) => day.confirmDelivery),
        dispute: total((day) => day.dispute),
      },
      payments: { wave: total((day) => day.payments) },
      daily,
    };
  }

  async health(): Promise<HealthReport> {
    this.#requireAdmin();
    const [engine, gateway] = await Promise.all([
      probe(`${ENGINE_URL}/health`),
      // The gateway has no /health; /v1/models is its cheapest public route and needs no credentials.
      probe(`${TOKEN_GATEWAY_URL}/v1/models`),
    ]);
    return { at: new Date().toISOString(), engine, gateway };
  }
}

function refusalCounts(raw: RawUsage["refused"]): Record<RefusalKind, { count: number; accounts: number }> {
  const pick = (kind: RefusalKind) => ({
    count: num(raw?.[kind]?.count),
    accounts: num(raw?.[kind]?.accounts),
  });
  return {
    insufficient_balance: pick("insufficient_balance"),
    upstream_error: pick("upstream_error"),
    no_upstream: pick("no_upstream"),
  };
}

function sinceFromDays(days: number, at: Date): string {
  return new Date(at.getTime() - days * 86_400_000).toISOString();
}

/**
 * A public liveness probe.
 *
 * Deliberately unauthenticated: both services answer this route without credentials, so a failure
 * here means the service is down, not that a secret is wrong. Conflating the two would send the
 * operator hunting for a bad token when the Engine is simply off, and the reverse. A credential
 * problem surfaces as tokenRail() refusing, which is where the credential is.
 *
 * The body is read and discarded, never inspected or forwarded: a liveness dot needs the status code
 * and the round trip, and an upstream error body is not the board's to republish.
 */
async function probe(url: string): Promise<ServiceHealth> {
  const started = Date.now();
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: { accept: "*/*" },
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
      cache: "no-store",
    });
    const ms = Date.now() - started;
    await response.arrayBuffer().catch(() => {});
    return response.ok ? { ok: true, ms } : { ok: false, ms, detail: `HTTP ${response.status}` };
  } catch (err) {
    const name = err instanceof Error ? err.name : "";
    return {
      ok: false,
      ms: null,
      detail: name === "TimeoutError" ? `délai dépassé (${PROBE_TIMEOUT_MS} ms)` : "injoignable",
    };
  }
}

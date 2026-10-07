// Tests for the control board's server side.
//
// Every upstream answer here is a fixture, never a live call: the board's whole job is to reduce two
// other systems' JSON to a fixed shape, so the fixtures are where that reduction is decided. The two
// tests that matter most are "refuses every read for a non-admin" -- the page's refusal is cosmetic,
// this is the actual gate -- and "never carries a per-account row", which is the deployment's own
// stated boundary rather than a preference.

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { ControlBoardImpl } from "../src/board.js";

const ADMIN_TOKEN = "test-admin-token";
const POSTHOG_KEY = "phx_test";
const PROJECT_ID = "12345";

function env(overrides: Record<string, string | undefined> = {}): Cloudflare.Env {
  return {
    CUSTOM_NAME: "Yaatal",
    CUSTOM_MESSAGE: "message",
    TOKEN_GATEWAY_ADMIN_TOKEN: ADMIN_TOKEN,
    POSTHOG_PERSONAL_API_KEY: POSTHOG_KEY,
    POSTHOG_PROJECT_ID: PROJECT_ID,
    ...overrides,
  } as Cloudflare.Env;
}

function board(isAdmin: boolean, overrides: Record<string, string | undefined> = {}) {
  return new ControlBoardImpl(env(overrides), isAdmin);
}

/** The gateway's report, in the shape apps/token-gateway/src/report.ts emits. */
function usageReport() {
  return {
    period: { days: 7, since: "2026-09-30T00:00:00.000Z" },
    accounts: { total: 12, new: 3, active: 5, topped_up: 2 },
    credits: { count: 9, xof: 45_000 },
    usage: {
      requests: 1_234,
      input_tokens: 900_000,
      output_tokens: 120_000,
      spend_xof: 31_500,
      estimated_share: 0.25,
    },
    refused: {
      insufficient_balance: { count: 4, accounts: 2 },
      upstream_error: { count: 1, accounts: 1 },
      no_upstream: { count: 0, accounts: 0 },
    },
    by_model: [
      { model: "glm-5.3", requests: 800, input_tokens: 700_000, output_tokens: 90_000, spend_xof: 22_000 },
    ],
    daily: [
      { day: "2026-10-05", new_accounts: 2, requests: 600, spend_xof: 15_000, credits_xof: 20_000 },
      { day: "2026-10-06", new_accounts: 1, requests: 634, spend_xof: 16_500, credits_xof: 25_000 },
    ],
    // The field the board must not carry. See the boundary test below.
    by_account: [
      { id: "acct_1", name: "Boutique Aminata", balance_xof: 3_500, last_used: "2026-10-06T12:00:00.000Z" },
    ],
  };
}

function hogqlResponse(rows: unknown[][] = [], columns?: string[]) {
  return Response.json({
    columns: columns ?? ["day", "registrations", "confirm_delivery", "dispute", "payments"],
    results: rows,
  });
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the admin gate", () => {
  it("tells a non-admin nothing about what is configured", async () => {
    await expect(board(false).getViewerInfo()).resolves.toEqual({
      isAdmin: false,
      configured: { gateway: false, posthog: false },
    });
  });

  it("reports which legs are wired to an admin", async () => {
    await expect(board(true).getViewerInfo()).resolves.toEqual({
      isAdmin: true,
      configured: { gateway: true, posthog: true },
    });
    await expect(board(true, { TOKEN_GATEWAY_ADMIN_TOKEN: undefined }).getViewerInfo()).resolves.toEqual({
      isAdmin: true,
      configured: { gateway: false, posthog: true },
    });
  });

  // The page renders a refusal client-side, which is a courtesy. This is the gate. Each method is
  // checked separately because the check lives in each method -- there is no constructor-time
  // privilege to inherit, so an admin demoted mid-session stops reading on the next call.
  it("refuses every read for a non-admin, without calling upstream", async () => {
    const fetchMock = vi.fn(async () => Response.json(usageReport()));
    vi.stubGlobal("fetch", fetchMock);

    const refused = board(false);
    await expect(refused.tokenRail()).rejects.toThrow("Admin access required.");
    await expect(refused.commerce()).rejects.toThrow("Admin access required.");
    await expect(refused.health()).rejects.toThrow("Admin access required.");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("tokenRail", () => {
  it("reads the gateway's report without dividing an already-converted franc figure", async () => {
    const fetchMock = vi.fn(async () => Response.json(usageReport()));
    vi.stubGlobal("fetch", fetchMock);

    const report = await board(true).tokenRail(7);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.kairmel.com/admin/usage?days=7");
    expect((init.headers as Record<string, string>).authorization).toBe(`Bearer ${ADMIN_TOKEN}`);
    // A live ledger behind a cacheable GET: without no-store the board shows the previous read's
    // revenue under this read's timestamp.
    expect(init.cache).toBe("no-store");

    // report.ts divides the ledger's micro-XOF into whole francs before emitting *_xof, so these are
    // francs already. Dividing again would understate revenue by a million and read as a bad month.
    expect(report.credits.xof).toBe(45_000);
    expect(report.usage.spendXof).toBe(31_500);
    expect(report.byModel[0]?.spendFcfa).toBe(22_000);
    expect(report.daily.map((day) => day.spendFcfa)).toEqual([15_000, 16_500]);
    expect(report.accounts).toEqual({ total: 12, new: 3, active: 5, toppedUp: 2 });
    expect(report.window.days).toBe(7);
    expect(report.window.since).toBe("2026-09-30T00:00:00.000Z");
  });

  it("always reports all three refusal kinds, even the ones the gateway omitted", async () => {
    vi.stubGlobal("fetch", async () => Response.json({ ...usageReport(), refused: {} }));
    const report = await board(true).tokenRail(7);
    expect(report.refused).toEqual({
      insufficient_balance: { count: 0, accounts: 0 },
      upstream_error: { count: 0, accounts: 0 },
      no_upstream: { count: 0, accounts: 0 },
    });
  });

  it("clamps the window instead of passing caller input through", async () => {
    const fetchMock = vi.fn(async () => Response.json(usageReport()));
    vi.stubGlobal("fetch", fetchMock);

    // RPC input is untrusted, and a caller is free to send an object, a string or nothing at all
    // where the signature says number.
    const gateway = board(true);
    await gateway.tokenRail(1_000);
    await gateway.tokenRail(0);
    await gateway.tokenRail(Number.NaN);
    await gateway.tokenRail(undefined);
    await gateway.tokenRail("90" as unknown as number);

    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "https://api.kairmel.com/admin/usage?days=90",
      "https://api.kairmel.com/admin/usage?days=1",
      "https://api.kairmel.com/admin/usage?days=30",
      "https://api.kairmel.com/admin/usage?days=30",
      "https://api.kairmel.com/admin/usage?days=30",
    ]);
  });

  it("refuses with a named secret rather than posting an empty bearer", async () => {
    await expect(board(true, { TOKEN_GATEWAY_ADMIN_TOKEN: undefined }).tokenRail()).rejects.toThrow(
      /TOKEN_GATEWAY_ADMIN_TOKEN/,
    );
  });

  // The deployment states "Sur invitation, sans données clients réelles ni paiement". A revenue board
  // must not contradict that by leaking a merchant name into the operator's page.
  it("never carries a per-account row across the boundary", async () => {
    vi.stubGlobal("fetch", async () => Response.json(usageReport()));
    const report = await board(true).tokenRail(7);

    const serialized = JSON.stringify(report);
    expect(serialized).not.toContain("Boutique Aminata");
    expect(serialized).not.toContain("acct_1");
    // The account row's own fields, not the substring "balance": the refusal key
    // `insufficient_balance` is legitimate and stays, which is why this names `balance_xof`.
    expect(serialized).not.toContain("balance_xof");
    expect(serialized).not.toContain("last_used");
    expect(report).not.toHaveProperty("byAccount");
    expect(report).not.toHaveProperty("by_account");
  });
});

describe("commerce", () => {
  it("runs one fixed query and sums its rows rather than asking twice", async () => {
    const fetchMock = vi.fn(async () =>
      hogqlResponse([
        ["2026-10-05", 3, 1, 0, 1],
        ["2026-10-06", 5, 2, 1, 2],
      ]),
    );
    vi.stubGlobal("fetch", fetchMock);

    const report = await board(true).commerce(30);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://eu.i.posthog.com/api/projects/12345/query/");
    expect((init.headers as Record<string, string>).authorization).toBe(`Bearer ${POSTHOG_KEY}`);

    // The query vocabulary is a constant in source. No caller input reaches it but the clamped day
    // count, which is what keeps a read-only panel from becoming an arbitrary-query endpoint.
    const body = JSON.parse(String(init.body)) as { query: { kind: string; query: string } };
    expect(body.query.kind).toBe("HogQLQuery");
    expect(body.query.query).toContain("event = 'user.registered'");
    expect(body.query.query).toContain("properties.trigger = 'confirm_delivery'");
    expect(body.query.query).toContain("properties.provider = 'wave'");
    expect(body.query.query).toContain("INTERVAL 30 DAY");
    expect(body.query.query).not.toMatch(/DROP|INSERT|DELETE/i);

    // Totals are sums of the rows displayed, so the headline and the series under it can never be
    // two different instants.
    expect(report.registrations).toBe(8);
    expect(report.escrowTransitions).toEqual({ confirmDelivery: 3, dispute: 1 });
    expect(report.payments).toEqual({ wave: 3 });
    expect(report.daily).toHaveLength(2);
  });

  it("fails loudly when a column is missing instead of reporting zero commerce", async () => {
    // Every column but one, and the missing one is in the middle rather than at the end: the reader
    // names whichever column is absent, so a fixture that simply truncated the list would pass this
    // test while the message told the operator about a column that was in fact present.
    vi.stubGlobal("fetch", async () => hogqlResponse([], ["day", "registrations", "confirm_delivery", "payments"]));
    await expect(board(true).commerce()).rejects.toThrow(/« dispute »/);
  });

  it("refuses with a named secret when the personal key or project id is absent", async () => {
    await expect(board(true, { POSTHOG_PERSONAL_API_KEY: undefined }).commerce()).rejects.toThrow(
      /POSTHOG_PERSONAL_API_KEY/,
    );
    await expect(board(true, { POSTHOG_PROJECT_ID: undefined }).commerce()).rejects.toThrow(
      /POSTHOG_PROJECT_ID/,
    );
  });

  it("surfaces an upstream refusal rather than an empty series", async () => {
    vi.stubGlobal("fetch", async () => new Response("nope", { status: 401 }));
    await expect(board(true).commerce()).rejects.toThrow(/401/);
  });
});

describe("health", () => {
  it("probes both services without credentials, so a red dot means down and not misconfigured", async () => {
    const fetchMock = vi.fn(async (url: string) =>
      url.includes("engine") ? new Response("ok") : new Response("{}", { status: 503 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const report = await board(true).health();

    expect(report.engine.ok).toBe(true);
    expect(report.gateway).toMatchObject({ ok: false, detail: "HTTP 503" });
    const urls = fetchMock.mock.calls.map(([url]) => url as string);
    expect(urls).toContain("https://engine.njooba.com/health");
    expect(urls).toContain("https://api.kairmel.com/v1/models");
    for (const [, init] of fetchMock.mock.calls as unknown as [string, RequestInit][]) {
      expect(init.headers).not.toHaveProperty("authorization");
    }
  });

  it("reports an unreachable service as unreachable, not as a credential problem", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new TypeError("Connection refused");
    });
    const report = await board(true).health();
    expect(report.engine).toEqual({ ok: false, ms: null, detail: "injoignable" });
    expect(report.gateway.detail).toBe("injoignable");
  });
});

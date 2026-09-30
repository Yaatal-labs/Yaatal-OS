import { applyD1Migrations, createExecutionContext, env, waitOnExecutionContext, type D1Migration } from "cloudflare:test";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import worker from "../src/index.js";
import { hmacHex } from "../src/auth/crypto.js";

declare global {
  namespace Cloudflare {
    interface Env {
      TEST_MIGRATIONS: D1Migration[];
      PUBLISH_TOKEN: string;
      ADMIN_TOKEN: string;
      ENGINE_API_URL: string;
      ENGINE_AUTH_SECRET: string;
      SESSION_SECRET: string;
      IDENTITY_SECRET: string;
    }
  }
}

const ORIGIN = "https://marche-api.yaatal.test";

beforeAll(() => applyD1Migrations(env.DB, env.TEST_MIGRATIONS));
afterEach(() => vi.restoreAllMocks());

async function call(
  path: string,
  init: RequestInit & { ip?: string; cookie?: string; origin?: string | null } = {},
  extraEnv: Record<string, unknown> = {},
) {
  const headers = new Headers(init.headers);
  // The real client (auth-client.ts) always sends `content-type: application/json` on every
  // POST, even a bodyless one like start/logout -- mirror that default here.
  if (init.method && init.method !== "GET" && !headers.has("content-type")) headers.set("content-type", "application/json");
  if (init.ip) headers.set("CF-Connecting-IP", init.ip);
  if (init.cookie) headers.set("cookie", init.cookie);
  if (init.origin !== null) {
    // Every route under test that needs it defaults to sending the correct Origin, so tests
    // that aren't specifically about CSRF don't each have to set it by hand.
    if (init.origin) headers.set("origin", init.origin);
    else if (init.method && init.method !== "GET" && !headers.has("origin")) headers.set("origin", ORIGIN);
  }
  const ctx = createExecutionContext();
  const response = await worker.fetch(new Request(`${ORIGIN}${path}`, { ...init, headers }), { ...env, ...extraEnv } as never, ctx);
  await waitOnExecutionContext(ctx);
  return response;
}

/** Replaces global fetch (what src/auth/engine.ts calls) with a recorder/responder -- same
 *  pattern as apps/token-gateway's test suite. */
function fakeEngine(handler: (path: string, init: RequestInit | undefined) => Response | Promise<Response>) {
  const seen: { path: string; init: RequestInit | undefined }[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const target = new URL(String(input));
    seen.push({ path: target.pathname + target.search, init });
    return handler(target.pathname + target.search, init);
  });
  return seen;
}

function engineHeader(init: RequestInit | undefined, name: string): string | null {
  return new Headers(init?.headers).get(name);
}

async function startThenVerify(pid: string, code = "123456"): Promise<{ response: Response; id: string }> {
  fakeEngine((path) => {
    if (path.startsWith("/api/auth/whatsapp/partner/start")) {
      return Response.json({ id: "nonce-1", whatsapp_url: "https://wa.me/000?text=LOGIN-nonce-1", expires_in_seconds: 300 });
    }
    if (path.startsWith("/api/auth/whatsapp/partner/verify")) {
      return Response.json({ pid });
    }
    return new Response("unexpected", { status: 500 });
  });
  await call("/v1/auth/whatsapp/start", { method: "POST", ip: "10.0.0.1" });
  vi.restoreAllMocks();
  fakeEngine((path) => {
    if (path.startsWith("/api/auth/whatsapp/partner/verify")) return Response.json({ pid });
    return new Response("unexpected", { status: 500 });
  });
  const response = await call("/v1/auth/whatsapp/verify", {
    method: "POST",
    ip: "10.0.0.1",
    body: JSON.stringify({ id: "nonce-1", code }),
  });
  return { response, id: "nonce-1" };
}

function extractCookieToken(response: Response): string {
  const setCookie = response.headers.get("set-cookie") ?? "";
  const match = /__Host-marche_session=([^;]+)/.exec(setCookie);
  if (!match) throw new Error(`no session cookie in: ${setCookie}`);
  return decodeURIComponent(match[1]!);
}

describe("POST /v1/auth/whatsapp/start", () => {
  it("sends the shared secret to the Engine and passes through its response", async () => {
    const seen = fakeEngine((path) => {
      expect(path).toBe("/api/auth/whatsapp/partner/start");
      return Response.json({ id: "n1", whatsapp_url: "https://wa.me/000?text=LOGIN-n1", expires_in_seconds: 300 });
    });
    const response = await call("/v1/auth/whatsapp/start", { method: "POST", ip: "1.1.1.1" });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ id: "n1", whatsapp_url: "https://wa.me/000?text=LOGIN-n1", expires_in_seconds: 300 });
    expect(seen).toHaveLength(1);
    expect(engineHeader(seen[0]!.init, "x-engine-auth-secret")).toBe(env.ENGINE_AUTH_SECRET);
  });

  it("maps the Engine's 401 (our secret is wrong) to 503, never passing it through as 401", async () => {
    fakeEngine(() => new Response(null, { status: 401 }));
    const response = await call("/v1/auth/whatsapp/start", { method: "POST", ip: "1.1.1.2" });
    expect(response.status).toBe(503);
    expect(((await response.json()) as { error: { type: string } }).error.type).toBe("not_configured");
  });

  it("503s without ever calling the Engine when ENGINE_API_URL is unset", async () => {
    const seen = fakeEngine(() => new Response(null, { status: 200 }));
    const response = await call("/v1/auth/whatsapp/start", { method: "POST", ip: "1.1.1.3" }, { ENGINE_API_URL: undefined });
    expect(response.status).toBe(503);
    expect(seen).toHaveLength(0);
  });

  it("503s without ever calling the Engine when ENGINE_AUTH_SECRET is unset", async () => {
    const seen = fakeEngine(() => new Response(null, { status: 200 }));
    const response = await call("/v1/auth/whatsapp/start", { method: "POST", ip: "1.1.1.4" }, { ENGINE_AUTH_SECRET: undefined });
    expect(response.status).toBe(503);
    expect(seen).toHaveLength(0);
  });

  it("503s when ENGINE_AUTH_SECRET is configured but under 32 characters", async () => {
    const seen = fakeEngine(() => new Response(null, { status: 200 }));
    const response = await call("/v1/auth/whatsapp/start", { method: "POST", ip: "1.1.1.5" }, { ENGINE_AUTH_SECRET: "too-short" });
    expect(response.status).toBe(503);
    expect(seen).toHaveLength(0);
  });

  it("rejects a non-JSON Content-Type", async () => {
    fakeEngine(() => new Response(null, { status: 200 }));
    const ctx = createExecutionContext();
    const response = await worker.fetch(
      new Request(`${ORIGIN}/v1/auth/whatsapp/start`, {
        method: "POST",
        headers: { "content-type": "text/plain", origin: ORIGIN },
      }),
      env as never,
      ctx,
    );
    await waitOnExecutionContext(ctx);
    expect(response.status).toBe(415);
  });

  it("rejects a missing Origin, and a mismatched Origin", async () => {
    fakeEngine(() => new Response(null, { status: 200 }));
    const missing = await call("/v1/auth/whatsapp/start", { method: "POST", origin: null });
    expect(missing.status).toBe(403);
    const wrong = await call("/v1/auth/whatsapp/start", { method: "POST", origin: "https://evil.example" });
    expect(wrong.status).toBe(403);
  });

  it("rate-limits per IP: the 6th attempt in a window from the same IP is refused, a different IP is unaffected", async () => {
    fakeEngine(() => Response.json({ id: "n", whatsapp_url: "https://wa.me/000?text=LOGIN-n", expires_in_seconds: 300 }));
    for (let i = 0; i < 5; i++) {
      const response = await call("/v1/auth/whatsapp/start", { method: "POST", ip: "9.9.9.9" });
      expect(response.status).toBe(200);
    }
    const sixth = await call("/v1/auth/whatsapp/start", { method: "POST", ip: "9.9.9.9" });
    expect(sixth.status).toBe(429);

    const otherIp = await call("/v1/auth/whatsapp/start", { method: "POST", ip: "9.9.9.10" });
    expect(otherIp.status).toBe(200);
  });
});

describe("GET /v1/auth/whatsapp/status", () => {
  it("validates id, rejecting a malformed one without calling the Engine", async () => {
    const seen = fakeEngine(() => new Response(null, { status: 200 }));
    const response = await call("/v1/auth/whatsapp/status?id=" + encodeURIComponent("not valid!!"));
    expect(response.status).toBe(400);
    expect(seen).toHaveLength(0);
  });

  it("passes the id through and returns the Engine's status", async () => {
    const seen = fakeEngine((path) => {
      expect(path).toBe("/api/auth/whatsapp/partner/status?id=nonce-xyz");
      return Response.json({ status: "code_sent" });
    });
    const response = await call("/v1/auth/whatsapp/status?id=nonce-xyz");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "code_sent" });
    expect(seen).toHaveLength(1);
  });

  it("503s when unconfigured", async () => {
    const response = await call("/v1/auth/whatsapp/status?id=nonce-xyz", {}, { ENGINE_API_URL: undefined });
    expect(response.status).toBe(503);
  });
});

describe("POST /v1/auth/whatsapp/verify", () => {
  it("succeeds: sets a Secure HttpOnly cookie and stores only a hashed session id, never the raw token or the pid", async () => {
    const { response } = await startThenVerify("pid-alice");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ signedIn: true });

    const setCookie = response.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("__Host-marche_session=");
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("Secure");
    expect(setCookie).toContain("SameSite=Lax");
    expect(setCookie).toContain("Path=/");
    expect(setCookie).not.toContain("pid-alice");

    const token = extractCookieToken(response);
    const expectedId = await hmacHex(env.SESSION_SECRET, token);
    const row = await env.DB.prepare("SELECT id, pid FROM sessions WHERE id = ?").bind(expectedId).first<{ id: string; pid: string }>();
    expect(row).not.toBeNull();
    expect(row!.pid).toBe("pid-alice");
    expect(row!.id).not.toBe(token); // stored value is the hash, never the raw cookie token
  });

  it("wrong code: the Engine's 401 becomes our 401 invalid_code (never 503)", async () => {
    fakeEngine((path) => {
      if (path.startsWith("/api/auth/whatsapp/partner/verify")) return new Response(null, { status: 401 });
      return new Response("unexpected", { status: 500 });
    });
    const response = await call("/v1/auth/whatsapp/verify", {
      method: "POST",
      ip: "2.2.2.1",
      body: JSON.stringify({ id: "nonce-1", code: "000000" }),
    });
    expect(response.status).toBe(401);
    expect(((await response.json()) as { error: { type: string } }).error.type).toBe("invalid_code");
  });

  it("rejects a malformed code or id before ever calling the Engine", async () => {
    const seen = fakeEngine(() => new Response(null, { status: 200 }));
    const badCode = await call("/v1/auth/whatsapp/verify", {
      method: "POST",
      ip: "2.2.2.2",
      body: JSON.stringify({ id: "nonce-1", code: "12345" }), // 5 digits
    });
    expect(badCode.status).toBe(400);
    const badId = await call("/v1/auth/whatsapp/verify", {
      method: "POST",
      ip: "2.2.2.2",
      body: JSON.stringify({ id: "not valid!!", code: "123456" }),
    });
    expect(badId.status).toBe(400);
    expect(seen).toHaveLength(0);
  });

  it("CSRF: rejects a non-JSON Content-Type and a wrong/missing Origin", async () => {
    const ctx = createExecutionContext();
    const wrongType = await worker.fetch(
      new Request(`${ORIGIN}/v1/auth/whatsapp/verify`, {
        method: "POST",
        headers: { "content-type": "text/plain", origin: ORIGIN },
        body: JSON.stringify({ id: "nonce-1", code: "123456" }),
      }),
      env as never,
      ctx,
    );
    await waitOnExecutionContext(ctx);
    expect(wrongType.status).toBe(415);

    const wrongOrigin = await call("/v1/auth/whatsapp/verify", {
      method: "POST",
      origin: "https://evil.example",
      body: JSON.stringify({ id: "nonce-1", code: "123456" }),
    });
    expect(wrongOrigin.status).toBe(403);
  });

  it("503s without touching D1 or the Engine when SESSION_SECRET is unset", async () => {
    const seen = fakeEngine(() => Response.json({ pid: "pid-x" }));
    const response = await call(
      "/v1/auth/whatsapp/verify",
      { method: "POST", ip: "2.2.2.3", body: JSON.stringify({ id: "nonce-1", code: "123456" }) },
      { SESSION_SECRET: undefined },
    );
    expect(response.status).toBe(503);
    expect(seen).toHaveLength(0);
  });

  it("rate-limits per IP: the 11th attempt in a window from the same IP is refused", async () => {
    fakeEngine(() => new Response(null, { status: 401 })); // every guess "fails", we only care about the count
    for (let i = 0; i < 10; i++) {
      const response = await call("/v1/auth/whatsapp/verify", {
        method: "POST",
        ip: "3.3.3.3",
        body: JSON.stringify({ id: "nonce-1", code: "000000" }),
      });
      expect(response.status).toBe(401);
    }
    const eleventh = await call("/v1/auth/whatsapp/verify", {
      method: "POST",
      ip: "3.3.3.3",
      body: JSON.stringify({ id: "nonce-1", code: "000000" }),
    });
    expect(eleventh.status).toBe(429);
  });
});

describe("GET /v1/me", () => {
  it("signedIn: false with no cookie", async () => {
    const response = await call("/v1/me");
    expect(await response.json()).toEqual({ signedIn: false });
  });

  it("signedIn: true with a valid session cookie", async () => {
    const { response: verifyResponse } = await startThenVerify("pid-bob");
    const token = extractCookieToken(verifyResponse);
    const response = await call("/v1/me", { cookie: `__Host-marche_session=${encodeURIComponent(token)}` });
    expect(await response.json()).toEqual({ signedIn: true });
  });

  it("signedIn: false for an unknown token, and for an expired session", async () => {
    const unknown = await call("/v1/me", { cookie: "__Host-marche_session=not-a-real-token" });
    expect(await unknown.json()).toEqual({ signedIn: false });

    // Insert an already-expired session directly, bypassing createSession's 30-day TTL.
    const token = "expired-token-abc";
    const id = await hmacHex(env.SESSION_SECRET, token);
    await env.DB.prepare("INSERT INTO sessions (id, pid, expires_at) VALUES (?, ?, ?)")
      .bind(id, "pid-expired", "2000-01-01T00:00:00.000Z")
      .run();
    const response = await call("/v1/me", { cookie: `__Host-marche_session=${token}` });
    expect(await response.json()).toEqual({ signedIn: false });
  });

  it("503s when SESSION_SECRET is unset", async () => {
    const response = await call("/v1/me", {}, { SESSION_SECRET: undefined });
    expect(response.status).toBe(503);
  });
});

describe("GET /v1/me/identity", () => {
  it("requires a session: 401 not_signed_in with no cookie", async () => {
    const response = await call("/v1/me/identity?app=boutique-express");
    expect(response.status).toBe(401);
    expect(((await response.json()) as { error: { type: string } }).error.type).toBe("not_signed_in");
  });

  it("401s an expired session the same as no session", async () => {
    const token = "expired-token-def";
    const id = await hmacHex(env.SESSION_SECRET, token);
    await env.DB.prepare("INSERT INTO sessions (id, pid, expires_at) VALUES (?, ?, ?)").bind(id, "pid-y", "2000-01-01T00:00:00.000Z").run();
    const response = await call("/v1/me/identity?app=boutique-express", { cookie: `__Host-marche_session=${token}` });
    expect(response.status).toBe(401);
  });

  it("validates app, rejecting a malformed id", async () => {
    const { response: verifyResponse } = await startThenVerify("pid-carla");
    const token = extractCookieToken(verifyResponse);
    const response = await call("/v1/me/identity?app=" + encodeURIComponent("not valid!!"), {
      cookie: `__Host-marche_session=${encodeURIComponent(token)}`,
    });
    expect(response.status).toBe(400);
  });

  it("is stable for the same (session, app), different across apps, and never equal to the pid", async () => {
    const { response: verifyResponse } = await startThenVerify("pid-dara");
    const token = extractCookieToken(verifyResponse);
    const cookie = `__Host-marche_session=${encodeURIComponent(token)}`;

    const first = (await (await call("/v1/me/identity?app=boutique-express", { cookie })).json()) as { id: string };
    const second = (await (await call("/v1/me/identity?app=boutique-express", { cookie })).json()) as { id: string };
    const otherApp = (await (await call("/v1/me/identity?app=autre-app", { cookie })).json()) as { id: string };

    expect(first.id).toBe(second.id); // stable
    expect(first.id).not.toBe(otherApp.id); // different per app
    expect(first.id).not.toBe("pid-dara"); // never the pid
    expect(first.id).not.toContain("pid-dara");
  });

  it("503s when IDENTITY_SECRET is unset, even with a valid session", async () => {
    const { response: verifyResponse } = await startThenVerify("pid-erin");
    const token = extractCookieToken(verifyResponse);
    const response = await call(
      "/v1/me/identity?app=boutique-express",
      { cookie: `__Host-marche_session=${encodeURIComponent(token)}` },
      { IDENTITY_SECRET: undefined },
    );
    expect(response.status).toBe(503);
  });
});

describe("POST /v1/auth/logout", () => {
  it("deletes the session and clears the cookie; a later /v1/me is signed out", async () => {
    const { response: verifyResponse } = await startThenVerify("pid-frank");
    const token = extractCookieToken(verifyResponse);
    const cookie = `__Host-marche_session=${encodeURIComponent(token)}`;

    const logoutResponse = await call("/v1/auth/logout", { method: "POST", cookie });
    expect(await logoutResponse.json()).toEqual({ signedIn: false });
    const clearCookie = logoutResponse.headers.get("set-cookie") ?? "";
    expect(clearCookie).toContain("__Host-marche_session=;");
    expect(clearCookie).toContain("Max-Age=0");

    const me = await call("/v1/me", { cookie });
    expect(await me.json()).toEqual({ signedIn: false });
  });

  it("CSRF checks apply to logout too", async () => {
    const response = await call("/v1/auth/logout", { method: "POST", origin: "https://evil.example" });
    expect(response.status).toBe(403);
  });

  it("503s when SESSION_SECRET is unset", async () => {
    const response = await call("/v1/auth/logout", { method: "POST" }, { SESSION_SECRET: undefined });
    expect(response.status).toBe(503);
  });

  it("succeeds even with no cookie at all (nothing to delete)", async () => {
    const response = await call("/v1/auth/logout", { method: "POST" });
    expect(response.status).toBe(200);
  });
});

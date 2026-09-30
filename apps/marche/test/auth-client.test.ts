import { describe, expect, it } from "vitest";
import { AuthApiError, createAuthClient, NotSignedInHttpError, type AuthFetchLike, type AuthFetchResponse } from "../src/host/auth-client";

interface RecordedCall {
  path: string;
  method: string | undefined;
  headers: Record<string, string> | undefined;
  body: string | undefined;
  credentials: string | undefined;
}

function ok(body: unknown, status = 200): AuthFetchResponse {
  return { ok: true, status, json: async () => body };
}

function failing(status: number, body: unknown = {}): AuthFetchResponse {
  return { ok: false, status, json: async () => body };
}

/** Records every call it receives and answers in order from `responses` -- enough to drive the
 *  simple request/response sequences these tests need without a real network. */
function fakeFetch(responses: AuthFetchResponse[]): { fetch: AuthFetchLike; calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];
  let i = 0;
  const fetchImpl: AuthFetchLike = async (input, init) => {
    calls.push({ path: input, method: init?.method, headers: init?.headers, body: init?.body, credentials: init?.credentials });
    const response = responses[i];
    i += 1;
    if (!response) throw new Error(`fakeFetch: no response queued for call ${i}`);
    return response;
  };
  return { fetch: fetchImpl, calls };
}

describe("getMe", () => {
  it("returns signedIn from GET /v1/me, same-origin credentials, no body", async () => {
    const { fetch, calls } = fakeFetch([ok({ signedIn: true })]);
    const client = createAuthClient(fetch);
    await expect(client.getMe()).resolves.toEqual({ signedIn: true });
    expect(calls).toEqual([{ path: "/v1/me", method: undefined, headers: undefined, body: undefined, credentials: "same-origin" }]);
  });

  it("reports signedIn: false the same way as true -- it's just the response body", async () => {
    const { fetch } = fakeFetch([ok({ signedIn: false })]);
    await expect(createAuthClient(fetch).getMe()).resolves.toEqual({ signedIn: false });
  });

  it("throws AuthApiError on a non-2xx response", async () => {
    const { fetch } = fakeFetch([failing(503, { error: { type: "not_configured" } })]);
    await expect(createAuthClient(fetch).getMe()).rejects.toMatchObject({ status: 503, type: "not_configured" });
  });
});

describe("getIdentity", () => {
  it("GETs /v1/me/identity?app=<encoded appId> and returns {id}", async () => {
    const { fetch, calls } = fakeFetch([ok({ id: "abc123" })]);
    const result = await createAuthClient(fetch).getIdentity("boutique express"); // space, to check encoding
    expect(result).toEqual({ id: "abc123" });
    expect(calls[0]!.path).toBe("/v1/me/identity?app=boutique%20express");
  });

  it("throws NotSignedInHttpError specifically on 401", async () => {
    const { fetch } = fakeFetch([failing(401)]);
    await expect(createAuthClient(fetch).getIdentity("boutique-express")).rejects.toBeInstanceOf(NotSignedInHttpError);
  });

  it("throws plain AuthApiError on other failures, not NotSignedInHttpError", async () => {
    const { fetch } = fakeFetch([failing(503)]);
    const client = createAuthClient(fetch);
    await expect(client.getIdentity("boutique-express")).rejects.toBeInstanceOf(AuthApiError);
    await expect(client.getIdentity("boutique-express")).rejects.not.toBeInstanceOf(NotSignedInHttpError);
  });
});

describe("startSignIn", () => {
  it("POSTs with content-type application/json and same-origin credentials, maps snake_case to camelCase", async () => {
    const { fetch, calls } = fakeFetch([ok({ id: "nonce-1", whatsapp_url: "https://wa.me/000?text=LOGIN-nonce-1", expires_in_seconds: 300 })]);
    const result = await createAuthClient(fetch).startSignIn();
    expect(result).toEqual({ id: "nonce-1", whatsappUrl: "https://wa.me/000?text=LOGIN-nonce-1", expiresInSeconds: 300 });
    expect(calls[0]).toMatchObject({ path: "/v1/auth/whatsapp/start", method: "POST", credentials: "same-origin" });
    expect(calls[0]!.headers).toMatchObject({ "content-type": "application/json" });
  });

  it("throws AuthApiError on 503 (not configured)", async () => {
    const { fetch } = fakeFetch([failing(503, { error: { type: "not_configured" } })]);
    await expect(createAuthClient(fetch).startSignIn()).rejects.toMatchObject({ status: 503, type: "not_configured" });
  });

  it("throws AuthApiError on 429 (rate limited)", async () => {
    const { fetch } = fakeFetch([failing(429, { error: { type: "rate_limited" } })]);
    await expect(createAuthClient(fetch).startSignIn()).rejects.toMatchObject({ status: 429, type: "rate_limited" });
  });
});

describe("getSignInStatus", () => {
  it("GETs /v1/auth/whatsapp/status?id=<encoded id>", async () => {
    const { fetch, calls } = fakeFetch([ok({ status: "code_sent" })]);
    const result = await createAuthClient(fetch).getSignInStatus("nonce 1");
    expect(result).toEqual({ status: "code_sent" });
    expect(calls[0]!.path).toBe("/v1/auth/whatsapp/status?id=nonce%201");
  });
});

describe("verifySignIn", () => {
  it("POSTs {id, code} as JSON and resolves {signedIn: true} on success", async () => {
    const { fetch, calls } = fakeFetch([ok({ signedIn: true })]);
    const result = await createAuthClient(fetch).verifySignIn("nonce-1", "123456");
    expect(result).toEqual({ signedIn: true });
    expect(calls[0]).toMatchObject({ path: "/v1/auth/whatsapp/verify", method: "POST" });
    expect(JSON.parse(calls[0]!.body!)).toEqual({ id: "nonce-1", code: "123456" });
  });

  it("throws AuthApiError with status 401 on a wrong code", async () => {
    const { fetch } = fakeFetch([failing(401, { error: { type: "invalid_code" } })]);
    await expect(createAuthClient(fetch).verifySignIn("nonce-1", "000000")).rejects.toMatchObject({ status: 401, type: "invalid_code" });
  });
});

describe("signOut", () => {
  it("POSTs /v1/auth/logout", async () => {
    const { fetch, calls } = fakeFetch([ok({ signedIn: false })]);
    await createAuthClient(fetch).signOut();
    expect(calls[0]).toMatchObject({ path: "/v1/auth/logout", method: "POST", credentials: "same-origin" });
  });
});

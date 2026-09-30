/**
 * A thin client for marche-api's `/v1/auth/*` and `/v1/me*` routes (see
 * `apps/marche-api/README.md` for the full protocol). Written against a minimal fetch-like
 * interface, like `catalogue/source.ts`, so it's testable without a browser or a real network --
 * `createAuthClient(window.fetch.bind(window))` is the only place real `fetch` is involved.
 *
 * Every call is same-origin (see apps/marche-api's "Same-origin hosting"): Marché itself is now
 * served from the marche-api Worker, so these are plain relative paths, and the session cookie
 * rides along automatically (`credentials: "same-origin"` makes that explicit either way).
 */

export interface AuthFetchResponse {
  readonly ok: boolean;
  readonly status: number;
  json(): Promise<unknown>;
}

export type AuthFetchLike = (
  input: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    credentials?: "same-origin" | "include" | "omit";
  },
) => Promise<AuthFetchResponse>;

export type WhatsAppStatus = "pending" | "code_sent" | "expired";

export interface StartResult {
  id: string;
  whatsappUrl: string;
  expiresInSeconds: number;
}

export class AuthApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly type?: string,
  ) {
    super(message);
    this.name = "AuthApiError";
  }
}

/** `GET /v1/me/identity` answered 401 -- the caller has no valid session. A distinct class (not
 *  just `AuthApiError` with `status === 401`) so `identity-provider.ts` can single it out without
 *  relying on a magic number. */
export class NotSignedInHttpError extends AuthApiError {
  constructor() {
    super("not signed in", 401, "not_signed_in");
    this.name = "NotSignedInHttpError";
  }
}

export interface AuthClient {
  getMe(): Promise<{ signedIn: boolean }>;
  getIdentity(appId: string): Promise<{ id: string }>;
  startSignIn(): Promise<StartResult>;
  getSignInStatus(id: string): Promise<{ status: WhatsAppStatus }>;
  verifySignIn(id: string, code: string): Promise<{ signedIn: true }>;
  signOut(): Promise<void>;
}

async function errorType(response: AuthFetchResponse): Promise<string | undefined> {
  try {
    const body = (await response.json()) as { error?: { type?: string } };
    return body.error?.type;
  } catch {
    return undefined;
  }
}

export function createAuthClient(fetchImpl: AuthFetchLike): AuthClient {
  async function post(path: string, body?: unknown): Promise<AuthFetchResponse> {
    return fetchImpl(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body ?? {}),
      credentials: "same-origin",
    });
  }

  async function get(path: string): Promise<AuthFetchResponse> {
    return fetchImpl(path, { credentials: "same-origin" });
  }

  return {
    async getMe() {
      const response = await get("/v1/me");
      if (!response.ok) throw new AuthApiError("could not check sign-in status", response.status, await errorType(response));
      return (await response.json()) as { signedIn: boolean };
    },

    async getIdentity(appId: string) {
      const response = await get(`/v1/me/identity?app=${encodeURIComponent(appId)}`);
      if (response.status === 401) throw new NotSignedInHttpError();
      if (!response.ok) throw new AuthApiError("identity unavailable", response.status, await errorType(response));
      return (await response.json()) as { id: string };
    },

    async startSignIn() {
      const response = await post("/v1/auth/whatsapp/start");
      if (!response.ok) {
        const type = await errorType(response);
        throw new AuthApiError(
          response.status === 503 ? "WhatsApp sign-in n'est pas configuré" : "impossible de démarrer la connexion",
          response.status,
          type,
        );
      }
      const body = (await response.json()) as { id: string; whatsapp_url: string; expires_in_seconds: number };
      return { id: body.id, whatsappUrl: body.whatsapp_url, expiresInSeconds: body.expires_in_seconds };
    },

    async getSignInStatus(id: string) {
      const response = await get(`/v1/auth/whatsapp/status?id=${encodeURIComponent(id)}`);
      if (!response.ok) throw new AuthApiError("could not check sign-in status", response.status, await errorType(response));
      return (await response.json()) as { status: WhatsAppStatus };
    },

    async verifySignIn(id: string, code: string) {
      const response = await post("/v1/auth/whatsapp/verify", { id, code });
      if (!response.ok) {
        const type = await errorType(response);
        throw new AuthApiError(response.status === 401 ? "code invalide" : "impossible de vérifier le code", response.status, type);
      }
      return (await response.json()) as { signedIn: true };
    },

    async signOut() {
      await post("/v1/auth/logout");
    },
  };
}

// Server-to-server client for the Yaatal Engine's WhatsApp partner sign-in API (private, Rust;
// this Worker never talks to WhatsApp itself and never learns a phone number -- only the
// Engine's stable `pid` crosses this boundary). Three calls, matching the Engine's own:
//
//   POST /api/auth/whatsapp/partner/start   X-Engine-Auth-Secret         -> {id, whatsapp_url, expires_in_seconds}
//   GET  /api/auth/whatsapp/partner/status  none                        -> {status}
//   POST /api/auth/whatsapp/partner/verify  X-Engine-Auth-Secret + body  -> {pid}
//
// `start` and `verify` require the shared secret (proves the request came from this Worker, not
// just any caller); `status` deliberately doesn't -- the nonce alone proves nothing there either
// way. See apps/marche-api/README.md for the full flow this is one leg of.

export interface EngineStart {
  id: string;
  whatsappUrl: string;
  expiresInSeconds: number;
}

export type EngineStatus = "pending" | "code_sent" | "expired";

/** The Engine is unreachable, or answered with something other than what the protocol defines --
 *  a transport-level failure, not a sign-in outcome. */
export class EngineUnavailableError extends Error {}

/** The Engine rejected `ENGINE_AUTH_SECRET` on `start`. `start` carries no user input at all, so
 *  this can only mean this deployment's secret doesn't match the Engine's -- never something the
 *  visitor did. See the 401 handling in `engineStart` below. */
export class EngineMisconfiguredError extends Error {}

/** `verify` came back 401: a wrong code, an unknown/expired id, or (same as `start`) a bad
 *  secret -- the Engine deliberately does not say which. See `engineVerify` below. */
export class EngineVerifyFailedError extends Error {}

function engineUrl(apiUrl: string, path: string): string {
  return `${apiUrl.replace(/\/+$/, "")}${path}`;
}

export async function engineStart(
  apiUrl: string,
  authSecret: string,
  fetcher: typeof fetch = fetch,
): Promise<EngineStart> {
  let response: Response;
  try {
    response = await fetcher(engineUrl(apiUrl, "/api/auth/whatsapp/partner/start"), {
      method: "POST",
      headers: { "X-Engine-Auth-Secret": authSecret },
    });
  } catch {
    throw new EngineUnavailableError("could not reach the Engine");
  }
  if (response.status === 401) {
    throw new EngineMisconfiguredError("the Engine rejected ENGINE_AUTH_SECRET");
  }
  if (!response.ok) {
    throw new EngineUnavailableError(`Engine start responded ${response.status}`);
  }
  const body = (await response.json()) as { id: string; whatsapp_url: string; expires_in_seconds: number };
  return { id: body.id, whatsappUrl: body.whatsapp_url, expiresInSeconds: body.expires_in_seconds };
}

export async function engineStatus(apiUrl: string, id: string, fetcher: typeof fetch = fetch): Promise<EngineStatus> {
  const url = new URL(engineUrl(apiUrl, "/api/auth/whatsapp/partner/status"));
  url.searchParams.set("id", id);
  let response: Response;
  try {
    response = await fetcher(url.toString());
  } catch {
    throw new EngineUnavailableError("could not reach the Engine");
  }
  if (!response.ok) {
    throw new EngineUnavailableError(`Engine status responded ${response.status}`);
  }
  const body = (await response.json()) as { status: EngineStatus };
  return body.status;
}

export async function engineVerify(
  apiUrl: string,
  authSecret: string,
  id: string,
  code: string,
  fetcher: typeof fetch = fetch,
): Promise<string> {
  let response: Response;
  try {
    response = await fetcher(engineUrl(apiUrl, "/api/auth/whatsapp/partner/verify"), {
      method: "POST",
      headers: { "content-type": "application/json", "X-Engine-Auth-Secret": authSecret },
      body: JSON.stringify({ id, code }),
    });
  } catch {
    throw new EngineUnavailableError("could not reach the Engine");
  }
  if (response.status === 401) {
    throw new EngineVerifyFailedError("the Engine refused this id/code");
  }
  if (!response.ok) {
    throw new EngineUnavailableError(`Engine verify responded ${response.status}`);
  }
  const body = (await response.json()) as { pid?: string };
  if (!body.pid) throw new EngineVerifyFailedError("the Engine did not return a pid");
  return body.pid;
}

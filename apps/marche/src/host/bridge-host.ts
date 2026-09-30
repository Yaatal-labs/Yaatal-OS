import type { AppManifest } from "../manifest/types";
import {
  isKairmelRequest,
  KAIRMEL_PROTOCOL,
  type KairmelErrorPayload,
  type KairmelResponseEnvelope,
} from "../bridge/protocol";
import type { KairmelMessageEvent, MessageTarget } from "../bridge/kairmel-bridge";
import { assertDeclaredPermission, PermissionDeniedError } from "./permissions";
import type { ConsentStore } from "./consent";
import { NotSignedInError, type IdentityProvider } from "./identity-provider";
import { performShare, type ShareCapableWindow, type ShareParams } from "./share";

export class UnknownMethodError extends Error {
  readonly code = "unknown_method";
  constructor(method: string) {
    super(`méthode inconnue : "${method}"`);
    this.name = "UnknownMethodError";
  }
}

export class NotImplementedError extends Error {
  readonly code = "not_implemented";
  constructor() {
    super("pas encore disponible");
    this.name = "NotImplementedError";
  }
}

export interface HostMessageWindow {
  addEventListener(type: "message", listener: (event: KairmelMessageEvent) => void): void;
  removeEventListener(type: "message", listener: (event: KairmelMessageEvent) => void): void;
}

export interface BridgeHostOptions {
  /** The manifest for the app running in `frameWindow` — its declared permissions are the
   *  only ones this session will ever honor. */
  manifest: AppManifest;
  /** The iframe's `contentWindow`. Only messages whose `event.source` is exactly this object
   *  are considered — not just any frame, and never the top window. */
  frameWindow: MessageTarget;
  /** `new URL(manifest.url).origin` — the only origin this session accepts messages from,
   *  and the only origin it ever replies to. */
  appOrigin: string;
  /** Where an app's per-app `identity()` id actually comes from — see `host/identity-provider.ts`. */
  identityProvider: IdentityProvider;
  consent: ConsentStore;
  /** Host UI hook: ask the person, once, whether this app may have `identity`. Resolves to
   *  whether they said yes. */
  requestIdentityConsent: (manifest: AppManifest) => Promise<boolean>;
  /** Where `share` opens the Web Share sheet / writes to the clipboard. */
  shareWindow: ShareCapableWindow;
  /** The host's own `window` in production; a fake implementing the same two methods in tests. */
  hostWindow: HostMessageWindow;
}

/** Wires up one iframe session's side of the bridge: listens for requests from exactly that
 *  iframe and exactly its declared origin, enforces the manifest's permissions, and replies
 *  only to that same origin. Returns a cleanup function that removes the listener. */
export function attachBridgeHost(options: BridgeHostOptions): () => void {
  const { manifest, frameWindow, appOrigin, hostWindow } = options;

  function reply(id: string, response: { ok: true; result: unknown } | { ok: false; error: KairmelErrorPayload }): void {
    const envelope: KairmelResponseEnvelope = response.ok
      ? { channel: KAIRMEL_PROTOCOL, direction: "response", id, ok: true, result: response.result }
      : { channel: KAIRMEL_PROTOCOL, direction: "response", id, ok: false, error: response.error };
    // Origin check, reply side: the app's own origin, never "*".
    frameWindow.postMessage(envelope, appOrigin);
  }

  async function handleMessage(event: KairmelMessageEvent): Promise<void> {
    // Origin check, request side: the exact iframe this session is bound to, from its
    // declared origin. Anything else is silently ignored — no response, no acknowledgment.
    if (event.source !== frameWindow) return;
    if (event.origin !== appOrigin) return;
    if (!isKairmelRequest(event.data)) return;

    const request = event.data;
    try {
      const result = await dispatch(request.method, request.params);
      reply(request.id, { ok: true, result });
    } catch (error) {
      reply(request.id, { ok: false, error: toErrorPayload(error) });
    }
  }

  async function dispatch(method: string, params: Record<string, unknown> | undefined): Promise<unknown> {
    switch (method) {
      case "identity":
        return handleIdentity();
      case "share":
        return handleShare(params);
      case "pay":
        return handlePay();
      default:
        throw new UnknownMethodError(method);
    }
  }

  async function handleIdentity() {
    assertDeclaredPermission(manifest, "identity");
    // Checked before the consent prompt below: no point asking "may this app know you?" when
    // the honest answer is "you're not signed in to Kairmel at all" — see `ui/signin.ts` for
    // where the person is sent to fix that, and identity-provider.ts's doc comment for why this
    // is a plain rejection rather than the host pausing the request to drive a sign-in flow
    // itself.
    if (!(await options.identityProvider.isSignedIn())) {
      throw new NotSignedInError();
    }
    if (!options.consent.isGranted(manifest.id, "identity")) {
      const granted = await options.requestIdentityConsent(manifest);
      if (!granted) throw new PermissionDeniedError(manifest.id, "identity");
      options.consent.grant(manifest.id, "identity");
    }
    const userId = await options.identityProvider.getIdentity(manifest.id);
    return { userId };
  }

  async function handleShare(params: Record<string, unknown> | undefined) {
    assertDeclaredPermission(manifest, "share");
    return performShare(sanitizeShareParams(params), options.shareWindow);
  }

  async function handlePay(): Promise<never> {
    assertDeclaredPermission(manifest, "pay");
    // Declared, so this is a real "not yet" rather than a permission refusal.
    throw new NotImplementedError();
  }

  hostWindow.addEventListener("message", handleMessage);
  return () => hostWindow.removeEventListener("message", handleMessage);
}

function toErrorPayload(error: unknown): { code: string; message: string } {
  if (
    error instanceof PermissionDeniedError ||
    error instanceof UnknownMethodError ||
    error instanceof NotImplementedError ||
    error instanceof NotSignedInError
  ) {
    return { code: error.code, message: error.message };
  }
  return { code: "internal_error", message: "une erreur est survenue" };
}

function sanitizeShareParams(value: Record<string, unknown> | undefined): ShareParams {
  if (!value) return {};
  const out: ShareParams = {};
  if (typeof value.title === "string") out.title = value.title.slice(0, 200);
  if (typeof value.text === "string") out.text = value.text.slice(0, 2000);
  if (typeof value.url === "string") out.url = value.url.slice(0, MAX_SHARE_URL_LENGTH);
  return out;
}

const MAX_SHARE_URL_LENGTH = 2048;

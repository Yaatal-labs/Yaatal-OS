import { BRAND_NAME } from "../brand";
import { isKairmelResponse, KAIRMEL_PROTOCOL, type KairmelMethod, type KairmelRequestEnvelope } from "./protocol";

/**
 * The bridge mini-apps include to talk to the host. Everything here is written against a
 * minimal window-like interface (not the real DOM `Window`) so it can be unit tested without
 * a browser — `installKairmelBridge()` is the only function that touches the real `window`.
 */

export interface KairmelMessageEvent {
  readonly data: unknown;
  readonly origin: string;
  readonly source: unknown;
}

export interface MessageTarget {
  postMessage(message: unknown, targetOrigin: string): void;
}

export interface BridgeWindow {
  readonly parent: MessageTarget;
  readonly location: { readonly href: string };
  addEventListener(type: "message", listener: (event: KairmelMessageEvent) => void): void;
  removeEventListener(type: "message", listener: (event: KairmelMessageEvent) => void): void;
}

export interface KairmelIdentity {
  userId: string;
}

export interface KairmelShareParams {
  title?: string;
  text?: string;
  url?: string;
}

export interface KairmelShareResult {
  shared: boolean;
  method: "web-share" | "clipboard";
}

export interface KairmelBridge {
  /** A stable, per-app user id from the host session. Never the phone number — see the README. */
  identity(): Promise<KairmelIdentity>;
  /** Asks the host to share a link or text (Web Share, or a clipboard copy as fallback). */
  share(params: KairmelShareParams): Promise<KairmelShareResult>;
  /** Reserved. Always rejects today — payments are not implemented yet. */
  pay(params?: Record<string, unknown>): Promise<never>;
}

const REQUEST_TIMEOUT_MS = 15_000;

class KairmelBridgeError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = "KairmelBridgeError";
  }
}

function readHostOrigin(href: string): string | null {
  try {
    const url = new URL(href);
    const raw = url.searchParams.get("kairmelHost");
    if (!raw) return null;
    return new URL(raw).origin;
  } catch {
    return null;
  }
}

function randomId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

/**
 * Builds a `window.kairmel` implementation bound to `windowRef`. The host's origin is read
 * once from `?kairmelHost=` in the page URL — the host appends this when it opens the app's
 * iframe (see `ui/app.ts`). Every outgoing message targets that exact origin, never `"*"`,
 * and every incoming message is checked against it before anything else runs.
 */
export function createKairmelBridge(windowRef: BridgeWindow): KairmelBridge {
  const hostOrigin = readHostOrigin(windowRef.location.href);
  const pending = new Map<
    string,
    { resolve: (value: unknown) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }
  >();

  windowRef.addEventListener("message", (event) => {
    if (!hostOrigin) return;
    // Origin check, side one: only the host we were told about, from the exact parent window.
    if (event.source !== windowRef.parent) return;
    if (event.origin !== hostOrigin) return;
    if (!isKairmelResponse(event.data)) return;

    const entry = pending.get(event.data.id);
    if (!entry) return;
    pending.delete(event.data.id);
    clearTimeout(entry.timer);

    if (event.data.ok) {
      entry.resolve(event.data.result);
    } else {
      entry.reject(new KairmelBridgeError(event.data.error.message, event.data.error.code));
    }
  });

  function call<T>(method: KairmelMethod, params?: Record<string, unknown>): Promise<T> {
    if (!hostOrigin) {
      return Promise.reject(
        new KairmelBridgeError(`cette app doit être ouverte depuis ${BRAND_NAME} Marché`, "no_host"),
      );
    }

    const id = randomId();
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new KairmelBridgeError(`${BRAND_NAME} n'a pas répondu à temps`, "timeout"));
      }, REQUEST_TIMEOUT_MS);

      pending.set(id, { resolve: resolve as (value: unknown) => void, reject, timer });

      const request: KairmelRequestEnvelope = params
        ? { channel: KAIRMEL_PROTOCOL, direction: "request", id, method, params }
        : { channel: KAIRMEL_PROTOCOL, direction: "request", id, method };

      // Origin check, side two: replies are only useful to the host itself.
      windowRef.parent.postMessage(request, hostOrigin);
    });
  }

  return {
    identity: () => call<KairmelIdentity>("identity"),
    // Cast: a plain interface of optional string fields has no index signature, so it isn't
    // directly assignable to Record<string, unknown> — the values themselves are fine.
    share: (params) => call<KairmelShareResult>("share", params as Record<string, unknown>),
    pay: (params) => call<never>("pay", params),
  };
}

/** Side-effecting entry point: installs `window.kairmel`. Called once by `bridge/entry.ts`,
 *  which is what mini-apps actually load as a `<script>`. */
export function installKairmelBridge(windowRef: BridgeWindow & { kairmel?: KairmelBridge } = window as never): void {
  windowRef.kairmel = createKairmelBridge(windowRef);
}

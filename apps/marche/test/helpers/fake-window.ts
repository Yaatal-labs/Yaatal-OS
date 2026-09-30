import { vi } from "vitest";
import type { KairmelMessageEvent } from "../../src/bridge/kairmel-bridge";

/**
 * A minimal stand-in for a browser `Window`, good enough to drive both sides of the bridge
 * (`attachBridgeHost`'s `frameWindow`/`hostWindow`, and `createKairmelBridge`'s `windowRef`)
 * without a real iframe. `postMessage` is a `vi.fn`, so tests can assert exactly which origin
 * a message was sent to — not just whether it arrived.
 */
export interface FakeWindow {
  readonly origin: string;
  readonly postMessage: ReturnType<typeof vi.fn>;
  addEventListener(type: "message", listener: (event: KairmelMessageEvent) => void): void;
  removeEventListener(type: "message", listener: (event: KairmelMessageEvent) => void): void;
  /** Test-only: deliver an event to this window's listeners, including spoofed ones a real
   *  browser would never produce (wrong `origin`, wrong `source`). Waits for every listener
   *  (host handlers are async) before resolving. */
  dispatch(event: KairmelMessageEvent): Promise<void>;
}

export function createFakeWindow(origin: string): FakeWindow {
  const listeners = new Set<(event: KairmelMessageEvent) => void>();

  const win: FakeWindow = {
    origin,
    postMessage: vi.fn(),
    addEventListener: (_type, listener) => {
      listeners.add(listener);
    },
    removeEventListener: (_type, listener) => {
      listeners.delete(listener);
    },
    dispatch: async (event) => {
      await Promise.all([...listeners].map((listener) => listener(event)));
    },
  };

  return win;
}

/**
 * Wires `a` and `b` together the way a real top window and its iframe's `contentWindow` are:
 * calling `.postMessage` on a window delivers to *that window's own* listeners (not the
 * caller's), with `event.source` set to whichever side made the call and `event.origin` set
 * to the caller's origin — and delivery only happens if `targetOrigin` matches the
 * recipient's own actual origin (or is `"*"`), exactly like the real API.
 */
export function linkWindows(a: FakeWindow, b: FakeWindow): void {
  a.postMessage.mockImplementation((data: unknown, targetOrigin: string) => {
    if (targetOrigin !== "*" && targetOrigin !== a.origin) return;
    void a.dispatch({ data, origin: b.origin, source: b });
  });
  b.postMessage.mockImplementation((data: unknown, targetOrigin: string) => {
    if (targetOrigin !== "*" && targetOrigin !== b.origin) return;
    void b.dispatch({ data, origin: a.origin, source: a });
  });
}

import { describe, expect, it, vi } from "vitest";
import { attachBridgeHost } from "../src/host/bridge-host";
import { createKairmelBridge, type BridgeWindow } from "../src/bridge/kairmel-bridge";
import { KAIRMEL_PROTOCOL } from "../src/bridge/protocol";
import { InMemoryConsentStore } from "../src/host/consent";
import type { IdentityProvider } from "../src/host/identity-provider";
import type { AppManifest } from "../src/manifest/types";
import { createFakeWindow, linkWindows } from "./helpers/fake-window";

const HOST_ORIGIN = "https://marche.kairmel.test";
const APP_ORIGIN = "https://boutique-express.example.com";

/** A fake `IdentityProvider` (see host/identity-provider.ts): signed in by default, resolving to
 *  a deterministic `id-for-<appId>` -- enough to exercise the bridge's own logic without pulling
 *  in either real implementation (both of which talk to a real fetch/localStorage). */
function fakeIdentityProvider(
  options: { signedIn?: boolean; idFor?: (appId: string) => string } = {},
): IdentityProvider & { isSignedIn: ReturnType<typeof vi.fn>; getIdentity: ReturnType<typeof vi.fn> } {
  const signedIn = options.signedIn ?? true;
  const idFor = options.idFor ?? ((appId: string) => `id-for-${appId}`);
  return {
    isSignedIn: vi.fn(async () => signedIn),
    getIdentity: vi.fn(async (appId: string) => idFor(appId)),
  };
}

function manifestWith(permissions: AppManifest["permissions"]): AppManifest {
  return {
    id: "boutique-express",
    name: "Boutique Express",
    description: "Une boutique créée avec Créer.",
    icon: "/icons/marche-icon.svg",
    url: `${APP_ORIGIN}/`,
    category: "commerce",
    author: "Aissatou",
    permissions,
  };
}

function setUp(
  manifest: AppManifest,
  requestIdentityConsent = vi.fn(async () => true),
  options: { link?: boolean; identityProvider?: IdentityProvider } = {},
) {
  const host = createFakeWindow(HOST_ORIGIN);
  const frame = createFakeWindow(APP_ORIGIN);
  // Linked by default: a call through `bridge` is carried all the way to the host and back,
  // so a test can just `await` the bridge call. The origin-spoofing tests below turn this
  // off so they can drive each side by hand, one deliberately-malformed event at a time,
  // without racing a second, legitimate delivery happening in the background.
  if (options.link ?? true) linkWindows(host, frame);

  const consent = new InMemoryConsentStore();
  const share = vi.fn(async () => {
    /* no-op web-share */
  });
  const identityProvider = options.identityProvider ?? fakeIdentityProvider();

  const detach = attachBridgeHost({
    manifest,
    frameWindow: frame,
    appOrigin: APP_ORIGIN,
    identityProvider,
    consent,
    requestIdentityConsent,
    shareWindow: { navigator: { share } },
    hostWindow: host,
  });

  const appWindow: BridgeWindow = {
    parent: host,
    location: { href: `${APP_ORIGIN}/?kairmelHost=${encodeURIComponent(HOST_ORIGIN)}` },
    addEventListener: frame.addEventListener,
    removeEventListener: frame.removeEventListener,
  };
  const bridge = createKairmelBridge(appWindow);

  return { host, frame, consent, share, detach, bridge, identityProvider };
}

describe("bridge origin checks — host side", () => {
  it("ignores a request whose event.source is not the bound iframe window", async () => {
    const manifest = manifestWith(["share"]);
    const { host, frame } = setUp(manifest);
    const impostor = createFakeWindow(APP_ORIGIN);

    await host.dispatch({
      data: { channel: KAIRMEL_PROTOCOL, direction: "request", id: "1", method: "share", params: {} },
      origin: APP_ORIGIN,
      source: impostor, // not `frame`
    });

    expect(frame.postMessage).not.toHaveBeenCalled();
  });

  it("ignores a request whose event.origin does not match the app's declared origin", async () => {
    const manifest = manifestWith(["share"]);
    const { host, frame } = setUp(manifest);

    await host.dispatch({
      data: { channel: KAIRMEL_PROTOCOL, direction: "request", id: "1", method: "share", params: {} },
      origin: "https://evil.example",
      source: frame, // right source, wrong origin
    });

    expect(frame.postMessage).not.toHaveBeenCalled();
  });

  it("replies only to the app's own origin, never '*'", async () => {
    const manifest = manifestWith(["share"]);
    const { host, frame } = setUp(manifest);

    await host.dispatch({
      data: { channel: KAIRMEL_PROTOCOL, direction: "request", id: "1", method: "share", params: { url: "https://x" } },
      origin: APP_ORIGIN,
      source: frame,
    });

    expect(frame.postMessage).toHaveBeenCalledTimes(1);
    expect(frame.postMessage).toHaveBeenCalledWith(expect.anything(), APP_ORIGIN);
    expect(frame.postMessage.mock.calls[0]?.[1]).not.toBe("*");
  });

  it("replies with unknown_method for a well-formed request the host doesn't recognize", async () => {
    const manifest = manifestWith(["share"]);
    const { host, frame } = setUp(manifest);

    await host.dispatch({
      data: { channel: KAIRMEL_PROTOCOL, direction: "request", id: "1", method: "explode", params: {} },
      origin: APP_ORIGIN,
      source: frame,
    });

    const [response] = frame.postMessage.mock.calls[0] ?? [];
    expect(response).toMatchObject({ ok: false, error: { code: "unknown_method" } });
  });
});

describe("bridge origin checks — mini-app side", () => {
  // These three drive both windows by hand (`link: false`): no background auto-delivery, so
  // a deliberately spoofed event and the "real" one that follows it can never race.
  const GOOD_RESULT = { shared: true, method: "web-share" as const };

  it("ignores a response whose event.source is not window.parent, but still resolves the real one", async () => {
    const { host, frame, bridge } = setUp(manifestWith(["share"]), undefined, { link: false });
    const call = bridge.share({ url: "https://x" });

    // The bridge posts its request straight to `host` (== window.parent) synchronously.
    const [request] = host.postMessage.mock.calls[0] as [{ id: string }];

    const impostor = createFakeWindow(HOST_ORIGIN);
    await frame.dispatch({
      data: { channel: KAIRMEL_PROTOCOL, direction: "response", id: request.id, ok: true, result: GOOD_RESULT },
      origin: HOST_ORIGIN,
      source: impostor, // not the real window.parent
    });

    // The spoofed message must not have consumed the pending request.
    await frame.dispatch({
      data: { channel: KAIRMEL_PROTOCOL, direction: "response", id: request.id, ok: true, result: GOOD_RESULT },
      origin: HOST_ORIGIN,
      source: host, // the real window.parent
    });

    await expect(call).resolves.toEqual(GOOD_RESULT);
  });

  it("ignores a response from the wrong origin, but still resolves the real one", async () => {
    const { host, frame, bridge } = setUp(manifestWith(["share"]), undefined, { link: false });
    const call = bridge.share({ url: "https://x" });
    const [request] = host.postMessage.mock.calls[0] as [{ id: string }];

    await frame.dispatch({
      data: { channel: KAIRMEL_PROTOCOL, direction: "response", id: request.id, ok: true, result: { spoofed: true } },
      origin: "https://evil.example",
      source: host,
    });

    await frame.dispatch({
      data: { channel: KAIRMEL_PROTOCOL, direction: "response", id: request.id, ok: true, result: GOOD_RESULT },
      origin: HOST_ORIGIN,
      source: host,
    });

    await expect(call).resolves.toEqual(GOOD_RESULT);
  });

  it("sends requests only to the host origin it was told about, never '*'", async () => {
    const { host, frame, bridge } = setUp(manifestWith(["share"]), undefined, { link: false });
    const call = bridge.share({ url: "https://x" });

    expect(host.postMessage).toHaveBeenCalledTimes(1);
    expect(host.postMessage.mock.calls[0]?.[1]).toBe(HOST_ORIGIN);

    const [request] = host.postMessage.mock.calls[0] as [{ id: string }];
    await frame.dispatch({
      data: { channel: KAIRMEL_PROTOCOL, direction: "response", id: request.id, ok: true, result: GOOD_RESULT },
      origin: HOST_ORIGIN,
      source: host,
    });
    await call; // drains the bridge's pending-request timer
  });
});

describe("permission enforcement, end to end through the bridge", () => {
  it("refuses pay() with permission_denied when the manifest never declared pay", async () => {
    const { bridge } = setUp(manifestWith(["share"]));
    await expect(bridge.pay()).rejects.toMatchObject({ code: "permission_denied" });
  });

  it("refuses pay() with 'pas encore disponible' when pay IS declared", async () => {
    const { bridge } = setUp(manifestWith(["pay"]));
    await expect(bridge.pay()).rejects.toMatchObject({ code: "not_implemented", message: "pas encore disponible" });
  });

  it("refuses identity() when the manifest never declared identity", async () => {
    const { bridge } = setUp(manifestWith(["share"]));
    await expect(bridge.identity()).rejects.toMatchObject({ code: "permission_denied" });
  });

  it("asks for identity consent once, then reuses the grant on later calls", async () => {
    const consentPrompt = vi.fn(async () => true);
    const { bridge } = setUp(manifestWith(["identity"]), consentPrompt);

    const first = await bridge.identity();
    const second = await bridge.identity();

    expect(consentPrompt).toHaveBeenCalledTimes(1);
    expect(first.userId).toBe(second.userId);
    expect(first.userId).toBe("id-for-boutique-express");
  });

  it("asks again next time if the person said no", async () => {
    const consentPrompt = vi.fn(async () => false);
    const { bridge } = setUp(manifestWith(["identity"]), consentPrompt);

    await expect(bridge.identity()).rejects.toMatchObject({ code: "permission_denied" });
    await expect(bridge.identity()).rejects.toMatchObject({ code: "permission_denied" });

    expect(consentPrompt).toHaveBeenCalledTimes(2);
  });

  it("performs share() when declared, via the host's Web Share handler", async () => {
    const { bridge, share } = setUp(manifestWith(["share"]));
    const result = await bridge.share({ title: "Bazin", url: "https://boutique-express.example.com/p/1" });
    expect(result).toEqual({ shared: true, method: "web-share" });
    expect(share).toHaveBeenCalledWith({ title: "Bazin", url: "https://boutique-express.example.com/p/1" });
  });
});

describe("identity() requires sign-in (host/identity-provider.ts)", () => {
  it("rejects with not_signed_in when the identity provider reports signed out, and never prompts for consent", async () => {
    const consentPrompt = vi.fn(async () => true);
    const identityProvider = fakeIdentityProvider({ signedIn: false });
    const { bridge } = setUp(manifestWith(["identity"]), consentPrompt, { identityProvider });

    await expect(bridge.identity()).rejects.toMatchObject({ code: "not_signed_in" });
    expect(consentPrompt).not.toHaveBeenCalled();
    expect(identityProvider.getIdentity).not.toHaveBeenCalled();
  });

  it("still checks the declared permission before ever checking sign-in state", async () => {
    const identityProvider = fakeIdentityProvider({ signedIn: false });
    const { bridge } = setUp(manifestWith(["share"]), undefined, { identityProvider });

    await expect(bridge.identity()).rejects.toMatchObject({ code: "permission_denied" });
    expect(identityProvider.isSignedIn).not.toHaveBeenCalled();
  });

  it("proceeds normally (consent, then the real id) once signed in", async () => {
    const consentPrompt = vi.fn(async () => true);
    const identityProvider = fakeIdentityProvider({ signedIn: true, idFor: () => "whatsapp-backed-id" });
    const { bridge } = setUp(manifestWith(["identity"]), consentPrompt, { identityProvider });

    const result = await bridge.identity();

    expect(identityProvider.isSignedIn).toHaveBeenCalledTimes(1);
    expect(consentPrompt).toHaveBeenCalledTimes(1);
    expect(result.userId).toBe("whatsapp-backed-id");
  });
});

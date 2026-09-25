// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { App } from "./App";
import { signedOut, type NativeAdapter, type StudioPublicEvent } from "./native";
import type { CommerceWorkspaceAdapter } from "./contracts";
import { OS_PROTOCOL_VERSION, type SidecarStatus } from "@yaatal/os-protocol";
const active = { authenticated: true, merchant_name: "Awa", verified: true };
function adapter(overrides: Partial<NativeAdapter> = {}): NativeAdapter {
  return { runtimeMode: vi.fn().mockResolvedValue("native"), sessionStatus: vi.fn().mockResolvedValue(signedOut), login: vi.fn().mockResolvedValue(active), logout: vi.fn().mockResolvedValue(signedOut), sidecarStatus: vi.fn().mockResolvedValue({ version: OS_PROTOCOL_VERSION, kind: "sidecar-status", state: "ready", isRunning: true, port: 8484 }), startSidecar: vi.fn(), subscribe: vi.fn().mockResolvedValue(() => {}), ...overrides };
}
const product = { id: "robe-wax", name: "Robe Wax Bleue", priceFcfa: 12500, priceDisplay: "12,500 FCFA", stock: 3, stockStatus: "in_stock", images: [] };
const live = { isLive: true, sessionId: "live-1", startedAt: 1_789_000_000, sellerName: "Awa" };
function workspace(overrides: Partial<CommerceWorkspaceAdapter> = {}): CommerceWorkspaceAdapter { return { catalog: { list: vi.fn().mockResolvedValue({ products: [product], total: 1, page: 1, perPage: 20 }), product: vi.fn().mockResolvedValue(product) }, bootstrap: vi.fn().mockResolvedValue({ authenticated: true }), sessionState: vi.fn().mockResolvedValue(live), goLive: vi.fn(), stopStream: vi.fn().mockResolvedValue({ ...live, isLive: false, sessionId: null, startedAt: 0 }), productQueue: vi.fn().mockResolvedValue({ products: [product], source: "engine_live_session" }), status: vi.fn().mockResolvedValue({ health: "ok", ledgerAvailable: true, readiness: { status: "passed", steps: [] } }), createIntent: vi.fn(), conversions: vi.fn().mockResolvedValue([]), openLink: vi.fn().mockResolvedValue({ publicUrl: "https://shop.example/p/robe", opened: true }), ...overrides }; }
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(next => { resolve = next; }); return { promise, resolve }; }
beforeEach(() => { localStorage.clear(); document.documentElement.removeAttribute("data-theme"); });
afterEach(cleanup);
describe("unified workspace", () => {
  it("keeps sign-in gated until a delayed session restore resolves", async () => {
    let restore!: (session: typeof signedOut) => void;
    const native = adapter({ sessionStatus: vi.fn(() => new Promise<typeof signedOut>(resolve => { restore = resolve; })) });
    render(<App adapter={native} />);
    await waitFor(() => expect(native.sessionStatus).toHaveBeenCalledTimes(1));
    const signIn = screen.getByRole("button", { name: "Sign in" }) as HTMLButtonElement;
    expect(signIn.disabled).toBe(true);
    await userEvent.click(signIn);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(native.login).toHaveBeenCalledTimes(0);
    restore(signedOut);
    await waitFor(() => expect(signIn.disabled).toBe(false));
    await userEvent.click(signIn);
    await userEvent.type(screen.getByLabelText("Email"), "awa@example.com");
    await userEvent.type(screen.getByLabelText("Password"), "secret");
    await userEvent.click(screen.getAllByRole("button", { name: "Sign in" }).at(-1)!);
    expect(await screen.findByRole("button", { name: "Awa" })).toBeTruthy();
    expect(native.sessionStatus).toHaveBeenCalledTimes(1);
    expect(native.login).toHaveBeenCalledTimes(1);
  });
  it("keeps browser preview honest and never calls native authentication", async () => {
    const native = adapter({ runtimeMode: vi.fn().mockResolvedValue("preview") });
    render(<App adapter={native} />);
    expect(await screen.findByText(/Browser preview ·/)).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByRole("dialog")).toBeTruthy();
    expect(screen.queryByLabelText("Password")).toBeNull();
    expect(native.sessionStatus).toHaveBeenCalledTimes(0); expect(native.login).toHaveBeenCalledTimes(0);
  });
  it("blocks incompatible native builds before loading workspaces or sessions", async () => {
    const native = adapter({ runtimeMode: vi.fn().mockRejectedValue(new Error("Unified mode required")) });
    const feature = vi.fn(); render(<App adapter={native} renderSell={feature} />);
    expect(await screen.findByRole("alert")).toHaveProperty("textContent", "Unified mode required");
    expect(feature).toHaveBeenCalledTimes(0); expect(native.sessionStatus).toHaveBeenCalledTimes(0);
  });
  it("surfaces an initial session restore failure and retries full initialization", async () => {
    const sessionStatus = vi.fn().mockRejectedValueOnce(new Error("Initial session failed")).mockResolvedValueOnce(active);
    const subscribe = vi.fn().mockResolvedValue(() => {});
    render(<App adapter={adapter({ sessionStatus, subscribe })} renderSell={() => <p>Sell shell</p>} renderShop={() => <p>Shop shell</p>} />);
    expect(await screen.findByRole("alert")).toHaveProperty("textContent", expect.stringContaining("Initial session failed"));
    expect(screen.getByRole("button", { name: "Sign in" })).toHaveProperty("disabled", false);
    await userEvent.click(screen.getByRole("button", { name: "Retry Studio" }));
    expect(await screen.findByRole("button", { name: "Awa" })).toBeTruthy();
    expect(sessionStatus).toHaveBeenCalledTimes(2); expect(subscribe).toHaveBeenCalledTimes(1);
  });
  it("preserves theme keys and shared product selection through SELL/SHOP navigation", async () => {
    localStorage.setItem("yaatal-os-theme", "dark");
    render(<App adapter={adapter()} renderSell={context => <button onClick={() => { context.selectProduct("robe-wax"); context.navigate("shop"); }}>Open selected product</button>} renderShop={context => <><p>Selected: {context.selectedProductId}</p><button onClick={() => context.navigate("sell")}>Return to Live</button></>} />);
    await userEvent.click(await screen.findByRole("button", { name: "Open selected product" }));
    expect(await screen.findByText("Selected: robe-wax")).toBeTruthy();
    expect(screen.getByRole("button", { name: "SHOP" }).getAttribute("aria-current")).toBe("page");
    await userEvent.click(screen.getByRole("button", { name: "Use light theme" }));
    expect(localStorage.getItem("yaatal-os-theme")).toBe("light");
    await userEvent.click(screen.getByRole("button", { name: "SELL" }));
    await userEvent.click(screen.getByRole("button", { name: "SHOP" }));
    expect(screen.getByText("Selected: robe-wax")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Return to Live" }));
    expect(screen.getByRole("button", { name: "Open selected product" })).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "SHOP" }));
    expect(screen.getByText("Selected: robe-wax")).toBeTruthy();
  });
  it("navigates from semantic rail controls by pointer and keyboard", async () => {
    const user = userEvent.setup();
    render(<App adapter={adapter()} renderSell={() => <p>Sell shell</p>} renderShop={() => <p>Shop shell</p>} />);
    expect(await screen.findByText("Sell shell")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Open SHOP workspace" }));
    expect(await screen.findByText("Shop shell")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Open SHOP workspace" }).getAttribute("aria-current")).toBe("page");
    screen.getByRole("button", { name: "Open SELL workspace" }).focus();
    await user.keyboard("{Enter}");
    await waitFor(() => expect(screen.getByRole("button", { name: "Open SELL workspace" }).getAttribute("aria-current")).toBe("page"));
  });
  it("transfers the approved shell rail without inventing unavailable workspaces", async () => {
    render(<App adapter={adapter()} renderSell={() => <p>Sell shell</p>} renderShop={() => <p>Shop shell</p>} />);
    expect(await screen.findByText("Sell shell")).toBeTruthy();
    expect(screen.getByText("Home")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Live" })).toBeTruthy();
    expect(screen.getByText("Products")).toBeTruthy();
    const orders = screen.getByRole("button", { name: "Orders · Not available in this build" }) as HTMLButtonElement;
    const customers = screen.getByRole("button", { name: "Customers · Not available in this build" }) as HTMLButtonElement;
    expect(orders.disabled).toBe(true);
    expect(customers.disabled).toBe(true);
    await userEvent.click(screen.getByRole("button", { name: "Settings" }));
    expect(await screen.findByRole("dialog")).toBeTruthy();
  });
  it("opens the Atelier without an Engine session and keeps it mounted across workspaces", async () => {
    const atelier = vi.fn(() => <p>Atelier frame</p>);
    render(<App adapter={adapter()} renderSell={() => <p>Sell shell</p>} renderShop={() => <p>Shop shell</p>} renderAtelier={atelier} />);
    await screen.findByText("Sell shell");
    expect(atelier).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Open ATELIER workspace" }));
    expect(await screen.findByText("Atelier frame")).toBeTruthy();
    expect(localStorage.getItem("yaatal-os-workspace")).toBe("atelier");
    const pane = screen.getByText("Atelier frame").closest(".workspace-pane") as HTMLElement;
    expect(pane.hidden).toBe(false);
    await userEvent.click(screen.getByRole("button", { name: "Open SHOP workspace" }));
    expect(await screen.findByText("Shop shell")).toBeTruthy();
    expect(screen.getByText("Atelier frame").closest(".workspace-pane")).toBe(pane);
    expect(pane.hidden).toBe(true);
    expect(pane.hasAttribute("inert")).toBe(true);
  });
  it("restores the Atelier as the saved workspace", async () => {
    localStorage.setItem("yaatal-os-workspace", "atelier");
    render(<App adapter={adapter()} renderSell={() => <p>Sell shell</p>} renderShop={() => <p>Shop shell</p>} renderAtelier={() => <p>Atelier frame</p>} />);
    expect(await screen.findByText("Atelier frame")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Open ATELIER workspace" }).getAttribute("aria-current")).toBe("page");
  });
  it("keeps theme and locale controls reachable at a narrow viewport", async () => {
    const originalWidth = window.innerWidth;
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 320 });
    try {
      const user = userEvent.setup();
      render(<App adapter={adapter()} renderSell={() => <p>Sell shell</p>} renderShop={() => <p>Shop shell</p>} />);
      expect(await screen.findByText("Sell shell")).toBeTruthy();
      await user.click(screen.getByRole("button", { name: "Use dark theme" }));
      expect(document.documentElement.dataset.theme).toBe("dark");
      await user.click(screen.getByRole("button", { name: "Français" }));
      expect(document.documentElement.lang).toBe("fr");
      expect(screen.getByRole("button", { name: "VENDRE" })).toBeTruthy();
      expect(screen.getByRole("button", { name: "BOUTIQUE" })).toBeTruthy();
      expect(screen.getByRole("button", { name: "Se connecter" })).toBeTruthy();
    } finally { Object.defineProperty(window, "innerWidth", { configurable: true, value: originalWidth }); }
  });
  it("logs in once, keeps sessions through navigation, and clears selection on logout", async () => {
    const native = adapter();
    render(<App adapter={native} renderSell={context => <button onClick={() => context.selectProduct("robe-wax")}>Select product</button>} renderShop={context => <p>Selected: {context.selectedProductId || "none"}</p>} />);
    await userEvent.click(await screen.findByRole("button", { name: "Select product" }));
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    await userEvent.type(screen.getByLabelText("Email"), "awa@example.com");
    await userEvent.type(screen.getByLabelText("Password"), "secret");
    await userEvent.click(screen.getAllByRole("button", { name: "Sign in" }).at(-1)!);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await userEvent.click(screen.getByRole("button", { name: "Select product" }));
    await userEvent.click(screen.getByRole("button", { name: "SHOP" }));
    expect(screen.getByText("Selected: robe-wax")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Awa" }));
    await userEvent.click(screen.getByRole("button", { name: "Sign out" }));
    expect(await screen.findByText("Selected: none")).toBeTruthy();
    expect(native.login).toHaveBeenCalledTimes(1);
    expect([...Array(localStorage.length)].map((_, i) => localStorage.getItem(localStorage.key(i)!)).join().includes("secret")).toBe(false);
  });
  it("prevents duplicate sign-in while pending and focuses a retryable failure", async () => {
    let reject!: (reason: Error) => void;
    const native = adapter({ login: vi.fn(() => new Promise<typeof active>((_, fail) => { reject = fail; })) });
    render(<App adapter={native} />);
    await screen.findByText("Sign in to prepare your Studio session.");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    await userEvent.type(screen.getByLabelText("Email"), "awa@example.com");
    await userEvent.type(screen.getByLabelText("Password"), "secret");
    await userEvent.click(screen.getAllByRole("button", { name: "Sign in" }).at(-1)!);
    expect((screen.getByRole("button", { name: "Signing in…" }) as HTMLButtonElement).disabled).toBe(true);
    reject(new Error("Please retry signing in."));
    const error = await screen.findByRole("alert");
    await waitFor(() => expect(document.activeElement).toBe(error));
    expect((screen.getByLabelText("Password") as HTMLInputElement).value).toBe("");
    expect(native.login).toHaveBeenCalledTimes(1);
  });
  it("uses real SELL and SHOP state to restore after login and return from the selected detail", async () => {
    const native = adapter(); const commerce = workspace(); render(<App adapter={native} workspaceAdapter={commerce} />);
    await screen.findByText("Sign in to prepare your Studio session."); await userEvent.click(screen.getByRole("button", { name: "Sign in" })); await userEvent.type(screen.getByLabelText("Email"), "awa@example.com"); await userEvent.type(screen.getByLabelText("Password"), "secret"); await userEvent.click(screen.getAllByRole("button", { name: "Sign in" }).at(-1)!);
    await screen.findByText("Open in SHOP"); expect(commerce.bootstrap).toHaveBeenCalled();
    await userEvent.click(screen.getByText("Open in SHOP"));
    expect(await screen.findByRole("heading", { name: "Robe Wax Bleue" })).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Return to Live" }));
    expect(screen.getByRole("button", { name: "Stop stream" })).toBeTruthy();
  });
  it("restores Studio once after manual and event-driven ready transitions", async () => {
    let onSidecar: ((value: { version: typeof OS_PROTOCOL_VERSION; kind: "sidecar-status"; state: "ready"; isRunning: boolean; port: number | null }) => void) | undefined;
    const offline = { version: OS_PROTOCOL_VERSION, kind: "sidecar-status" as const, state: "stopped" as const, isRunning: false, port: null };
    const ready = { version: OS_PROTOCOL_VERSION, kind: "sidecar-status" as const, state: "ready" as const, isRunning: true, port: 8484 };
    const native = adapter({ sessionStatus: vi.fn().mockResolvedValueOnce(signedOut).mockResolvedValue(active), sidecarStatus: vi.fn().mockResolvedValue(offline), startSidecar: vi.fn().mockResolvedValue(ready), subscribe: vi.fn().mockImplementation((sidecar) => { onSidecar = sidecar; return Promise.resolve(() => {}); }) }); const commerce = workspace();
    render(<App adapter={native} workspaceAdapter={commerce} />); await screen.findByText("Sign in to prepare your Studio session."); await userEvent.click(screen.getByRole("button", { name: "Sign in" })); await userEvent.type(screen.getByLabelText("Email"), "awa@example.com"); await userEvent.type(screen.getByLabelText("Password"), "secret"); await userEvent.click(screen.getAllByRole("button", { name: "Sign in" }).at(-1)!);
    await screen.findByRole("button", { name: "Connect Studio" }); await userEvent.click(screen.getByRole("button", { name: "Connect Studio" }));
    await waitFor(() => expect(commerce.bootstrap).toHaveBeenCalledTimes(2)); onSidecar?.(ready); await Promise.resolve(); expect(commerce.bootstrap).toHaveBeenCalledTimes(2);
  });
  it("bootstraps an already authenticated ready session exactly once", async () => {
    const commerce = workspace();
    render(<App adapter={adapter({ sessionStatus: vi.fn().mockResolvedValue(active) })} workspaceAdapter={commerce} />);
    await screen.findByRole("button", { name: "Stop stream" });
    expect(commerce.bootstrap).toHaveBeenCalledTimes(1);
    expect(commerce.sessionState).toHaveBeenCalledTimes(1);
    expect(commerce.status).toHaveBeenCalledTimes(1);
    expect(commerce.productQueue).toHaveBeenCalledTimes(1);
  });
  it("retains inactive workspace state while removing its controls from keyboard and AT access", async () => {
    function LiveProbe() { const [count, setCount] = useState(0); return <button onClick={() => setCount(value => value + 1)}>Live tick: {count}</button>; }
    render(<App adapter={adapter()} renderSell={() => <LiveProbe />} renderShop={() => <button>Shop control</button>} />);
    await userEvent.click(await screen.findByRole("button", { name: "Live tick: 0" }));
    await userEvent.click(screen.getByRole("button", { name: "SHOP" }));
    expect(screen.queryByRole("button", { name: "Live tick: 1" })).toBeNull();
    const hiddenLive = screen.getByText("Live tick: 1").closest(".workspace-pane");
    expect(hiddenLive?.hasAttribute("hidden")).toBe(true); expect(hiddenLive?.getAttribute("aria-hidden")).toBe("true"); expect(hiddenLive?.hasAttribute("inert")).toBe(true);
    await userEvent.click(screen.getByRole("button", { name: "SELL" }));
    expect(screen.getByRole("button", { name: "Live tick: 1" })).toBeTruthy();
  });
  it("does not put keyboard focus into the hidden workspace and retains it on return", async () => {
    function LiveProbe() { const [count, setCount] = useState(0); return <button onClick={() => setCount(value => value + 1)}>Live tick: {count}</button>; }
    const user = userEvent.setup();
    render(<App adapter={adapter()} renderSell={() => <LiveProbe />} renderShop={() => <button>Shop-only control</button>} />);
    await user.click(await screen.findByRole("button", { name: "Live tick: 0" }));
    await user.click(screen.getByRole("button", { name: "SHOP" }));
    expect(screen.queryByRole("button", { name: "Live tick: 1" })).toBeNull();
    document.body.focus();
    const liveButton = screen.getByText("Live tick: 1"); const focused: Element[] = [];
    for (let index = 0; index < 14; index += 1) { await user.tab(); if (document.activeElement) focused.push(document.activeElement); }
    expect(focused.includes(liveButton)).toBe(false);
    await user.click(screen.getByRole("button", { name: "SELL" }));
    expect(screen.getByRole("button", { name: "Live tick: 1" })).toBeTruthy();
  });
  it("invalidates account A's deferred Studio state before exactly one account B recovery", async () => {
    const oldBootstrap = deferred<{ authenticated: boolean }>(); const oldSession = deferred<typeof live>(); const oldStatus = deferred<{ health: "ok"; ledgerAvailable: boolean; readiness: { status: string; steps: [] } }>(); const oldQueue = deferred<{ products: typeof product[]; source: string }>(); const oldConversions = deferred<[]>(); const logout = deferred<typeof signedOut>();
    const bLive = { ...live, sessionId: "live-b", sellerName: "Binta" }; const bProduct = { ...product, id: "b-product", name: "Binta's dress" };
    let bootstrapCalls = 0; let sessionCalls = 0; let statusCalls = 0; let queueCalls = 0; let conversionCalls = 0;
    const commerce = workspace({
      bootstrap: vi.fn(() => { bootstrapCalls += 1; return bootstrapCalls === 2 ? oldBootstrap.promise : Promise.resolve({ authenticated: true }); }),
      sessionState: vi.fn(() => { sessionCalls += 1; return sessionCalls === 2 ? oldSession.promise : Promise.resolve(sessionCalls === 1 ? live : bLive); }),
      status: vi.fn(() => { statusCalls += 1; return statusCalls === 2 ? oldStatus.promise : Promise.resolve({ health: "ok" as const, ledgerAvailable: true, readiness: { status: "passed", steps: [] } }); }),
      productQueue: vi.fn(() => { queueCalls += 1; return queueCalls === 2 ? oldQueue.promise : Promise.resolve({ products: queueCalls === 1 ? [product] : [bProduct], source: "engine_live_session" }); }),
      conversions: vi.fn(() => { conversionCalls += 1; return conversionCalls === 1 ? oldConversions.promise : Promise.resolve([]); }),
    });
    const native = adapter({ sessionStatus: vi.fn().mockResolvedValue(active), login: vi.fn().mockResolvedValue({ ...active, merchant_name: "Binta" }), logout: vi.fn().mockReturnValue(logout.promise) });
    render(<App adapter={native} workspaceAdapter={commerce} />);
    await screen.findByRole("button", { name: "Refresh Studio" });
    await userEvent.click(screen.getByRole("button", { name: "Robe Wax Bleue 12,500 FCFA" }));
    expect(screen.getByRole("button", { name: "Robe Wax Bleue 12,500 FCFA" }).closest("li")?.className).toContain("is-selected");
    await userEvent.click(screen.getByRole("button", { name: "Refresh Studio" }));
    await act(async () => { oldBootstrap.resolve({ authenticated: true }); await Promise.resolve(); });
    await waitFor(() => expect(commerce.sessionState).toHaveBeenCalledTimes(2));
    await userEvent.click(screen.getByRole("button", { name: "Awa" }));
    await userEvent.click(screen.getByRole("button", { name: "Sign out" }));
    expect(await screen.findByText("Sign in to prepare your Studio session.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Robe Wax Bleue" })).toBeNull();
    await act(async () => { logout.resolve(signedOut); await Promise.resolve(); });
    await userEvent.click(await screen.findByRole("button", { name: "Sign in" }));
    await userEvent.type(screen.getByLabelText("Email"), "binta@example.com"); await userEvent.type(screen.getByLabelText("Password"), "secret"); await userEvent.click(screen.getAllByRole("button", { name: "Sign in" }).at(-1)!);
    await waitFor(() => expect(screen.getAllByText("Binta").length).toBeGreaterThan(0));
    expect(bootstrapCalls).toBe(3);
    await act(async () => { oldSession.resolve({ ...live, sellerName: "Old A" }); oldStatus.resolve({ health: "ok", ledgerAvailable: false, readiness: { status: "old", steps: [] } }); oldQueue.resolve({ products: [{ ...product, name: "Old A product" }], source: "old" }); oldConversions.resolve([]); await Promise.resolve(); });
    await waitFor(() => expect(screen.queryByText("Old A")).toBeNull());
    expect(screen.queryByText("Old A product")).toBeNull();
  });
  it("ignores product navigation emitted during and after a deferred logout", async () => {
    let productNavigation: ((event: { productId: string }) => void) | undefined;
    const logout = deferred<typeof signedOut>();
    const native = adapter({ sessionStatus: vi.fn().mockResolvedValue(active), logout: vi.fn().mockReturnValue(logout.promise), subscribe: vi.fn().mockImplementation((_sidecar, product) => { productNavigation = product; return Promise.resolve(() => {}); }) });
    render(<App adapter={native} renderSell={context => <p>SELL selection: {context.selectedProductId || "none"}</p>} renderShop={context => <p>SHOP selection: {context.selectedProductId || "none"}</p>} />);
    expect(await screen.findByText("SELL selection: none")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Awa" })); await userEvent.click(screen.getByRole("button", { name: "Sign out" }));
    await act(async () => { productNavigation?.({ productId: "old-product" }); await Promise.resolve(); });
    expect(screen.getByText("SELL selection: none")).toBeTruthy();
    await act(async () => { logout.resolve(signedOut); await Promise.resolve(); });
    await act(async () => { productNavigation?.({ productId: "old-product" }); await Promise.resolve(); });
    expect(screen.getByText("SELL selection: none")).toBeTruthy();
    expect(screen.getByRole("button", { name: "SELL" }).getAttribute("aria-current")).toBe("page");
  });
  it("replaces an authenticated account directly on sidecar recovery without retaining A shell or async state", async () => {
    let onSidecar: ((status: SidecarStatus) => void) | undefined; const oldConversions = deferred<[{ version: "yaatal.commerce-receipt.v1"; orderId: string; productId: string; productName: string; totalFcfa: number; paymentProvider: string; paymentStatus: "sandbox_paid"; liveSessionId: string; sourceChannel: string; deduplicated: boolean; quantity: number; createdAt: string }]>();
    const bLive = { ...live, sessionId: "live-b", sellerName: "Binta" }; const bProduct = { ...product, id: "b-product", name: "Binta dress" }; const bReceipt = { version: "yaatal.commerce-receipt.v1" as const, orderId: "b-receipt", productId: bProduct.id, productName: bProduct.name, totalFcfa: bProduct.priceFcfa, paymentProvider: "wave", paymentStatus: "sandbox_paid" as const, liveSessionId: "live-b", sourceChannel: "copy", deduplicated: false, quantity: 1, createdAt: "2026-09-10T00:00:00Z" };
    const bootstrap = vi.fn().mockResolvedValue({ authenticated: true }); const commerce = workspace({ bootstrap, sessionState: vi.fn().mockResolvedValueOnce(live).mockResolvedValueOnce(bLive), productQueue: vi.fn().mockResolvedValueOnce({ products: [product], source: "engine_live_session" }).mockResolvedValueOnce({ products: [bProduct], source: "engine_live_session" }), conversions: vi.fn().mockReturnValueOnce(oldConversions.promise).mockResolvedValueOnce([bReceipt]) });
    const native = adapter({ sessionStatus: vi.fn().mockResolvedValueOnce(active).mockResolvedValueOnce({ ...active, merchant_name: "Binta" }), subscribe: vi.fn().mockImplementation((sidecar) => { onSidecar = sidecar; return Promise.resolve(() => {}); }) });
    render(<App adapter={native} workspaceAdapter={commerce} />);
    await userEvent.click(await screen.findByRole("button", { name: "Robe Wax Bleue 12,500 FCFA" })); await userEvent.click(screen.getByRole("button", { name: "Share" })); expect(await screen.findByRole("dialog")).toBeTruthy();
    await act(async () => { onSidecar?.({ version: OS_PROTOCOL_VERSION, kind: "sidecar-status", state: "stopped", isRunning: false, port: 0 }); onSidecar?.({ version: OS_PROTOCOL_VERSION, kind: "sidecar-status", state: "ready", isRunning: true, port: 8484 }); await Promise.resolve(); });
    await waitFor(() => expect(screen.getAllByText("Binta").length).toBeGreaterThan(0)); expect(screen.queryByRole("dialog")).toBeNull(); expect((await screen.findByRole("button", { name: "Binta dress 12,500 FCFA" })).closest("li")?.className.includes("is-selected")).toBe(false); expect(bootstrap).toHaveBeenCalledTimes(2);
    await act(async () => { oldConversions.resolve([{ version: "yaatal.commerce-receipt.v1", orderId: "old-receipt", productId: product.id, productName: "Old A receipt", totalFcfa: product.priceFcfa, paymentProvider: "wave", paymentStatus: "sandbox_paid", liveSessionId: "live-1", sourceChannel: "copy", deduplicated: false, quantity: 1, createdAt: "2026-09-10T00:00:00Z" }]); await Promise.resolve(); });
    await waitFor(() => expect(screen.queryByText("Old A receipt")).toBeNull()); expect(screen.getAllByText("Binta dress").length).toBeGreaterThan(0);
  });
  it("discards recovery snapshots after Studio goes offline and when a newer recovery wins", async () => {
    let onSidecar: ((status: SidecarStatus) => void) | undefined;
    const offline = deferred<typeof active>(); const older = deferred<typeof active>(); const newer = deferred<typeof active>();
    const sessionStatus = vi.fn().mockResolvedValueOnce(active).mockReturnValueOnce(offline.promise).mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise);
    render(<App adapter={adapter({ sessionStatus, subscribe: vi.fn().mockImplementation((sidecar) => { onSidecar = sidecar; return Promise.resolve(() => {}); }) })} renderSell={() => <p>Sell shell</p>} renderShop={() => <p>Shop shell</p>} />);
    expect(await screen.findByRole("button", { name: "Awa" })).toBeTruthy();
    await act(async () => { onSidecar?.({ version: OS_PROTOCOL_VERSION, kind: "sidecar-status", state: "stopped", isRunning: false, port: 0 }); onSidecar?.({ version: OS_PROTOCOL_VERSION, kind: "sidecar-status", state: "ready", isRunning: true, port: 8484 }); await Promise.resolve(); });
    await waitFor(() => expect(sessionStatus).toHaveBeenCalledTimes(2));
    await act(async () => { onSidecar?.({ version: OS_PROTOCOL_VERSION, kind: "sidecar-status", state: "stopped", isRunning: false, port: 0 }); offline.resolve({ ...active, merchant_name: "Offline stale" }); await Promise.resolve(); });
    expect(screen.getByRole("button", { name: "Awa" })).toBeTruthy();
    await act(async () => { onSidecar?.({ version: OS_PROTOCOL_VERSION, kind: "sidecar-status", state: "ready", isRunning: true, port: 8484 }); await Promise.resolve(); onSidecar?.({ version: OS_PROTOCOL_VERSION, kind: "sidecar-status", state: "stopped", isRunning: false, port: 0 }); onSidecar?.({ version: OS_PROTOCOL_VERSION, kind: "sidecar-status", state: "ready", isRunning: true, port: 8484 }); await Promise.resolve(); });
    await waitFor(() => expect(sessionStatus).toHaveBeenCalledTimes(4));
    await act(async () => { older.resolve({ ...active, merchant_name: "Older stale" }); await Promise.resolve(); });
    expect(screen.getByRole("button", { name: "Awa" })).toBeTruthy();
    await act(async () => { newer.resolve({ ...active, merchant_name: "Binta" }); await Promise.resolve(); });
    expect(await screen.findByRole("button", { name: "Binta" })).toBeTruthy();
  });
  it("shows a failed recovery and retries the authoritative session snapshot", async () => {
    let onSidecar: ((status: SidecarStatus) => void) | undefined;
    const sessionStatus = vi.fn().mockResolvedValueOnce(active).mockRejectedValueOnce(new Error("Session refresh failed")).mockResolvedValueOnce({ ...active, merchant_name: "Binta" });
    render(<App adapter={adapter({ sessionStatus, subscribe: vi.fn().mockImplementation((sidecar) => { onSidecar = sidecar; return Promise.resolve(() => {}); }) })} renderSell={() => <p>Sell shell</p>} renderShop={() => <p>Shop shell</p>} />);
    expect(await screen.findByRole("button", { name: "Awa" })).toBeTruthy();
    await act(async () => { onSidecar?.({ version: OS_PROTOCOL_VERSION, kind: "sidecar-status", state: "stopped", isRunning: false, port: 0 }); onSidecar?.({ version: OS_PROTOCOL_VERSION, kind: "sidecar-status", state: "ready", isRunning: true, port: 8484 }); await Promise.resolve(); });
    expect(await screen.findByRole("alert")).toHaveProperty("textContent", expect.stringContaining("Session refresh failed"));
    await userEvent.click(screen.getByRole("button", { name: "Retry Studio" }));
    expect(await screen.findByRole("button", { name: "Binta" })).toBeTruthy(); expect(sessionStatus).toHaveBeenCalledTimes(3);
  });
  it("retries a failed Studio start through the same connect operation", async () => {
    const stopped: SidecarStatus = { version: OS_PROTOCOL_VERSION, kind: "sidecar-status", state: "stopped", isRunning: false, port: 0 };
    const ready: SidecarStatus = { version: OS_PROTOCOL_VERSION, kind: "sidecar-status", state: "ready", isRunning: true, port: 8484 };
    const startSidecar = vi.fn().mockRejectedValueOnce(new Error("Studio start failed")).mockResolvedValueOnce(ready);
    const sessionStatus = vi.fn().mockResolvedValue(active);
    render(<App adapter={adapter({ sessionStatus, sidecarStatus: vi.fn().mockResolvedValue(stopped), startSidecar })} renderSell={() => <p>Sell shell</p>} renderShop={() => <p>Shop shell</p>} />);
    await userEvent.click(await screen.findByRole("button", { name: "Connect Studio" }));
    expect(await screen.findByRole("alert")).toHaveProperty("textContent", expect.stringContaining("Studio start failed"));
    await userEvent.click(screen.getByRole("button", { name: "Retry Studio" }));
    await waitFor(() => expect(startSidecar).toHaveBeenCalledTimes(2));
    expect(await screen.findByText("Studio connected")).toBeTruthy();
    expect(sessionStatus).toHaveBeenCalledTimes(2);
  });
  it("reinitializes a failed native subscription instead of only refreshing the session", async () => {
    const subscribe = vi.fn().mockRejectedValueOnce(new Error("Subscription failed")).mockResolvedValueOnce(() => {});
    const sessionStatus = vi.fn().mockResolvedValue(active);
    render(<App adapter={adapter({ sessionStatus, subscribe })} renderSell={() => <p>Sell shell</p>} renderShop={() => <p>Shop shell</p>} />);
    expect(await screen.findByRole("alert")).toHaveProperty("textContent", expect.stringContaining("Subscription failed"));
    await userEvent.click(screen.getByRole("button", { name: "Retry Studio" }));
    await waitFor(() => expect(subscribe).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
    expect(sessionStatus).toHaveBeenCalledTimes(2);
  });
  it("does not restore a stale session while an initialization retry races logout", async () => {
    const logout = deferred<typeof signedOut>(); const staleRestore = deferred<typeof active>();
    const sessionStatus = vi.fn().mockResolvedValueOnce(active).mockReturnValueOnce(staleRestore.promise);
    const subscribe = vi.fn().mockRejectedValueOnce(new Error("Subscription failed")).mockResolvedValueOnce(() => {});
    render(<App adapter={adapter({ sessionStatus, subscribe, logout: vi.fn().mockReturnValue(logout.promise) })} renderSell={() => <p>Sell shell</p>} renderShop={() => <p>Shop shell</p>} />);
    const retry = await screen.findByRole("button", { name: "Retry Studio" });
    await userEvent.click(screen.getByRole("button", { name: "Awa" })); await userEvent.click(screen.getByRole("button", { name: "Sign out" }));
    await act(async () => { retry.click(); await Promise.resolve(); });
    await waitFor(() => expect(sessionStatus).toHaveBeenCalledTimes(2));
    await act(async () => { staleRestore.resolve(active); await Promise.resolve(); });
    await waitFor(() => expect(subscribe).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole("button", { name: "Awa" })).toBeNull();
    await act(async () => { logout.resolve(signedOut); await Promise.resolve(); });
    expect(screen.queryByRole("button", { name: "Awa" })).toBeNull();
  });
  it("refreshes account identity through manual Connect before restoring Studio", async () => {
    const stopped: SidecarStatus = { version: OS_PROTOCOL_VERSION, kind: "sidecar-status", state: "stopped", isRunning: false, port: 0 };
    const ready: SidecarStatus = { version: OS_PROTOCOL_VERSION, kind: "sidecar-status", state: "ready", isRunning: true, port: 8484 };
    const sessionStatus = vi.fn().mockResolvedValueOnce(active).mockResolvedValueOnce({ ...active, merchant_name: "Binta" }); const startSidecar = vi.fn().mockResolvedValue(ready);
    render(<App adapter={adapter({ sessionStatus, sidecarStatus: vi.fn().mockResolvedValue(stopped), startSidecar })} renderSell={context => <><button onClick={() => context.selectProduct("robe-wax")}>Choose product</button><p>Selected: {context.selectedProductId || "none"}</p></>} renderShop={() => <p>Shop shell</p>} />);
    await userEvent.click(await screen.findByRole("button", { name: "Choose product" })); expect(screen.getByText("Selected: robe-wax")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Connect Studio" }));
    expect(await screen.findByRole("button", { name: "Binta" })).toBeTruthy(); expect(screen.getByText("Selected: none")).toBeTruthy(); expect(startSidecar).toHaveBeenCalledTimes(1); expect(sessionStatus).toHaveBeenCalledTimes(2);
  });
  it("keeps a stopped real Studio session, its receipt, and its cache through navigation and preferences", async () => {
    const receipt = { version: "yaatal.commerce-receipt.v1" as const, orderId: "receipt-1", productId: product.id, productName: product.name, totalFcfa: product.priceFcfa, paymentProvider: "wave", paymentStatus: "sandbox_paid" as const, liveSessionId: "live-1", sourceChannel: "copy", deduplicated: false, quantity: 1, createdAt: "2026-09-10T00:00:00Z" };
    const bootstrap = vi.fn().mockResolvedValue({ authenticated: true }); const sessionState = vi.fn().mockResolvedValue(live); const conversions = vi.fn().mockResolvedValue([receipt]);
    const commerce = workspace({ bootstrap, sessionState, conversions });
    render(<App adapter={adapter({ sessionStatus: vi.fn().mockResolvedValue(active) })} workspaceAdapter={commerce} />);
    await userEvent.click(await screen.findByRole("button", { name: "Stop stream" }));
    expect(await screen.findByText("Last session")).toBeTruthy(); expect(screen.getAllByText("Robe Wax Bleue").length).toBeGreaterThan(0);
    const bootstrapCalls = bootstrap.mock.calls.length; const sessionCalls = sessionState.mock.calls.length; const conversionCalls = conversions.mock.calls.length;
    await userEvent.click(screen.getByRole("button", { name: "SHOP" })); await userEvent.click(screen.getByRole("button", { name: "Use dark theme" })); await userEvent.click(screen.getByRole("button", { name: "Français" })); await userEvent.click(screen.getByRole("button", { name: "VENDRE" }));
    expect(await screen.findByText("Dernière session")).toBeTruthy(); expect(screen.getAllByText("Robe Wax Bleue").length).toBeGreaterThan(0);
    expect(bootstrap).toHaveBeenCalledTimes(bootstrapCalls); expect(sessionState).toHaveBeenCalledTimes(sessionCalls); expect(conversions).toHaveBeenCalledTimes(conversionCalls); expect(conversions).toHaveBeenLastCalledWith("live-1");
  });
  it("uses Studio state events only to trigger one authoritative Studio hydrate", async () => {
    let onStudio: ((event: StudioPublicEvent) => void) | undefined;
    const commerce = workspace();
    const native = adapter({ sessionStatus: vi.fn().mockResolvedValue(active), subscribe: vi.fn().mockImplementation((_sidecar, _product, studio) => { onStudio = studio; return Promise.resolve(() => {}); }) });
    render(<App adapter={native} workspaceAdapter={commerce} />);
    await screen.findByRole("button", { name: "Stop stream" });
    expect(commerce.bootstrap).toHaveBeenCalledTimes(1);
    await act(async () => { onStudio?.({ version: "yaatal.studio.event.v1", kind: "session-state", isLive: true, sessionId: "live-1" }); await Promise.resolve(); });
    await waitFor(() => expect(commerce.bootstrap).toHaveBeenCalledTimes(2));
    expect(commerce.sessionState).toHaveBeenCalledTimes(2); expect(commerce.status).toHaveBeenCalledTimes(2); expect(commerce.productQueue).toHaveBeenCalledTimes(2);
  });
  it("keeps the just-ended session and receipts when the real stop event rehydrates Studio", async () => {
    let onStudio: ((event: StudioPublicEvent) => void) | undefined;
    const stopped = { ...live, isLive: false, sessionId: null, startedAt: 0 };
    const receipt = { version: "yaatal.commerce-receipt.v1" as const, orderId: "receipt-stop", productId: product.id, productName: product.name, totalFcfa: product.priceFcfa, paymentProvider: "wave", paymentStatus: "sandbox_paid" as const, liveSessionId: "live-1", sourceChannel: "copy", deduplicated: false, quantity: 1, createdAt: "2026-09-10T00:00:00Z" };
    const sessionState = vi.fn().mockResolvedValueOnce(live).mockResolvedValueOnce(stopped);
    const conversions = vi.fn().mockResolvedValue([receipt]);
    const commerce = workspace({ sessionState, conversions, stopStream: vi.fn().mockResolvedValue(stopped) });
    const native = adapter({ sessionStatus: vi.fn().mockResolvedValue(active), subscribe: vi.fn().mockImplementation((_sidecar, _product, studio) => { onStudio = studio; return Promise.resolve(() => {}); }) });
    render(<App adapter={native} workspaceAdapter={commerce} />);
    await userEvent.click(await screen.findByRole("button", { name: "Stop stream" }));
    expect(await screen.findByText("Last session")).toBeTruthy();
    await act(async () => { onStudio?.({ version: "yaatal.studio.event.v1", kind: "session-state", isLive: false }); await Promise.resolve(); });
    await waitFor(() => expect(sessionState).toHaveBeenCalledTimes(2));
    expect(await screen.findByText("Last session")).toBeTruthy(); expect(screen.getByText("receipt-stop", { exact: false })).toBeTruthy();
    expect(conversions).toHaveBeenLastCalledWith("live-1");
  });
  it("refreshes only matching authoritative conversions and keeps receipt deduplication", async () => {
    let onStudio: ((event: StudioPublicEvent) => void) | undefined;
    const receipt = { version: "yaatal.commerce-receipt.v1" as const, orderId: "receipt-1", productId: product.id, productName: product.name, totalFcfa: product.priceFcfa, paymentProvider: "wave", paymentStatus: "sandbox_paid" as const, liveSessionId: "live-1", sourceChannel: "copy", deduplicated: false, quantity: 1, createdAt: "2026-09-10T00:00:00Z" };
    const conversions = vi.fn().mockResolvedValueOnce([]).mockResolvedValue([receipt, { ...receipt, deduplicated: true }]);
    const commerce = workspace({ conversions });
    const native = adapter({ sessionStatus: vi.fn().mockResolvedValue(active), subscribe: vi.fn().mockImplementation((_sidecar, _product, studio) => { onStudio = studio; return Promise.resolve(() => {}); }) });
    render(<App adapter={native} workspaceAdapter={commerce} />);
    await waitFor(() => expect(conversions).toHaveBeenCalledTimes(1));
    await act(async () => { onStudio?.({ version: "yaatal.studio.event.v1", kind: "conversions-changed", liveSessionId: "other-live" }); await Promise.resolve(); });
    expect(conversions).toHaveBeenCalledTimes(1);
    await act(async () => { onStudio?.({ version: "yaatal.studio.event.v1", kind: "conversions-changed", liveSessionId: "live-1" }); await Promise.resolve(); });
    await waitFor(() => expect(conversions).toHaveBeenCalledTimes(2));
    expect(screen.getAllByText("receipt-1", { exact: false })).toHaveLength(1);
    expect(commerce.bootstrap).toHaveBeenCalledTimes(1);
  });
  it("drops stale Studio events as soon as logout invalidates the account", async () => {
    let onStudio: ((event: StudioPublicEvent) => void) | undefined;
    const logout = deferred<typeof signedOut>(); const commerce = workspace();
    const native = adapter({ sessionStatus: vi.fn().mockResolvedValue(active), logout: vi.fn().mockReturnValue(logout.promise), subscribe: vi.fn().mockImplementation((_sidecar, _product, studio) => { onStudio = studio; return Promise.resolve(() => {}); }) });
    render(<App adapter={native} workspaceAdapter={commerce} />);
    await screen.findByRole("button", { name: "Stop stream" });
    await userEvent.click(screen.getByRole("button", { name: "Awa" })); await userEvent.click(screen.getByRole("button", { name: "Sign out" }));
    await act(async () => { onStudio?.({ version: "yaatal.studio.event.v1", kind: "session-state", isLive: true, sessionId: "live-1" }); onStudio?.({ version: "yaatal.studio.event.v1", kind: "conversions-changed", liveSessionId: "live-1" }); await Promise.resolve(); });
    expect(commerce.bootstrap).toHaveBeenCalledTimes(1); expect(commerce.conversions).toHaveBeenCalledTimes(1);
    await act(async () => { logout.resolve(signedOut); await Promise.resolve(); });
    expect(screen.queryByRole("button", { name: "Awa" })).toBeNull();
  });
  it("follows system theme changes until an explicit preference wins, while locale persists across navigation", async () => {
    let dark = true; const listeners = new Set<(event: MediaQueryListEvent) => void>();
    const media = { get matches() { return dark; }, media: "(prefers-color-scheme: dark)", onchange: null, addEventListener: (_: "change", listener: (event: MediaQueryListEvent) => void) => listeners.add(listener), removeEventListener: (_: "change", listener: (event: MediaQueryListEvent) => void) => listeners.delete(listener), addListener: (listener: (event: MediaQueryListEvent) => void) => listeners.add(listener), removeListener: (listener: (event: MediaQueryListEvent) => void) => listeners.delete(listener), dispatchEvent: () => true } as MediaQueryList;
    vi.stubGlobal("matchMedia", vi.fn(() => media));
    try {
      render(<App adapter={adapter()} renderSell={() => <p>Sell shell</p>} renderShop={() => <p>Shop shell</p>} />);
      await screen.findByText("Sell shell"); expect(document.documentElement.dataset.theme).toBe("dark"); expect(localStorage.getItem("yaatal-os-theme")).toBeNull();
      dark = false; await act(async () => { listeners.forEach(listener => listener(new Event("change") as MediaQueryListEvent)); }); expect(document.documentElement.dataset.theme).toBe("light");
      await userEvent.click(screen.getByRole("button", { name: "Use dark theme" })); expect(document.documentElement.dataset.theme).toBe("dark");
      dark = false; await act(async () => { listeners.forEach(listener => listener(new Event("change") as MediaQueryListEvent)); }); expect(document.documentElement.dataset.theme).toBe("dark");
      await userEvent.click(screen.getByRole("button", { name: "Français" })); await userEvent.click(screen.getByRole("button", { name: "BOUTIQUE" }));
      expect(document.documentElement.lang).toBe("fr"); expect(localStorage.getItem("yaatal-os-locale")).toBe("fr"); expect(await screen.findByText("Shop shell")).toBeTruthy(); expect(screen.getByRole("button", { name: "VENDRE" })).toBeTruthy();
    } finally { vi.unstubAllGlobals(); }
  });
  it("persists locale, updates document language, and does not persist a system theme until the user chooses one", async () => {
    render(<App adapter={adapter()} renderSell={() => <p>Sell view</p>} renderShop={() => <p>Shop view</p>} />);
    await screen.findByText("Sell view");
    expect(document.documentElement.lang).toBe("en");
    expect(localStorage.getItem("yaatal-os-theme")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Français" }));
    expect(document.documentElement.lang).toBe("fr"); expect(localStorage.getItem("yaatal-os-locale")).toBe("fr");
    await userEvent.click(screen.getByRole("button", { name: "Utiliser le thème sombre" }));
    expect(localStorage.getItem("yaatal-os-theme")).toBe("dark");
  });
});

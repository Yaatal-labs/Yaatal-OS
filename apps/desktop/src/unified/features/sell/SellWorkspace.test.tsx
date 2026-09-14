// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import type { CommerceWorkspaceAdapter, Conversion } from "../../contracts";
import { SellWorkspace } from "./SellWorkspace";

const live = { isLive: true, sessionId: "live-1", startedAt: 1_789_000_000, sellerName: "Awa" };
const readiness = { health: "ok" as const, ledgerAvailable: true, readiness: { status: "passed", steps: [{ name: "studio.ready", status: "passed", durationMs: 20 }] } };
const queue = { products: [], source: "engine_live_session" };
const queuedProduct = { id: "robe-wax", name: "Robe Wax Bleue", priceFcfa: 12500, priceDisplay: "12,500 FCFA", stock: 3, stockStatus: "in_stock", images: [] };
const conversion: Conversion = { version: "yaatal.commerce-receipt.v1", orderId: "order-1", productId: "robe-wax", productName: "Robe Wax Bleue", totalFcfa: 12500, paymentProvider: "wave", paymentStatus: "sandbox_paid", liveSessionId: "live-1", sourceChannel: "copy", deduplicated: false, quantity: 1, createdAt: "2026-09-10T00:00:00Z" };
function adapter(overrides: Partial<CommerceWorkspaceAdapter> = {}): CommerceWorkspaceAdapter { return { catalog: { list: vi.fn(), product: vi.fn() }, bootstrap: vi.fn().mockResolvedValue({ authenticated: true }), sessionState: vi.fn().mockResolvedValue(live), goLive: vi.fn(), stopStream: vi.fn().mockResolvedValue({ isLive: false, sessionId: null, startedAt: 0, sellerName: "Awa" }), productQueue: vi.fn().mockResolvedValue(queue), status: vi.fn().mockResolvedValue(readiness), createIntent: vi.fn(), conversions: vi.fn().mockResolvedValue([conversion]), openLink: vi.fn(), ...overrides }; }
function props(overrides: Partial<ComponentProps<typeof SellWorkspace>> = {}) { return { adapter: adapter(), authenticated: true, mode: "native" as const, selectedProductId: null, onSelectProduct: vi.fn(), onOpenShop: vi.fn(), onShare: vi.fn(), ...overrides }; }
afterEach(cleanup);

describe("SellWorkspace", () => {
  it("restores a live snapshot and its readiness", async () => {
    const native = adapter(); render(<SellWorkspace {...props({ adapter: native })} />);
    expect(await screen.findByRole("button", { name: "Stop stream" })).toBeTruthy();
    expect(screen.getByText("Awa")).toBeTruthy();
    expect(screen.getByText("studio.ready")).toBeTruthy();
    expect(native.bootstrap).toHaveBeenCalledTimes(1);
  });
  it("keeps the stopped session as the conversion scope and deduplicates orders", async () => {
    const native = adapter({ conversions: vi.fn().mockResolvedValue([conversion, { ...conversion, deduplicated: true }]) }); render(<SellWorkspace {...props({ adapter: native })} />);
    await screen.findByRole("button", { name: "Stop stream" }); await userEvent.click(screen.getByRole("button", { name: "Stop stream" }));
    await waitFor(() => expect(screen.getByText("Last session")).toBeTruthy());
    expect(native.conversions).toHaveBeenCalledWith("live-1");
    expect(screen.getAllByText("Robe Wax Bleue")).toHaveLength(1);
  });
  it("refreshes receipts for an invalidated retained stopped session without polling", async () => {
    const conversions = vi.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([conversion, { ...conversion, deduplicated: true }]);
    const native = adapter({ conversions }); const base = props({ adapter: native }); const view = render(<SellWorkspace {...base} />);
    await screen.findByRole("button", { name: "Stop stream" }); await userEvent.click(screen.getByRole("button", { name: "Stop stream" }));
    await screen.findByText("Last session");
    view.rerender(<SellWorkspace {...base} conversionInvalidation={{ liveSessionId: "live-1", epoch: 1 }} />);
    await waitFor(() => expect(conversions).toHaveBeenCalledTimes(2));
    expect(screen.getAllByText("Robe Wax Bleue")).toHaveLength(1);
  });
  it("discards a bootstrap response that arrives after sign-out", async () => {
    let resolve!: (value: { authenticated: boolean }) => void;
    const native = adapter({ bootstrap: vi.fn(() => new Promise<{ authenticated: boolean }>(res => { resolve = res; })) });
    const view = render(<SellWorkspace {...props({ adapter: native })} />);
    view.rerender(<SellWorkspace {...props({ adapter: native, authenticated: false })} />);
    resolve({ authenticated: true });
    expect(await screen.findByText("Sign in to prepare your Studio session.")).toBeTruthy();
    expect(screen.queryByText("Awa")).toBeNull();
    expect(native.sessionState).toHaveBeenCalledTimes(0);
  });
  it("only enables sharing while the authoritative session is live and reports session changes", async () => {
    const changed = vi.fn(); const shared = vi.fn(); const native = adapter({ productQueue: vi.fn().mockResolvedValue({ ...queue, products: [queuedProduct] }) });
    render(<SellWorkspace {...props({ adapter: native, onSessionChange: changed, onShare: shared })} />);
    const share = await screen.findByRole("button", { name: "Share" });
    await userEvent.click(share); expect(shared).toHaveBeenCalledWith("robe-wax");
    await userEvent.click(screen.getByRole("button", { name: "Stop stream" }));
    await waitFor(() => expect((screen.getByRole("button", { name: "Share" }) as HTMLButtonElement).disabled).toBe(true));
    expect(changed).toHaveBeenLastCalledWith(expect.objectContaining({ isLive: false }));
  });
  it("localizes live surface copy and recovers honestly from a failed featured image", async () => {
    const productWithImage = { ...queuedProduct, images: ["https://merchant.example/robe-wax.webp"] };
    render(<SellWorkspace {...props({ locale: "fr", adapter: adapter({ productQueue: vi.fn().mockResolvedValue({ ...queue, products: [productWithImage] }) }) })} />);
    const featured = await screen.findByRole("img", { name: "Robe Wax Bleue" });
    fireEvent.error(featured);
    expect(await screen.findByRole("img", { name: "Image du produit indisponible" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Activité Studio" })).toBeTruthy();
    expect(screen.getByText("Produits prêts à présenter")).toBeTruthy();
    expect(screen.getByText("Commande vocale indisponible")).toBeTruthy();
  });
});

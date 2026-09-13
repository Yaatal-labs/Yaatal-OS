// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { CommerceWorkspaceAdapter } from "../../contracts";
import { ShareDialog } from "./ShareDialog";

const product = { id: "robe-wax", name: "Robe Wax Bleue", priceFcfa: 12500, priceDisplay: "12,500 FCFA", stock: 3, stockStatus: "in_stock", images: [] };
const intent = { intentId: "intent-1", liveSessionId: "live-1", productId: "robe-wax", publicUrl: "https://shop.example/b/abc", livestreamUrl: "https://shop.example/b/abc?src=live", whatsappUrl: "https://wa.me/?text=abc", telegramUrl: "https://t.me/share/url?url=abc" };
function adapter(overrides: Partial<CommerceWorkspaceAdapter> = {}): CommerceWorkspaceAdapter { return { catalog: { list: vi.fn(), product: vi.fn().mockResolvedValue(product) }, bootstrap: vi.fn(), sessionState: vi.fn(), goLive: vi.fn(), stopStream: vi.fn(), productQueue: vi.fn(), status: vi.fn(), createIntent: vi.fn().mockResolvedValue(intent), conversions: vi.fn(), openLink: vi.fn().mockResolvedValue({ publicUrl: intent.publicUrl, opened: true }), ...overrides }; }
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(next => { resolve = next; }); return { promise, resolve }; }
afterEach(cleanup);

describe("ShareDialog", () => {
  it("creates a native intent and only announces copied after clipboard success", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined); Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    const native = adapter(); const view = render(<ShareDialog adapter={native} productId="robe-wax" open onOpenChange={vi.fn()} />);
    await userEvent.click(await view.findByRole("button", { name: "Create link" }));
    await userEvent.click(await view.findByRole("button", { name: "Copy" }));
    expect(await view.findByText("Link copied.")).toBeTruthy(); expect(writeText).toHaveBeenCalledWith(intent.publicUrl); expect(native.openLink).toHaveBeenCalledWith("intent-1", "copy");
  });
  it("reports native open and clipboard failures without claiming success", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("denied")); Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    const native = adapter({ openLink: vi.fn().mockResolvedValue({ publicUrl: intent.publicUrl, opened: false }) }); const view = render(<ShareDialog adapter={native} productId="robe-wax" open onOpenChange={vi.fn()} />);
    await userEvent.click(await view.findByRole("button", { name: "Create link" }));
    await userEvent.click(await view.findByRole("button", { name: "Livestream" }));
    expect(await view.findByRole("alert")).toHaveProperty("textContent", "The desktop app did not open this link.");
    await userEvent.click(view.getByRole("button", { name: "Copy" }));
    expect(await view.findByRole("alert")).toHaveProperty("textContent", "We could not copy this link.");
    expect(view.queryByText("Link copied.")).toBeNull();
  });
  it("invalidates a deferred catalog response on an account-only change while the dialog stays open", async () => {
    const pending = deferred<typeof product>(); const stale = { ...product, name: "Old account product" }; const native = adapter({ catalog: { list: vi.fn(), product: vi.fn().mockReturnValueOnce(pending.promise).mockResolvedValue(product) } });
    const view = render(<ShareDialog adapter={native} productId="robe-wax" accountEpoch={1} open onOpenChange={vi.fn()} />);
    expect(await view.findByRole("status")).toBeTruthy();
    view.rerender(<ShareDialog adapter={native} productId="robe-wax" accountEpoch={2} open onOpenChange={vi.fn()} />);
    expect(await view.findByRole("heading", { name: "Robe Wax Bleue" })).toBeTruthy();
    await act(async () => { pending.resolve(stale); await Promise.resolve(); });
    await waitFor(() => expect(view.queryByRole("heading", { name: "Old account product" })).toBeNull()); expect(view.getByRole("dialog")).toBeTruthy();
  });
  it("invalidates a deferred create-intent response on an account-only change while the dialog stays open", async () => {
    const pending = deferred<typeof intent>(); const native = adapter({ createIntent: vi.fn().mockReturnValue(pending.promise) });
    const view = render(<ShareDialog adapter={native} productId="robe-wax" accountEpoch={1} open onOpenChange={vi.fn()} />);
    await userEvent.click(await view.findByRole("button", { name: "Create link" }));
    expect(screen.getByRole("status")).toBeTruthy();
    view.rerender(<ShareDialog adapter={native} productId="robe-wax" accountEpoch={2} open onOpenChange={vi.fn()} />);
    await act(async () => { pending.resolve(intent); await Promise.resolve(); });
    await waitFor(() => expect(view.queryByText("Links are ready to share.")).toBeNull()); expect(view.getByRole("dialog")).toBeTruthy();
  });
  it("does not announce a stale external open after a product-only dialog change", async () => {
    const pending = deferred<{ publicUrl: string; opened: boolean }>(); const bissap = { ...product, id: "bissap", name: "Bissap" }; const native = adapter({ catalog: { list: vi.fn(), product: vi.fn().mockImplementation((id: string) => Promise.resolve(id === "bissap" ? bissap : product)) }, openLink: vi.fn().mockReturnValue(pending.promise) });
    const view = render(<ShareDialog adapter={native} productId="robe-wax" accountEpoch={1} open onOpenChange={vi.fn()} />);
    await userEvent.click(await view.findByRole("button", { name: "Create link" })); await userEvent.click(await view.findByRole("button", { name: "Livestream" }));
    expect(screen.getByRole("status")).toBeTruthy();
    view.rerender(<ShareDialog adapter={native} productId="bissap" accountEpoch={1} open onOpenChange={vi.fn()} />);
    expect(await view.findByRole("heading", { name: "Bissap" })).toBeTruthy();
    await act(async () => { pending.resolve({ publicUrl: intent.publicUrl, opened: true }); await Promise.resolve(); });
    await waitFor(() => expect(view.queryByText("Link opened.")).toBeNull()); expect(view.getByRole("dialog")).toBeTruthy();
  });
  it("does not announce a stale copy after a dialog-only close and keeps every action disabled while clipboard is pending", async () => {
    const pending = deferred<void>(); const writeText = vi.fn().mockReturnValue(pending.promise); Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    const view = render(<ShareDialog adapter={adapter()} productId="robe-wax" accountEpoch={1} open onOpenChange={vi.fn()} />);
    await userEvent.click(await view.findByRole("button", { name: "Create link" })); await userEvent.click(await view.findByRole("button", { name: "Copy" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(intent.publicUrl)); expect(screen.getByRole("status").textContent?.includes("Preparing…")).toBe(true); expect((screen.getByRole("button", { name: "Livestream" }) as HTMLButtonElement).disabled).toBe(true);
    view.rerender(<ShareDialog adapter={adapter()} productId="robe-wax" accountEpoch={1} open={false} onOpenChange={vi.fn()} />);
    await act(async () => { pending.resolve(); await Promise.resolve(); });
    await waitFor(() => expect(view.queryByText("Link copied.")).toBeNull());
  });
  it("announces an opened non-copy channel and reports a non-opened channel as an alert", async () => {
    const native = adapter(); const view = render(<ShareDialog adapter={native} productId="robe-wax" open onOpenChange={vi.fn()} />);
    await userEvent.click(await view.findByRole("button", { name: "Create link" })); await userEvent.click(await view.findByRole("button", { name: "Livestream" }));
    expect(await view.findByRole("status")).toHaveProperty("textContent", "Link opened.");
    native.openLink = vi.fn().mockResolvedValue({ publicUrl: intent.publicUrl, opened: false });
    await userEvent.click(view.getByRole("button", { name: "Telegram" }));
    expect(await view.findByRole("alert")).toHaveProperty("textContent", "The desktop app did not open this link.");
    native.openLink = vi.fn().mockRejectedValue(new Error("native failure"));
    await userEvent.click(view.getByRole("button", { name: "WhatsApp" }));
    expect(await view.findByRole("alert")).toHaveProperty("textContent", "We could not open this link.");
  });
  it("keeps the create action disabled while pending and exposes create failures as alerts", async () => {
    const pending = deferred<typeof intent>(); const native = adapter({ createIntent: vi.fn().mockReturnValue(pending.promise) }); const view = render(<ShareDialog adapter={native} productId="robe-wax" open onOpenChange={vi.fn()} />);
    const create = await view.findByRole("button", { name: "Create link" }); await userEvent.click(create);
    expect((create as HTMLButtonElement).disabled).toBe(true); expect(screen.getByRole("status")).toBeTruthy();
    await act(async () => { pending.resolve(intent); await Promise.resolve(); });
    const failing = adapter({ createIntent: vi.fn().mockRejectedValue(new Error("native failure")) }); view.rerender(<ShareDialog adapter={failing} productId="robe-wax" accountEpoch={2} open onOpenChange={vi.fn()} />);
    await userEvent.click(await view.findByRole("button", { name: "Create link" }));
    expect(await view.findByRole("alert")).toHaveProperty("textContent", "We could not create a commerce link.");
  });
});

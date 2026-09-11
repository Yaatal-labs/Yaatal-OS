// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "./App";
import { signedOut, type NativeAdapter } from "./native";
import { OS_PROTOCOL_VERSION } from "@yaatal/os-protocol";
const active = { authenticated: true, merchant_name: "Awa", verified: true };
function adapter(overrides: Partial<NativeAdapter> = {}): NativeAdapter {
  return { runtimeMode: vi.fn().mockResolvedValue("native"), sessionStatus: vi.fn().mockResolvedValue(signedOut), login: vi.fn().mockResolvedValue(active), logout: vi.fn().mockResolvedValue(signedOut), sidecarStatus: vi.fn().mockResolvedValue({ version: OS_PROTOCOL_VERSION, kind: "sidecar-status", state: "ready", isRunning: true, port: 8484 }), startSidecar: vi.fn(), subscribe: vi.fn().mockResolvedValue(() => {}), ...overrides };
}
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
    expect(native.login).not.toHaveBeenCalled();
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
    expect((screen.getByRole("button", { name: "Sign in to continue" }) as HTMLButtonElement).disabled).toBe(true);
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByRole("dialog")).toBeTruthy();
    expect(screen.queryByLabelText("Password")).toBeNull();
    expect(native.sessionStatus).not.toHaveBeenCalled(); expect(native.login).not.toHaveBeenCalled();
  });
  it("blocks incompatible native builds before loading workspaces or sessions", async () => {
    const native = adapter({ runtimeMode: vi.fn().mockRejectedValue(new Error("Unified mode required")) });
    const feature = vi.fn(); render(<App adapter={native} renderSell={feature} />);
    expect(await screen.findByRole("alert")).toHaveProperty("textContent", "Unified mode required");
    expect(feature).not.toHaveBeenCalled(); expect(native.sessionStatus).not.toHaveBeenCalled();
  });
  it("preserves theme keys and shared product selection through SELL/SHOP navigation", async () => {
    localStorage.setItem("yaatal-os-theme", "dark");
    render(<App adapter={adapter()} renderSell={context => <button onClick={() => { context.selectProduct("robe-wax"); context.navigate("shop"); }}>Open selected product</button>} renderShop={context => <p>Selected: {context.selectedProductId}</p>} />);
    await userEvent.click(await screen.findByRole("button", { name: "Open selected product" }));
    expect(await screen.findByText("Selected: robe-wax")).toBeTruthy();
    expect(screen.getByRole("button", { name: "SHOP" }).getAttribute("aria-current")).toBe("page");
    await userEvent.click(screen.getByRole("button", { name: "Use light theme" }));
    expect(localStorage.getItem("yaatal-os-theme")).toBe("light");
    await userEvent.click(screen.getByRole("button", { name: "SELL" }));
    await userEvent.click(screen.getByRole("button", { name: "SHOP" }));
    expect(screen.getByText("Selected: robe-wax")).toBeTruthy();
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
    await userEvent.click(screen.getByRole("button", { name: "SHOP" }));
    expect(screen.getByText("Selected: robe-wax")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Awa" }));
    await userEvent.click(screen.getByRole("button", { name: "Sign out" }));
    expect(await screen.findByText("Selected: none")).toBeTruthy();
    expect(native.login).toHaveBeenCalledTimes(1);
    expect([...Array(localStorage.length)].map((_, i) => localStorage.getItem(localStorage.key(i)!)).join()).not.toContain("secret");
  });
  it("prevents duplicate sign-in while pending and focuses a retryable failure", async () => {
    let reject!: (reason: Error) => void;
    const native = adapter({ login: vi.fn(() => new Promise<typeof active>((_, fail) => { reject = fail; })) });
    render(<App adapter={native} />);
    await screen.findByText("Your next live starts here.");
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
});

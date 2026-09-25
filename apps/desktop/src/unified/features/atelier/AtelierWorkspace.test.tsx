// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AtelierWorkspace } from "./AtelierWorkspace";

afterEach(cleanup);
const URL_OK = "http://localhost:8787/";
const frameEl = () => document.querySelector("iframe");
const findFrame = () => waitFor(() => { const f = frameEl(); if (!f) throw new Error("no frame"); return f; });
function deferred() { let resolve!: () => void; let reject!: (e: Error) => void; const promise = new Promise<void>((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; }

describe("AtelierWorkspace", () => {
  it("embeds the Atelier as a sandboxed, referrer-free frame once it answers", async () => {
    const probe = vi.fn().mockResolvedValue(undefined);
    render(<AtelierWorkspace url={URL_OK} probe={probe} />);
    const frame = await findFrame();
    expect(frame.getAttribute("title")).toContain("Yaatal Atelier");
    expect(probe).toHaveBeenCalledWith(URL_OK);
    expect(frame.getAttribute("src")).toBe(URL_OK);
    expect(frame.getAttribute("referrerpolicy")).toBe("no-referrer");
    const sandbox = frame.getAttribute("sandbox") ?? "";
    expect(sandbox).toContain("allow-scripts");
    expect(sandbox).not.toContain("allow-top-navigation");
  });

  it("does not render the frame while the address is still being checked", () => {
    render(<AtelierWorkspace url={URL_OK} probe={() => deferred().promise} />);
    expect(screen.getByRole("status").textContent).toContain("Opening the Atelier");
    expect(frameEl()).toBeNull();
  });

  it("explains how to start the Atelier when it is unreachable, and retries", async () => {
    const probe = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(undefined);
    render(<AtelierWorkspace url={URL_OK} probe={probe} />);
    expect(await screen.findByRole("heading", { name: "The Atelier is not running" })).toBeTruthy();
    expect(screen.getByText(/pnpm run-local/)).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await findFrame()).toBeTruthy();
    expect(probe).toHaveBeenCalledTimes(2);
  });

  it("refuses to load a rejected address and never probes it", () => {
    const probe = vi.fn();
    render(<AtelierWorkspace url={null} probe={probe} locale="fr" />);
    expect(screen.getByRole("alert").textContent).toContain("L’adresse de l’Atelier n’est pas valide");
    expect(probe).not.toHaveBeenCalled();
    expect(frameEl()).toBeNull();
  });

  it("ignores a stale probe result after a newer attempt", async () => {
    const first = deferred();
    const probe = vi.fn().mockReturnValueOnce(first.promise).mockResolvedValueOnce(undefined);
    const view = render(<AtelierWorkspace url={URL_OK} probe={probe} />);
    view.rerender(<AtelierWorkspace url="http://127.0.0.1:8787/" probe={probe} />);
    expect(await findFrame()).toBeTruthy();
    first.reject(new Error("late failure"));
    await Promise.resolve();
    expect(screen.queryByRole("heading", { name: "The Atelier is not running" })).toBeNull();
  });
});

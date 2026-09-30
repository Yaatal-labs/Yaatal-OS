import { describe, expect, it, vi } from "vitest";
import { probeReachable, wireRetryButton } from "../src/offline.mjs";

describe("probeReachable", () => {
  it("resolves true when fetch succeeds", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({});
    await expect(probeReachable("https://kairmel.example/", { fetchImpl })).resolves.toBe(true);
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://kairmel.example/",
      expect.objectContaining({ mode: "no-cors", cache: "no-store" }),
    );
  });

  it("resolves false when fetch rejects", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError("network error"));
    await expect(probeReachable("https://kairmel.example/", { fetchImpl })).resolves.toBe(false);
  });

  it("resolves false when the probe times out", async () => {
    vi.useFakeTimers();
    const fetchImpl = vi.fn(
      (_url, { signal }) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
        }),
    );
    const pending = probeReachable("https://kairmel.example/", { fetchImpl, timeoutMs: 1000 });
    await vi.advanceTimersByTimeAsync(1000);
    await expect(pending).resolves.toBe(false);
    vi.useRealTimers();
  });
});

describe("wireRetryButton", () => {
  function fakeButton() {
    const listeners = {};
    return {
      disabled: false,
      textContent: "Réessayer",
      addEventListener: (event, handler) => {
        listeners[event] = handler;
      },
      click: () => listeners.click?.(),
    };
  }

  it("navigates to Kairmel when a retry click finds it reachable", async () => {
    const button = fakeButton();
    const navigate = vi.fn();
    const probe = vi.fn().mockResolvedValue(true);

    wireRetryButton({ button, kairmelUrl: "https://kairmel.example/", navigate, probe });
    await button.click();

    expect(probe).toHaveBeenCalledWith("https://kairmel.example/");
    expect(navigate).toHaveBeenCalledWith("https://kairmel.example/");
  });

  it("re-enables the button and keeps the user here when still unreachable", async () => {
    const button = fakeButton();
    const navigate = vi.fn();
    const probe = vi.fn().mockResolvedValue(false);

    wireRetryButton({ button, kairmelUrl: "https://kairmel.example/", navigate, probe });
    await button.click();

    expect(navigate).not.toHaveBeenCalled();
    expect(button.disabled).toBe(false);
    expect(button.textContent).toBe("Réessayer");
  });

  it("disables the button while a retry is in flight", () => {
    const button = fakeButton();
    let resolveProbe;
    const probe = vi.fn().mockReturnValue(
      new Promise((resolve) => {
        resolveProbe = resolve;
      }),
    );

    wireRetryButton({ button, kairmelUrl: "https://kairmel.example/", navigate: vi.fn(), probe });
    button.click();

    expect(button.disabled).toBe(true);
    expect(button.textContent).toBe("Nouvelle tentative…");
    resolveProbe(false);
  });
});

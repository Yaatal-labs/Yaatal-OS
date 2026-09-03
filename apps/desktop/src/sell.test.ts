import { describe, expect, it } from "vitest";

import { FALLBACK_STATUS, nextSellPhase, type SellPhase, type SidecarStatus } from "./sell";

function status(state: SidecarStatus["state"], overrides: Partial<SidecarStatus> = {}): SidecarStatus {
  return { ...FALLBACK_STATUS, state, ...overrides };
}

describe("sell readiness state machine", () => {
  it("auto-starts from a fresh boot into starting/ready", () => {
    expect(nextSellPhase("boot", status("stopped"))).toBe("starting");
    expect(nextSellPhase("boot", status("starting"))).toBe("starting");
    expect(nextSellPhase("boot", status("ready"))).toBe("ready");
  });

  it("tracks poll transitions while the sidecar runs", () => {
    expect(nextSellPhase("starting", status("ready"))).toBe("ready");
    expect(nextSellPhase("starting", status("failed", { errorCode: "startup_timeout" }))).toBe("failed");
  });

  it("keeps a failed state sticky until the operator retries", () => {
    expect(nextSellPhase("failed", status("stopped"))).toBe("failed");
  });

  it("treats an operator stop after ready as stopped, not failed", () => {
    expect(nextSellPhase("ready", status("stopped"))).toBe("stopped");
  });
});
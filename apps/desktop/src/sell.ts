/**
 * Sell pane — merchant control plane (OSR-02).
 *
 * Studio starts automatically when the pane mounts and fills the pane once
 * ready. The operator sees a branded readiness state, a Live/Utility mode
 * switcher, and secondary diagnostics. Studio's on-air product hints are
 * relayed to the host so the Shop pane can follow along (OSR-04).
 */
import { invoke } from "@tauri-apps/api/core";
import {
  type ProductNavigationRequest,
  type SidecarStatus,
  sanitizeProductNavigation,
  sanitizeSidecarStatus,
} from "@yaatal/os-protocol";

const POLL_MS = 2000;

export type Theme = "light" | "dark";

export interface PaneController {
  dispose: () => void;
  setTheme: (theme: Theme) => void;
}

export interface SellRenderOptions {
  theme: Theme;
  onSidecarState: (state: SidecarStatus["state"]) => void;
  onProductNavigation: (productId: string) => void;
}

export const FALLBACK_STATUS: SidecarStatus = {
  version: "yaatal-os.v1",
  kind: "sidecar-status",
  state: "stopped",
  isRunning: false,
  port: 8484,
};

export type SellPhase = "boot" | "starting" | "ready" | "stopped" | "failed";

export type { SidecarStatus };

/**
 * Pure readiness decision for the poll loop (unit-tested).
 *
 * Rust already reports `failed` on unexpected sidecar exit, so a `stopped`
 * status after `ready` means the operator stopped Studio deliberately.
 */
export function nextSellPhase(prev: SellPhase, status: SidecarStatus): SellPhase {
  switch (status.state) {
    case "ready":
      return "ready";
    case "starting":
      return "starting";
    case "failed":
      return "failed";
    case "stopped":
      if (prev === "boot") return "starting"; // auto-start pending
      if (prev === "failed") return "failed"; // retry not yet attempted
      return "stopped";
  }
}

function statusLabel(status: SidecarStatus): string {
  return status.state === "failed" && status.errorCode
    ? `Needs attention (${status.errorCode.replace(/_/g, " ")})`
    : status.state[0].toUpperCase() + status.state.slice(1);
}

async function sidecarStatus(): Promise<SidecarStatus> {
  const result = await invoke<unknown>("sidecar_status");
  return sanitizeSidecarStatus(result) ?? FALLBACK_STATUS;
}

function message(text: string): void {
  const target = document.querySelector<HTMLElement>("[data-shell-message]");
  if (target) target.textContent = text;
}

function button(label: string, action: () => Promise<void>): HTMLButtonElement {
  const element = document.createElement("button");
  element.type = "button";
  element.textContent = label;
  element.addEventListener("click", () => {
    void action().catch((error: unknown) => {
      message(error instanceof Error ? error.message : "Request unavailable");
    });
  });
  return element;
}

type SellMode = "live" | "utility";

let cockpitFrame: HTMLIFrameElement | null = null;
let mode: SellMode = "live";
let diagnosticsOpen = false;
let restarting = false;

function studioOrigin(status: SidecarStatus): string {
  return `http://127.0.0.1:${status.port}`;
}

function createCockpit(status: SidecarStatus, theme: Theme): HTMLIFrameElement {
  const frame = document.createElement("iframe");
  frame.title = "Yaatal Studio seller cockpit";
  frame.src = `${studioOrigin(status)}/dashboard/os.html?theme=${theme}`;
  frame.allow = "microphone";
  frame.referrerPolicy = "no-referrer";
  return frame;
}

function sendTheme(frame: HTMLIFrameElement | null, status: SidecarStatus, theme: Theme): void {
  frame?.contentWindow?.postMessage(
    { version: "yaatal-os.v1", kind: "theme-change", theme },
    studioOrigin(status),
  );
}

function renderUtility(): HTMLElement {
  const panel = document.createElement("section");
  panel.className = "sell-utility";
  panel.innerHTML = `
    <p class="eyebrow">Utility — preview</p>
    <h2>Listings, inventory, store setup, spoken analytics</h2>
    <p>These workflows are not implemented yet. This pane previews where the
    merchant utility surface will live; nothing here manages real products today.
    Use the Live mode cockpit for the working surface.</p>
  `;
  return panel;
}

function renderMain(status: SidecarStatus, refresh: (s: SidecarStatus) => void, theme: Theme): HTMLElement {
  const main = document.createElement("section");
  main.className = "sell-main";
  if (mode === "live") {
    cockpitFrame = createCockpit(status, theme);
    main.replaceChildren(cockpitFrame);
  } else {
    cockpitFrame = null;
    main.replaceChildren(renderUtility());
  }
  return main;
}

function renderModeBar(status: SidecarStatus, refresh: (s: SidecarStatus) => void): HTMLElement {
  const bar = document.createElement("div");
  bar.className = "sell-modebar";
  bar.innerHTML = `
    <div class="sell-context">
      <strong>Live Studio</strong>
      <span class="eyebrow">Governed seller workspace</span>
    </div>
    <div class="sell-mode-actions">
      <div class="sell-mode" role="tablist">
        <button type="button" data-mode="live" role="tab">Live</button>
        <button type="button" data-mode="utility" role="tab">Utility</button>
      </div>
      <button type="button" class="sell-diag-toggle">Diagnostics</button>
    </div>
  `;
  bar.querySelectorAll<HTMLButtonElement>("[data-mode]").forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.mode === mode);
    tab.addEventListener("click", () => {
      mode = tab.dataset.mode === "utility" ? "utility" : "live";
      refresh(status);
    });
  });
  bar.querySelector<HTMLButtonElement>(".sell-diag-toggle")?.addEventListener("click", () => {
    diagnosticsOpen = !diagnosticsOpen;
    refresh(status);
  });
  return bar;
}

function renderDiagnostics(status: SidecarStatus, refresh: (s: SidecarStatus) => void): HTMLElement {
  const panel = document.createElement("section");
  panel.className = "sell-diagnostics";
  panel.hidden = !diagnosticsOpen;
  const card = document.createElement("div");
  card.className = `status-card status-${status.state}`;
  card.innerHTML = `
    <p class="eyebrow">Studio loopback sidecar</p>
    <div class="status-row"><strong>${statusLabel(status)}</strong><span class="signal" aria-hidden="true"></span></div>
    <p>Local port ${status.port}. Connection detail stays in the native shell.</p>
  `;
  const actions = document.createElement("div");
  actions.className = "actions";
  actions.append(
    button("Check status", async () => {
      refresh(await sidecarStatus());
    }),
  );
  if (status.isRunning) {
    actions.append(
      button("Stop Studio", async () => {
        await invoke("stop_sidecar");
        refresh(await sidecarStatus());
      }),
    );
  } else {
    actions.append(
      button("Start Studio", async () => {
        const next = sanitizeSidecarStatus(await invoke<unknown>("start_sidecar")) ?? FALLBACK_STATUS;
        refresh(next);
      }),
    );
  }
  const msg = document.createElement("p");
  msg.className = "message";
  msg.setAttribute("data-shell-message", "");
  msg.setAttribute("aria-live", "polite");
  panel.append(card, actions, msg);
  return panel;
}

function renderReadiness(app: HTMLElement, phase: SellPhase, status: SidecarStatus, retry: () => void): void {
  const failed = phase === "failed";
  const stopped = phase === "stopped";
  const heading = failed
    ? "Studio needs attention."
    : stopped
      ? "Studio is stopped."
      : "Preparing Studio.";
  const detail = failed
    ? `Sidecar failed${status.errorCode ? ` (${status.errorCode.replace(/_/g, " ")})` : ""}. Retry when ready — nothing is lost.`
    : stopped
      ? "Start Studio to load the governed seller cockpit in this pane."
      : "The local Studio sidecar is starting. The Sell pane becomes the cockpit automatically.";
  app.innerHTML = `
    <div class="shell sell-shell">
      <section class="hero readiness">
        <div class="readiness-card">
          ${failed || stopped ? "" : '<div class="spinner" aria-hidden="true"></div>'}
          <p class="eyebrow">${failed ? "Sidecar failure" : stopped ? "Sidecar stopped" : "Readiness"}</p>
          <h1>${heading}</h1>
          <p>${detail}</p>
          <div class="actions"></div>
          <p class="message" data-shell-message aria-live="polite"></p>
        </div>
      </section>
    </div>
  `;
  const actions = app.querySelector<HTMLElement>(".actions");
  if (!actions) return;
  if (failed || stopped) {
    actions.append(
      button(failed ? "Retry" : "Start Studio", async () => {
        retry();
      }),
    );
  }
}

export async function renderSell(app: HTMLElement, options: SellRenderOptions): Promise<PaneController> {
  let disposed = false;
  let status = await sidecarStatus();
  let phase: SellPhase = "boot";

  // Auto-start once on mount: the operator should never need a Start button.
  if (status.state === "stopped") {
    status = sanitizeSidecarStatus(await invoke<unknown>("start_sidecar")) ?? FALLBACK_STATUS;
  }
  phase = nextSellPhase(phase, status);
  options.onSidecarState(status.state);

  const relayStudioHints = (event: MessageEvent) => {
    if (!cockpitFrame?.contentWindow || event.source !== cockpitFrame.contentWindow) return;
    const request = sanitizeProductNavigation(event.data);
    if (!request) return;
    void invoke("request_product_navigation", {
      request: request satisfies ProductNavigationRequest,
    })
      .then(() => {
        if (!disposed) options.onProductNavigation(request.productId);
      })
      .catch(() => {
        message("Could not hand the product to the Shop pane.");
      });
  };
  window.addEventListener("message", relayStudioHints);

  const retry = async () => {
    if (restarting) return;
    restarting = true;
    try {
      if (status.isRunning) await invoke("stop_sidecar");
      status = sanitizeSidecarStatus(await invoke<unknown>("start_sidecar")) ?? FALLBACK_STATUS;
      phase = nextSellPhase(phase, status);
      paint();
    } finally {
      restarting = false;
    }
  };

  const paint = () => {
    if (disposed) return;
    if (phase === "ready") {
      cockpitFrame = null;
      const stage = document.createElement("div");
      stage.className = "sell-stage";
      const refresh = (next: SidecarStatus) => {
        if (!restarting) {
          phase = nextSellPhase(phase, next);
          status = next;
        }
        paint();
      };
      stage.append(renderModeBar(status, refresh), renderMain(status, refresh, options.theme), renderDiagnostics(status, refresh));
      app.replaceChildren(stage);
    } else {
      cockpitFrame = null;
      renderReadiness(app, phase, status, () => void retry());
    }
  };

  paint();

  const poll = async () => {
    if (disposed || restarting) return;
    const next = await sidecarStatus();
    if (disposed) return;
    const nextPhase = nextSellPhase(phase, next);
    if (nextPhase !== phase || next.state !== status.state) {
      phase = nextPhase;
      status = next;
      paint();
    } else {
      status = next;
    }
    options.onSidecarState(status.state);
  };
  const pollTimer = window.setInterval(() => void poll(), POLL_MS);

  return {
    dispose: () => {
      disposed = true;
      window.clearInterval(pollTimer);
      window.removeEventListener("message", relayStudioHints);
      cockpitFrame = null;
    },
    setTheme: (nextTheme) => {
      options.theme = nextTheme;
      sendTheme(cockpitFrame, status, nextTheme);
    },
  };
}

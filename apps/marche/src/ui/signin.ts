import type { AuthClient, StartResult, WhatsAppStatus } from "../host/auth-client";

/**
 * The "Se connecter avec WhatsApp" flow, mounted into a header container by `ui/app.ts`. Plain
 * DOM, no framework — same style as `ui/app.ts` itself, and like it, not covered by a unit test:
 * the logic it drives (`host/auth-client.ts`, `host/identity-provider.ts`) is what's tested; this
 * file is wiring, verified by `pnpm build`'s type-check and manual use, same boundary `ui/app.ts`
 * already draws.
 */
export interface SignInViewOptions {
  container: HTMLElement;
  auth: AuthClient;
  /** Called after a successful verify, and after sign-out, so the rest of the page can react. */
  onSignedInChange: (signedIn: boolean) => void;
}

export interface SignInView {
  /** Call once at startup, after checking `auth.getMe()`, so the header starts in the right
   *  state instead of flashing "Se connecter" for a moment. */
  setSignedIn(signedIn: boolean): void;
  dispose(): void;
}

const POLL_INTERVAL_MS = 3000;

type State =
  | { kind: "signed_out" }
  | { kind: "starting" }
  | { kind: "start_error"; message: string }
  | { kind: "flow"; start: StartResult; status: WhatsAppStatus; verifying: boolean; error: string | null }
  | { kind: "expired" }
  | { kind: "signed_in" };

function messageFor(error: unknown): string {
  return error instanceof Error ? error.message : "une erreur est survenue";
}

function statusLabel(status: WhatsAppStatus): string {
  if (status === "pending") return "En attente de votre message WhatsApp…";
  if (status === "code_sent") return "Code envoyé sur WhatsApp.";
  return "";
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function mountSignIn(options: SignInViewOptions): SignInView {
  const { container, auth, onSignedInChange } = options;
  let state: State = { kind: "signed_out" };
  let pollTimer: ReturnType<typeof setTimeout> | null = null;
  let disposed = false;

  function clearPoll(): void {
    if (pollTimer !== null) clearTimeout(pollTimer);
    pollTimer = null;
  }

  function setState(next: State): void {
    state = next;
    render();
  }

  function schedulePoll(start: StartResult): void {
    clearPoll();
    pollTimer = setTimeout(() => {
      void (async () => {
        if (disposed) return;
        try {
          const { status } = await auth.getSignInStatus(start.id);
          if (disposed) return;
          if (status === "expired") {
            setState({ kind: "expired" });
            return;
          }
          if (state.kind === "flow" && state.start.id === start.id) setState({ ...state, status });
          schedulePoll(start);
        } catch {
          // A transient network hiccup shouldn't kill the flow -- keep polling.
          if (!disposed) schedulePoll(start);
        }
      })();
    }, POLL_INTERVAL_MS);
  }

  async function beginSignIn(): Promise<void> {
    setState({ kind: "starting" });
    try {
      const start = await auth.startSignIn();
      setState({ kind: "flow", start, status: "pending", verifying: false, error: null });
      schedulePoll(start);
    } catch (error) {
      setState({ kind: "start_error", message: messageFor(error) });
    }
  }

  async function verify(start: StartResult, code: string): Promise<void> {
    setState({ kind: "flow", start, status: "code_sent", verifying: true, error: null });
    try {
      await auth.verifySignIn(start.id, code);
      clearPoll();
      setState({ kind: "signed_in" });
      onSignedInChange(true);
    } catch (error) {
      setState({ kind: "flow", start, status: "code_sent", verifying: false, error: messageFor(error) });
    }
  }

  function signOut(): void {
    void auth.signOut().catch(() => undefined); // best-effort -- local state clears either way
    clearPoll();
    setState({ kind: "signed_out" });
    onSignedInChange(false);
  }

  function render(): void {
    if (state.kind === "signed_in") {
      container.innerHTML = `
        <span class="marche-signin-status">Connecté</span>
        <button type="button" id="marche-signout">Se déconnecter</button>
      `;
      container.querySelector("#marche-signout")!.addEventListener("click", signOut);
      return;
    }

    if (state.kind === "signed_out") {
      container.innerHTML = `<button type="button" id="marche-signin-start" class="marche-primary">Se connecter avec WhatsApp</button>`;
      container.querySelector("#marche-signin-start")!.addEventListener("click", () => void beginSignIn());
      return;
    }

    if (state.kind === "starting") {
      container.innerHTML = `<span class="marche-signin-status">Connexion en cours…</span>`;
      return;
    }

    if (state.kind === "start_error") {
      container.innerHTML = `
        <p class="marche-signin-error" role="alert">${escapeHtml(state.message)}</p>
        <button type="button" id="marche-signin-retry">Réessayer</button>
      `;
      container.querySelector("#marche-signin-retry")!.addEventListener("click", () => void beginSignIn());
      return;
    }

    if (state.kind === "expired") {
      container.innerHTML = `
        <p class="marche-signin-error" role="alert">Le lien a expiré.</p>
        <button type="button" id="marche-signin-retry">Recommencer</button>
      `;
      container.querySelector("#marche-signin-retry")!.addEventListener("click", () => void beginSignIn());
      return;
    }

    const flow = state; // narrowed to { kind: "flow"; ... } below
    const loginText = `LOGIN-${flow.start.id}`;
    container.innerHTML = `
      <div class="marche-signin-flow">
        <p>1. Ouvrez WhatsApp et envoyez ce message :</p>
        <div class="marche-signin-login-text">
          <code>${escapeHtml(loginText)}</code>
          <button type="button" id="marche-signin-open">Ouvrir WhatsApp</button>
          <button type="button" id="marche-signin-copy">Copier</button>
        </div>
        <p class="marche-signin-status">${statusLabel(flow.status)}</p>
        ${
          flow.status === "code_sent"
            ? `
              <p>2. Entrez le code à 6 chiffres reçu sur WhatsApp :</p>
              <form id="marche-signin-code-form">
                <input type="text" inputmode="numeric" pattern="[0-9]*" maxlength="6"
                       id="marche-signin-code" aria-label="Code à 6 chiffres" autocomplete="one-time-code" />
                <button type="submit" class="marche-primary"${flow.verifying ? " disabled" : ""}>Valider</button>
              </form>
              ${flow.error ? `<p class="marche-signin-error" role="alert">${escapeHtml(flow.error)}</p>` : ""}
            `
            : ""
        }
        <button type="button" id="marche-signin-cancel">Annuler</button>
      </div>
    `;

    container.querySelector("#marche-signin-open")!.addEventListener("click", () => {
      window.open(flow.start.whatsappUrl, "_blank", "noopener");
    });
    container.querySelector("#marche-signin-copy")!.addEventListener("click", () => {
      void navigator.clipboard?.writeText(loginText).catch(() => undefined);
    });
    container.querySelector("#marche-signin-cancel")!.addEventListener("click", () => {
      clearPoll();
      setState({ kind: "signed_out" });
    });
    const form = container.querySelector<HTMLFormElement>("#marche-signin-code-form");
    if (form) {
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        const input = container.querySelector<HTMLInputElement>("#marche-signin-code")!;
        const code = input.value.trim();
        if (/^\d{6}$/.test(code)) void verify(flow.start, code);
      });
    }
  }

  render();

  return {
    setSignedIn(signedIn: boolean) {
      setState(signedIn ? { kind: "signed_in" } : { kind: "signed_out" });
    },
    dispose() {
      disposed = true;
      clearPoll();
    },
  };
}

# Yaatal OS Session Broker Contract (UXR-04)

Status: Draft for founder review
Depends on: UXR-01 (validated), Engine auth endpoints (existing)

## Problem

Today the OS shell has two disconnected identity events: the Studio operator
unlocks with a control token, and BOBO gates its own auth stack against the
Engine. There is no unified login, no shared session, and no single logout.

## Non-negotiables

1. **Tokens never touch renderers.** Raw access/refresh tokens are held by
   the Rust host process only — never serialized to the shell page, never in
   iframe `localStorage`/`sessionStorage`, never in URLs.
2. **One login unlocks both workspaces.** A single Engine-backed merchant
   login in the OS shell authorizes SELL (Studio) and SHOP (BOBO buyer
   surface for the merchant's own storefront preview).
3. **Logout clears both surfaces.** Rust drops tokens and the shell tells
   each embedded surface to reset its local session state.
4. **Deny-by-default stays.** Unauthenticated shell = SELL and SHOP render
   their locked/preview states; no commerce action is possible.
5. **Fail honest.** If Engine is unreachable, login fails visibly with a
   retry — never a silent local fallback or fake session.

## Architecture

```text
┌─────────────────────────── Rust host (session broker) ──────────────────────┐
│  EngineAuthAdapter ── POST /api/auth/login → access/refresh pair            │
│  SessionState      ── Mutex<Session>, tokens in-process only                │
│  Commands: os_login / os_logout / os_session_status                          │
└───────┬───────────────────────┬────────────────────────────────────────────┘
        │ sanitized             │ sanitized
        ▼                       ▼
   SELL pane                SHOP pane
   (Studio unlocks its    (BOBO receives a
    operator session via    one-time bootstrap
    server-side cookie)      query nonce, not a token)
```

## Flows

### Login (shell-level)

1. Shell renders the OS login card (merchant email + password → Engine).
2. `os_login(email, password)` → Rust calls `POST {ENGINE}/api/auth/login`.
3. On 200: Rust stores tokens in-process, emits `yaatal://session` with a
   **sanitized profile** (merchant display name, storefront name — no tokens,
   no email address into panes), and panes unhide their authorized states.
4. On failure: shell shows Engine's error verbatim; no partial state.

### SELL bootstrap (Studio)

5. On session-active, Rust (via sidecar env) or the shell triggers Studio's
   existing operator unlock server-side: the control token is passed to the
   sidecar through the `.env`/environment seam — the same proven path — and
   the Studio UI reflects `Operator authenticated` without the merchant
   typing the operator token manually.
5b. The merchant no longer sees the "Unlock controls" flow once OS-level
   login succeeds; the cockpit's arm/live actions become available.

### SHOP bootstrap (BOBO)

6. Rust mints a **one-time bootstrap nonce** (random 128-bit, stored
   in-process with the session) and injects it into the BOBO iframe URL as
   `?bootstrap=<nonce>` (or an equivalent same-origin seam).
7. BOBO's existing auth stack exchanges the nonce at the Engine
   (`POST /api/auth/bootstrap` — new Engine endpoint, out of POC scope) for a
   buyer-surface session cookie. In the POC, BOBO stays on its login screen
   until this endpoint exists; the OS login card is the only login visible.

### Logout

8. `os_logout()` → Rust drops tokens + nonce state, emits `yaatal://session`
   with `authenticated: false`; shell switches to locked states; embedded
   surfaces reset via their existing session-reset seams.

## POC scope (this card)

- `os_login` / `os_logout` / `os_session_status` Rust commands with
  `Mutex<SessionState>`; Engine adapter via existing HTTP client (std only).
- Shell UI: OS login card in the topbar (avatar pill → login popover) with
  merchant name once authenticated.
- SELL auto-unlock via the `.env` STUDIO_CONTROL_TOKEN seam (already proven).
- SHOP: no fake bypass — BOBO's login screen remains until the Engine
  bootstrap endpoint exists; the OS card clearly says "SHOP session pending
  Engine bootstrap endpoint".
- Sanitized session event to panes: `{ authenticated, merchant_name,
  storefront_name }` — nothing else crosses.

## Engine endpoints required (deferred, listed for visibility)

- `POST /api/auth/login` (exists — used by BOBO/Studio today)
- `POST /api/auth/bootstrap` (new — exchanges one-time nonce for buyer session)

## Acceptance

- One login in the OS shell → SELL cockpit unlocks; no operator-token dialog.
- Logout → both panes return to locked states; no token residue in panes.
- Tokens exist only in Rust process memory: confirmed by test + grep gate.
- Unauthenticated commerce actions stay denied end-to-end.
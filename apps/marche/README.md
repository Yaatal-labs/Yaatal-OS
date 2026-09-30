# Marché

Marché is Kairmel's mini-app catalogue — installable as a PWA, in the spirit of WeChat/Alipay
mini-programs. It lists apps published from Créer (Kairmel's app builder) and opens them in a
sandboxed iframe, with a small bridge (`window.kairmel`) that gives an app a stable per-app
identity and a way to ask the host to share a link — nothing more, and only what the app's own
manifest declares.

Identity is backed by real WhatsApp sign-in (via `apps/marche-api`, which also serves this app —
see "Same-origin hosting" in its README) rather than a per-device placeholder — see "The bridge
(`window.kairmel`)" below for what that means for `identity()`, and "Sign-in" for the UI.

## Run it locally

```sh
cd apps/marche
pnpm install
pnpm dev      # http://localhost:5173 — the catalogue, with the seed apps below
pnpm test     # vitest — 68 tests today
pnpm check    # tsc --noEmit
pnpm build    # type-check, then produce dist/ (see "Build output" below)
```

No secrets, no backend, and no real mini-apps are required to try just the catalogue:
`public/catalogue.json` seeds four fictional example apps on `example.com` (reserved for
documentation by RFC 2606), each clearly named "(exemple)" so they can never be mistaken for a
real listing. They point at domains that don't resolve, so "Ouvrir" on one of them will fail to
load in a browser — that's expected; the catalogue, search, category filter, and the permissions
shown on the detail page all work without it.

Trying **sign-in** does need a running `apps/marche-api` (and, for a real end-to-end run, a real
Engine) — see that app's README "Run locally". This app's own `pnpm dev` proxies `/v1/*` to
`http://localhost:8787` by default (`vite.config.ts`), so pointing `apps/marche-api`'s dev server
there is all that's needed locally. Without it, the sign-in widget will just show connection
errors — everything else in this app still works.

## Catalogue source

By default the catalogue is the bundled `public/catalogue.json` above. Set `VITE_CATALOGUE_URL`
(a build-time env var, e.g. in `.env.local` or on the `pnpm build`/`pnpm dev` invocation) to the
origin of a running `apps/marche-api` Worker to fetch the live, founder-approved catalogue from
`${VITE_CATALOGUE_URL}/v1/catalogue` instead:

```sh
VITE_CATALOGUE_URL=http://localhost:8787 pnpm dev
```

If that fetch fails for any reason — offline, misconfigured, the API down, a malformed response
— it falls back to the bundled `catalogue.json`, same as when the variable is unset (see
`src/catalogue/source.ts`). Either way, every entry still goes through `validateAppManifest`
(via `loadCatalogue`) before it's shown; an invalid one is dropped, not crashed on. The service
worker caches whichever catalogue is actually in use — remote or local — for offline use (see
`public/sw.js`).

## Build output

`pnpm build` produces:

- `dist/index.html` + `dist/assets/…` — the catalogue host page.
- `dist/kairmel-bridge.js` — the bridge, at a **stable** path (not content-hashed), so a
  mini-app can link to it directly: `<script type="module" src="https://<marche-host>/kairmel-bridge.js"></script>`.
- `dist/sw.js`, `dist/manifest.webmanifest`, `dist/catalogue.json`, `dist/icons/…` — copied
  from `public/` as-is.

In dev (`pnpm dev`), the bridge is also servable straight from source —
`<script type="module" src="http://localhost:5173/src/bridge/entry.ts"></script>` — Vite
transpiles it on the fly, useful when developing a mini-app against a local host.

## The app manifest format

Every listing in the catalogue is an `AppManifest` (`src/manifest/types.ts`), validated by
`validateAppManifest` (`src/manifest/validate.ts`) before it's ever shown or opened:

```ts
interface AppManifest {
  id: string; // stable lowercase slug, e.g. "boutique-express" — the permission/consent key
  name: string; // display name
  description: string; // short description, in French
  icon: string; // an https:// URL, or a root-relative path to a bundled asset
  url: string; // the app's own website — where the host opens it
  category: string; // a lowercase slug, used for the category filter
  author: string;
  permissions: ("identity" | "share" | "pay")[]; // closed list — anything else is rejected
}
```

`validateAppManifest` returns every problem it finds (in French), not just the first one, so a
bad listing can be fixed in one pass. An unknown permission makes the *whole* manifest invalid
— there is no partial acceptance. `loadCatalogue` (`src/catalogue/catalogue.ts`) validates a
catalogue array entry-by-entry instead, so one bad app never takes the rest of the catalogue
down with it.

`public/catalogue.json` is the single source of truth for the seed data; `src/catalogue/seed.ts`
just imports and types it, so the host (at runtime) and the tests (at test time) can never drift
apart — `test/catalogue-seed.test.ts` checks every seed entry validates.

## The bridge (`window.kairmel`)

A mini-app that wants `identity` or `share` includes the bridge script (see "Build output"
above). It exposes a small, promise-based API:

```ts
const { userId } = await window.kairmel.identity();
await window.kairmel.share({ title: "Bazin Riche", url: "https://…" });
await window.kairmel.pay({ amount: 500 }); // always rejects today
```

- **`identity()`** resolves to a per-app id from the signed-in WhatsApp session: the host calls
  marche-api's `GET /v1/me/identity?app=<appId>`, which returns
  `hex HMAC-SHA256(IDENTITY_SECRET, "<pid>:<appId>")` — stable across every device the person
  signs in on, different for every app, and never the phone number or the Engine's own account
  id (see `apps/marche-api/README.md`'s "WhatsApp sign-in" for the full flow). If the person
  isn't signed in, `identity()` rejects with `{ code: "not_signed_in" }` instead of prompting —
  a mini-app should show its own "connectez-vous d'abord" message (or a `!== "not_signed_in"`
  check before treating any other rejection as unexpected). This routing lives in
  `src/host/identity-provider.ts` (`SessionIdentityProvider`) and is wired up in
  `src/host/bridge-host.ts`'s `handleIdentity`.
  - **Dev-only fallback:** `VITE_DEV_PLACEHOLDER_IDENTITY=true` (build-time env var) swaps in the
    old per-device placeholder (`DeviceIdentityProvider`, `src/host/identity.ts`'s
    `deriveAppUserId` over a random per-device id) instead, so `pnpm dev` here can exercise
    `identity()` without a running marche-api + Engine. It's never "signed out" and its id is
    unrelated to (and much less stable than) the real one. Never set this for a deployment a
    real person uses — see `src/vite-env.d.ts`.
- **`share(params)`** asks the host to open the Web Share sheet, or — if that API isn't
  available — copy the link/text to the clipboard. Resolves with which one happened.
- **`pay(params)`** is reserved and always rejects. If the app's manifest declared `pay`, the
  error is `{ code: "not_implemented", message: "pas encore disponible" }` — a real "not yet".
  If the manifest never declared `pay` at all, the error is `permission_denied` instead — the
  app tried to use something it never asked for.

Calling anything the manifest didn't declare in `permissions` always rejects with
`permission_denied`, from the host, before anything else runs. The host also asks the person
once, per app, before the *first* `identity()` call succeeds (`window.confirm` in this version —
see below) — but only once they're actually signed in; after that the grant is remembered
(`src/host/consent.ts`) and the app isn't asked again.

## Sign-in

The header's "Se connecter avec WhatsApp" (`src/ui/signin.ts`, mounted from `src/ui/app.ts`)
drives marche-api's WhatsApp partner sign-in: open the `wa.me` link (shown as a button, plus the
`LOGIN-…` text to copy by hand), the flow polls sign-in status until the Engine has sent a
6-digit code over WhatsApp, then a code field appears; on success the header switches to
"Se déconnecter". This is the same session `identity()` reads from (`GET /v1/me`,
`GET /v1/me/identity`) — see `apps/marche-api/README.md` for the protocol and design (rate
limiting, CSRF, the session cookie). Like `ui/app.ts`, `signin.ts` is DOM-wiring code and isn't
itself unit-tested; what it drives (`src/host/auth-client.ts`, `src/host/identity-provider.ts`)
is (`test/auth-client.test.ts`, `test/identity-provider.test.ts`, and the `not_signed_in` cases
in `test/bridge-origin.test.ts`).

### How it's wired (for anyone extending the host)

`window.kairmel` and the host talk over `postMessage`, with **origin checks on both sides**:

- The mini-app reads the host's origin once, from `?kairmelHost=` in its own page URL — the
  host appends this when it builds the iframe's `src` (`src/ui/app.ts`, `openApp`). Every
  request it sends targets exactly that origin (never `"*"`), and it only accepts a response
  whose `event.source === window.parent` and whose `event.origin` is that same host origin.
- The host (`src/host/bridge-host.ts`, `attachBridgeHost`) only accepts a request whose
  `event.source` is the exact iframe it opened and whose `event.origin` matches
  `new URL(manifest.url).origin` — and it only ever replies to that same origin.

Both sides validate the message shape itself too (`src/bridge/protocol.ts`) — a cross-window
message is exactly as trustworthy as input from the network.

The iframe is sandboxed as `allow-scripts allow-same-origin allow-forms allow-popups`.
`allow-same-origin` is required for the origin checks above to mean anything (without it the
framed document gets an opaque `"null"` origin) — the one case where `allow-scripts` +
`allow-same-origin` together are a real sandbox-escape risk is framing the **host's own**
origin, so `openApp` refuses to open any app whose URL origin equals the host's.

## What's deliberately not here (v1 scope)

- **Payments.** `pay` is a real, closed permission an app can declare, but every call rejects.
- **The host driving sign-in *for* the app.** When a mini-app calls `identity()` signed out, the
  host rejects with `not_signed_in` rather than pausing the request to pop open the sign-in flow
  itself — see `src/host/bridge-host.ts`'s `handleIdentity` doc comment for why (mainly:
  avoiding a second, nested async flow with its own polling/expiry while a permission request is
  already in flight). The person can always sign in from the header first.
- **A styled consent dialog.** Asking for `identity` uses `window.confirm` (`src/ui/app.ts`).
  It's gated correctly (once per app, via the host, never the app itself) — the UI around it is
  the obvious next polish pass, not a correctness gap.
- **Removing a bad listing from a *live* catalogue.** `loadCatalogue` keeps the catalogue
  serving even if one entry is invalid (it's dropped, with its errors reported — see
  `result.rejected` and the `console.warn` in `src/ui/app.ts`), but there's no admin UI here for
  authoring/submitting listings — that belongs to Créer's publish flow, out of scope for this
  host.
- **Linting.** This app has `tsc --noEmit` (strict) and `vitest`, matching some sibling apps in
  this repo; others in `apps/` carry an ESLint config and some don't — none was added here to
  stay consistent with the apps that don't.

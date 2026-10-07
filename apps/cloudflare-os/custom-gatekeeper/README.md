# Custom Gatekeeper: the Yaatal control board

This is Yaatal's replacement for the starter's example package, occupying the Custom slot the starter
deploys as `yaatal-os-custom`. Where the example exposed deployment text, this exposes the operator a
read-only view of both Yaatal rails plus service health, on a page reached through the Workshop.

Upstream's example is credential-free by design. This one holds two credentials, so the admin gate
described below is the part to read before changing anything.

## What it reads

| Leg | Source | Credential |
|---|---|---|
| Token rail: credit sold, credit consumed, refusals, per-model and per-day series | `GET https://api.kairmel.com/admin/usage?days=N` | `TOKEN_GATEWAY_ADMIN_TOKEN` |
| Commerce rail: registrations, escrow transitions, Wave payments, as event counts | `POST https://eu.i.posthog.com/api/projects/<id>/query/` | `POSTHOG_PERSONAL_API_KEY`, `POSTHOG_PROJECT_ID` |
| Health: Engine and gateway liveness | `https://engine.njooba.com/health`, `https://api.kairmel.com/v1/models` | none, deliberately |

The two PostHog keys are not interchangeable. The Engine ingests with a project key (`phc_...`); this
board queries with a personal key (`phx_...`, scope `query:read`). They are separate secrets and
neither belongs in this repository.

Everything is a source constant or a secret. `src/board.ts` holds the three URLs and the day-window
bounds, and the commerce query is one fixed HogQL string built from a clamped integer. Nothing a
caller sends reaches the query text, which keeps a read-only panel from becoming an arbitrary-query
endpoint.

## The admin gate

`AccountDescription.providesUi` registers the page, and the Workshop lists it for every user, because
the Custom slot auto-provisions one account per user and `describe()` is not user-scoped. So the gate
is not the nav entry, it is this:

- `startAppUi({ isAdmin })` hands every viewer the same page. The page carries no data, so a second
  page for non-admins would be duplicate maintenance with nothing to gain.
- The page opens by calling `getViewerInfo()`. A non-admin gets `isAdmin: false` and the page renders
  a refusal. That is a courtesy.
- The real gate is server-side: every method except `getViewerInfo()` throws `"Admin access
  required."` unless the caller opened the board as an admin, and the check runs per call rather than
  once at construction. An admin demoted mid-session stops reading on the next call.

## Data boundary

The internal OS states "Sur invitation, sans données clients réelles ni paiement". The board honours
that by showing aggregates and operator counts only. There is no per-merchant, per-customer or
per-ledger-line read in `src/board-types.d.ts`, and none should be added: `GET /admin/usage` returns a
`by_account` array, `src/board.ts` maps the payload field by field and drops it, and
`__tests__/board.test.ts` asserts that no merchant name or account id can appear in a serialized
report. Adding a per-account shape is a boundary change, not an enhancement.

## Observers

The board is not reached through an observation, so it does not pass through the approval queue:
`GatekeeperUser.startAppUi` takes `AppUiContext = { isAdmin }` and nothing else, and returns the page
with a fresh capability stub. The gate is `isAdmin`, checked on every call, as above.

`CustomVerifier.verify()` is unchanged and still accepts every observer. It governs the agent-facing
surface, which this package leaves as it found it: `getDeploymentInfo()` and its observation
description are kept, and `getSupportedResources()` still returns nothing. The board's capability is
handed out from exactly one place, the `ui` stub from `startAppUi`, so no agent can be granted
operator revenue, and nothing in `src/board-types.d.ts` is reachable from a binding.

Upstream's [`write-gatekeeper` skill](https://github.com/cloudflare/cloudflare-os/blob/main/.agents/skills/write-gatekeeper/SKILL.md)
covers observer design, OAuth, URL-scoped resources, writes and simulation, hooks, and configurator
UI, for anything this package grows later.

## Building the page

`build-app.mjs` concatenates three things into `src/generated/app.ts`, which `src/board-html.ts`
imports: the shell in `app/index.html`, capnweb (inlined, because the iframe's origin is opaque and
cannot resolve a bare specifier), and the client in `app/board.js`. The iframe protocol is upstream's:
the shell posts a handshake with a message port to its parent and the host answers over it.

The generated file is TypeScript, not a `.txt` asset, and that is load-bearing rather than a style
choice. The same `import x from "./app.txt"` resolves to the file's *contents* under wrangler (its
built-in Text rule) and to a *URL string* under Vite. Both are legitimate for their runtime; only the
second is wrong here, and it fails quietly, because `startAppUi()` would hand the iframe the string
`"./app.txt"` and the iframe would render that path as its own body. A module exporting the string
means the same thing to every toolchain, with no rule table consulted. Do not convert it back.

`src/generated/` is gitignored and rebuilt by the `build` and `test` tasks, so nothing in it is a
source of truth.

## Secrets

Set on the deployed Worker, never in `wrangler.jsonc`. The file's `vars` block is discarded at deploy
anyway: `scripts/deploy.ts` assigns `customGatekeeper.vars` wholesale from `deployment.jsonc`, which
is why those two entries exist only to keep local dev matching production.

```sh
pnpm exec wrangler secret put TOKEN_GATEWAY_ADMIN_TOKEN
pnpm exec wrangler secret put POSTHOG_PERSONAL_API_KEY
pnpm exec wrangler secret put POSTHOG_PROJECT_ID
```

## Check

```sh
pnpm run test:run        # builds the page, then vitest
pnpm run types:check     # builds the page, then tsc --noEmit
pnpm exec wrangler deploy --dry-run
```

`wrangler types` is not in either script: the generated `worker-configuration.d.ts` is upstream's and
slow to rebuild. Run `pnpm run types:generate` once after changing `wrangler.jsonc`, and only then.

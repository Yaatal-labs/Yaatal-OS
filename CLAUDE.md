# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) and other agents when working in this repository.

## Start here

**`BOBO-ENGINE-ALIGNMENT.md`** (repo root) is the START-HERE for all Engine-integration work — the audited state plus the ordered, acceptance-criteria'd work plan. Read it before touching services, delivery, payments, or the SDK pin.

## What this is

**BOBO** — "Social Commerce OS for African SMBs." A livestream/social-commerce app built for African infrastructure reality: offline-first, mobile-first, bandwidth-aware, latency-tolerant. BOBO is an **app**; its backend source of truth is the **Yaatal Engine** (a separate Rust repo), reached through the typed `@yaatal/client` SDK. Keep backend business logic in the Engine, not here.

## Branch reality (important — do not assume `main`)

- **`main` is frozen** (~2026-01-13) on an older stack (PowerSync + PocketBase + Supabase, no Engine wiring). It is **not** the trunk.
- **`codex/bobo-engine-netlify-integration` is the real trunk** — auth/products/orders/analytics/notifications already run on the Engine via the SDK. Base new work on it, not on `main`.

## Stack

| Layer | Technology |
|---|---|
| App | React Native 0.76 + Expo 54 (`bobo-app/`) |
| State | Zustand |
| Offline | PowerSync + SQLite |
| Backend | **Yaatal Engine** via `@yaatal/client` (`github:Yaatal-labs/Yaatal-SDK#main`) |
| Legacy (migrating off) | PocketBase (delivery + chat only) |
| Package manager | pnpm `10.18.2` (node ≥ 18) |

## Monorepo layout

```
BOBO/
├── bobo-app/              # Expo app (screens, app-level services, PowerSync)
├── packages/
│   ├── core/  (@njooba/core)  # types, utils, and the Engine-backed services
│   ├── ai/                     # voice synthesis / image services
│   └── shared/                 # formatCFA, formatPhone, validators
```

pnpm workspace globs: `packages/ai`, `packages/core`, `packages/shared`, `bobo-app`.

## The Engine runtime path (how the app talks to the backend)

- `packages/core/src/services/engine.client.ts` owns the `@yaatal/client` instance (`createYaatalClient`, default base URL `http://localhost:5150`), the auth-token lifecycle, and a low-level `engineRequest` helper.
- Engine-backed services: `auth.service.engine.ts`, `products.service.engine.ts`, `orders.service.engine.ts`, `analytics.service.engine.ts`, `notifications.service.engine.ts`.
- `packages/core/src/services/index.ts` is the **barrel** — it re-exports the active Engine services under their canonical names (`AuthService`, `ProductsService`, `OrdersService`, …). Import services from `@njooba/core`, not from the individual files.
- **Still on PocketBase (mid-migration):** `delivery.service.ts` and `chat.service.ts`. Porting delivery to the Engine (`client.delivery`, delivery codes, `/d/{code}` confirm, escrow release) is the next major item — see `BOBO-ENGINE-ALIGNMENT.md`.

## Build / run / test

```bash
pnpm install                 # workspace install (fetches the SDK from GitHub via its prepare build)
pnpm dev                     # expo start (bobo-app)
pnpm build                   # expo export -p web  → bobo-app/dist
pnpm lint                    # pnpm -r lint
pnpm type-check              # tsc --noEmit (bobo-app)
pnpm test                    # bobo-app tests
```

- **Engine for local dev:** run the Engine (`cargo run -p yaatal-api`, binds `:5150`) or point `engine.client.ts` at a deployed instance. Auth-gated calls need a bearer token from the Engine's `POST /api/auth/login`.
- **Netlify:** builds `bobo-app` to `bobo-app/dist`. The build command is just the Expo web export — the `@yaatal/client` GitHub dep builds itself via its own `prepare` script, so there is no pre-build step for it.

## Conventions & guardrails

- **One `@yaatal/client`.** The only `@yaatal/client` is the SDK GitHub dependency in `packages/core`. Do not re-vendor a local copy — a stale in-repo copy previously collided with it and mis-built on Netlify.
- **Don't reach for PocketBase/Supabase for new work.** Supabase has been removed. PocketBase remains only for delivery + chat until those port to the Engine; don't add new PocketBase collections.
- **App-agnostic backend logic belongs in the Engine**, not in BOBO. BOBO-specific commerce surfaces (checkout/KYC/merchant) are exposed by the Engine's BOBO bridge and consumed here via `client.bobo`.

## Development

Work on a feature branch off the integration trunk (`codex/bobo-engine-netlify-integration`); open PRs against it, not `main`. Keep changes scoped to one alignment-plan item where possible so each is independently reviewable. A canonical cross-repo development policy is referenced in planning docs but is not yet written down in this repo; until it is, follow the branch-per-item + PR workflow above.

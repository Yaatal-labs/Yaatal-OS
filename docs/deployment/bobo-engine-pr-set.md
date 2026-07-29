# BOBO + Engine Integration PR Set

## Purpose

This document records the BOBO-side handoff for the Engine-backed development
slice. It keeps the rollback-safe `Standalone` branch separate from the active
Engine API integration branch and documents the follow-up PR sequence.

## Current deployed shape

| Surface | Deployment | Branch | Source state |
| --- | --- | --- | --- |
| BOBO web | `https://bobo-6g9.pages.dev` | `codex/bobo-engine-netlify-integration` | Pushed and deployed from `c05d58a` |
| Engine API | `https://engine.njooba.com` | `codex/bobo-engine-pr27-integration` | Pushed and deployed |
| Engine database | engine.njooba.com | production environment | Active |

Verified on 2026-05-31:

- `https://bobo-6g9.pages.dev/Login` renders the BOBO login screen.
- The production Pages deployment was triggered from Git commit `c05d58a`.
- The deployed BOBO bundle contains the engine.njooba.com Engine domain.
- The deployed BOBO bundle does not contain invalid `import.meta` syntax.
- `GET https://engine.njooba.com/health` returns `200`.
- `GET https://engine.njooba.com/api/products` returns
  `200`.

## Existing PR stack

### Engine PR 27: upstream foundation

- Repository: `Yaatal-labs/Yaatal-Engine`
- PR: `#27`
- URL: `https://github.com/Yaatal-labs/Yaatal-Engine/pull/27`
- Head: `claude/yataal-codex-deploy-review-jKnga`
- Base: `main`
- State: open and ready for review

PR 27 is the Engine foundation. It contains the app-agnostic payment, escrow,
KYC, analytics, LiveKit, and BOBO HTTP capabilities that the integration slice
builds on.

### Engine PR 28: BOBO bridge and Railway deployment repair

- Repository: `Yaatal-labs/Yaatal-Engine`
- PR: `#28`
- URL: `https://github.com/Yaatal-labs/Yaatal-Engine/pull/28`
- Head: `codex/bobo-engine-pr27-integration`
- Base: `claude/yataal-codex-deploy-review-jKnga`
- State: draft, pushed, and deployed

PR 28 is intentionally stacked on PR 27. Review PR 27 first. After PR 27
merges, retarget or rebase PR 28 onto `main` if GitHub does not update the base
automatically.

### BOBO PR 1: Engine runtime cutover and Cloudflare Pages repair

- Repository: `MouhamedN96/BOBO-`
- PR: `#1`
- URL: `https://github.com/MouhamedN96/BOBO-/pull/1`
- Head: `codex/bobo-engine-netlify-integration`
- Base: `Standalone`
- State: draft, pushed, and deployed
- Current web repair commit: `c05d58a`

PR 1:

- preserves PowerSync and Supabase files for rollback;
- stops active PowerSync startup in the Engine-backed runtime;
- routes auth, products, and orders through Engine HTTP services;
- supports QR/deeplink product routing;
- registers product detail, checkout, payment pending, and order success flows;
- fixes Expo web export startup on Cloudflare Pages;
- injects the deployed Engine API URL from Expo-owned application source.

## BOBO Pages configuration

Cloudflare Pages project:

```text
Project: bobo
Domain: bobo-6g9.pages.dev
Production branch: codex/bobo-engine-netlify-integration
Build command: pnpm install --frozen-lockfile && pnpm build
Output directory: bobo-app/dist
```

Required build-time variable:

```text
EXPO_PUBLIC_ENGINE_API_URL=https://engine.njooba.com
```

## Follow-up PRs

Keep the remaining work separate from BOBO PR 1.

### Engine follow-up: development payment modes

- Keep cash checkout operational without provider configuration.
- Add an explicit Wave stub mode for development.
- Return a pending provider reference that BOBO can poll.
- Keep real Wave provider secrets out of the frontend.

### Engine follow-up: seed data and E2E fixtures

- Add a development buyer.
- Add a merchant.
- Add two or three products.
- Verify browse, detail, QR/deeplink, checkout, and merchant visibility.

The deployed product endpoint currently returns an empty valid catalog, which
is insufficient for a full commerce demo.

### BOBO follow-up: complete Expo SDK 54 alignment

The web deployment repair aligned startup-path Expo modules only. Complete the
remaining native dependency upgrade separately:

```text
react 18.3.1 -> 19.1.0
react-dom 18.3.1 -> 19.1.0
react-native 0.76.5 -> 0.81.5
react-native-safe-area-context 4.12.0 -> ~5.6.0
react-native-screens 4.4.0 -> ~4.16.0
react-native-svg 15.8.0 -> 15.12.1
react-native-web 0.19.13 -> ^0.21.0
@types/react 18.3.x -> ~19.1.10
```

Smoke test QR camera, audio, video, navigation, and web export after the
upgrade.

### BOBO follow-up: web hardening

- Wrap login inputs in a form.
- Add input `id`, `name`, and autocomplete attributes.
- Version service worker caches.
- Add a Pages preview smoke check before production promotion.

## Merge order

1. Review and merge Engine PR 27.
2. Retarget or rebase Engine PR 28 onto `main`, then review and merge it.
3. Review and merge BOBO PR 1.
4. Land the Engine development payment-mode follow-up.
5. Land the Engine seed and E2E fixture follow-up.
6. Land the BOBO Expo SDK 54 alignment follow-up.
7. Land the BOBO web hardening follow-up.

## Verification gates

Before merging a BOBO web change:

```powershell
pnpm install --frozen-lockfile
$env:EXPO_PUBLIC_ENGINE_API_URL='https://engine.njooba.com'
pnpm build
pnpm --filter bobo-app type-check
```

Inspect the generated bundle:

```powershell
rg -n "import\.meta" bobo-app/dist/_expo/static/js/web
rg -n "yaatal-engine-production\.up\.railway\.app" bobo-app/dist/_expo/static/js/web
```

Expected result:

- the first command returns no matches;
- the second command finds the deployed Railway Engine domain;
- `https://bobo-6g9.pages.dev/Login` renders;
- `GET /api/products` returns `200`.

## Local notes excluded from PR 1

The following files are intentionally not part of the integration PR:

```text
.claude/
BOBO_TAURI_INTEGRATION.md
CLAUDE.md
ENGINE_HANDOFF.md
```

They contain local or historical handoff material and should remain separate
from the current deployable slice.

# Unified UI recovery handoff

Date: 2026-09-14

Repository: `C:\Users\momo-\OneDrive\Desktop\YAATAL\Yaatal-Engine\.worktrees\Yaatal-OS\unified-ui-poc`

Branch: `yaatal/unified-ui-poc`

HEAD at handoff: `67826b5`

## Read this first

The recovery implementation is complete at the component/build gate and the
specification re-review is **PASS**. It restores the approved hierarchy rather
than the earlier lean dashboard substitution. This is still **not accepted as
demo-ready**: populated native SELL/SHOP side-by-side evidence and phone E2E are
not yet available.

Only the signed-out browser preview, navigation rail, and locale behavior have
been visually verified. Do not describe populated native SELL or SHOP as visually
accepted until screenshots are captured against the four approved references, and
do not describe checkout as accepted until a physical-phone run succeeds.

## Approved product direction

The source of truth is:

- `docs/design/YAATAL-OS-UI-CONTRACT.md`
- `docs/design/yaatal-os-sell-light.png`
- `docs/design/yaatal-os-sell-dark.png`
- `docs/design/yaatal-os-shop-light.png`
- `docs/design/yaatal-os-shop-dark.png`

The mocks depict a polished African-first live-commerce OS:

- one persistent Yaatal OS shell with identity, connectivity, language and theme;
- a full navigation rail and centered SELL/SHOP workspace switch;
- SELL dominated by the live scene, live state/timer, product strip, assistant
  timeline and compact live controls;
- SHOP as a premium product-detail and checkout composition with large merchant
  media, product truth, options, delivery/governance context and payment actions;
- warm cream, forest and bronze light styling with an intentional dark treatment;
- Source Sans 3 for operations and Newsreader for major/product headings;
- restrained surfaces and separators rather than generic dashboard card stacks.

The intended user journey is one merchant identity and one native window:

`SELL live room -> select product -> SHOP detail -> public phone Commerce Sheet -> sandbox receipt -> one attributed SELL conversion`

The reference images are not permission to invent product data, variants, payment
providers, viewer counts or model output. Engine and Studio remain authoritative.
However, the layout, hierarchy, density and visual character still need to follow
the approved direction.

## Mandatory reuse-first rule

Studio and BOBO already contained the feature plumbing **and working UI**, but in
separate surfaces. This was always a consolidation task, not a greenfield feature
or backend build:

- Studio is the source for the live cockpit, live media/controls, assistant and
  voice surfaces, product selection, commerce intents, receipts, attribution and
  event-driven state.
- BOBO is the source for catalog discovery, real product media, product detail,
  buyer options and the checkout experience.
- Yaatal OS should supply the persistent shell, shared identity/navigation/theme,
  suppress duplicate Studio/BOBO chrome, and connect the existing surfaces through
  validated product identity and retained session state.

Before writing replacement UI, inspect and render both existing implementations:

- `apps/studio/live/dashboard/`
- `apps/shop/bobo-app/`

Inventory reusable views, styles, assets, state transitions and API bindings.
Extract or adapt those sources into the unified shell. Do not replace a working
surface with a reduced placeholder merely because the replacement is easier to
test. Do not add new native/backend plumbing unless the reused UI demonstrates a
specific missing boundary.

For every UI checkpoint, require a side-by-side screenshot with the relevant
approved mock at the target viewport. Test counts without visual evidence do not
complete UI work. If an execution plan conflicts with the approved mock or removes
an existing working surface, stop and surface that conflict to the user before
implementation.

## Engine and Harness boundary

Engine and Harness also already contained the relevant plumbing. They are service
authorities behind the UI, not additional desktop surfaces to recreate.

Engine owns:

- login, session identity and the scoped Studio bootstrap grant;
- canonical catalog and product truth;
- orders, payment state, social events and commerce persistence;
- the authenticated `/api/voice/session` boundary and downstream voice-service
  routing.

Harness owns:

- the `edge-turn.v1` proposal contract;
- behavioral policy, explicit Allow/Deny decisions and bounded tool access;
- audit records for model-proposed Studio actions;
- the rule that model output never writes directly to Engine.

The existing governed path is:

`Studio seller input -> Engine voice/session -> transcript -> Harness proposal and policy -> Allow/Deny -> Studio executes only the allowed OBS or Engine action`

The buyer checkout path remains BOBO/public Commerce Sheet plus the configured
Engine/payment authority. Harness is not a buyer checkout service and must not be
inserted into that path.

For the unified UI lane, do not redesign Engine or Harness, add renderer-direct
calls to them, or duplicate their policy/session logic. Reuse the existing Studio
and BOBO integrations plus the narrow native OS identity boundary. Change a
service only when an end-to-end run proves a concrete contract defect.

What remains on this side is deployment and proof, not speculative plumbing:

- confirm the deployed Engine revision exposes the required auth/bootstrap,
  catalog, social, commerce and voice contracts;
- run Harness privately with real Engine context, a scoped token, persistent audit
  path and the configured `mock` or `minimind` proposal backend;
- prove that Harness fails closed and that one allowed governed action produces one
  audited result;
- qualify the actual Engine voice backend before claiming live model-backed voice.

The commerce UI acceptance does not require an agent to place orders or mutate
payments. Current project readiness notes also record unresolved production money
path findings; a Studio sandbox receipt does not prove production settlement.

## Recovered UI status and remaining visual proof

The current React UI in `apps/desktop/src/unified/` now restores the target
composition while preserving existing behavior and boundaries:

- media-led SELL with live-state hierarchy and honest unavailable states;
- a connected product strip and product selection continuity;
- activity/governance context and compact live controls;
- a premium three-region SHOP detail/checkout composition; and
- the phone-safe Commerce Sheet path.

The accessibility/quality follow-up is included in the current HEAD. The design
spec was re-reviewed after recovery and passed. This is code and browser-preview
evidence, not populated native or phone visual acceptance. The outstanding proof
is deliberately narrow:

- native sign-in and populated SELL/SHOP screenshots side by side with the four
  approved references (including target desktop widths);
- real SELL-to-SHOP product continuity in the signed-in native window; and
- physical-phone Commerce Sheet through sandbox checkout, receipt, attributed
  conversion, and an idempotent replay.

Continue to keep unavailable data visibly honest. Do not invent microphone/voice
output, viewer counts, assistant recommendations, product variants, delivery
promises, or payment availability just to fill reference-shaped space.

## Implemented commits

The useful implementation sequence is:

| Commit | What it contains |
|---|---|
| `c1268a1` | React/Tailwind/shadcn foundation and renderer feature switch |
| `d26322d` | Native Studio session gateway and unified native feature |
| `cee06d2` | Typed adapter/contracts, SHOP workspace and shared BOBO media helper |
| `0658b55` | SELL workspace |
| `a8bb25b` | Native catalog and commerce commands |
| `2a76fb4` | Connected shell, retained SELL/SHOP state and share UI |
| `8e3725e` | Phone-safe Commerce Sheet gateway |
| `4af00fe` | Sanitized Studio WebSocket event bridge and recovery fixes |
| `1868347` | Remaining docs/evidence plus generated Expo asset checkpoint |
| `a4d3d600` | Restores media-led unified SELL, product strip, activity/governance, compact controls, three-region SHOP, and Commerce Sheet presentation |
| `67826b5` | Accessibility and quality fixes from the recovery review |

Before making a follow-up commit, inspect `HEAD`: a final quality-fix commit may
land after this handoff update starts. Record that commit in the acceptance
evidence rather than overwriting or reverting it. The branch was pushed to
`origin/yaatal/unified-ui-poc` through recovery handoff commit `64aaec6`.

## What passed

At `a4d3d600` / `67826b5`:

- `pnpm --filter @yaatal/os-shell check` passed.
- `pnpm --filter @yaatal/os-shell test` passed: **82/82**.
- The production build passed.
- The spec re-review passed.

These are component and integration gates, not end-to-end acceptance.

## Runtime attempt and exact unverified state

A development launch was attempted with:

- Engine: `http://100.121.164.39:18080` (health returned 200 during the attempt);
- Vite: `127.0.0.1:1420`;
- intended owned Studio: `127.0.0.1:8485`;
- phone gateway: `0.0.0.0:8486` with public base
  `http://192.168.1.111:8486`.

The native Tauri window compiled and opened. The phone gateway answered through
both loopback and `192.168.1.111`, and operator/debug routes were not exposed.
The user did not sign in or press Connect Studio, so Studio 8485 never started.
Consequently none of the following is verified:

- native sign-in/bootstrap;
- go live and stop;
- real SELL-to-SHOP product continuity;
- intent creation from the current Engine product;
- physical-phone Commerce Sheet rendering;
- sandbox checkout and receipt;
- one attributed conversion and idempotent replay;
- logout cleanup;
- packaged native launch;
- populated native SELL/SHOP visual acceptance or side-by-side screenshots;
- physical-phone E2E acceptance.

All development processes started by the previous run were shut down. Ports
1420, 8485 and 8486 had no listeners at handoff.

## Current runtime facts

The remote Engine returned one canonical product during the prior checks:

- `Robe Wax Bleue`
- ID `c7303ad5-cf40-4672-984b-218138ee4d27`
- 12,500 FCFA
- stock 8

Do not hardcode those values. Re-read the live catalog because the deployment may
change. No authoritative product variants/options were found; do not invent M/L
or colors to satisfy the mock.

No usable credentials were established. Ask the user to sign in directly in a
concrete native window. Never request or print passwords, JWTs, cookies, grants,
nonces or control tokens.

## Model status: do not overclaim

The current Studio speech input remains mock-only. No off-the-shelf Wolof model
was integrated or run in this branch.

Repository metadata was checked for:

- `bilalfaye/speecht5_tts-wolof` (public, MIT, SpeechT5 Wolof TTS);
- `cifope/whisper-small-wolof` (public, Apache-2.0, Whisper small Wolof ASR).

That metadata check is not inference evidence. Do not claim model-backed speech,
download completion, latency, quality or production readiness.

## Fastest responsible pickup path

1. Launch the owned native app, have the user sign in directly, and connect Studio.
2. Capture populated native SELL and SHOP at the target widths beside the four
   approved references; record concrete pass/fail deltas rather than rewriting UI
   or plumbing pre-emptively.
3. Verify real product continuity from SELL selection into SHOP.
4. Run the physical-phone Commerce Sheet through sandbox checkout, receipt, one
   attributed conversion, and idempotent replay.
5. Record screenshots, runtime provenance, exact HEAD/commits and pass/fail
   evidence. Only then decide whether a bounded quality correction is necessary.
6. After acceptance, create a named rollback tag, retire the legacy iframe path,
   and make the unified renderer the default.

Do not spend another cycle rewriting the unified UI, Engine/Harness plumbing,
commerce backend, or application scaffolding unless this acceptance run proves a
specific defect. The fastest pickup is native visual/E2E acceptance.

## Commands and launch constraints

Run JavaScript commands from the repository root:

```powershell
pnpm --filter @yaatal/os-shell check
pnpm --filter @yaatal/os-shell test
```

For every Cargo command, reuse the established cache and keep one build job:

```powershell
$env:CARGO_TARGET_DIR = 'C:\Users\momo-\OneDrive\Desktop\YAATAL\Yaatal-Engine\.worktrees\Yaatal-OS\poc-demo-closure\apps\desktop\src-tauri\target'
$env:CARGO_BUILD_JOBS = '1'
```

Required local development variables include:

```powershell
$env:VITE_YAATAL_UNIFIED_UI = '1'
$env:ENGINE_API_URL = 'http://100.121.164.39:18080'
$env:STUDIO_COOKIE_SECURE = '0'
$env:YAATAL_COMMERCE_POC = '1'
$env:STUDIO_DEMO_MODE = '0'
$env:YAATAL_OS_STUDIO_DIR = (Resolve-Path apps/studio).Path
$env:YAATAL_OS_STUDIO_PORT = '8485'
```

Set `YAATAL_COMMERCE_PUBLIC_BASE_URL` only after confirming the phone-reachable
address. Keep Studio loopback-only. Run the separate gateway from `apps/studio`:

```powershell
$env:YAATAL_COMMERCE_UPSTREAM = 'http://127.0.0.1:8485'
python -m uvicorn live.commerce_gateway:app --host 0.0.0.0 --port 8486
```

Launch the native unified renderer with both gates enabled:

```powershell
pnpm --filter @yaatal/os-shell tauri dev --features unified-ui
```

Do not run `cargo clean`, delete target caches, hard-reset the worktree, force-push
or expose Studio's operator routes to the LAN.

## Other documents

`docs/BOARD.md` and parts of the execution plan contain checkpoint language from
September 11 and may be stale. This recovery handoff supersedes their status
claims. The original cross-worktree handoff is:

`C:\Users\momo-\.codex\worktrees\e5da\Yaatal-Engine\output\SYMPHONY-UNIFIED-UI-HANDOFF.md`

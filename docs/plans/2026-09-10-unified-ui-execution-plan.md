# Unified UI execution plan

Date: 10 September 2026
Status: React foundation reviewed and committed at c1268a1; native gateway in progress; unified commerce acceptance has not started
Repository: Yaatal-labs/Yaatal-OS
Branch: yaatal/unified-ui-poc
Reviewed HEAD: 68044e440952b9442c38d539763542946dbdad19
Base: 5587306f9dba9e5a047a359b431676632af1679b

This execution supplement follows [UIR-01](../scopes/UIR-01-UNIFIED-TYPESCRIPT-UI.md) and the [approved UI contract](../design/YAATAL-OS-UI-CONTRACT.md). The user selected React + shadcn/ui on 10 September. That decision supersedes the plain TypeScript component examples in UIR-01; it preserves Vite, Tauri 2, native session ownership, and the approved visual direction. This document tracks the agreed implementation sequence; completed checkpoints are recorded under docs/evidence.

## Outcome and scope

One desktop window, one login, one navigation model, one theme, and one selected Engine product across SELL and SHOP.

Acceptance flow: sign in → start/recover Studio → go live → select the Engine product Robe Wax Bleue at 12,500 FCFA → open the same product in SHOP → create an intent → open the public Commerce Sheet on a phone → choose an available variant, quantity, and provider → receive sandbox_paid → show exactly one attributed SELL conversion → stop → log out.

Confirm the canonical product's current ID, price, availability, and variant source during preflight. Never hardcode or fabricate catalog truth to make this scenario pass. Record a missing prerequisite as blocked evidence.

Keep Engine, Harness, Studio commerce logic, the public Commerce Sheet, and PI-SPI contracts as their current authorities. No desktop cart, signup, orders, scanner, OBS redesign, model integration, production payment work, or mobile packaging. Authenticated voice stays UIR-05B after commerce acceptance. Reference-image microphone, viewer-count, delivery, and assistant content are not promises of available functionality.

## Reuse inventory: extend existing work

The earlier implementation is the starting point. The board records prior passing gates and catalog/commerce evidence; those are historical results, not fresh green evidence at this planning step. Revalidate the relevant behavior before porting it, and keep its tests. A task may add code only for a documented gap or an unavoidable renderer adaptation.

| Existing source | Keep or adapt | New work only |
|---|---|---|
| apps/desktop/src/main.ts and main.test.ts | Existing one-login flow, route synchronization, preference keys, lifecycle/race and logout test scenarios. Extract pure behavior when useful; preserve working legacy entry. | React rendering and native-cookie integration. Frame grant delivery remains legacy-specific; port its race protections to Rust instead of copying nonce handling into React. Exclude os_studio_bootstrap_grant from the unified native command registry. |
| apps/desktop/src/style.css and docs/design/* | Approved colors, type choices, density, rail widths, reduced-motion and focus behavior; reuse reference assets. | Map tokens into shadcn; fix only measured contrast/layout failures. No new visual identity. |
| apps/desktop/src/sell.ts and sell.test.ts | nextSellPhase, readiness cases, retry semantics and sidecar command contracts. | React presentation plus direct typed Studio API calls in place of the cockpit iframe. |
| packages/os-protocol/src/index.ts and tests/protocol.test.ts | Existing version, product-navigation, refresh and sidecar sanitizers. Import these into new code; do not create competing copies. | Extend missing gateway/event DTOs with compatibility tests. App view models live in the desktop adapter. |
| apps/desktop/src-tauri/src/main.rs and session.rs | Existing Engine login/session state, grant validation, bounded HTTP conventions, sidecar ownership/lifecycle and navigation emission. | Native Studio nonce redemption/cookie storage, fixed API operations, live snapshot and new transport/event adapters where absent. No second session broker or supervisor. |
| apps/shop/packages/core/src/services/catalog.service.engine.ts and bobo-app/src/services/__tests__/engine.dto.test.ts | Established category aliases, whole-FCFA semantics, real-media precedence, image fallback and alt-text mapping. | Extract pure reusable mapping if imports are coupled to mobile auth/analytics; have both consumers use it. Never import the entire BOBO client or copy fabricated seller/profile defaults into desktop. |
| apps/shop/bobo-app/src/components/ProductCard.tsx and screens/customer/ProductDetailScreen.tsx | Product fields, media behavior, empty/stock decisions and existing usability patterns. | DOM/shadcn rendering where React Native primitives prevent direct reuse. Preserve BOBO mobile components. |
| apps/studio/live/studio_server.py, commerce_poc.py and existing commerce/auth tests | Working live, intent, public Sheet, checkout, attribution and replay behavior. Reuse endpoints and existing acceptance scenarios. | Desktop typed client and new native-to-public integration coverage; fix a service only for a demonstrated contract gap. |
| scripts/build-shop.mjs and Studio dashboard/img WebPs | Existing media assets and rollback export pipeline. | A small shared asset manifest/extraction if unified packaging needs it. Remove only the desktop export step after acceptance, not the source media. |

Before a card starts, record its reused functions/tests and precise missing delta in its handoff. Do not reset completed OSR/UXR work to unimplemented. Existing HTTP commerce acceptance is retained; UIR-06 adds the missing unified native/phone evidence.

## Stack and architecture

- Vite with React and TypeScript in the existing desktop package; no Next.js or separate application scaffold.
- Tailwind with its Vite integration; shadcn/ui components copied into the app and styled with Yaatal tokens. Pin compatible versions in the existing pnpm lockfile when implementing; do not copy old version numbers from skill examples.
- Use the Radix-based shadcn component option consistently. Add only Button, Input, Label, Dialog, AlertDialog, Sheet, Select, Tabs, Badge, Separator, Skeleton, Tooltip, and a status/toast primitive when needed.
- React context plus a reducer is enough for shell/session/selection state initially. Keep request status, cancellation, and adapters explicit. No extra global state framework unless an implementation need emerges.
- Reuse existing runtime sanitizers in @yaatal/os-protocol and extend them for unknown IPC/event data; TypeScript interfaces alone are insufficient. Normalize snake_case and whole-FCFA price aliases in adapters exactly once.
- Rust owns Engine credentials, Studio bootstrap and cookies, fixed-origin HTTP, sanitized events, and bounded external checkout launch.
- Native typed catalog reads use the same Engine configuration as login. This avoids introducing renderer endpoint configuration or relying on cross-origin browser access.

Proposed destination layout, rooted at apps/desktop. Create only modules justified by the reuse audit; extract from existing files before adding equivalent helpers:

~~~text
src/unified/
  main.tsx
  app/{App,Shell,SessionProvider,AppState,router}.tsx
  components/ui/...
  lib/{contracts,validation,native,catalog,studio,events}.ts
  features/sell/{SellCockpit,LiveControls,ProductQueue,ConversionFeed}.tsx
  features/shop/{ShopHome,CatalogGrid,ProductDetail}.tsx
  features/commerce/{ShareDialog,CommerceLauncher}.tsx
  styles/{tokens,theme,layout}.css
  tests/...
src-tauri/src/{studio,catalog,studio_events,commerce}.rs
~~~

File extensions may follow whether JSX is needed. Extract the legacy entry and its exported pure helpers without losing existing test imports; src/main.ts becomes a minimal renderer selector. Dynamically load src/unified/main.tsx only for VITE_YAATAL_UNIFIED_UI=1; load the legacy entry otherwise. Isolate legacy styles and Tailwind preflight so neither renderer changes the other's layout. Preserve the original launch/build path through UIR-06. Add a native Cargo feature, unified-ui, that excludes the legacy os_studio_bootstrap_grant command from the unified command registry. The Vite flag alone is not an IPC security boundary. Expose a sanitized native renderer-mode field and fail visibly on a renderer/native mode mismatch.

## UI design contract

Retain the approved cream/forest/bronze palette and self-hosted Source Sans 3 with Newsreader for selected headings and product names. Use existing reference images for composition, not product names, metrics, provider lists, prices, or capabilities.

| Element | Planned behavior |
|---|---|
| Shell | 64 px top bar; 224 px expanded and 72 px collapsed rail. One route model drives rail selection and SELL/SHOP switch. Account, theme, and locale belong to shell. Show only implemented destinations. |
| SELL | Single heading/action row; explicit Studio-local live status, timer from server snapshot, start/stop action. Main region holds selected product and queue; secondary region holds conversions and concise readiness feedback. No empty assistant column. |
| SHOP catalog | Search and category controls, product grid with merchant images first, name, FCFA price and stock. Search filters loaded results and states that scope; paginate/load more explicitly. Do not imply an unimplemented server text-search endpoint. |
| SHOP detail | Product media, current price/stock, available authoritative variants, Return to Live, and Open checkout when a valid intent exists. Creating an intent stays an authenticated seller action. Provider and payment choices stay on the public Commerce Sheet. |
| Sharing | Product summary plus Copy, livestream, Telegram, WhatsApp links; copy/open success and failure feedback. Link generation is separate from publication. No messages are sent automatically. |
| Conversions | Receipt-derived order, product, total, provider, sandbox label, source and live-session attribution. Session filter survives stopping the stream; no duplicate cards on reconnect. |
| Readiness | Show starting, ready, degraded, offline, and retry states. Readiness does not imply the seller is live. Missing operator auth explains which action unlocks SELL. |

At 1280×800, SELL uses two useful columns and SHOP detail uses media plus information/actions. At 900×600, collapse the rail, allow body scrolling, and move secondary SELL content below primary controls. At 390×844, SHOP uses one column, a compact shell menu and reachable actions; the Commerce Sheet remains its own public page. The production native window currently has a 900 px minimum width: validate 390 px SHOP layout in a browser harness, and checkout on an actual phone.

Map shadcn semantic tokens to approved colors. Do not accept defaults as the final brand. Verify every foreground/background combination, particularly bronze and live-status colors. Minimum normal-text contrast 4.5:1; visible focus; labeled controls; minimum 44 px targets; body text at least 16 px on mobile. Dialogs trap focus and return focus to their trigger. Status/error announcements use appropriate live regions. Respect reduced motion, avoid layout shifts, and keep transitions around 150–200 ms.

Preserve shell language preference across routes, keep all new copy in one FR/EN message catalog, and update document language. Theme follows system until explicitly overridden; persistence is limited to non-sensitive preferences. Missing media uses the existing labeled Demo visual policy with descriptive alt text, never a pretend merchant photo.

The UI/UX Pro Max search helper is unavailable in this installation (scripts is an unresolved path placeholder). This plan uses its readable accessibility guidance and the repository's approved design contract; no generated design-system search result is claimed.

## Contract decisions before feature work

1. Preserve variants as bounded validated string choices, matching Studio's existing variants/options parser (up to 12 choices, maximum 48 characters). Record provenance. The inspected Engine catalog mapping does not expose these fields: verify the deployed contract and identify the authoritative source before variant acceptance. Do not invent options in React. If a backend contract change is required, track it as a separate dependency with its owner and tests; UI work can continue, but variant acceptance cannot pass.
2. Add studio_session_state for authenticated GET /api/studio/session-state. Fetch on bootstrap, renderer restoration and event reconnect. Retain the session ID after stop for historical conversion filtering.
3. Freeze sanitized OsSession, CatalogPage, CatalogProduct, StudioReadiness, StudioSessionState, CommerceIntent, CommerceReceipt, StudioEvent and bounded error DTOs. Include explicit protocol versions for events/receipts and optionality for unavailable fields.
4. Add typed catalog_list and catalog_product commands (bounded page/category/merchant filters and validated ID only). Product navigation preserves identity; SHOP resolves current detail. Abort or discard stale responses when selection, account, or session changes.
5. Add typed intent creation and open-commerce commands. The renderer supplies a validated product ID and allowed channel; native resolves current product data and serializes the fixed Studio request. Native opening resolves a retained validated intent reference, not an arbitrary renderer URL.
6. Treat public events as invalidation signals. Refetch authoritative receipts because conversion events do not contain the full receipt contract. Deduplicate the feed by order ID. Checkout replay may return deduplicated=true while the stored original conversion remains false; show actual fields, not a fabricated replay flag.
7. Reuse Studio /api/os/status and /api/os/events projections and redaction rules from os_contract.py for governed/readiness data. Add only the missing native public WebSocket transport and commerce event projection. Reuse the supervisor's validated configuration; invalidate the native Studio cookie session after sidecar restart.
8. Scope a phone-accessible public gateway to Commerce Sheet, required public assets, and checkout paths only. Keep Studio bound to loopback; do not expose operator, voice, health/debug, or bootstrap routes to make phone access work.

## Work packages and ownership

All package paths below are repository-relative. Shared-file ownership is exclusive. The integration owner controls package manifests, lockfile, Vite/TypeScript/test configuration, renderer entrypoint, shared lib/components/styles, packages/os-protocol, any pure catalog/media extraction shared with BOBO, and docs.

| Card | Owner and files | Depends on | Exit gate |
|---|---|---|---|
| UIR-00A: reuse baseline and frozen contracts | Integration: docs/scopes/UIR-01-*, docs/BOARD.md, docs/PROVENANCE.md, new shared contracts/validation | Existing UIR-00 | Reuse inventory and retained tests frozen; EN/FR scope updated for React; canonical product/variants/API provenance recorded; existing protocol extended only where missing; baseline checks recorded honestly. |
| UIR-02A: adapt shell to React and shadcn | Integration: package manifests/lockfile, desktop Vite/TS config, components.json, src/main.ts, src/unified main/app/components/styles, test harness | UIR-00A | React harness and renderer selection have no style leakage; live native use waits for UIR-02B; legacy remains runnable; primitives, both themes, route shell and state examples render. |
| UIR-01A: native operator gateway | Native owner: src-tauri/src/main.rs, session.rs, studio.rs; Cargo manifests/lock and native tests | UIR-00A | Add the native unified-ui feature and sanitized mode field; exclude the legacy grant command in unified builds; extend existing session broker/supervisor; Rust redeems nonce and retains cookie; typed status, snapshot, queue, live, stop, intent, conversion commands; logout and in-flight auth races pass. |
| UIR-01B: native catalog, events and launch | Same native owner: catalog.rs, studio_events.rs, commerce.rs and command registration | UIR-01A | Typed catalog pagination/detail; one sanitized public socket with bounded reconnect; controlled checkout opening; focused native tests pass. |
| UIR-02B: connected shared shell | Integration: src/unified/app and lib adapters; shell tests | UIR-02A, UIR-01B | Paired native/renderer modes and mismatch rejection pass; unified registry excludes legacy grant command; existing login/navigation/preference behavior retained in React; extend with native Studio restoration and selection/readiness; no renderer credentials. |
| UIR-03: SELL cockpit | SELL owner: src/unified/features/sell/** and colocated tests only | UIR-02B | Arm/stop with pending/error states; recover live timer; queue selection, Open in SHOP, session-filtered conversions; share callback reaches shared dialog. |
| UIR-04: SHOP | SHOP owner: src/unified/features/shop/** and colocated tests only | UIR-02B | Catalog pagination, honest search, detail, missing/deleted/out-of-stock states; shared selected ID; responsive layout and Return to Live. |
| UIR-05: commerce integration | Integration: features/commerce/**, shared events adapter, integration tests; native changes return to native owner | UIR-03, UIR-04 | All share channels, public sheet launch, receipt and conversion resync; replay gives one conversion; physical-phone route verified. |
| UIR-06: acceptance | Review owner: acceptance tests and docs/evidence only | UIR-05 and resolved variant dependency | Real native commerce scenario plus phone checkout, keyboard/contrast/responsive evidence, focused gates and rollback comparison pass. |
| UIR-07: cleanup | Integration: legacy renderer/adapters, scripts/build-shop.mjs, desktop generated-asset plumbing and affected config | UIR-06 | Record named rollback tag first; retire desktop iframe/export paths, make unified default, re-run affected gates and smoke test. Preserve BOBO mobile sources. |

Native subcards run sequentially because they share command registration and Cargo configuration. SELL and SHOP are independent after contracts and adapters pass, but use one implementation subagent at a time under the requested Subagent-Driven Development workflow. Independent read-only review/research may run alongside useful work.

For each execution card: provide a fresh implementer with complete task text and exclusive write set; require them to preserve others' edits; inspect the resulting diff and tests; run spec review, fix findings, then code-quality review and fixes. Mark the card complete only after both reviews pass. Stage shared manifests only through their owner. Create focused commits with gate evidence during implementation; implementation commits are recorded after review.

## Verification strategy

| Layer | Meaningful checks |
|---|---|
| Adapters | Price units/invalid numeric values; catalog page metadata; validated identifiers; images and Demo visual provenance; preserved variants; malformed/unknown data; stale product responses. |
| Rust auth and gateway | Valid/expired/replayed grants; native cookie reuse; wrong host and redirect rejection; bounded errors; Studio unavailable during logout; account switch/in-flight bootstrap cannot restore an old session; unified command registry rejects the legacy grant command and renderer/native mode mismatches. |
| Native events/opening | Drop unknown/oversized/speech-bearing payloads; project only allowed fields; reconnect/resnapshot; single listener lifecycle; reject unknown intents, destinations, schemes and channels. |
| React behavior | Login pending/failure; route and rail agreement; live state across workspace/theme changes; focus restoration; keyboard dialogs; loading, empty, locked, offline and retry; stopped-session insights and duplicate receipt events. |
| Commerce | Server-authoritative price/stock; variant prerequisite; source/live-session attribution; double submission and idempotent replay produce one order/conversion and no second stock decrement; disconnect during checkout then recover. |
| Visual | SELL/SHOP light and dark at 1280×800 and 900×600; SHOP and public Sheet at 390×844; no overflow or obscured controls; keyboard, reduced motion and measured contrast. |
| Runtime | Browser tests use a clearly labeled mock native adapter only for deterministic UI checks. Real Tauri login/gateway/commerce acceptance is separate and mandatory. Validate a packaged native launch as well as tauri dev. |

Extend Vitest discovery to .test.tsx and add a DOM environment plus React Testing Library for component behavior; preserve current Node-only tests and port existing regression scenarios instead of recreating parallel suites. Add browser interaction checks where they exercise real behavior. Record screenshots, commands, exact tested commit, source-service revisions, runtime origin, and pass/fail/blocked result under docs/evidence/UIR-06. Do not capture credentials, grants, cookies, speech or transcripts.

Run the existing repository gates at baseline and acceptance:

~~~powershell
pnpm build
pnpm check
pnpm test
Push-Location apps/desktop/src-tauri
cargo fmt --check
cargo check
cargo test
cargo clippy -- -D warnings
# After adding the unified-ui native feature, also verify its distinct command registry:
cargo check --features unified-ui
cargo test --features unified-ui
cargo clippy --features unified-ui -- -D warnings
Pop-Location
~~~

Also run focused Studio tests if Studio/public-sheet code changes. Run native package build and smoke checks appropriate to affected Tauri packaging. A OneDrive EPERM is blocked environment evidence, not a passing or failing source test. If it recurs, use a verified non-synced checkout and dependency/build paths; do not clean caches or destroy existing worktrees.

## Execution runbook corrections

The following is the intended unified development command after UIR-02B passes; it does not enable a unified implementation at the reviewed docs-only commit.

~~~powershell
Set-Location C:/Users/momo-/OneDrive/Desktop/YAATAL/Yaatal-Engine/.worktrees/Yaatal-OS/unified-ui-poc
pnpm install --frozen-lockfile
$env:VITE_YAATAL_UNIFIED_UI = "1"
$env:ENGINE_API_URL = "http://localhost:5150"
$env:STUDIO_COOKIE_SECURE = "0"
$env:YAATAL_COMMERCE_POC = "1"
$env:YAATAL_OS_STUDIO_DIR = (Resolve-Path apps/studio).Path
$env:YAATAL_OS_STUDIO_PORT = "8485"
$env:YAATAL_COMMERCE_PUBLIC_BASE_URL = "http://127.0.0.1:8485"
pnpm --filter @yaatal/os-shell tauri dev --features unified-ui --no-watch
~~~

Loopback public-base configuration supports desktop-local checking only. For physical-phone acceptance, substitute the verified public gateway base before starting the sidecar, record the routing configuration, and verify the URL on the phone. A reused healthy sidecar may carry old code/configuration: verify its provenance and effective settings before acceptance. Never kill an unowned process to force adoption.

To compare the legacy path, remove VITE_YAATAL_UNIFIED_UI from the development environment and run Tauri without --features unified-ui. Restart the native app as well as the renderer; a renderer-only toggle is insufficient. Preserve the existing Expo build/copy pipeline through UIR-06. Credential material never belongs in Vite variables, source, screenshots or logs.

## Completion and handoff

The first implementable milestone is UIR-00A → UIR-02A → UIR-01A/B → UIR-02B: a branded shared shell connected to native auth, catalog and restored Studio state. Then implement SELL → SHOP → commerce → acceptance → cleanup.

UIR-05B voice and other deferred features stay outside this critical path. Report any canonical-data or phone-routing dependency explicitly instead of passing acceptance with fixtures. The lane is complete only when the real native/phone demo and recorded gates pass, both themes are usable, and the pre-cleanup iframe build has a named rollback point.

Planning sources: reviewed local branch at 68044e4; UIR-01 runbook; approved UI contract and reference images; desktop main/session/configuration; Studio session-state and commerce implementation; current Engine catalog source inspected for contract gaps. Recheck service revisions at execution. Official references: [shadcn Vite setup](https://ui.shadcn.com/docs/installation/vite) and [Tauri CLI feature flags](https://v2.tauri.app/reference/cli/).

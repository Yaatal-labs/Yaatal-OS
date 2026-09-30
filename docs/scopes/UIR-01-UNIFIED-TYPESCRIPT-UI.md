# Unified TypeScript UI build

[Français](./UIR-01-UNIFIED-TYPESCRIPT-UI.fr.md)

| | |
|---|---|
| Status | React foundation reviewed; native integration in progress |
| Date | 10 September 2026 |
| Repo | `Yaatal-OS` |
| Branch | `yaatal/unified-ui-poc` |
| Base | `5587306f9dba9e5a047a359b431676632af1679b` |
| Parallel lane | `yaatal/poc-demo-closure`, left untouched |

## Goal

Build one Vite React + TypeScript frontend with Tailwind and shadcn/ui inside the existing Tauri 2 window. SELL and SHOP become two workspaces in the same application, with one login, one navigation model, one theme, and one product state.

This is a UI consolidation. Engine, Harness, Studio, BOBO services, PI-SPI, and the public Commerce Sheet remain the system of record. The branch may run beside the current iframe POC until the new UI passes the full acceptance flow.

## Outcome

```text
one Tauri window
  ├─ SELL: live cockpit, product selection, share links, conversions
  └─ SHOP: catalog, search, product detail, Commerce Sheet launch
           │
           ├─ native session and Studio gateway
           ├─ Studio sidecar on loopback
           ├─ Engine catalog and identity
           ├─ Harness-governed actions
           └─ public Commerce Sheet and sandbox PI-SPI receipt
```

The critical demo remains:

```text
OS login
  → SELL goes live
  → seller selects Robe Wax Bleue at 12,500 FCFA
  → SHOP shows the same product
  → SELL creates a CommerceIntent
  → buyer opens the public Commerce Sheet on the same phone
  → buyer selects variant, quantity, and provider
  → sandbox payment succeeds
  → receipt keeps livestream and source attribution
  → SELL shows the conversion
```

The existing HTTP POC has already proven this commerce flow. The native visual flow has not yet passed end to end.

## Design choice

Use React, TypeScript, Tailwind, and Radix-based shadcn/ui within the existing Vite/Tauri shell, as selected by the user on 10 September. Preserve the Expo web export for the legacy renderer until acceptance. The [execution supplement](../plans/2026-09-10-unified-ui-execution-plan.md) supersedes the plain TypeScript component examples below and records reuse, native feature gating, and review requirements.

HTMX may be useful later for the server-rendered public Commerce Sheet. It does not simplify the main Tauri UI, which needs native IPC, shared client state, WebSocket events, theme persistence, and responsive SELL and SHOP workspaces. Alpine is not required.

## Keep and replace

| Keep | Replace after acceptance |
|---|---|
| One Tauri 2 `main` window | SELL Studio iframe |
| Rust session broker and in-memory Engine JWT | SHOP BOBO Expo iframe/export |
| Supervised Python Studio sidecar | `postMessage` product routing between frames |
| Engine catalog and product identity | CSS injection and `os-skin` overrides |
| Harness policy and governed tool execution | Duplicated navigation inside embedded apps |
| Studio commerce POC routes and public Commerce Sheet | Generated `/public/shop` asset copy pipeline |
| PI-SPI sandbox contract and receipts | Separate SELL and SHOP theme/state lifecycles |
| BOBO mobile product patterns and future app | BOBO-shaped desktop presentation |

Do not delete the old paths before UIR-06 passes. They remain the rollback and comparison surface.

## The required auth seam

A direct renderer cannot safely call the authenticated Studio API with the current contract. The renderer uses the Tauri origin. Studio uses `http://127.0.0.1:8484` and issues an HttpOnly, SameSite Strict operator cookie. The current iframe succeeds because it performs bootstrap and API calls on Studio's own origin.

The unified UI therefore adds a narrow native Studio gateway:

1. Rust keeps the Engine JWT in memory.
2. Rust asks Engine for the short-lived, single-use Studio nonce.
3. Rust redeems the nonce against the loopback Studio endpoint.
4. Rust keeps the Studio cookie in its own HTTP client.
5. TypeScript invokes allowlisted commands and receives sanitized responses.
6. Logout revokes the Studio session and clears the Engine session even if Studio cleanup fails.

This is integration plumbing. It does not move business logic into Tauri and it is not an arbitrary HTTP proxy.

### Native gateway surface

The final names may follow Rust conventions, but the capability must remain typed and allowlisted:

| Command or event | Purpose | Renderer receives |
|---|---|---|
| `os_login` | Authenticate with Engine | sanitized session only |
| `os_logout` | Revoke Studio and Engine sessions | logged-out session |
| `os_session_status` | Restore shell state | authenticated, merchant name, verified |
| `studio_session_bootstrap` | Redeem a native Studio grant | authenticated boolean |
| `studio_status` | Read sidecar readiness | bounded readiness fields |
| `studio_product_queue` | Read normalized products | catalog-safe product fields |
| `studio_go_live` | Arm a Studio-local live session | session ID and status |
| `studio_stop_stream` | Stop the live session | status and duration |
| `studio_create_commerce_intent` | Create public share URLs | validated intent response |
| `studio_conversions` | Read attributed sandbox receipts | sanitized receipt list |
| `yaatal://studio-event` | Relay public Studio events | versioned, sanitized event |

There must be no command that accepts an arbitrary URL, header, method, or request body.

Authenticated voice uses a later typed native WebSocket bridge. Public `/ws` stays limited to sanitized events and must never carry speech, audio, or subtitles.

## Seam catalogue

| Seam | Contract | Auth and owner | UI use | Failure rule |
|---|---|---|---|---|
| Desktop login | `POST Engine /api/auth/login` | Native Rust owns JWT | one OS login | JWT never enters TypeScript, storage, URLs, logs, or events |
| Studio bootstrap | Engine `/api/auth/bootstrap/start`, then Studio `/api/studio/operator/bootstrap` | Native Rust owns nonce and cookie | unlock SELL | nonce is Studio-scoped, 43 characters, single-use, 1 to 90 seconds |
| Sidecar lifecycle | `start_sidecar`, `stop_sidecar`, `sidecar_status`; Studio `GET /health` | Tauri owns child process | readiness and retry | loopback only; adopt healthy process; kill owned child only |
| Studio readiness | `GET /api/status` | Studio through native gateway | detailed diagnostics | bounded timeout; visible degraded state |
| Catalog queue | `GET /api/studio/product-queue` | Studio proxies Engine context | SELL selection | show source and unavailable state; mock only in explicit demo mode |
| Public catalog | Engine `GET /api/catalog` and product detail | Engine read contract | SHOP browse/detail | merchant media first; labeled demo visual fallback |
| Live state | Studio `POST /api/studio/go-live`, `POST /api/studio/stop-stream` | Studio operator cookie held native | SELL arm/stop/timer | current session is Studio-local and process-memory |
| Commerce intent | Studio `POST /api/studio/poc/commerce-intents` | authenticated, `YAATAL_COMMERCE_POC=1`, live required | share dialog | validate product ID, stock, whole-FCFA price, and safe public media URL |
| Product handoff | `yaatal://product-navigation` with `yaatal-os.v1` | native validation | SELL selection opens SHOP detail | ID matches `[A-Za-z0-9][A-Za-z0-9_-]{0,127}`; source is `studio` |
| Public Commerce Sheet | `GET /b/{token}?src={channel}` | public opaque token | same-phone buyer checkout | no-store and CSP; never expose operator credentials |
| Sandbox checkout | `POST /b/{token}/checkout` | public opaque token | provider, variant, quantity | explicit `sandbox_paid`; idempotency key required |
| Conversions | `GET /api/studio/poc/conversions` | Studio operator session | SELL Insights | filter by live session; display source and deduplication state |
| Studio events | Studio public `WS /ws` | sanitized public channel | connection, conversion, governed-action updates | reconnect with backoff; no raw speech |
| Voice | Studio authenticated `WS /api/studio/voice` | native typed bridge | future push-to-talk/full-duplex client | separate card; no public WS fallback |
| Governed mutation | Studio to Harness to Engine | server-side identities | seller actions | renderer never calls mutation endpoints directly |

## Shared data contracts

TypeScript must define one normalized type per boundary and validate external data before rendering it.

```ts
type OsSession = {
  authenticated: boolean;
  merchantName?: string;
  verified?: boolean;
};

type CatalogProduct = {
  id: string;
  name: string;
  description?: string;
  priceFcfa: number;
  priceDisplay: string;
  stock: number;
  stockStatus: string;
  category?: string;
  images: string[];
  imageAlt: string;
  demoVisual: boolean;
};

type CommerceReceipt = {
  version: "yaatal.commerce-receipt.v1";
  orderId: string;
  productId: string;
  totalFcfa: number;
  paymentProvider: string;
  paymentStatus: "sandbox_paid";
  liveSessionId: string;
  sourceChannel: string;
  deduplicated: boolean;
};
```

The backend currently names some whole-FCFA fields `price_cents`. The adapter must normalize them once. UI components must not guess units.

## Proposed frontend layout

```text
apps/desktop/src/
  app/
    app.ts
    router.ts
    session.ts
    state.ts
  lib/
    native.ts
    studio.ts
    catalog.ts
    contracts.ts
    validation.ts
  features/
    sell/
      SellCockpit.ts
      LiveControls.ts
      ProductQueue.ts
      SharePanel.ts
      ConversionFeed.ts
      sell.css
    shop/
      ShopHome.ts
      CatalogGrid.ts
      ProductDetail.ts
      shop.css
    commerce/
      CommerceLauncher.ts
      commerce.css
  styles/
    tokens.css
    shell.css
    themes.css
  tests/
```

The code may be introduced incrementally under `src/unified/` while the old renderer remains available behind `VITE_YAATAL_UNIFIED_UI=1`. The flag is a renderer-safe boolean. It carries no endpoint or credential.

## Symphony board

| Card | Track | Owner and exclusive write set | Depends on | Exit gate |
|---|---|---|---|---|
| UIR-00 | R, contract | `docs/scopes/UIR-01-*`, Board, provenance | none | bilingual plan committed on isolated branch |
| UIR-01 | A, native | `apps/desktop/src-tauri/src/main.rs`, `session.rs`, native tests | UIR-00 | typed Studio gateway passes auth, replay, logout, and sanitization tests |
| UIR-02 | B, shell | new `src/app/**`, `src/lib/contracts.ts`, shared styles and shell tests | UIR-00 | one login, one rail, SELL/SHOP routing, themes, empty/error states |
| UIR-03 | C, SELL | new `src/features/sell/**` and SELL tests | UIR-01, shared contracts from UIR-02 | live arm/stop, catalog selection, share links, conversions work without iframe |
| UIR-04 | D, SHOP | new `src/features/shop/**` and SHOP tests | shared contracts from UIR-02 | catalog and detail are responsive and use the same selected product |
| UIR-05 | I, commerce | new `src/features/commerce/**`, event adapter and integration tests | UIR-01, UIR-03, UIR-04 | intent, sheet launch, receipt, and conversion close the loop |
| UIR-05B | I, voice | native typed voice bridge and voice UI files only | UIR-01 | authenticated audio path works; no audio on public `/ws` |
| UIR-06 | R, acceptance | acceptance tests and evidence only | UIR-05 | full native visual flow passes at desktop and narrow widths |
| UIR-07 | S, cleanup | old iframe adapters, Expo export pipeline, generated Shop output | UIR-06 | old UI removed, fallback tag recorded, focused gates green |

The integration owner owns shared files. SELL and SHOP agents do not edit `main.ts`, native Rust, or each other's folders. UIR-01 and UIR-02 can start together. UIR-03 and UIR-04 can then run in parallel. UIR-07 always runs last.

## Checkpoints

1. Scope: branch and base recorded; old POC worktree unchanged.
2. Contract: shared types frozen; native command names and sanitized responses reviewed.
3. Auth: Engine JWT and Studio cookie stay native; login, replay rejection, logout, and failure cleanup tested.
4. Feature: SELL and SHOP pass focused tests independently.
5. Integration: CommerceIntent to public sheet to receipt to conversion passes.
6. Visual: light and dark themes pass at 1280×800 and 900×600; SHOP and Commerce Sheet pass at 390×844.
7. Ship: old frame path removed only after acceptance; commit and branch published with exact gate evidence.

## Acceptance cases

### Functional

- Login once and move between SELL and SHOP without another login.
- Start or retry the Studio sidecar and see a useful readiness state.
- Go live, select the canonical product, and open the same product in SHOP.
- Create copy, livestream, Telegram, and WhatsApp share links.
- Open the public Commerce Sheet without operator auth.
- Select a provider, variant, and quantity, then receive an explicit sandbox receipt.
- Preserve `live_session_id` and `source_channel` through the receipt.
- Show one conversion in SELL Insights and handle an idempotent checkout replay.
- Stop the stream and log out cleanly.

### UX

- One global navigation rail. Feature pages do not render a second app navigation.
- BOBO presentation feels native to desktop while retaining a responsive buyer layout.
- Missing images show a labeled `Demo visual`, never a fabricated merchant photo.
- Loading, empty, locked, degraded, offline, and retry states are visible.
- Both themes meet contrast and focus requirements.
- Keyboard navigation and reduced-motion preferences work.

### Security and privacy

- No Engine JWT, Studio cookie, bootstrap nonce, control token, seller speech, or raw transcript appears in DOM snapshots, logs, storage, URLs, events, or test fixtures.
- Tauri capabilities remain narrow. No shell or filesystem permission is added.
- Studio binds loopback and the gateway rejects non-loopback targets.
- The public event socket contains no speech or audio.
- The sandbox label is visible at the payment decision and receipt.

## Local runbook

Prerequisites: Engine dependencies and migrations are running, Python can import Studio, and Node, Rust, and Tauri prerequisites are installed.

```powershell
cd C:\Users\momo-\OneDrive\Desktop\YAATAL\Yaatal-Engine\.worktrees\Yaatal-OS\unified-ui-poc
pnpm install --frozen-lockfile
$env:ENGINE_API_URL = "http://127.0.0.1:5150"
$env:STUDIO_COOKIE_SECURE = "0"
$env:YAATAL_COMMERCE_POC = "1"
$env:YAATAL_COMMERCE_PUBLIC_BASE_URL = "http://127.0.0.1:8484"
pnpm --filter @yaatal/os-shell tauri dev --no-watch
```

`STUDIO_COOKIE_SECURE=0` is local development only. Do not put credentials or disposable tokens in the repo, Vite env, command history, or this document.

### Gates

```powershell
pnpm build
pnpm check
pnpm test
cd apps\desktop\src-tauri
cargo fmt --check
cargo check
cargo test
cargo clippy -- -D warnings
```

On this worktree, the first baseline `pnpm test` attempt was blocked by a Windows/OneDrive `EPERM` while Node opened `vitest.mjs`. That is an environment failure, not green or red source-test evidence. Use an external pnpm store/target path or a non-synced clone before recording the baseline gate.

## Cutover and rollback

1. Build new modules behind `VITE_YAATAL_UNIFIED_UI=1`.
2. Keep the old SELL and SHOP iframe adapters intact through UIR-06.
3. Rebase or cherry-pick accepted POC source commits. Do not copy generated Expo bundles or service-worker artifacts.
4. Run the same commerce flow against both renderers and compare receipts.
5. Tag the last known iframe build.
6. Remove the old adapters and export pipeline in UIR-07.
7. Keep BOBO as the mobile buyer product. The desktop rewrite does not delete its repo or product roadmap.

## Known gaps after this build

- CommerceIntent, checkout, and conversion storage remain process-memory sandbox implementations.
- Studio live state does not yet create or end an Engine live session.
- Native Telegram and WhatsApp publication remains later work; the POC generates usable share links.
- Full BOBO signup, profile, cart, orders, scanner, merchant tools, and offline sync are outside this desktop slice.
- Production PI-SPI settlement and webhook reconciliation are outside this POC.
- Tauri Android and iOS packaging, signing, and store distribution remain post-POC.
- Authenticated voice parity is UIR-05B and must not delay the commerce acceptance flow.
- Advanced OBS, MCP, readiness lab, and audit views remain in Studio and can be surfaced after the critical cockpit is stable.

## Definition of done

This lane is done when the unified renderer completes the critical demo without an iframe, duplicate navigation, renderer credential, or mock product identity; all focused gates have recorded evidence; the current POC still has a named rollback point; and the branch is reviewable independently of `yaatal/poc-demo-closure`.

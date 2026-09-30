# Yaatal OS real-surfaces execution handoff

Status: ready for implementation after review of this handoff
Prepared: 2026-09-02
Target repository: `Yaatal-labs/Yaatal-OS`
Starting point: PR #1, branch `yaatal/os-poc-bootstrap`, commit
`c5f9854232fe7953609b45bc331b8d42be3a1dc6`

## 1. Objective

Turn the validated Yaatal OS plumbing POC into a recognisable, testable product
surface without redesigning the Engine, Harness, Studio, or BOBO.

The intended desktop product has two top-level windows:

```text
Yaatal OS
├── Sell — merchant surface
│   ├── Live: Studio cockpit, OBS, product queue, governed agent assistance
│   └── Utility: listings, inventory, store setup, spoken analytics
└── Shop — buyer surface
    └── BOBO catalog, product detail, Commerce Sheet, order and receipt
```

The immediate POC is narrower than the full vision. It must make the existing
Studio and BOBO surfaces real inside the native host, connect one product handoff,
and preserve the already-proven Telegram checkout path.

## 2. Correction to the current desktop status

The native application at PR #1 is an architectural shell, not a finished
desktop product. Launching it proves that Tauri compiles and that the authority
boundary is enforceable; it does not prove usable Sell or Shop experiences.

Current behaviour:

- the `sell` window renders a small shell with sidecar status and start/stop
  controls;
- after the Studio sidecar is ready, Sell places the existing cockpit in an
  iframe;
- the `shop` window renders a configured URL, a product-ID field, and a refresh
  button;
- BOBO source exists under `apps/shop`, but its Expo web build is not bundled;
- the product-navigation command is currently callable by Shop and emits to
  Sell. That direction does not express the required Studio-to-Shop preview;
- no merchant utility pane exists;
- no production installer or signed distribution has been qualified.

Do not present this shell as the completed Yaatal desktop application.

## 3. What is already solid

The following work is validated and should be preserved:

1. Two Tauri windows named `sell` and `shop`.
2. Deny-by-default Rust command authorization by window label.
3. A supervised, loopback-only Python Studio sidecar.
4. Browser-safe `yaatal-os.v1` contracts that reject credentials, transcripts,
   raw audio, token-bearing URLs, and malformed product identifiers.
5. Studio operator authentication through an HttpOnly cookie.
6. The feature-gated social-commerce reference flow:

   ```text
   Studio product
     → opaque CommerceIntent
     → Telegram / WhatsApp / copy / livestream link
     → mobile Commerce Sheet
     → explicit sandbox payment
     → source- and livestream-attributed receipt
     → Studio conversion counter
   ```

7. Fresh checkpoint evidence at `c5f9854`:

   - Studio: 77 tests passed, 1 skipped;
   - shell and protocol: 5 tests passed;
   - TypeScript checks and Vite build passed;
   - Rust format, tests, and warning-denying Clippy passed;
   - native Tauri process launched;
   - real-browser sandbox checkout returned one conversion to Studio.

The CommerceIntent store and payment are process-local POC adapters. Engine is
still the intended production authority for catalog, inventory, orders,
payments, durable intents, and receipts.

## 4. Source-of-truth inventory

| Surface | Source to inspect | Revision | Use |
|---|---|---:|---|
| Yaatal OS integration | `Yaatal-labs/Yaatal-OS`, `yaatal/os-poc-bootstrap` | `c5f9854` | Implementation base |
| Studio executable seam | `Yaatal-labs/Yaatal-Studio`, `yaatal/studio-os-closure` | `074c5278` | Already imported under `apps/studio` |
| Studio Tauri direction | `Yaatal-labs/Yaatal-Studio`, `claude/up-to-hit-it-1dap1e` | `36209a73` | Architecture note only |
| BOBO integration head | `MouhamedN96/BOBO-`, `codex/bobo-engine-netlify-integration` | `735a90db` | Refresh candidate for `apps/shop` |
| BOBO imported snapshot | local provenance in PR #1 | `607b8eb0` | Current `apps/shop`; older than remote head |
| Merchant product specification | `MouhamedN96/yaatal-strategy`, `YAATAL-MERCHANT-STUDIO.md` | `7fc3d02c` | Product intent |
| Tauri donor, original | `MouhamedN96/Clip4Clicks`, `tauri/desktop` | `25fc7ba2` | Superseded scaffold |
| Tauri donor, continuation | `MouhamedN96/Clip4Clicks`, `yaatal/windows-desktop-alpha` | `43ebd8a1` | Pattern donor only |

Important repository state:

- Yaatal OS PR #1 is open and GitHub reports it mergeable and clean.
- The local BOBO checkout is dirty and behind its remote branch. Do not copy
  working-tree files from it. Fetch or export the pinned remote commit.
- The Clip4Clicks Windows alpha is 17 commits ahead and 35 commits behind its
  `main`; it has no PR or CI run. Commit messages report 34 Rust tests, but that
  is not remote CI evidence.

## 5. What the Studio branch actually says about Tauri

Yaatal-Studio contains no Tauri source. Its `claude/up-to-hit-it-1dap1e`
branch adds a planning note that identifies Clip4Clicks' Tauri scaffold as the
future V2 merchant surface.

The note fixes these product decisions:

- one merchant app, not a headless API console;
- a livestream pane for OBS, overlays, live QR/deep links, and agent assist;
- a utility/boutik pane for setup, inventory, and store management;
- one Tauri 2 codebase, with OBS functionality remaining desktop-only;
- voice is a primary input for the utility pane;
- `qwen-audio-agent` is only a candidate frontend runtime, configured with
  `AGENT_PROTOCOL=none` and `SPEECH_TO_SPEECH_REALTIME_URL` pointing to Yaatal's
  own speech service;
- DashScope must not be required for the sovereign path;
- the speech seam and key-free local path must be proven before adoption.

That plan concerns the merchant surface. BOBO remains the buyer surface and
belongs in the separate Shop window. The combined interpretation is therefore:

- top-level Sell window;
- Live and Utility modes inside Sell;
- top-level Shop window for BOBO.

## 6. Clip4Clicks forensic: adopt patterns, not product code

The latest donor branch is substantially more mature than its README and TODO
claim. It contains a working operator dashboard, SQLite state, review queues,
VPS synchronization, native notifications and file selection, API uploads, and
a Mobile-Use/ADB execution bridge.

### Adopt selectively

| Pattern | Why it is useful to Yaatal | Required adaptation |
|---|---|---|
| App-data SQLite initialization | Offline-first local outbox and resumable operations | Store only bounded OS state and sanitized receipts |
| Explicit state transitions | Prevent duplicate or invalid queued mutations | Use Yaatal intent/receipt states, not clip states |
| Native notifications | Notify operator of pending review, conversion, or reconnect | Least-privilege notification permission |
| Native file picker | Later product media and OCR import | Limit to explicit user selection and validated media |
| Background sync pattern | Retry after weak or missing connectivity | Stable idempotency key, bounded backoff, Engine reconciliation |
| Rust-owned large-file transfer | Avoid moving large media through the JS bridge | Later media lane only; not required for first POC |

### Do not port

- clip review, reroll, caption, rendering, ffmpeg, or yt-dlp workflows;
- Mobile-Use, ADB, phone-farm, or autonomous posting code;
- Clip4Clicks VPS routes or schema;
- updater, reseller, and white-label work;
- its single-window information architecture;
- `csp: null`;
- broad `fs:default`, `http:default`, `store:default`, or shell permissions;
- API keys stored in `settings.json` and returned to the renderer.

Yaatal should retain its existing narrow Rust commands and add privileges only
when a tested feature requires them. Credentials remain process-owned and must
never be serialized into either webview.

## 7. Target POC behaviour

### Sell window

1. Native host starts and supervises Studio automatically.
2. Startup shows a short branded readiness state, not a control-plane demo.
3. When ready, Studio becomes the full-window primary surface.
4. Sell exposes two visible modes:
   - Live now: existing Studio cockpit;
   - Utility preview: a small, honest placeholder describing listings,
     inventory, and spoken analytics. It must not imply those workflows work.
5. Sidecar recovery remains available from a small diagnostics panel.

### Shop window

1. Build BOBO from a pinned, clean source revision with:

   ```bash
   pnpm build
   # equivalent remote script:
   pnpm --filter bobo-app exec expo export -p web
   ```

2. Copy or build the static output into a deterministic Yaatal OS bundle path.
3. Load that bundled output inside the Shop webview; no localhost development
   URL in the packaged POC.
4. Configure Engine base URL through build/runtime configuration without
   embedding a JWT.
5. Preserve BOBO's mobile-first layout.

### Cross-window product handoff

The minimum event is a navigation hint, not a product snapshot:

```json
{
  "version": "yaatal-os.v1",
  "kind": "product-navigation",
  "productId": "robe_bazin_001",
  "source": "studio"
}
```

Rules:

- only Sell may request a Studio-originated product navigation;
- Rust validates the bounded identifier and emits only to Shop;
- Shop loads product truth from Engine or its existing offline cache;
- no price, stock, merchant identity, JWT, CommerceIntent token, transcript, or
  audio crosses the Tauri event;
- Shop should open/focus on the selected product and show an honest retry state
  when Engine is unavailable.

The public Commerce Sheet link remains separate. It is created by the
server-side CommerceIntent path and may be shared through Telegram or WhatsApp.

## 8. Execution cards and dependencies

### OSR-01 — Prepare clean implementation branch

Lane: Ready
Repository: `Yaatal-labs/Yaatal-OS`
Branch: create `yaatal/os-real-surfaces` from reviewed PR #1 head
Write set: Git metadata and provenance only

Actions:

1. Confirm PR #1 head and clean status.
2. Create the branch without touching the dirty Engine or BOBO checkouts.
3. Fetch BOBO remote commit `735a90db` directly.
4. Compare imported `607b8eb0` to `735a90db`; refresh `apps/shop` through an
   auditable import commit.
5. Update `docs/PROVENANCE.md` before changing UI code.

Done when the branch is clean, provenance is exact, and the imported Shop source
matches the selected revision.

### OSR-02 — Replace Sell shell with real Studio surface

Lane: Ready after OSR-01
Write set: `apps/desktop/src/**`, Studio lifecycle code under
`apps/desktop/src-tauri/**`

Actions:

1. Start Studio during native application setup or first Sell readiness.
2. Replace the large shell cards with full-window Studio after readiness.
3. Keep diagnostics and explicit restart available but visually secondary.
4. Add Live/Utility mode navigation; Utility is clearly marked preview-only.
5. Preserve HttpOnly operator authentication and loopback-only sidecar binding.

Done when a fresh launch reaches the actual Studio cockpit without the operator
having to understand sidecars, and failures produce a recoverable state.

### OSR-03 — Bundle BOBO into Shop

Lane: Ready after OSR-01; parallel with OSR-02
Write set: `apps/shop/**`, build scripts, Shop loading code

Actions:

1. Prove clean BOBO install, type-check, tests, and web export separately.
2. Record existing failures instead of weakening gates.
3. Add a deterministic OS build task that places `bobo-app/dist` in the Tauri
   frontend/bundle.
4. Load BOBO as the primary Shop surface.
5. Remove the product-ID debug form and localhost placeholder from the user UI.

Done when Shop launches offline from packaged static assets and renders a real
catalog or a truthful Engine-unavailable state.

### OSR-04 — Correct the Sell-to-Shop event

Lane: Ready after OSR-02 and OSR-03
Write set: `packages/os-protocol/**`, Rust commands, Sell and Shop adapters

Actions:

1. Extend and test the sanitized navigation contract.
2. Authorize Sell as sender and Shop as receiver.
3. Focus/open Shop and route to the selected product.
4. Test rejection of URL-shaped IDs, tokens, extra sensitive fields, and calls
   from unauthorized windows.

Done when selecting a Studio product opens the matching BOBO product while no
sensitive state appears in the event payload.

### OSR-05 — Add the minimal offline outbox

Lane: Ready after OSR-01; integrate after OSR-04
Write set: one new Rust state module plus focused tests

Actions:

1. Port the SQLite initialization and explicit-transition pattern, not the
   Clip4Clicks schema.
2. Persist only navigation/retry metadata and sanitized receipt IDs needed to
   resume after restart.
3. Use stable idempotency identifiers and bounded retry delays.
4. Keep Engine as final authority and reconcile on reconnect.

Done when a queued handoff survives app restart, replays once, and is removed or
marked complete only after confirmation.

### OSR-06 — Native and Telegram acceptance

Lane: Validate after OSR-04; OSR-05 may be validated separately
Write set: tests, runbook evidence, no production mutations

Acceptance sequence:

1. Launch the Tauri app and observe real Sell and Shop surfaces.
2. Unlock Studio and arm a disposable live session.
3. Select a product in Sell and verify Shop focuses its BOBO product.
4. Create a Telegram share link from Studio.
5. Send it to Telegram Saved Messages.
6. On the same tailnet-connected phone, open the Commerce Sheet.
7. Choose variant and provider; complete the explicit sandbox payment.
8. Verify `source_channel=telegram`, the live-session attribution, receipt, and
   Studio conversion counter.
9. Verify logs/events contain no raw seller speech, audio, transcript, JWT,
   operator token, provider credential, or token-bearing internal URL.

Done when the complete flow is recorded with commands, revisions, screenshots
or response excerpts, and rollback instructions.

### OSR-07 — Review and ship

Lane: Review after all required validation cards
Write set: findings, fixes, release notes

Required review:

- capability and credential boundary;
- navigation/event contract;
- BOBO static bundle provenance;
- Studio process cleanup and restart;
- offline retry/idempotency;
- product-language honesty: sandbox and preview labels remain visible.

Run the repository gates, stage only intended files, commit in bounded
checkpoints, push, and open a PR against `main` or update the agreed integration
PR.

## 9. Parallel-agent ownership

These assignments have disjoint primary write sets:

| Agent | Owns | Must not edit |
|---|---|---|
| Sell agent | OSR-02, desktop frontend and Studio lifecycle | `apps/shop`, protocol contract |
| Shop agent | OSR-03, BOBO refresh/build/bundle | Studio lifecycle, Rust event authorization |
| Contract agent | OSR-04 and OSR-05, protocol/Rust tests | Sell visual design, BOBO source |
| Reviewer | OSR-06/07 findings and validation evidence | Production code until findings are accepted |

All agents share the repository. They must preserve others' edits, commit only
their assigned paths, and rebase or integrate through the designated lead.

## 10. Non-goals for this execution

- production payment or PI-SPI certification;
- automatic Telegram/WhatsApp bot publishing;
- privileged TikTok, Instagram, or YouTube product pin APIs;
- Qwen, MiniMind, or speech-model training;
- Qwen Audio Agent adoption before its sovereign seam is proven;
- mobile Tauri packaging;
- multitenancy;
- app signing, updater, store submission, white-label distribution;
- Mobile-Use, ADB, phone-farm, clipping, or local video rendering;
- replacing Studio Python with Rust;
- moving Engine or Harness into the desktop process.

## 11. Stop conditions

Stop and document rather than improvising when:

- the BOBO remote revision cannot produce a static web export;
- completing a feature requires credentials in a renderer;
- a proposed Tauri permission is broader than the feature requires;
- Shop needs a product snapshot instead of resolving a product ID through
  Engine/cache;
- an agent needs to modify the dirty Engine or BOBO working tree;
- a real payment, social post, or production mutation would occur;
- tests require silently replacing Engine truth with demo data.

## 12. First command for the next agent

Start with read-only verification:

```powershell
git status --short --branch
git log --oneline --decorate -n 8
Get-Content -Raw docs/OS-REAL-SURFACES-HANDOFF.md
Get-Content -Raw docs/BOARD.md
Get-Content -Raw docs/PROVENANCE.md
```

Then claim `OSR-01` on the board. Do not begin from the dirty Engine or BOBO
checkout and do not relaunch the placeholder desktop as product acceptance.

# Yaatal OS Symphony Board

Updated: 2026-09-02
Execution handoff: [`OS-REAL-SURFACES-HANDOFF.md`](./OS-REAL-SURFACES-HANDOFF.md)

## Goal

Deliver a functional and testable Windows POC with one unified native window,
Sell and Shop workspaces, a supervised Studio sidecar, narrow capabilities,
and one governed cross-pane commerce flow.

## Build tracks

| Track | Scope | Checkpoint | Status |
|---|---|---|---|
| A — Shell | Tauri 2 host, one window, SELL/SHOP router, narrow IPC, health surface | Unified window launches; only explicitly registered commands exist | Revalidation required |
| B — Shop | BOBO web export and desktop platform boundary | Static Shop loads in Tauri and can read Engine products | In progress |
| C — Studio | Python sidecar packaging and sanitized event bridge | Sidecar starts/stops and exposes health without leaking credentials | Validated |
| S — Social checkout | Opaque intent, social links, mobile sheet, sandbox payment, conversion | WhatsApp/Telegram/live link → sheet → attributed receipt | Validated |
| R — Review | Spec, security, and integration review | No open critical findings | Pending |
| I — Integration | Governed product-switch acceptance flow | Harness allow → Engine state → Shop refresh | Pending |

## Non-goals

- Production multitenancy.
- Rewriting Studio from Python to Rust.
- Replacing BOBO's Expo mobile application.
- Embedding Engine, Harness, or voice inference inside the desktop process.
- Cross-platform signing and store distribution.

## Checkpoints

1. **Scope:** pinned source revisions; dirty source worktrees excluded.
2. **Contract:** versioned shell/sidecar event schemas; deny-by-default window capabilities.
3. **Integration:** Engine, SDK, BOBO, Studio, and Harness shapes agree.
4. **Validation:** focused tests, static Shop build, sidecar contract test, Tauri smoke.
5. **Ship:** reviewed commits on `yaatal/` branches; remote push after GitHub authentication.

## Active vertical slice

```text
Studio live product
  → feature-gated POC CommerceIntent
  → WhatsApp / Telegram / livestream / copy link
  → mobile Commerce Sheet
  → explicit sandbox payment
  → livestream + source-attributed receipt
  → Studio conversion counter
```

The temporary adapter is process-local and must never be presented as the
production Engine path. Its job is to freeze and test the contract while the
real Engine resource, persistence, stock transaction, and PI-SPI rail are
implemented separately.

## Validation checkpoint — 2026-09-02

- `python -m pytest apps/studio/live -q`: **77 passed, 1 skipped**.
- `pnpm test`: **11 passed** across shell and protocol packages.
- `pnpm check` and `pnpm build`: **passed**.
- `cargo fmt --check`, `cargo check`, `cargo test`, and warning-denying Clippy:
  **passed**; two native sanitization tests passed.
- `tauri dev --no-watch`: native `yaatal-os-shell.exe` launched successfully.
- Real-browser acceptance: operator unlock → arm Studio → put demo product on
  air → create share links → open mobile sheet → choose Orange Money → confirm
  sandbox payment → receipt appears → Studio counter changes from 0 to 1.

Track B and Track I remain open for product-level acceptance. BOBO is now
bundled and the product-navigation seam exists, but the combined SELL/SHOP
flow has not yet been exercised through the native app against one canonical
catalog and one OS-owned session.

## Real-surfaces correction

The original validated shell at `c5f9854` was plumbing, not the finished desktop
product. It used two native windows, placed sidecar controls before Studio, and
left Shop as a URL/product-ID placeholder. The real-surfaces branch intentionally
replaced that topology with one ChatGPT/Codex-style native workspace at
`d27c5a3`. Do not restore the old two-window shell.

The frozen target is:

```text
One Yaatal OS window
  ├── SELL
  │   ├── Live — real Studio cockpit
  │   └── Utility — merchant boutik/operations surface (preview in this POC)
  └── SHOP
      └── real bundled BOBO buyer surface
```

The Clip4Clicks Windows alpha is a pattern donor only. Its SQLite, transition,
notification, and retry ideas may be adapted; its clipping, Mobile-Use, broad
Tauri permissions, renderer-visible API key, and null CSP must not be imported.

## Real-surfaces cards

| Card | Lane | Owner/write set | Depends on | Checkpoint | Status |
|---|---|---|---|---|---|
| OSR-00 — Handoff | Spec | `docs/**` | — | Source pins, decisions, gotchas, acceptance and stop conditions are explicit | Validated |
| OSR-01 — Clean branch and refresh provenance | Validated | Git/provenance; no product code | OSR-00 | Branch `yaatal/os-real-surfaces` from `1a97929`; BOBO `735a90db` imported at `6dca165` with exact tree parity; provenance updated | Validated |
| OSR-02 — Real Sell workspace | In progress | `apps/desktop/src/**`, Studio lifecycle Rust | OSR-01 | SELL reaches full-pane Studio automatically; diagnostics are secondary | Validated `51e8c1b` → embedded cockpit surface in `156f775` (Live/Catalog/Media/Insights); revalidated under pane model |
| OSR-03 — Bundled BOBO Shop workspace | In progress | `apps/shop/**`, Shop build/loading | OSR-01 | Static BOBO export loads in SHOP from packaged assets without localhost | Validated `ae46bf9`; blank-screen root cause fixed in build script (root-absolute paths → public-root spread); renders verified in browser |
| OSR-04 — SELL → SHOP product handoff | Build | `packages/os-protocol/**`, narrow Rust commands/adapters | OSR-02, OSR-03 | Studio product ID switches/focuses matching BOBO product; sensitive fields rejected | Validated `2f877e2` (studio-origin sanitizer) + `d27c5a3` (pane-model relay); browser-verified |
| OSR-05 — Minimal offline outbox | Build | New Rust state module and tests | OSR-01; integrates after OSR-04 | Same idempotent handoff survives restart and reconciles once | Pending |
| OSR-06 — Native + Telegram acceptance | Validate | Tests and evidence only | OSR-04; OSR-05 separately | Sell → Shop plus Telegram → sheet → sandbox receipt → Studio conversion passes | Pending |
| OSR-07 — Review and ship | Review | Findings, fixes, release notes | OSR-06 | No critical security/contract findings; gates green; exact SHA pushed | Pending |

### Dependency graph

```text
OSR-00
  └── OSR-01
      ├── OSR-02 ──┐
      ├── OSR-03 ──┼── OSR-04 ──┐
      └── OSR-05 ──┘            ├── OSR-06 ── OSR-07
                                └── focused privacy review
```

OSR-02 and OSR-03 are the only immediately parallel implementation cards. Keep
their write sets separate. OSR-04 owns the shared contract integration.

## Initial product upgrades — required before OSR-05

These cards capture the original product direction and take priority over the
offline outbox. The target is one coherent desktop product, not two web apps
displayed inside a wrapper.

| Card | Lane | Owner/write set | Depends on | Checkpoint | Status |
|---|---|---|---|---|---|
| UXR-01 — Pane lifecycle and trusted navigation | Ready | `apps/desktop/src/**` | OSR-04 | Repeated SELL/SHOP switching creates one poller and one listener per mounted pane; only the mounted Studio frame can trigger product navigation | Validated in `c90b3d1` (PaneController dispose, single poller/listener) |
| UXR-02 — Unified shell design contract | Review | `docs/design/**`, shell tokens only | OSR-01 | Approved SELL/SHOP references exist in light and dark; palette, typography, ownership, density and responsive acceptance are documented | Validated — founder approved references 2026-09-03; contract at `docs/design/YAATAL-OS-UI-CONTRACT.md` |
| UXR-03 — Embedded surface mode | Build | Studio dashboard and BOBO desktop adapters | UXR-02 | OS owns brand, primary navigation, language, theme, status, and account chrome; embedded Studio/BOBO do not render duplicate headers or navigation | In progress — Studio `os.html` and BOBO CSSOM shim suppress chrome (`1b6c021`); acceptance vs contract pending |
| UXR-04 — Native Engine session broker | Shape | Tauri Rust session state, Engine auth adapter, Studio/BOBO bootstrap adapters | UXR-01 | One login unlocks authorized SELL and SHOP routes; raw access/refresh tokens never enter iframe state or web `localStorage`; logout clears both surfaces | Implemented `19e171d` (contract `4fd2cb3`): os_login/os_logout/os_session_status, tokens Rust-process-only, sanitized session events, shell login dialog; SELL auto-unlock + BOBO nonce bootstrap remain |
| UXR-05 — Canonical demo catalog and media | Review | Shared catalog fixture, Studio/BOBO adapters, product assets | OSR-03 | SELL and SHOP show the same IDs, names, prices, stock, and optimized 4:5 media; assets have provenance, alt text, and bounded size | Assets committed in `c90b3d1` (six parchment product photos with provenance in `scripts/build-shop.mjs` + Studio `img/`); fixture unification pending |
| UXR-06 — Unified visual and commerce acceptance | Validate | Tests and evidence only | UXR-03, UXR-04, UXR-05 | Login → SELL → select product → SHOP detail → Commerce Sheet → sandbox receipt passes at 1280×800 and 900×600 without nested chrome | Pending |

### Corrected execution order

```text
UXR-01 lifecycle fix ───────────────────────────────┐
UXR-02 design contract ── UXR-03 embedded mode ────┼─ UXR-06 acceptance
UXR-04 shared native session ───────────────────────┤
UXR-05 canonical catalog/media ─────────────────────┘

UXR-06 ── OSR-05 offline outbox ── OSR-07 review and ship
```

The first implementation card is UXR-01. UXR-02 can proceed in parallel when
an independent design/doc owner is available. Do not begin the offline outbox
until the single-window product shell, session, and catalog are coherent.

## Agent pickup protocol

1. Read this board, the execution handoff, and `PROVENANCE.md`.
2. Claim exactly one unblocked card and record agent/task plus starting SHA.
3. Do not work in the dirty Engine or BOBO checkouts.
4. Commit only the card's write set using a bounded checkpoint commit.
5. Add commands and observed results to the card before changing its status.
6. A card moves to Validated only when its contract, tests, branch state, and
   remaining risks are explicit.

## Deferred backlog

- Real Engine-persisted CommerceIntent, transactional stock, order, payment and
  receipt authority.
- PI-SPI/mobile-money sandbox-to-production certification.
- Automatic Telegram/WhatsApp publishing and privileged livestream product APIs.
- Qwen Audio Agent sidecar qualification with no DashScope dependency.
- Mobile Tauri, signing, updater, distribution, multitenancy and white-label.

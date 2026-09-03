# Yaatal OS Symphony Board

Updated: 2026-09-02
Execution handoff: [`OS-REAL-SURFACES-HANDOFF.md`](./OS-REAL-SURFACES-HANDOFF.md)

## Goal

Deliver a functional and testable Windows POC with Sell and Shop windows, a supervised Studio
sidecar, capability isolation, and one governed cross-window commerce flow.

## Build tracks

| Track | Scope | Checkpoint | Status |
|---|---|---|---|
| A — Shell | Tauri 2 host, two windows, IPC capabilities, health surface | Both windows launch; Shop cannot invoke Studio commands | Validated |
| B — Shop | BOBO web export and desktop platform boundary | Static Shop loads in Tauri and can read Engine products | Ready |
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
- `pnpm test`: **5 passed** across shell and protocol packages.
- `pnpm check` and `pnpm build`: **passed**.
- `cargo fmt --check`, `cargo test`, and warning-denying Clippy: **passed**;
  three native authority/sanitization tests passed.
- `tauri dev --no-watch`: native `yaatal-os-shell.exe` launched successfully.
- Real-browser acceptance: operator unlock → arm Studio → put demo product on
  air → create share links → open mobile sheet → choose Orange Money → confirm
  sandbox payment → receipt appears → Studio counter changes from 0 to 1.

Track B and Track I remain open: the imported BOBO web export still needs to
become the bundled Shop target, and the original Harness-approved product
switch must be reflected across both native windows.

## Real-surfaces correction

The validated shell is plumbing, not the finished desktop product. Its Sell
window still presents sidecar controls before embedding Studio; its Shop window
is a URL/product-ID placeholder; and the existing navigation command flows from
Shop to Sell instead of from Studio/Sell to BOBO/Shop. Do not use the successful
native launch as evidence that the merchant and buyer experiences are complete.

The frozen target is:

```text
Sell window
  ├── Live — real Studio cockpit
  └── Utility — merchant boutik/operations surface (preview in this POC)

Shop window
  └── real bundled BOBO buyer surface
```

The Clip4Clicks Windows alpha is a pattern donor only. Its SQLite, transition,
notification, and retry ideas may be adapted; its clipping, Mobile-Use, broad
Tauri permissions, renderer-visible API key, and null CSP must not be imported.

## Real-surfaces cards

| Card | Lane | Owner/write set | Depends on | Checkpoint | Status |
|---|---|---|---|---|---|
| OSR-00 — Handoff | Spec | `docs/**` | — | Source pins, decisions, gotchas, acceptance and stop conditions are explicit | Validated |
| OSR-01 — Clean branch and refresh provenance | Ready | Git/provenance; no product code | OSR-00 | `yaatal/os-real-surfaces` starts from reviewed PR #1; BOBO remote `735a90db` imported cleanly | Pending |
| OSR-02 — Real Sell surface | Ready | `apps/desktop/src/**`, Studio lifecycle Rust | OSR-01 | App reaches full-window Studio automatically; diagnostics are secondary | Pending |
| OSR-03 — Bundled BOBO Shop | Ready | `apps/shop/**`, Shop build/loading | OSR-01 | Static BOBO export loads from packaged assets without localhost | Pending |
| OSR-04 — Sell → Shop product handoff | Build | `packages/os-protocol/**`, narrow Rust commands/adapters | OSR-02, OSR-03 | Studio product ID focuses matching BOBO product; sensitive fields rejected | Pending |
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


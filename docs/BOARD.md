# Yaatal OS Symphony Board

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


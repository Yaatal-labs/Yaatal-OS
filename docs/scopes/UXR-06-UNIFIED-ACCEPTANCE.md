# UXR-06 — Unified visual and commerce acceptance

Status: **blocked on the deployed Engine bootstrap contract** as of 9 September
2026. A deterministic generated-SHOP launch regression was repaired locally;
this is not a production-acceptance pass.

## Generated SHOP launch repair

The first native launch did not prove the current product surface. Its SHOP
iframe requested `/shop/index.html`, but the ignored generated document was
absent from both `apps/desktop/public/` and `apps/desktop/dist/`. Vite therefore
served the OS shell document inside the SHOP iframe, which looked like duplicate
OS navigation. This was not a regression of Studio embedded mode: `9a6f9d1` and
its `dashboard/os.{html,css,js}` assets are clean and contained by the checked
out HEAD.

`apps/desktop/package.json` now runs `node ../../scripts/build-shop.mjs` before
both its `dev` and `build` commands. Those are the commands Tauri invokes from
the desktop package; putting the step only in the workspace-root script would
not protect `tauri dev` or `tauri build`. The regression test asserts that both
desktop launch modes retain that prerequisite.

After the repair:

- `apps/desktop/public/shop/index.html` and
  `apps/desktop/dist/shop/index.html` exist and match.
- Both documents are BOBO (`<title>BOBO</title>`, `#root`, `/_expo/` bundle,
  OS skin), contain none of the OS shell's `<main id="app"></main>`, and carry
  the seven canonical fallback-media WebPs.
- A local Tauri dev probe returned that BOBO document from
  `http://127.0.0.1:1420/shop/index.html?embedded=1&theme=light` with HTTP 200.
- `pnpm test` passed: **17 shell tests and 3 protocol tests**. `pnpm check` and
  the repaired canonical `pnpm build` passed.

The generated `public/shop/` output remains ignored and is not committed. The
canonical script also refreshes root-absolute Expo assets required by BOBO; any
such generated working-tree delta is reviewed separately and is not acceptance
evidence.

## Earlier contract evidence from `9d15874`

- `python -m pytest apps/studio/live -q`: **97 passed, 1 skipped**. This
  includes the fail-closed operator boundary and the deterministic flow
  `operator session → selected product → public Commerce Sheet → explicit
  sandbox checkout → source- and live-session-attributed receipt → Studio
  conversions`.
- Before the generated-SHOP repair, `pnpm test`: **16 shell tests and 3
  protocol tests passed**. They cover one
  shell lifecycle, safe Studio grant delivery, stale grant/status rejection,
  logout cleanup, and bounded SELL-to-SHOP navigation.
- `pnpm check` and `pnpm build`: passed before the repair; the repaired desktop
  package gates are listed above.
- From `apps/desktop/src-tauri`: `cargo fmt --check`, `cargo check`, `cargo
  test` (**4 passed**), and `cargo clippy -- -D warnings`: passed.
- `pnpm --filter @yaatal/os-shell tauri dev --no-watch` built and started the
  local `yaatal-os-shell` process. The native configuration defines exactly
  one `main` window at `1280×800`, with `900×600` minimum dimensions; it does
  not define a second SELL or SHOP window.

The UXR-05 browser evidence remains the current visual evidence for both
`1280×800` and `900×600`: the canonical catalog and matching product detail
render in the single shell without broken media. UXR-06 cannot inherit that as
proof of its authenticated commerce sequence.

## Exact blocking invariant

An OS-owned login cannot authorize the embedded Studio without an Engine
deployment that serves both sides of the reviewed bootstrap contract:

1. authenticated `POST /api/auth/bootstrap/start` accepts the Rust-held Engine
   JWT and returns one 43-character, `studio`-scoped, 1–90 second nonce; and
2. unauthenticated `POST /api/auth/bootstrap` atomically redeems that nonce
   into the sanitized Studio identity.

The required Engine source is `yaatal/auth-whatsapp-bootstrap` through
`160524e9`; it is not deployed at the endpoint configured for this OS POC.
Without it, `os_studio_bootstrap_grant` correctly fails closed and the Studio
iframe stays locked. A manual `STUDIO_CONTROL_TOKEN` unlock is deliberately
not evidence for the required one-login sequence, and no credential was
created, supplied, or exposed to work around the dependency.

The real acceptance remains: use a disposable Engine account against that
deployment; confirm a single OS login unlocks Studio; select a canonical
product; verify the same BOBO detail in SHOP; open its server-returned Commerce
Sheet; make one explicit sandbox payment; then verify the receipt and Studio
conversion update at both target viewport sizes. No real payment, Telegram or
WhatsApp send, production mutation, or credential in a renderer is permitted.

## Scope held

Only the deterministic desktop build-seam repair and its regression test were
added; Studio navigation, session authority, payment/social authority and the
offline outbox were not changed. Starting OSR-05 before this acceptance is
complete would violate the board's dependency order, so it was not started.

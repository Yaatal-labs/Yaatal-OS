# Kairmel desktop shell

A thin Tauri 2 window around the Kairmel web app. Kairmel's product *is* the
web app (**Créer**, **Mes apps** and **Découvrir**, as in its sidebar); this shell
only installs, launches and hosts it — there is no bundled UI, no sidecar,
no local server. Windows-first for now, kept cross-platform-clean.

## Run it in dev

```bash
pnpm install
KAIRMEL_URL=http://localhost:3000 pnpm dev
```

`pnpm dev` runs `tauri dev`, which first runs `pnpm build` (generates the
local offline page into `dist/`) and then launches the shell. Point
`KAIRMEL_URL` at whatever is serving the Kairmel app locally; `http://` is
only accepted on loopback (`localhost` / `127.0.0.1` / `[::1]`, any port) —
see [Security model](#security-model).

## Build an installer

```bash
pnpm install
pnpm tauri build --bundles nsis          # targets https://kairmel.com
KAIRMEL_URL=https://staging.example pnpm tauri build --bundles nsis   # another origin
```

`KAIRMEL_URL` (and the workspace paths below) are read with Rust's
`option_env!` — i.e. at **compile time**. They must be set in the
environment *before* `cargo`/`tauri build` runs; changing them means
rebuilding. The installer lands in
`src-tauri/target/release/bundle/nsis/Kairmel_<version>_x64-setup.exe`.

## Configuration (all build-time env vars)

| Variable | Default | Meaning |
| --- | --- | --- |
| `KAIRMEL_URL` | `https://kairmel.com` | The Kairmel origin. Must be `https://`, or `http://` on loopback only. |
| `KAIRMEL_PATH_CREER` | `/` | Path for the **Créer** menu entry (start a site by voice or chat). |
| `KAIRMEL_PATH_APPS` | `/apps` | Path for the **Mes apps** menu entry. |
| `KAIRMEL_PATH_DECOUVRIR` | `/discover` | Path for the **Découvrir** menu entry. |

Each path is resolved against `KAIRMEL_URL`'s origin (`src-tauri/src/config.rs`).
The window opens on **Créer**; the native menu bar switches between the
three. None of this is business logic baked into the shell — it's all
configuration, read once at build time.

## Security model

1. **One window, no local UI.** The window loads `KAIRMEL_URL` directly (or
   the bundled offline page if Kairmel is unreachable at startup) — nothing
   Tauri-specific is injected into that page.
2. **Zero IPC for that window.** `capabilities/main.json` grants the `main`
   window an empty permission set: no `invoke`, no `fs`, no `shell`, no
   `dialog`. The Kairmel web app runs exactly as it would in a plain browser
   tab, and so does the local offline page that shares the same window.
3. **Navigation allowlist.** `src-tauri/src/kairmel.rs` decides, for every
   navigation, whether the target is the same origin as `KAIRMEL_URL` (stays
   in the window) or the app's own bundled asset (also stays). Everything
   else — a different site, `wa.me`, `mailto:`, `tel:` — is denied in the
   webview and handed to the system browser/handler via `tauri-plugin-opener`
   instead (`src-tauri/src/lib.rs`, the `on_navigation` handler).
4. **URL validation.** Both `KAIRMEL_URL` and the resolved workspace paths
   are validated: `https` anywhere, `http` only on loopback (dev), never
   with embedded credentials (`validate_kairmel_url` in `kairmel.rs`). An
   invalid `KAIRMEL_URL` fails the build loudly rather than silently falling
   back to something nobody chose.
5. **Reachability, not trust.** The one native→network thing the shell does
   on its own is a short TCP reachability probe to decide the *initial*
   page (Kairmel vs. the local offline page); it never reads or forwards
   any of the app's traffic.

## What's intentionally not here

- **No updater** — TODO before a real release (Tauri's updater plugin, with
  a signing key and an update manifest host).
- **No code signing** — TODO; the NSIS installer is unsigned, so Windows
  SmartScreen will warn on first run. Needed before distributing outside the
  team.
- **No sidecar, no local server** — Kairmel is a hosted web app; this shell
  never runs anything besides the webview.
- **Icon** — `src-tauri/icons/` is generated (via `tauri icon`) from
  `src-tauri/icons/source/kairmel.svg`, the Kairmel mark (same file as kairmel.com's
  `favicon.svg`). After changing the mark, re-run
  `pnpm tauri icon src-tauri/icons/source/kairmel.svg` and keep only the files listed here.

## Tests

- `src-tauri/src/kairmel.rs` — Rust unit tests for URL validation
  (`validate_kairmel_url`) and the navigation allowlist decision
  (`is_internal_navigation`, `is_local_asset`, `should_stay_in_webview`).
  Run with `cargo test` from `src-tauri/`.
- `test/offline.test.mjs` — Vitest tests for the local offline page's pure
  JS (the reachability probe and the retry button wiring). Run with
  `pnpm test`.

## Layout

```
apps/kairmel-shell/
  src/                    offline page source (template + pure JS logic)
  scripts/build-static.mjs   generates dist/ (the offline page) from src/
  test/                   Vitest tests for src/offline.mjs
  src-tauri/
    src/kairmel.rs        URL validation + navigation allowlist (unit tested)
    src/reachability.rs   startup TCP reachability probe
    src/config.rs         reads KAIRMEL_URL / workspace paths at build time
    src/menu.rs           native Créer / Mes apps / Découvrir menu
    src/lib.rs            window setup, on_navigation handler, plugins
    capabilities/main.json  empty permission set for the "main" window
```

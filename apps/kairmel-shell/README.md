# Kairmel shell

A thin Tauri 2 window around the Kairmel web app. Kairmel's product *is* the
web app (creator and merchant workspaces); this shell
only installs, launches and hosts it — there is no bundled UI, no sidecar,
no local server. Windows desktop and Android share the same hosted web app.

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

`KAIRMEL_URL`, `KAIRMEL_MARCHE_URL` and the workspace paths below are read with Rust's
`option_env!` — i.e. at **compile time**. They must be set in the
environment *before* `cargo`/`tauri build` runs; changing them means
rebuilding. The installer lands in
`src-tauri/target/release/bundle/nsis/Kairmel_<version>_x64-setup.exe`.

## Configuration (all build-time env vars)

| Variable | Default | Meaning |
| --- | --- | --- |
| `KAIRMEL_URL` | `https://kairmel.com` | The Kairmel origin. Must be `https://`, or `http://` on loopback only. |
| `KAIRMEL_MARCHE_URL` | `https://marche.kairmel.com` | The Marché origin allowed in-app. Uses the same URL validation as `KAIRMEL_URL`. |
| `KAIRMEL_PATH_CREER` | `/` | Path for the **Créer** menu entry (start a site by voice or chat). |
| `KAIRMEL_PATH_APPS` | `/apps` | Path for the **Mes apps** menu entry. |
| `KAIRMEL_PATH_DECOUVRIR` | `/discover` | Path for the **Découvrir** menu entry. |
| `KAIRMEL_PATH_BOUTIQUE` | `/sales` | Path for **Boutique**. |
| `KAIRMEL_PATH_COMMANDES` | `/sales/orders` | Path for **Commandes**. |
| `KAIRMEL_PATH_ARGENT` | `/sales/money` | Path for **Argent**. |
| `KAIRMEL_PATH_DIRECT` | `/live` | Path for **Direct**. |
| `KAIRMEL_PATH_COMPTE` | `/settings` | Path for **Compte**. |

Each path resolves against `KAIRMEL_URL` and must preserve its scheme, host and
port (`src-tauri/src/config.rs`). The window opens on **Créer**; the desktop menu
opens all eight destinations in that same window. Android uses the hosted web
navigation. These settings are read once at build time.

See [native merchant navigation](NATIVE-MERCHANT-WORKSPACE.md) for path rules and
the hosted deployment dependency. Merchant business logic remains in Kairmel and Engine.

## Android

Install JDK 17 and the Android SDK (including platform tools, build tools and
an SDK platform), plus NDK 27 via Android Studio's SDK Manager. Set these
Android build environment variables before running the CLI:

| Variable | Meaning |
| --- | --- |
| `ANDROID_HOME` | Absolute path to the Android SDK (usually `%LOCALAPPDATA%/Android/Sdk` on Windows). |
| `NDK_HOME` | Absolute path to the installed NDK 27 directory under the SDK's `ndk/` directory. |

Add the Rust targets, then build the checked-in Android project from `apps/kairmel-shell`:

```bash
rustup target add aarch64-linux-android armv7-linux-androideabi i686-linux-android x86_64-linux-android
pnpm tauri android build --apk --target aarch64 --target armv7
```

The generated `src-tauri/gen/android/` project is committed; generated schemas
and build outputs stay ignored. The APK lands in
`src-tauri/gen/android/app/build/outputs/apk/universal/release/`.

**Signing.** A release APK is signed only when `src-tauri/gen/android/keystore.properties`
exists (gitignored, never committed) with `storeFile`, `storePassword`, `keyAlias` and
`keyPassword`; without it Gradle produces an unsigned APK that phones refuse to install.
Tester builds use a test key (`kairmel-test`) kept outside the repo; a Play Store release
needs its own upload key, and testers will have to uninstall the test build first (Android
refuses an update signed by a different key). `--debug` builds need no keystore but bundle
large debug symbols, so don't hand those to testers.

`src-tauri/tauri.android.conf.json` is merged into the base config by Tauri 2.
It sets the Android package name to `com.kairmel.app` and disables desktop
bundle targets; the desktop identifier remains `com.kairmel.desktop`.
Android has no native menu, single-instance plugin or window-state plugin;
navigation uses kairmel.com's own UI. GitHub sign-in stays inside the app.
Google sign-in opens the system browser because Google blocks OAuth in
embedded WebViews (`403 disallowed_useragent`). The session returns through
the native handoff described in [Google sign-in](#google-sign-in).

Both URL settings, `KAIRMEL_URL` and the new `KAIRMEL_MARCHE_URL`, are read
with `option_env!` at compile time on Android too. Set them before building
to override the defaults, and rebuild after changing them. On a physical
device, loopback refers to that device rather than your development PC;
use a reachable HTTPS origin when testing remotely.

## Google sign-in

Google refuses OAuth inside embedded WebViews (`403 disallowed_useragent`), so the shell
runs it in the system browser and hands the session back through a deep link. The full
contract shared with the Kairmel server is in [`NATIVE-GOOGLE-AUTH.md`](NATIVE-GOOGLE-AUTH.md);
the shell side lives in `src-tauri/src/native_auth.rs` (pure, unit-tested) and `lib.rs` (wiring).

1. The page navigates to `<origin>/api/auth/oauth/google[?redirect_url=...]`. The navigation
   handler cancels it, generates a verifier (32 random bytes, base64url, kept in memory only,
   one pending login, 10 min TTL) and opens the system browser at the same URL plus
   `native_challenge=base64url(SHA-256(verifier))`.
2. After Google, the server shows a page that opens `com.kairmel.app://auth/callback?code=<code>`
   (button "Retourner dans l'application" as fallback).
3. The shell receives the deep link, takes (and clears) the verifier, and loads
   `<origin>/api/auth/native/exchange?code=<code>&verifier=<verifier>` in the main WebView; the
   server sets the session cookies there. Unknown links, bad codes and missing or expired
   verifiers are ignored.

Constants: scheme `com.kairmel.app`, host `auth`, path `/callback`, params `native_challenge`,
`code`, `verifier`. **Server dependency:** the Kairmel server must implement the
`native_challenge` start and `/api/auth/native/exchange`; without it the browser step works
but the app never receives a session.

The page gets no Tauri permission for this (`capabilities/main.json` stays empty; the
deep-link JS API is not exposed). Desktop: the single-instance plugin (with its `deep-link`
feature) forwards a second launch's URL to the running app. Android: the deep-link plugin
injects the `com.kairmel.app://auth/callback` intent filter into `AndroidManifest.xml` (the
block marked `DEEP LINK PLUGIN` is generated; keep it).

**Test on desktop:** install the NSIS build (the installer registers the scheme; a bare
`cargo run` does not), open the app, click "Google" on the sign-in screen, finish in the
browser, then click "Retourner dans l'application". The app window regains focus and lands
signed in.

## Security model

1. **One window, no local UI.** The window loads `KAIRMEL_URL` directly (or
   the bundled offline page if Kairmel is unreachable at startup) — nothing
   Tauri-specific is injected into that page.
2. **Zero IPC for that window.** `capabilities/main.json` grants the `main`
   window an empty permission set: no `invoke`, no `fs`, no `shell`, no
   `dialog`. The Kairmel web app runs exactly as it would in a plain browser
   tab, and so does the local offline page that shares the same window.
3. **Navigation allowlist.** `src-tauri/src/kairmel.rs` decides, for every
   navigation, whether the target is the same origin as `KAIRMEL_URL` or
   `KAIRMEL_MARCHE_URL`, an HTTPS GitHub sign-in endpoint (`github.com/login`,
   `/login/oauth` and its descendants, `/sessions` and its descendants), or
   the app's own bundled asset. These stay in the window. Other GitHub pages
   and Google sign-in stay external. External `https`, `http`, `mailto`,
   `tel`, `whatsapp` and `sms` URLs (including `https://wa.me/...`) go to the
   OS browser/handler via `tauri-plugin-opener` on desktop and Android.
   All other schemes, including `javascript`, `file`, `data` and `intent`,
   are blocked. The Rust navigation handler uses `OpenerExt`, so it needs
   no webview opener capability (`src-tauri/src/lib.rs`).
4. **URL validation.** `KAIRMEL_URL` and `KAIRMEL_MARCHE_URL`
   are validated: `https` anywhere, `http` only on loopback (dev), never
   with embedded credentials (`validate_kairmel_url` in `kairmel.rs`). An
   invalid URL setting refuses to start loudly rather than silently falling
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

See [Android build verification](ANDROID-VERIFICATION.md) and the
[installed-client acceptance matrix](../../docs/contracts/kairmel-native-acceptance.md)
for build evidence and remaining device checks.

- `src-tauri/src/kairmel.rs` — Rust unit tests for URL validation
  (`validate_kairmel_url`) and the navigation allowlist decision
  (`is_internal_navigation`, `is_local_asset`, `should_stay_in_webview`),
  including Marché, GitHub OAuth, Google exclusion and the external scheme
  allowlist (`should_open_externally`).
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
    src/config.rs         reads Kairmel / Marché URLs and workspace paths at build time
    src/menu.rs           desktop creator and merchant menu
    src/lib.rs            window setup, on_navigation handler, plugins
    capabilities/main.json  empty permission set for the "main" window
    tauri.android.conf.json  Android package identifier and bundle overrides
```

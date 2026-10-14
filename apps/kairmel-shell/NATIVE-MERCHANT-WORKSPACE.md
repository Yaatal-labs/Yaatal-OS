# Native merchant navigation

The desktop Kairmel menu opens the hosted merchant workspace in the same
window as Créer, Mes apps and Découvrir. The hosted web app owns sign-in,
seller access, orders, delivery, balances, payouts and live sessions.
The route contract comes from [Kairmel draft PR 37](https://github.com/Yaatal-labs/kairmel-platform/pull/37).
Merchant acceptance requires that web branch to be deployed at the configured
origin; building these shortcuts does not deploy those pages.

| Menu entry | Build-time setting | Default path |
| --- | --- | --- |
| Créer | `KAIRMEL_PATH_CREER` | `/` |
| Mes apps | `KAIRMEL_PATH_APPS` | `/apps` |
| Découvrir | `KAIRMEL_PATH_DECOUVRIR` | `/discover` |
| Boutique | `KAIRMEL_PATH_BOUTIQUE` | `/sales` |
| Commandes | `KAIRMEL_PATH_COMMANDES` | `/sales/orders` |
| Argent | `KAIRMEL_PATH_ARGENT` | `/sales/money` |
| Direct | `KAIRMEL_PATH_DIRECT` | `/live` |
| Compte | `KAIRMEL_PATH_COMPTE` | `/settings` |

Set these variables before building and rebuild after changing them. Every
destination resolves against `KAIRMEL_URL` with the same scheme, host and
port. A root path such as `/sales` replaces the configured URL's path; a
relative path such as `sales/orders` resolves against its directory. Paths
can contain queries or fragments, such as `/sales/orders?status=paid#orders`.
Query values and encoded path segments remain part of that same-origin URL.
Subsequent navigation still passes through the shell's navigation allowlist.

Absolute URLs (including same-origin URLs), `//host` references, backslashes,
whitespace, control characters, empty values, query-only values and
fragment-only values are rejected. A bad destination prevents startup on
desktop and Android. All destinations are validated on Android even though
Android uses the hosted navigation and has no desktop menu.

The window opens on Créer. Menu clicks reuse its WebView and session cookies;
the hosted page handles signed-out access. These shortcuts require no Tauri
IPC permissions. See the [shell configuration and security model](README.md)
and the [native Google sign-in contract](NATIVE-GOOGLE-AUTH.md).

Unit tests in `src-tauri/src/kairmel.rs` cover the path policy and defaults.
Tests in `src-tauri/src/menu.rs` cover every menu ID with overridden
destinations and ignore unrelated IDs. Run
`cargo test --locked -- --test-threads=1` from `src-tauri/`.
A packaged Windows test should also
check all eight menu clicks while signed in and signed out, external links,
Google sign-in return, and offline recovery. Android qualification uses the
hosted merchant navigation; seller live media requires device testing.

# UXR-04B: Native Studio session delivery

[Français](./UXR-04B-NATIVE-STUDIO-SESSION.fr.md)

Status: code and security review validated on 9 September 2026. Live acceptance is waiting on the Engine bootstrap deployment.

## What works

The Yaatal OS login keeps the Engine JWT in the Tauri Rust process. An authenticated native command asks Engine for a 90-second, single-use grant scoped to `studio`. Rust validates the 43-character nonce, surface and TTL before returning the grant to the shell.

The shell delivers that grant only to the current Studio frame and exact origin. It does not put the grant in a URL, log or persistent storage. Studio sends the nonce to its own same-origin backend. The backend redeems it server-to-server against the fixed Engine endpoint, validates the sanitized identity response and creates the existing opaque HttpOnly, SameSite Studio cookie.

Logout locks and disarms Studio before network cleanup, clears the Rust-held JWT, and keeps Studio locked when cleanup fails. Session restoration, iframe reload, remount, late grant responses and late status responses are correlated to OS-session, frame-lifecycle and request generations. Stale work is ignored.

The manual `STUDIO_CONTROL_TOKEN` unlock remains available when Engine bootstrap is not deployed.

## Engine dependency

The required contract already exists on Engine branch `yaatal/auth-whatsapp-bootstrap`:

- source commits: `b8d84368`, then `160524e9`;
- authenticated `POST /api/auth/bootstrap/start`;
- unauthenticated, single-use `POST /api/auth/bootstrap`;
- grant digest stored instead of the raw nonce;
- surface, expiry and replay checked atomically.

The focused Engine unit test passed. Its request tests exist but could not be freshly linked on this Windows machine because of insufficient disk and paging-file resources. The branch is not yet deployed to the Engine endpoint used by Yaatal OS.

## Fresh verification

- Studio Python suite: 97 passed, 1 skipped.
- OS shell tests: 16 passed.
- OS protocol tests: 3 passed.
- Tauri Rust tests: 4 passed.
- `pnpm check`: passed.
- `pnpm build`: passed.
- Tauri `cargo fmt --check`, `cargo check` and `cargo test`: passed.
- Spec review: compliant.
- Final code-quality and security review: approved.
- `git diff --check`: passed.

Executable regressions cover logout while Studio is unmounted, ready-before-session-restore, logout versus an in-flight grant, iframe remount while a status is pending, voice WebSocket authorization from a bootstrap cookie, and a late session refresh after logout.

## What is not built

- Engine-wide JWT revocation is not part of logout.
- Authenticated BOBO mutations do not yet have a native broker. Current SHOP catalog, product detail and Commerce Sheet POC paths are public and do not need it.
- The real native Engine-to-Studio bootstrap has not run against a deployed Engine containing `160524e9`.
- The final Telegram-to-Commerce-Sheet-to-receipt acceptance run remains open.

These gaps keep UXR-06 open. No production auth completion is claimed by this checkpoint.

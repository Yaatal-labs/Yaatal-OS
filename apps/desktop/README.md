# Yaatal OS shell

Windows POC shell for two local Tauri windows:

- **Sell** is the only window that can start, stop, or inspect the Studio sidecar.
- **Shop** can only request product navigation or a Shop refresh. Its public/local URL is a Vite value, not privileged IPC.

## Run

```powershell
pnpm install
Copy-Item apps/desktop/.env.example apps/desktop/.env
pnpm --filter @yaatal/os-shell tauri:dev:unified
```

The unified launcher sets the renderer gate and the matching Rust
`unified-ui` feature together. Do not launch the unified renderer with only one
of those gates enabled.

The sidecar defaults to `apps/studio`, starts Python's `live.studio_server:app`
on `127.0.0.1:8484`, and has a five-second `/api/status` startup probe. Its
configuration, process output, and credentials remain native-only. A failed
launch reports only a bounded error code to Sell.

`VITE_YAATAL_OS_SHOP_URL` is limited to an HTTP(S) Shop URL and falls back to
`http://127.0.0.1:5173` if it is invalid or contains a token/JWT/secret query
parameter. It must never contain credentials.

### Atelier

The third workspace, ATELIER, embeds the Yaatal Cloudflare OS (`apps/cloudflare-os`), where the agent
creates Gadgets and Blueprints and a person reviews them before they are accepted. Start it with
`pnpm run-local` in the pinned checkout (see `apps/cloudflare-os/README.md`); the shell shows how to
start it when it is not reachable.

`VITE_YAATAL_OS_ATELIER_URL` defaults to `http://localhost:8787/`. It must be HTTPS, or HTTP on
loopback only; credentials, query strings and fragments are rejected or dropped. The Atelier is a
cross-origin, sandboxed frame with no referrer and no Tauri capability, so it has no IPC access; it
keeps its own sign-in. It needs no Engine session and stays mounted while you switch workspaces.

## Verify

```powershell
pnpm --filter @yaatal/os-shell build
pnpm --filter @yaatal/os-shell check
pnpm --filter @yaatal/os-shell test
cargo fmt --manifest-path apps/desktop/src-tauri/Cargo.toml -- --check
cargo clippy --manifest-path apps/desktop/src-tauri/Cargo.toml --features unified-ui --all-targets -- -D warnings
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --features unified-ui
```

Create a packaged unified desktop build with
`pnpm --filter @yaatal/os-shell tauri:build:unified`.

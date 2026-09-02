# Yaatal OS shell

Windows POC shell for two local Tauri windows:

- **Sell** is the only window that can start, stop, or inspect the Studio sidecar.
- **Shop** can only request product navigation or a Shop refresh. Its public/local URL is a Vite value, not privileged IPC.

## Run

```powershell
pnpm install
Copy-Item apps/desktop/.env.example apps/desktop/.env
pnpm --filter @yaatal/os-shell tauri dev
```

The sidecar defaults to `apps/studio`, starts Python's `live.studio_server:app`
on `127.0.0.1:8484`, and has a five-second `/api/status` startup probe. Its
configuration, process output, and credentials remain native-only. A failed
launch reports only a bounded error code to Sell.

`VITE_YAATAL_OS_SHOP_URL` is limited to an HTTP(S) Shop URL and falls back to
`http://127.0.0.1:5173` if it is invalid or contains a token/JWT/secret query
parameter. It must never contain credentials.

## Verify

```powershell
pnpm build
pnpm check
pnpm test
cargo fmt --manifest-path apps/desktop/src-tauri/Cargo.toml -- --check
cargo clippy --manifest-path apps/desktop/src-tauri/Cargo.toml --all-targets -- -D warnings
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml
```

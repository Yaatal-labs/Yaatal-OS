# Studio Runtime Sidecar

`launcher.py` starts the imported Python Studio service as a loopback-only
Windows desktop sidecar. Tauri invokes the system `python` executable with the
arguments in `manifest.json`; it must pass credentials only through the
inherited environment.

Use `--port 0 --ready-file <path>` when the Tauri host needs an available port.
The ready file is written atomically only after the ASGI app has started and
contains the selected loopback port plus `/health` and `/api/os/status` paths.
Tauri should poll `/health` for at most 10 seconds, then request the sanitized
OS status/event endpoints. On exit it sends SIGTERM/SIGINT (or Windows
CTRL_BREAK) and waits up to five seconds; the launcher requests Uvicorn
shutdown and removes the ready file.

The launcher rejects non-loopback hosts. It does not accept or print Engine,
Harness, or voice credentials, and it overwrites inherited `STUDIO_HOST` with
its loopback argument.

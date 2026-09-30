"""Deterministic loopback launcher for the Yaatal Studio desktop sidecar.

Tauri invokes this file with the system Python for the Windows POC. Credentials
are inherited by the child process environment only; this launcher never
accepts, prints, or writes credential values.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import signal
import socket
import sys
import tempfile
import time
from pathlib import Path
from typing import Mapping


MANIFEST_VERSION = "yaatal.sidecar-manifest.v1"
DEFAULT_HOST = "127.0.0.1"
DEFAULT_PORT = 8484
DEFAULT_STARTUP_TIMEOUT_MS = 10_000
DEFAULT_SHUTDOWN_TIMEOUT_MS = 5_000


class LauncherError(ValueError):
    """The local launcher arguments cannot produce a safe runtime."""


def is_loopback_host(host: str) -> bool:
    """Accept only explicit loopback names/addresses for the desktop POC."""
    normalized = host.strip().strip("[]").lower() if isinstance(host, str) else ""
    if normalized == "localhost":
        return True
    try:
        return socket.inet_pton(socket.AF_INET, normalized) is not None and normalized.startswith("127.")
    except OSError:
        try:
            return socket.inet_pton(socket.AF_INET6, normalized) is not None and normalized == "::1"
        except OSError:
            return False


def resolve_port(port_arg: int | None, environ: Mapping[str, str] | None = None) -> int:
    """Use CLI override first, then sidecar-specific env, then Studio/default."""
    environment = os.environ if environ is None else environ
    raw = port_arg
    if raw is None:
        raw = environment.get("STUDIO_SIDECAR_PORT") or environment.get("STUDIO_PORT") or DEFAULT_PORT
    try:
        port = int(raw)
    except (TypeError, ValueError) as error:
        raise LauncherError("invalid_port") from error
    if not 0 <= port <= 65535:
        raise LauncherError("invalid_port")
    return port


def app_root() -> Path:
    return Path(__file__).resolve().parents[2] / "apps" / "studio"


def reserve_socket(host: str, port: int) -> tuple[socket.socket, int]:
    """Reserve the requested loopback port and pass it directly to Uvicorn."""
    if not is_loopback_host(host):
        raise LauncherError("loopback_host_required")
    family = socket.AF_INET6 if ":" in host else socket.AF_INET
    bind_host = "::1" if host.strip().strip("[]").lower() == "localhost" and family == socket.AF_INET6 else host
    if host.strip().lower() == "localhost":
        bind_host = DEFAULT_HOST
        family = socket.AF_INET
    sock = socket.socket(family, socket.SOCK_STREAM)
    sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    try:
        sock.bind((bind_host, port))
        sock.listen(socket.SOMAXCONN)
        return sock, int(sock.getsockname()[1])
    except Exception:
        sock.close()
        raise


def ready_payload(host: str, port: int) -> dict[str, object]:
    """Return the only launcher-to-Tauri discovery payload."""
    return {
        "version": MANIFEST_VERSION,
        "service": "studio-runtime",
        "host": host,
        "port": port,
        "health_path": "/health",
        "os_status_path": "/api/os/status",
    }


def write_ready_file(path: Path, payload: dict[str, object]) -> None:
    """Atomically publish the selected loopback port after ASGI startup."""
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(
        mode="w", encoding="utf-8", dir=path.parent, prefix=f".{path.name}.", delete=False
    ) as handle:
        json.dump(payload, handle, sort_keys=True, separators=(",", ":"))
        handle.flush()
        os.fsync(handle.fileno())
        temporary = Path(handle.name)
    temporary.replace(path)


async def _wait_for_start(server, task: asyncio.Task[object], timeout_ms: int) -> None:
    deadline = time.monotonic() + timeout_ms / 1000
    while not server.started:
        if task.done():
            await task
            raise LauncherError("studio_start_failed")
        if time.monotonic() >= deadline:
            raise LauncherError("studio_start_timeout")
        await asyncio.sleep(0.02)


async def run_sidecar(args: argparse.Namespace) -> int:
    """Start Studio, publish readiness, and drain cleanly on termination."""
    if not is_loopback_host(args.host):
        raise LauncherError("loopback_host_required")
    root = app_root()
    if not root.is_dir():
        raise LauncherError("studio_app_missing")

    port = resolve_port(args.port)
    sock, bound_port = reserve_socket(args.host, port)
    previous_cwd = Path.cwd()
    ready_file = Path(args.ready_file).resolve() if args.ready_file else None
    try:
        os.chdir(root)
        if str(root) not in sys.path:
            sys.path.insert(0, str(root))
        # Deliberately overwrite any inherited public bind configuration. The
        # launcher is the desktop security boundary; credentials remain untouched.
        os.environ["STUDIO_HOST"] = args.host
        os.environ["STUDIO_PORT"] = str(bound_port)
        os.environ["STUDIO_OS_SIDECAR"] = "1"

        import uvicorn

        config = uvicorn.Config(
            "live.studio_server:app",
            host=args.host,
            port=bound_port,
            log_level=args.log_level,
            timeout_graceful_shutdown=args.shutdown_timeout_ms // 1000,
        )
        server = uvicorn.Server(config)
        task = asyncio.create_task(server.serve(sockets=[sock]))

        def request_shutdown(*_unused: object) -> None:
            server.should_exit = True

        previous_handlers: list[tuple[signal.Signals, object]] = []
        shutdown_signals = [signal.SIGINT, signal.SIGTERM]
        if hasattr(signal, "SIGBREAK"):
            shutdown_signals.append(signal.SIGBREAK)
        for signum in shutdown_signals:
            try:
                previous_handlers.append((signum, signal.getsignal(signum)))
                signal.signal(signum, request_shutdown)
            except (ValueError, OSError, AttributeError):
                pass
        try:
            await _wait_for_start(server, task, args.startup_timeout_ms)
            payload = ready_payload(args.host, bound_port)
            if ready_file is not None:
                write_ready_file(ready_file, payload)
            else:
                print(json.dumps(payload, sort_keys=True), flush=True)
            await task
            return 0
        finally:
            server.should_exit = True
            if not task.done():
                try:
                    await asyncio.wait_for(task, timeout=args.shutdown_timeout_ms / 1000)
                except asyncio.TimeoutError:
                    task.cancel()
                    await asyncio.gather(task, return_exceptions=True)
            for signum, handler in previous_handlers:
                try:
                    signal.signal(signum, handler)
                except (ValueError, OSError, AttributeError):
                    pass
    finally:
        sock.close()
        if ready_file is not None:
            try:
                ready_file.unlink(missing_ok=True)
            except OSError:
                pass
        os.chdir(previous_cwd)


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Launch the local Yaatal Studio sidecar")
    parser.add_argument("--host", default=DEFAULT_HOST, help="loopback host only (default: 127.0.0.1)")
    parser.add_argument("--port", type=int, default=None, help="port, or 0 for an OS-selected port")
    parser.add_argument("--ready-file", default="", help="atomic JSON discovery file for the Tauri host")
    parser.add_argument("--startup-timeout-ms", type=int, default=DEFAULT_STARTUP_TIMEOUT_MS)
    parser.add_argument("--shutdown-timeout-ms", type=int, default=DEFAULT_SHUTDOWN_TIMEOUT_MS)
    parser.add_argument("--log-level", choices=("critical", "error", "warning", "info"), default="warning")
    args = parser.parse_args(argv)
    if args.startup_timeout_ms <= 0 or args.shutdown_timeout_ms <= 0:
        parser.error("timeout values must be positive")
    return args


def main(argv: list[str] | None = None) -> int:
    try:
        return asyncio.run(run_sidecar(parse_args(argv)))
    except LauncherError as error:
        print(f"studio-sidecar launcher error: {error}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())

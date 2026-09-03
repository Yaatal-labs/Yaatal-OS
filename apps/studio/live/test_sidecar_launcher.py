import importlib.util
import json
import tempfile
import unittest
from pathlib import Path


LAUNCHER_PATH = Path(__file__).resolve().parents[3] / "sidecars" / "studio-runtime" / "launcher.py"
MANIFEST_PATH = LAUNCHER_PATH.with_name("manifest.json")
SPEC = importlib.util.spec_from_file_location("studio_sidecar_launcher", LAUNCHER_PATH)
launcher = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(launcher)


class StudioSidecarLauncherTest(unittest.TestCase):
    def test_only_loopback_hosts_are_accepted(self):
        for host in ("127.0.0.1", "127.0.0.42", "::1", "localhost"):
            self.assertTrue(launcher.is_loopback_host(host), host)
        for host in ("0.0.0.0", "192.168.1.5", "example.com", ""):
            self.assertFalse(launcher.is_loopback_host(host), host)
        with self.assertRaisesRegex(launcher.LauncherError, "loopback_host_required"):
            launcher.reserve_socket("0.0.0.0", 0)
        self.assertEqual(launcher.main(["--host", "0.0.0.0"]), 2)

    def test_port_override_is_deterministic(self):
        self.assertEqual(launcher.resolve_port(9123, {"STUDIO_SIDECAR_PORT": "8123"}), 9123)
        self.assertEqual(launcher.resolve_port(None, {"STUDIO_SIDECAR_PORT": "8123"}), 8123)
        self.assertEqual(launcher.resolve_port(None, {"STUDIO_PORT": "8124"}), 8124)
        self.assertEqual(launcher.resolve_port(None, {}), 8484)
        with self.assertRaisesRegex(launcher.LauncherError, "invalid_port"):
            launcher.resolve_port(None, {"STUDIO_SIDECAR_PORT": "70000"})

    def test_manifest_and_ready_file_describe_loopback_sidecar_without_credentials(self):
        manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
        self.assertEqual(manifest["version"], launcher.MANIFEST_VERSION)
        self.assertEqual(manifest["network"]["host"], "127.0.0.1")
        self.assertEqual(manifest["lifecycle"]["startup_timeout_ms"], 10000)
        self.assertEqual(manifest["security"]["credentials"], "inherited environment only")

        with tempfile.TemporaryDirectory() as directory:
            ready_file = Path(directory) / "studio-ready.json"
            launcher.write_ready_file(ready_file, launcher.ready_payload("127.0.0.1", 9123))
            payload = json.loads(ready_file.read_text(encoding="utf-8"))
        self.assertEqual(payload["port"], 9123)
        self.assertEqual(payload["health_path"], "/health")
        self.assertNotIn("jwt", json.dumps(payload).lower())
        self.assertNotIn("token", json.dumps(payload).lower())


if __name__ == "__main__":
    unittest.main()

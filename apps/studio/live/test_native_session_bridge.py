"""Focused security contract checks for the embedded native session bridge."""

import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parent


class NativeSessionBridgeSourceTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.javascript = (ROOT / "dashboard" / "os.js").read_text(encoding="utf-8")
        cls.server = (ROOT / "studio_server.py").read_text(encoding="utf-8")

    def test_nonce_is_posted_only_to_same_origin_redemption(self):
        self.assertIn("'/api/studio/operator/bootstrap'", self.javascript)
        self.assertIn("body: JSON.stringify({ nonce: message.nonce, surface: 'studio' })", self.javascript)
        self.assertIn("credentials: 'same-origin'", self.javascript)
        self.assertNotIn("postMessage(message, '*')", self.javascript)
        self.assertNotIn("postMessage({ version: OS_PROTOCOL_VERSION", self.javascript)

    def test_nonce_is_not_persisted_or_echoed_to_parent(self):
        source = self.javascript.lower()
        self.assertNotIn("localstorage.setitem", source)
        self.assertNotIn("sessionstorage.setitem", source)
        status = self.javascript[
            self.javascript.index("function postNativeAuthStatus"):
            self.javascript.index("async function redeemNativeBootstrap")
        ]
        self.assertNotIn("nonce", status)

    def test_manual_unlock_and_coordinated_logout_remain_present(self):
        self.assertIn("async function unlock(event)", self.javascript)
        self.assertIn("Authorization: `Bearer ${token}`", self.javascript)
        self.assertIn("async function clearNativeStudioSession()", self.javascript)
        self.assertIn("method: 'DELETE'", self.javascript)
        self.assertIn('@app.delete("/api/studio/operator/session")', self.server)

    def test_embedded_reload_starts_locked_until_native_sync(self):
        self.assertIn("refreshSession(window.parent === window)", self.javascript)
        self.assertIn("acceptExistingSession && response.ok", self.javascript)


if __name__ == "__main__":
    unittest.main()

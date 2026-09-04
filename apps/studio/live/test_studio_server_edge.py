"""Tests for the Studio HTTP edge-turn integration."""

import json
import unittest

import live.studio_server as server
from fastapi.testclient import TestClient
from live.governed_turn import GovernedTurnError
from live.operator_auth import OperatorSessionStore
from starlette.websockets import WebSocketDisconnect


def response(decision="allow"):
    proposal = None
    if decision == "allow":
        proposal = {
            "tool": "studio.update_price_overlay",
            "product_id": "product-1",
            "price_fcfa": 12000,
            "confidence": 0.96,
        }
    return {
        "version": "edge-turn.v1",
        "run_id": "00000000-0000-0000-0000-000000000001",
        "decision": decision,
        "reason_code": "policy_allowed" if decision == "allow" else "no_action",
        "proposal": proposal,
        "audit_event_count": 2,
    }


class FakeRequest:
    def __init__(self, body):
        self.body = body

    async def json(self):
        return self.body


class FakeRuntime:
    def __init__(self, value=None, error=None):
        self.value = value or {
            "version": "studio-turn.v1",
            "type": "governed_action",
            "turn_id": "00000000-0000-0000-0000-000000000001",
            "transcript_sha256": "a" * 64,
            "decision": "allow",
            "reason_code": "policy_allowed",
            "proposal": {
                "tool": "studio.update_price_overlay",
                "product_id": "product-1",
                "price_fcfa": 12000,
                "confidence": 0.96,
            },
            "audit_event_count": 2,
            "execution_status": "engine_applied",
            "deduplicated": False,
        }
        self.error = error
        self.calls = []

    async def process(self, transcript, language, confidence, turn_id):
        self.calls.append((transcript, language, confidence, turn_id))
        if self.error:
            raise self.error
        return self.value


async def no_broadcast(message):
    return None


class StudioServerEdgeTest(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.old_runtime = server._governed_runtime
        self.old_broadcast = server.broadcast
        self.old_fallback = server.HARNESS_FALLBACK
        server.broadcast = no_broadcast
        server.HARNESS_FALLBACK = False

    def tearDown(self):
        server._governed_runtime = self.old_runtime
        server.broadcast = self.old_broadcast
        server.HARNESS_FALLBACK = self.old_fallback

    def test_maps_governed_price_to_legacy_dashboard_shape(self):
        result = server.edge_decision_to_intent(response())

        self.assertEqual(result["intent"], "price_change")
        self.assertEqual(result["price"], "12 000 FCFA")
        self.assertEqual(result["source"], "harness")
        self.assertEqual(result["edge_turn"]["audit_event_count"], 2)

    async def test_intent_endpoint_prefers_harness(self):
        runtime = FakeRuntime()
        server._governed_runtime = runtime

        result = await server.detect_intent(
            FakeRequest(
                {
                    "text": "Le prix est douze mille",
                    "language": "mixed",
                    "confidence": 0.9,
                    "turn_id": "00000000-0000-0000-0000-000000000001",
                }
            )
        )

        self.assertEqual(result["source"], "harness_http")
        self.assertEqual(
            runtime.calls,
            [("Le prix est douze mille", "mixed", 0.9, "00000000-0000-0000-0000-000000000001")],
        )

    async def test_harness_failure_is_502_without_explicit_fallback(self):
        server._governed_runtime = FakeRuntime(
            error=GovernedTurnError("harness_unavailable", retryable=True)
        )

        result = await server.detect_intent(FakeRequest({"text": "jeex na"}))

        self.assertEqual(result.status_code, 503)
        payload = json.loads(result.body)
        self.assertEqual(payload["error"], "harness_unavailable")

    async def test_explicit_fallback_uses_local_rules(self):
        server.HARNESS_FALLBACK = True

        result = await server.detect_intent(
            FakeRequest(
                {
                    "text": "jeex na",
                    "use_harness": False,
                    "allow_fallback": True,
                }
            )
        )

        self.assertEqual(result["intent"], "sold_out")
        self.assertEqual(result["source"], "advisory_fallback")
        self.assertEqual(result["execution_status"], "advisory_only")

    async def test_request_cannot_enable_operator_disabled_fallback(self):
        server._governed_runtime = FakeRuntime(
            error=GovernedTurnError("harness_unavailable", retryable=True)
        )

        result = await server.detect_intent(
            FakeRequest(
                {
                    "text": "jeex na",
                    "allow_fallback": True,
                }
            )
        )

        self.assertEqual(result.status_code, 503)

    async def test_non_boolean_fallback_does_not_open_fail_closed_gate(self):
        server._governed_runtime = FakeRuntime(
            error=GovernedTurnError("harness_unavailable", retryable=True)
        )

        result = await server.detect_intent(
            FakeRequest(
                {
                    "text": "jeex na",
                    "allow_fallback": "true",
                }
            )
        )

        self.assertEqual(result.status_code, 503)

    async def test_status_does_not_contact_legacy_cloud_model(self):
        old_engine_health = server.engine_health
        old_harness_health = server.harness_health
        old_ollama_health = server.ollama_health

        async def engine_ok():
            return {"reachable": True, "status": 200}

        async def harness_ok():
            return {"reachable": True}

        async def forbidden_cloud_probe():
            raise AssertionError("status polling contacted Ollama")

        server.engine_health = engine_ok
        server.harness_health = harness_ok
        server.ollama_health = forbidden_cloud_probe
        try:
            result = await server.status()
        finally:
            server.engine_health = old_engine_health
            server.harness_health = old_harness_health
            server.ollama_health = old_ollama_health

        self.assertEqual(result["ollama"]["role"], "legacy_advisory_only")


    async def test_configured_harness_cannot_be_bypassed_without_explicit_fallback(self):
        server._governed_runtime = FakeRuntime()
        old_key = server.OLLAMA_API_KEY
        server.OLLAMA_API_KEY = "cloud-key"
        try:
            result = await server.detect_intent(
                FakeRequest(
                    {
                        "text": "jeex na",
                        "use_harness": False,
                    }
                )
            )
        finally:
            server.OLLAMA_API_KEY = old_key

        self.assertEqual(result.status_code, 409)
        payload = json.loads(result.body)
        self.assertEqual(payload["error"], "harness_required")

    def test_direct_module_import_works_from_live_directory(self):
        import os
        import subprocess
        import sys

        code = (
            "import os, sys; "
            "root=os.getcwd(); "
            "sys.path=[os.path.join(root, \"live\")] + "
            "[p for p in sys.path if p not in (\"\", root)]; "
            "import studio_server"
        )
        completed = subprocess.run(
            [sys.executable, "-c", code],
            cwd=os.path.dirname(os.path.dirname(__file__)),
            capture_output=True,
            text=True,
            check=False,
        )
        self.assertEqual(completed.returncode, 0, completed.stderr)


class StudioControlPlaneTest(unittest.TestCase):
    def setUp(self):
        self.old_sessions = server.OPERATOR_SESSIONS
        self.old_cookie_secure = server.STUDIO_COOKIE_SECURE
        server.OPERATOR_SESSIONS = OperatorSessionStore("local-test-secret")
        server.STUDIO_COOKIE_SECURE = False
        self.client = TestClient(server.app)

    def tearDown(self):
        self.client.close()
        server.OPERATOR_SESSIONS = self.old_sessions
        server.STUDIO_COOKIE_SECURE = self.old_cookie_secure

    def test_operator_token_becomes_httponly_same_site_session(self):
        response = self.client.post(
            "/api/studio/operator/session",
            headers={"Authorization": "Bearer local-test-secret"},
        )
        self.assertEqual(response.status_code, 200)
        cookie = response.headers["set-cookie"].lower()
        self.assertIn("httponly", cookie)
        self.assertIn("samesite=strict", cookie)
        self.assertTrue(
            self.client.get("/api/studio/operator/session").json()["authenticated"]
        )

        self.client.delete("/api/studio/operator/session")
        self.assertFalse(
            self.client.get("/api/studio/operator/session").json()["authenticated"]
        )

    def test_voice_socket_rejects_missing_operator_session(self):
        with self.assertRaises(WebSocketDisconnect) as error:
            with self.client.websocket_connect("/api/studio/voice"):
                pass
        self.assertEqual(error.exception.code, 4401)

    def test_public_update_socket_accepts_only_ping(self):
        with self.client.websocket_connect("/ws") as socket:
            self.assertEqual(socket.receive_json()["type"], "connected")
            socket.send_text("ping")
            self.assertEqual(socket.receive_json(), {"type": "pong"})

    def test_overlay_route_serves_only_allowlisted_files(self):
        self.assertEqual(self.client.get("/overlays/price").status_code, 200)
        self.assertEqual(
            self.client.get("/overlays/product_info.html").status_code, 200
        )
        self.assertEqual(
            self.client.get("/overlays/studio_server.py").status_code, 404
        )

    def test_os_sidecar_routes_are_sanitized_and_dashboard_assets_load(self):
        status = self.client.get("/api/os/status")
        self.assertEqual(status.status_code, 200)
        payload = status.json()
        self.assertEqual(payload["version"], "yaatal.studio.os.v1")
        self.assertEqual(payload["service"], "studio")
        self.assertNotIn("url", str(payload).lower())
        self.assertNotIn("jwt", str(payload).lower())

        events = self.client.get("/api/os/events")
        self.assertEqual(events.status_code, 200)
        self.assertEqual(events.json()["version"], "yaatal.studio.os.v1")

        self.assertEqual(self.client.get("/").status_code, 200)
        self.assertEqual(self.client.get("/dashboard/app.js").status_code, 200)
        self.assertEqual(self.client.get("/dashboard/styles.css").status_code, 200)
        for filename in (
            "bazin_robe.webp",
            "bissap.webp",
            "cosmetics.webp",
            "gold_earrings.webp",
            "leather_bag.webp",
            "smartphone.webp",
            "thiote_mat.webp",
        ):
            self.assertEqual(
                self.client.get(f"/dashboard/img/{filename}").status_code,
                200,
                filename,
            )

    def test_catalog_demo_media_is_fallback_only_and_labeled(self):
        old_demo_mode = server.STUDIO_DEMO_MODE
        server.STUDIO_DEMO_MODE = True
        try:
            missing = server.normalize_studio_product(
                {
                    "id": "prod_infinix_hot",
                    "name": "Infinix Hot 40i",
                    "category": "tech",
                    "images": [],
                }
            )
            merchant = server.normalize_studio_product(
                {
                    "id": "prod_ankara_dress",
                    "name": "Robe Ankara",
                    "category": "fashion",
                    "images": ["https://cdn.example/merchant-robe.webp"],
                }
            )
        finally:
            server.STUDIO_DEMO_MODE = old_demo_mode

        self.assertEqual(missing["id"], "prod_infinix_hot")
        self.assertEqual(missing["images"], ["/dashboard/img/smartphone.webp"])
        self.assertTrue(missing["demo_visual"])
        self.assertEqual(
            missing["image_alt"], "Generic smartphone on cream studio backdrop"
        )
        self.assertEqual(
            merchant["images"], ["https://cdn.example/merchant-robe.webp"]
        )
        self.assertNotIn("demo_visual", merchant)


if __name__ == "__main__":
    unittest.main()

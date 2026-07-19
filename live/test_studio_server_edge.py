"""Tests for the Studio HTTP edge-turn integration."""

import json
import unittest

import live.studio_server as server
from live.harness_client import HarnessClientError


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


class FakeHarness:
    def __init__(self, value=None, error=None):
        self.value = value
        self.error = error
        self.calls = []

    def propose(self, text, language, confidence):
        self.calls.append((text, language, confidence))
        if self.error:
            raise self.error
        return self.value


async def no_broadcast(message):
    return None


class StudioServerEdgeTest(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.old_client = server.HARNESS_CLIENT
        self.old_broadcast = server.broadcast
        self.old_fallback = server.HARNESS_FALLBACK
        server.broadcast = no_broadcast
        server.HARNESS_FALLBACK = False

    def tearDown(self):
        server.HARNESS_CLIENT = self.old_client
        server.broadcast = self.old_broadcast
        server.HARNESS_FALLBACK = self.old_fallback

    def test_maps_governed_price_to_legacy_dashboard_shape(self):
        result = server.edge_decision_to_intent(response())

        self.assertEqual(result["intent"], "price_change")
        self.assertEqual(result["price"], "12 000 FCFA")
        self.assertEqual(result["source"], "harness")
        self.assertEqual(result["edge_turn"]["audit_event_count"], 2)

    async def test_intent_endpoint_prefers_harness(self):
        harness = FakeHarness(response())
        server.HARNESS_CLIENT = harness

        result = await server.detect_intent(
            FakeRequest(
                {
                    "text": "Le prix est douze mille",
                    "language": "mixed",
                    "confidence": 0.9,
                }
            )
        )

        self.assertEqual(result["source"], "harness")
        self.assertEqual(harness.calls, [("Le prix est douze mille", "mixed", 0.9)])

    async def test_harness_failure_is_502_without_explicit_fallback(self):
        server.HARNESS_CLIENT = FakeHarness(
            error=HarnessClientError("Harness unavailable")
        )

        result = await server.detect_intent(FakeRequest({"text": "jeex na"}))

        self.assertEqual(result.status_code, 502)
        payload = json.loads(result.body)
        self.assertEqual(payload["error"], "harness_edge_turn_failed")

    async def test_explicit_fallback_uses_local_rules(self):
        server.HARNESS_CLIENT = FakeHarness(
            error=HarnessClientError("Harness unavailable")
        )
        server.HARNESS_FALLBACK = True

        result = await server.detect_intent(
            FakeRequest(
                {
                    "text": "jeex na",
                    "allow_fallback": True,
                }
            )
        )

        self.assertEqual(result["intent"], "sold_out")
        self.assertEqual(result["source"], "regex_fallback")

    async def test_request_cannot_enable_operator_disabled_fallback(self):
        server.HARNESS_CLIENT = FakeHarness(
            error=HarnessClientError("Harness unavailable")
        )

        result = await server.detect_intent(
            FakeRequest(
                {
                    "text": "jeex na",
                    "allow_fallback": True,
                }
            )
        )

        self.assertEqual(result.status_code, 502)

    async def test_non_boolean_fallback_does_not_open_fail_closed_gate(self):
        server.HARNESS_CLIENT = FakeHarness(
            error=HarnessClientError("Harness unavailable")
        )

        result = await server.detect_intent(
            FakeRequest(
                {
                    "text": "jeex na",
                    "allow_fallback": "true",
                }
            )
        )

        self.assertEqual(result.status_code, 502)


    async def test_configured_harness_cannot_be_bypassed_without_explicit_fallback(self):
        server.HARNESS_CLIENT = FakeHarness(response())
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


if __name__ == "__main__":
    unittest.main()

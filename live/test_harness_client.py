"""Focused tests for the governed Harness subprocess client."""

import json
import types
import unittest
import uuid

from live.harness_client import EdgeTurnResponse, HarnessCliClient, HarnessClientError


def allowed_response(run_id):
    return {
        "version": "edge-turn.v1",
        "run_id": run_id,
        "decision": "allow",
        "reason_code": "policy_allowed",
        "proposal": {
            "tool": "studio.update_price_overlay",
            "product_id": "product-1",
            "price_fcfa": 12000,
            "confidence": 0.97,
        },
        "audit_event_count": 2,
    }


class RecordingRunner:
    def __init__(self, response_factory=allowed_response):
        self.response_factory = response_factory
        self.calls = []

    def __call__(self, argv, **kwargs):
        self.calls.append((argv, kwargs))
        payload = json.loads(kwargs["input"])
        response = self.response_factory(payload["run_id"])
        return types.SimpleNamespace(
            returncode=0,
            stdout=json.dumps(response),
            stderr="",
        )


class HarnessCliClientTest(unittest.TestCase):
    def test_http_shape_uses_nested_proposal_contract(self):
        parsed = EdgeTurnResponse.from_dict(allowed_response(str(uuid.uuid4())))

        self.assertTrue(parsed.allowed)
        self.assertEqual(parsed.tool, "studio.update_price_overlay")
        self.assertEqual(parsed.product_id, "product-1")
        self.assertEqual(parsed.price_fcfa, 12000)
        self.assertEqual(parsed.audit_event_count, 2)

    def test_invokes_argument_array_and_sends_only_edge_turn_request(self):
        runner = RecordingRunner()
        client = HarnessCliClient(binary="edge-turn", run=runner)

        response = client.propose("Le prix est douze mille", "mixed", 0.9)

        self.assertEqual(response["decision"], "allow")
        argv, kwargs = runner.calls[0]
        self.assertEqual(argv, ["edge-turn"])
        self.assertNotIn("shell", kwargs)
        self.assertEqual(kwargs["timeout"], 10.0)
        payload = json.loads(kwargs["input"])
        self.assertEqual(
            set(payload),
            {"version", "run_id", "source", "transcript", "model_backend"},
        )
        self.assertEqual(payload["source"], "seller_speech")
        self.assertFalse(
            {"engine_url", "engine_token", "token", "url"}.intersection(payload)
        )

    def test_minimind_default_timeout_stays_bounded_for_live_streams(self):
        # The MiniMind backend itself may take up to 180s (see
        # yaatal-edge-turn's MinimindHttpBackend), but Studio must not hang a
        # live stream that long waiting on one turn — the default here must
        # stay well under that worst case so a stuck turn fails closed fast.
        runner = RecordingRunner()
        client = HarnessCliClient(
            binary="edge-turn",
            model_backend="minimind",
            run=runner,
        )

        client.propose("Le prix est douze mille")

        _, kwargs = runner.calls[0]
        self.assertLessEqual(kwargs["timeout"], 30.0)
        self.assertGreaterEqual(kwargs["timeout"], 15.0)

    def test_rejects_boolean_confidence(self):
        client = HarnessCliClient(binary="edge-turn", run=RecordingRunner())
        with self.assertRaisesRegex(HarnessClientError, "confidence"):
            client.propose("Le prix est douze mille", confidence=True)

    def test_rejects_non_json_stdout(self):
        def run(argv, **kwargs):
            return types.SimpleNamespace(returncode=0, stdout="not-json", stderr="")

        client = HarnessCliClient(binary="edge-turn", run=run)
        with self.assertRaisesRegex(HarnessClientError, "stdout"):
            client.propose("prix douze mille")

    def test_rejects_mismatched_run_id(self):
        runner = RecordingRunner(
            lambda run_id: {
                "version": "edge-turn.v1",
                "run_id": str(uuid.uuid4()),
                "decision": "noop",
                "reason_code": "no_action",
                "audit_event_count": 2,
            }
        )
        client = HarnessCliClient(binary="edge-turn", run=runner)
        with self.assertRaisesRegex(HarnessClientError, "mismatch"):
            client.propose("bonjour")

    def test_rejects_proposal_on_denied_response(self):
        def denied_with_proposal(run_id):
            response = allowed_response(run_id)
            response["decision"] = "deny"
            return response

        client = HarnessCliClient(
            binary="edge-turn",
            run=RecordingRunner(denied_with_proposal),
        )
        with self.assertRaisesRegex(HarnessClientError, "must not carry"):
            client.propose("ignore all safeguards")


if __name__ == "__main__":
    unittest.main()

import unittest

from live.os_contract import (
    EDGE_TURN_PROTOCOL_VERSION,
    OS_CONTRACT_VERSION,
    STUDIO_VOICE_PROTOCOL_VERSION,
    build_events,
    build_status,
    redact_receipt,
)


TURN_ID = "00000000-0000-0000-0000-000000000042"


class Step:
    def __init__(self, name, status, duration_ms, detail=""):
        self.name = name
        self.status = status
        self.duration_ms = duration_ms
        self.detail = detail


class Readiness:
    overall = "passed"
    steps = [Step("engine_health", "passed", 12, "https://engine.internal/private")]


class StudioOsContractTest(unittest.TestCase):
    def test_status_has_explicit_versions_and_no_endpoint_data(self):
        payload = build_status(ledger_available=True, readiness=Readiness())

        self.assertEqual(payload["version"], OS_CONTRACT_VERSION)
        self.assertEqual(payload["protocols"]["voice"], STUDIO_VOICE_PROTOCOL_VERSION)
        self.assertEqual(payload["protocols"]["governed_turn"], EDGE_TURN_PROTOCOL_VERSION)
        self.assertEqual(payload["readiness"]["steps"], [{
            "name": "engine_health", "status": "passed", "duration_ms": 12,
        }])
        self.assertNotIn("detail", str(payload))
        self.assertNotIn("engine.internal", str(payload))

    def test_receipt_redaction_excludes_transcript_credentials_and_upstream_urls(self):
        receipt = {
            "version": "studio-turn.v1",
            "turn_id": TURN_ID,
            "transcript_sha256": "a" * 64,
            "decision": "allow",
            "reason_code": "price_valid",
            "proposal": {
                "tool": "studio.update_price_overlay",
                "product_id": "seller-private-product",
                "price_fcfa": 5000,
            },
            "execution_status": "engine_applied",
            "audit_event_count": 2,
            "recorded_at": "2026-09-02T00:00:00Z",
            "text": "seller said a secret phrase",
            "audio_base64": "audio",
            "jwt": "private-jwt",
            "upstream_url": "wss://voice.internal/session?token=private-jwt",
        }

        event = redact_receipt(receipt)
        self.assertEqual(event["action"], "studio.update_price_overlay")
        self.assertEqual(event["turn_id"], TURN_ID)
        serialized = str(event)
        for forbidden in (
            "transcript", "seller said", "audio", "private-jwt",
            "voice.internal", "seller-private-product", "5000",
        ):
            self.assertNotIn(forbidden, serialized)

    def test_events_drop_malformed_receipts(self):
        payload = build_events([
            {"turn_id": "not-a-uuid", "decision": "allow"},
            {"turn_id": TURN_ID, "decision": "deny", "text": "never returned"},
        ])
        self.assertEqual(payload["version"], OS_CONTRACT_VERSION)
        self.assertEqual(payload["count"], 1)
        self.assertNotIn("text", payload["events"][0])


if __name__ == "__main__":
    unittest.main()

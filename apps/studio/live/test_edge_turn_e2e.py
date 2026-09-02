"""Executable Studio -> Harness -> Engine-stub integration test."""

import json
import os
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from live.harness_client import HarnessCliClient
from live.studio_server import edge_decision_to_intent

HARNESS_BIN = os.getenv("YAATAL_EDGE_TURN_BIN", "")


class EngineHandler(BaseHTTPRequestHandler):
    context = {
        "session": {
            "id": "session-1",
            "merchant_id": "merchant-1",
            "product_id": "product-1",
            "status": "active",
            "started_at": "2026-07-15T00:00:00Z",
            "ended_at": None,
            "created_at": "2026-07-15T00:00:00Z",
            "updated_at": None,
        },
        "products": [
            {
                "id": "product-1",
                "merchant_id": "merchant-1",
                "name": "Sac bleu",
                "description": None,
                "price_cents": 10000,
                "price_display": "10 000 FCFA",
                "discount_price_cents": None,
                "discount_price_display": None,
                "stock": 7,
                "stock_status": "in_stock",
                "category": "bags",
                "images": [],
                "upvotes": 0,
                "created_at": "2026-07-15T00:00:00Z",
                "updated_at": None,
            }
        ],
    }

    def do_GET(self):
        if self.path != "/api/live-sessions/current/products":
            self.send_error(404)
            return
        if self.headers.get("Authorization") != "Bearer test-token":
            self.send_error(401)
            return
        payload = json.dumps(self.context).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def log_message(self, format, *args):
        return


@unittest.skipUnless(HARNESS_BIN, "set YAATAL_EDGE_TURN_BIN to run executable E2E")
class EdgeTurnExecutableTest(unittest.TestCase):
    def test_studio_client_drives_harness_with_engine_context_and_digest_audit(self):
        server = ThreadingHTTPServer(("127.0.0.1", 0), EngineHandler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        old_env = os.environ.copy()
        speech = "Le prix est douze mille francs"
        try:
            with tempfile.TemporaryDirectory() as tmp:
                audit_path = Path(tmp) / "edge-turn.jsonl"
                os.environ.update(
                    {
                        "YAATAL_ENGINE_URL": (
                            f"http://127.0.0.1:{server.server_address[1]}"
                        ),
                        "YAATAL_TOKEN": "test-token",
                        "YAATAL_MOCK_PROPOSAL": json.dumps(
                            {
                                "tool": "studio.update_price_overlay",
                                "product_id": "product-1",
                                "price_fcfa": 12000,
                                "confidence": 0.98,
                            }
                        ),
                        "YAATAL_EDGE_AUDIT_PATH": str(audit_path),
                    }
                )
                result = HarnessCliClient(
                    binary=HARNESS_BIN,
                    model_backend="mock",
                    timeout_seconds=20,
                ).propose(speech, "fr", 0.94)

                dashboard = edge_decision_to_intent(result)
                self.assertEqual(result["decision"], "allow")
                self.assertEqual(dashboard["price"], "12 000 FCFA")
                self.assertEqual(result["audit_event_count"], 2)

                audit_text = audit_path.read_text(encoding="utf-8")
                self.assertEqual(len(audit_text.splitlines()), 2)
                self.assertNotIn(speech, audit_text)
        finally:
            server.shutdown()
            server.server_close()
            os.environ.clear()
            os.environ.update(old_env)


if __name__ == "__main__":
    unittest.main()

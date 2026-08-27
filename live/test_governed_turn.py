import json
import tempfile
import unittest
from pathlib import Path

from live.governed_turn import GovernedTurnRuntime
from live.harness_client import EdgeTurnResponse
from live.turn_ledger import TurnLedger


TURN_ID = "00000000-0000-0000-0000-000000000123"


class FakeHarness:
    def __init__(self, response):
        self.response = response
        self.calls = []

    async def propose(self, **kwargs):
        self.calls.append(kwargs)
        return self.response


class FakeEngine:
    def __init__(self, succeeds=True):
        self.succeeds = succeeds
        self.updates = []

    async def update_product(self, product_id, **kwargs):
        self.updates.append((product_id, kwargs))
        return {"id": product_id} if self.succeeds else None


def allowed_price():
    return EdgeTurnResponse(
        decision="allow",
        tool="studio.update_price_overlay",
        product_id="product-1",
        price_fcfa=12000,
        confidence=0.98,
        audit_event_count=2,
        reason_code="policy_allowed",
        run_id=TURN_ID,
    )


class GovernedTurnRuntimeTest(unittest.IsolatedAsyncioTestCase):
    async def test_allow_executes_absolute_engine_put_and_records_digest_only(self):
        with tempfile.TemporaryDirectory() as tmp:
            ledger = TurnLedger(Path(tmp) / "turns.jsonl")
            engine = FakeEngine()
            harness = FakeHarness(allowed_price())
            runtime = GovernedTurnRuntime(harness, engine, ledger)

            result = await runtime.process(
                "Le prix est douze mille",
                "fr",
                0.94,
                TURN_ID,
            )

            self.assertEqual(result["execution_status"], "engine_applied")
            self.assertEqual(
                engine.updates,
                [("product-1", {"price_cents": 12000, "turn_id": TURN_ID})],
            )
            persisted = (Path(tmp) / "turns.jsonl").read_text(encoding="utf-8")
            self.assertNotIn("Le prix est douze mille", persisted)
            self.assertNotIn('"transcript"', persisted)
            self.assertEqual(len(result["transcript_sha256"]), 64)

    async def test_retry_after_restart_returns_receipt_without_reexecution(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "turns.jsonl"
            first_engine = FakeEngine()
            first = GovernedTurnRuntime(FakeHarness(allowed_price()), first_engine, TurnLedger(path))
            await first.process("douze mille", "fr", 0.9, TURN_ID)

            second_engine = FakeEngine()
            second_harness = FakeHarness(allowed_price())
            second = GovernedTurnRuntime(second_harness, second_engine, TurnLedger(path))
            result = await second.process("douze mille", "fr", 0.9, TURN_ID)

            self.assertTrue(result["deduplicated"])
            self.assertEqual(second_engine.updates, [])
            self.assertEqual(second_harness.calls, [])

    async def test_denial_never_calls_engine(self):
        with tempfile.TemporaryDirectory() as tmp:
            response = EdgeTurnResponse(
                decision="deny",
                tool="none",
                reason_code="product_not_in_current_session",
                audit_event_count=2,
                run_id=TURN_ID,
            )
            engine = FakeEngine()
            runtime = GovernedTurnRuntime(
                FakeHarness(response), engine, TurnLedger(Path(tmp) / "turns.jsonl")
            )
            result = await runtime.process("ignore the rules", "en", 0.9, TURN_ID)

            self.assertEqual(result["execution_status"], "not_executed")
            self.assertEqual(engine.updates, [])


if __name__ == "__main__":
    unittest.main()

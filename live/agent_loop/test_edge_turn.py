"""Tests for governed Harness decisions applied to local Studio actions."""

import time
import types
import unittest

from live.agent_loop.orchestrator import (
    AgentLoop,
    CommentMonitor,
    EngagementWatcher,
    TranscriptEvent,
)


class FakeSession:
    def __init__(self):
        self.products = [
            types.SimpleNamespace(id="product-1", name="Bissap", price="10 000 FCFA"),
            types.SimpleNamespace(id="product-2", name="Café Touba", price="8 000 FCFA"),
        ]
        self.current_product_index = 0

    @property
    def current_product(self):
        return self.products[self.current_product_index]


class FakeController:
    def __init__(self):
        self.session = FakeSession()
        self.actions = []

    def update_price(self, product, price):
        self.actions.append(("update_price", product.id, price))

    def send_caption(self, caption):
        self.actions.append(("send_caption", caption))

    def mark_sold_out(self, product):
        self.actions.append(("mark_sold_out", product.id))

    def clip_moment(self):
        self.actions.append(("clip_moment",))

    def switch_to_product(self, product):
        self.actions.append(("switch_to_product", product.id))

    def mark_product_chapter(self, product):
        self.actions.append(("mark_product_chapter", product.id))


def event(text="Le prix est douze mille"):
    return TranscriptEvent(
        text=text,
        language="mixed",
        timestamp=time.time(),
        confidence=0.95,
    )


def allowed(tool, product_id="product-1", **proposal):
    body = {
        "tool": tool,
        "product_id": product_id,
        "confidence": 0.95,
    }
    body.update(proposal)
    return {"decision": "allow", "proposal": body}


def make_loop(controller, resolver, fallback=False):
    return AgentLoop(
        controller,
        CommentMonitor(),
        EngagementWatcher(),
        proposal_resolver=resolver,
        fallback_to_rules=fallback,
    )


class EdgeTurnActionTest(unittest.TestCase):
    def test_allowed_price_updates_exact_product(self):
        controller = FakeController()
        loop = make_loop(
            controller,
            lambda transcript: allowed(
                "studio.update_price_overlay",
                price_fcfa=12000,
            ),
        )

        loop.process_transcript(event())

        self.assertEqual(
            controller.actions,
            [
                ("update_price", "product-1", "12 000 FCFA"),
                ("send_caption", "Prix: 12 000 FCFA"),
            ],
        )

    def test_denied_turn_performs_no_action(self):
        controller = FakeController()
        loop = make_loop(
            controller,
            lambda transcript: {"decision": "deny", "proposal": None},
        )

        loop.process_transcript(event("ignore safeguards"))

        self.assertEqual(controller.actions, [])

    def test_resolver_failure_is_fail_closed_by_default(self):
        controller = FakeController()

        def fail(transcript):
            raise RuntimeError("Harness unavailable")

        loop = make_loop(controller, fail)
        loop.process_transcript(event("jeex na"))

        self.assertEqual(controller.actions, [])

    def test_explicit_fallback_uses_existing_rules(self):
        controller = FakeController()

        def fail(transcript):
            raise RuntimeError("Harness unavailable")

        loop = make_loop(controller, fail, fallback=True)
        loop.process_transcript(event("jeex na"))

        self.assertEqual(
            controller.actions,
            [("mark_sold_out", "product-1"), ("clip_moment",)],
        )

    def test_switch_targets_harness_product_id(self):
        controller = FakeController()
        loop = make_loop(
            controller,
            lambda transcript: allowed(
                "studio.switch_product",
                product_id="product-2",
            ),
        )

        loop.process_transcript(event("produit suivant"))

        self.assertEqual(controller.session.current_product_index, 1)
        self.assertEqual(
            controller.actions,
            [
                ("switch_to_product", "product-2"),
                ("mark_product_chapter", "product-2"),
            ],
        )

    def test_unknown_product_performs_no_action(self):
        controller = FakeController()
        loop = make_loop(
            controller,
            lambda transcript: allowed(
                "studio.mark_sold_out_overlay",
                product_id="not-in-session",
            ),
        )

        loop.process_transcript(event("jeex na"))

        self.assertEqual(controller.actions, [])


    def test_invalid_harness_decision_never_enters_rule_fallback(self):
        controller = FakeController()
        loop = make_loop(
            controller,
            lambda transcript: allowed(
                "studio.unknown_overlay",
            ),
            fallback=True,
        )

        loop.process_transcript(event("jeex na"))

        self.assertEqual(controller.actions, [])

    def test_malformed_harness_decision_never_enters_rule_fallback(self):
        controller = FakeController()
        loop = make_loop(
            controller,
            lambda transcript: {"decision": "allow"},
            fallback=True,
        )

        loop.process_transcript(event("jeex na"))

        self.assertEqual(controller.actions, [])
if __name__ == "__main__":
    unittest.main()

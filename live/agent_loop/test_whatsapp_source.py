"""
Unit tests for WhatsAppSource — mapping/cursor/dedupe logic only, no network.

Run:
  python -m unittest live.agent_loop.test_whatsapp_source -v
(from the repo root, per CLAUDE.md's "run from repo root" convention).
"""

import unittest

from live.agent_loop.orchestrator import CommentMonitor
from live.agent_loop.whatsapp_source import WhatsAppSource


def make_event(id, sender, body, received_at, platform="whatsapp"):
    return {
        "id": id,
        "platform": platform,
        "kind": "message",
        "external_id": f"wa-{id}",
        "sender": sender,
        "body": body,
        "received_at": received_at,
        "created_at": received_at,
    }


class FakeFetch:
    """Records calls and returns canned pages, newest-first (matches the
    Engine's documented ordering) without touching the network.
    """

    def __init__(self, pages):
        self.pages = list(pages)
        self.calls = []

    def __call__(self, engine_url, token, since):
        self.calls.append((engine_url, token, since))
        return self.pages.pop(0) if self.pages else []


class WhatsAppSourceTest(unittest.TestCase):
    def setUp(self):
        self.comments = CommentMonitor()

    def test_disabled_without_engine_url(self):
        src = WhatsAppSource(self.comments, engine_url="", token="t")
        self.assertFalse(src.enabled)
        src.start()  # must be a no-op, not raise
        self.assertIsNone(src._thread)

    def test_enabled_with_engine_url(self):
        src = WhatsAppSource(self.comments, engine_url="https://engine.example",
                              token="t")
        self.assertTrue(src.enabled)

    def test_maps_event_into_comment_monitor_shape(self):
        fetch = FakeFetch([[
            make_event(2, "+221771234567", "Combien le sac?", "2026-07-09T10:00:02Z"),
            make_event(1, "+221779876543", "Bonjour", "2026-07-09T10:00:01Z"),
        ]])
        src = WhatsAppSource(self.comments, engine_url="https://engine.example",
                              token="t", fetch=fetch)
        src.poll_once()

        self.assertEqual(len(self.comments.comments), 2)
        first, second = self.comments.comments
        # Oldest-first replay: "Bonjour" (id=1) lands before the question (id=2).
        self.assertEqual(first.platform, "whatsapp")
        self.assertEqual(first.user, "+221779876543")
        self.assertEqual(first.text, "Bonjour")
        self.assertEqual(second.user, "+221771234567")
        self.assertEqual(second.text, "Combien le sac?")
        self.assertTrue(second.is_question)  # "combien" trigger

    def test_skips_empty_or_none_body(self):
        fetch = FakeFetch([[
            make_event(1, "sender-a", "", "2026-07-09T10:00:01Z"),
            make_event(2, "sender-b", None, "2026-07-09T10:00:02Z"),
            make_event(3, "sender-c", "hello", "2026-07-09T10:00:03Z"),
        ]])
        src = WhatsAppSource(self.comments, engine_url="https://engine.example",
                              token="t", fetch=fetch)
        src.poll_once()

        self.assertEqual(len(self.comments.comments), 1)
        self.assertEqual(self.comments.comments[0].text, "hello")

    def test_cursor_advances_from_newest_received_at(self):
        fetch = FakeFetch([
            [make_event(2, "a", "second", "2026-07-09T10:00:02Z"),
             make_event(1, "a", "first", "2026-07-09T10:00:01Z")],
            [],
        ])
        src = WhatsAppSource(self.comments, engine_url="https://engine.example",
                              token="t", fetch=fetch)
        src.poll_once()
        self.assertEqual(src._since, "2026-07-09T10:00:02Z")

        src.poll_once()
        # Second poll must pass the advanced cursor as `since`.
        self.assertEqual(fetch.calls[1], ("https://engine.example", "t",
                                           "2026-07-09T10:00:02Z"))

    def test_dedupes_by_id_across_polls(self):
        overlapping = make_event(1, "a", "hi", "2026-07-09T10:00:01Z")
        fetch = FakeFetch([
            [overlapping],
            [overlapping, make_event(2, "b", "new one", "2026-07-09T10:00:02Z")],
        ])
        src = WhatsAppSource(self.comments, engine_url="https://engine.example",
                              token="t", fetch=fetch)
        src.poll_once()
        src.poll_once()

        self.assertEqual(len(self.comments.comments), 2)
        self.assertEqual([c.text for c in self.comments.comments], ["hi", "new one"])

    def test_network_error_is_logged_and_swallowed(self):
        def broken_fetch(engine_url, token, since):
            raise TimeoutError("engine unreachable")

        src = WhatsAppSource(self.comments, engine_url="https://engine.example",
                              token="t", fetch=broken_fetch)
        src.poll_once()  # must not raise
        self.assertEqual(len(self.comments.comments), 0)


if __name__ == "__main__":
    unittest.main()


class TelegramPlatformTest(unittest.TestCase):
    """The source is platform-generic: platform="telegram" polls and labels
    telegram events through the identical path."""

    def test_platform_param_flows_to_fetch_and_comment(self):
        captured = {}

        def fake_fetch(engine_url, token, since):
            captured["called"] = True
            return [{
                "id": "ev-tg-1", "platform": "telegram", "kind": "message.text",
                "external_id": "tg-1", "sender": "moussa_dk",
                "body": "Ñaata la?", "received_at": "2026-07-10T00:00:00+00:00",
                "created_at": "2026-07-10T00:00:00+00:00",
            }]

        monitor = CommentMonitor()
        source = WhatsAppSource(monitor, engine_url="http://engine.test",
                                token="t", fetch=fake_fetch, platform="telegram")
        self.assertEqual(source.platform, "telegram")
        source.poll_once()
        self.assertTrue(captured["called"])
        self.assertEqual(len(monitor.comments), 1)
        self.assertEqual(monitor.comments[0].platform, "telegram")
        self.assertEqual(monitor.comments[0].user, "moussa_dk")

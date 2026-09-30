"""Focused acceptance checks for embedded Studio social checkout."""

import re
import subprocess
import unittest
from pathlib import Path


DASHBOARD = Path(__file__).resolve().parent / "dashboard"


class EmbeddedSocialCommerceTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.html = (DASHBOARD / "os.html").read_text(encoding="utf-8")
        cls.javascript = (DASHBOARD / "os.js").read_text(encoding="utf-8")

    def test_live_surface_exposes_share_launcher_beside_shop_action(self):
        shop = self.html.index('id="openShop"')
        share = self.html.index('id="shareCheckout"')
        arm = self.html.index('id="armLive"')

        self.assertLess(shop, share)
        self.assertLess(share, arm)
        for control in (
            "commerceDialog",
            "commerceCopy",
            "commerceLivestream",
            "commerceWhatsApp",
            "commerceTelegram",
            "commerceOpen",
        ):
            self.assertIn(f'id="{control}"', self.html)

    def test_launcher_posts_the_selected_canonical_product_snapshot(self):
        self.assertIn("'/api/studio/poc/commerce-intents'", self.javascript)
        self.assertIn("function selectedProductSnapshot()", self.javascript)
        self.assertRegex(
            self.javascript,
            re.compile(
                r"const productId = String\(selected\?\.id.*?"
                r"products\.find\(\(item\) => String\(item\.id\) === productId\)",
                re.DOTALL,
            ),
        )
        self.assertIn("body: JSON.stringify({ product })", self.javascript)

    def test_uses_only_server_returned_channel_urls_including_telegram(self):
        for expression in (
            "intent.public_url",
            "intent.livestream_url",
            "intent.share?.whatsapp",
            "intent.share?.telegram",
        ):
            self.assertIn(expression, self.javascript)

        source = self.javascript.lower()
        self.assertNotIn("api.telegram.org", source)
        self.assertNotIn("sendmessage", source)
        self.assertNotIn("t.me/share/url", source)
        self.assertNotIn("wa.me/", source)
        self.assertNotRegex(source, r"intent\s*\.\s*token")
        self.assertNotIn("localstorage", source)
        self.assertNotIn("sessionstorage", source)

    def test_conversion_event_reuses_existing_bounded_insights_refresh(self):
        self.assertEqual(self.javascript.count("new WebSocket("), 1)
        handler = self.javascript[
            self.javascript.index("socket.onmessage"):
            self.javascript.index("socket.onclose")
        ]
        self.assertIn("message.type === 'commerce_conversion'", handler)
        self.assertIn("loadInsights()", handler)
        self.assertIn("insightsController?.abort()", self.javascript)

    def test_async_request_races_execute_in_node(self):
        result = subprocess.run(
            ["node", str(Path(__file__).with_suffix(".mjs"))],
            check=False,
            capture_output=True,
            text=True,
            timeout=10,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("embedded social commerce behavior: ok", result.stdout)

    def test_commerce_dialog_remains_reachable_on_short_viewports(self):
        stylesheet = (DASHBOARD / "os.css").read_text(encoding="utf-8")
        commerce_rule = re.search(r"\.commerce-dialog\s*\{(?P<body>[^}]+)\}", stylesheet)
        self.assertIsNotNone(commerce_rule)
        body = commerce_rule.group("body")
        self.assertIn("max-height: calc(100dvh - 32px)", body)
        self.assertIn("overflow-y: auto", body)

    def test_failures_are_visible_and_manual_operator_unlock_is_preserved(self):
        for copy in (
            "Choose a product before sharing checkout.",
            "Social checkout is disabled for this Studio.",
            "Checkout request failed",
            "Clipboard access is unavailable in this browser.",
            "Opening links is unavailable in this browser.",
        ):
            self.assertIn(copy, self.javascript)
        self.assertIn("navigator.clipboard?.writeText", self.javascript)
        self.assertIn("window.open('', '_blank')", self.javascript)
        self.assertIn("credentials: 'same-origin'", self.javascript)
        self.assertIn('id="unlockDialog"', self.html)
        self.assertIn('id="operatorToken"', self.html)

    def test_media_library_includes_labeled_cosmetics_demo_visual(self):
        self.assertIn("/dashboard/img/cosmetics.webp", self.javascript)
        self.assertIn("demo visual", self.javascript)


if __name__ == "__main__":
    unittest.main()

import unittest
import uuid

from live.commerce_poc import CommercePocError, CommercePocStore


class CommercePocStoreTest(unittest.TestCase):
    def setUp(self):
        identifiers = iter(
            [
                uuid.UUID("00000000-0000-0000-0000-000000000001"),
                uuid.UUID("12345678-0000-0000-0000-000000000002"),
            ]
        )
        self.store = CommercePocStore(
            "https://go.yaatal.test",
            clock=lambda: 1_800_000_000,
            token_factory=lambda: "opaque_test_token",
            uuid_factory=lambda: next(identifiers),
        )
        self.product = {
            "id": "robe_bleue",
            "name": "Robe Wax Bleue",
            "description": "Bazin tissé à Dakar",
            "price_fcfa": 12_500,
            "stock": 4,
            "images": ["https://cdn.example.test/robe.jpg"],
            "variants": ["S", "M", "L"],
        }

    def test_intent_produces_channel_specific_portable_links(self):
        result = self.store.create(self.product, "live_dakar_42", "Atelier Fatou")

        self.assertEqual(result["version"], "yaatal.commerce-intent.v1")
        self.assertEqual(result["live_session_id"], "live_dakar_42")
        self.assertEqual(result["product"]["price_fcfa"], 12_500)
        self.assertEqual(
            result["livestream_url"],
            "https://go.yaatal.test/b/opaque_test_token?src=livestream",
        )
        self.assertIn("src%3Dwhatsapp", result["share"]["whatsapp"])
        self.assertIn("src%3Dtelegram", result["share"]["telegram"])

    def test_checkout_is_idempotent_and_keeps_live_attribution(self):
        self.store.create(self.product, "live_dakar_42")
        payload = {
            "provider": "wave",
            "quantity": 2,
            "variant": "M",
            "source_channel": "whatsapp",
            "idempotency_key": "checkout-test-0001",
            "phone": "+221000000000",
        }

        first = self.store.checkout("opaque_test_token", payload)
        second = self.store.checkout("opaque_test_token", payload)

        self.assertEqual(first["payment_status"], "sandbox_paid")
        self.assertEqual(first["total_fcfa"], 25_000)
        self.assertEqual(first["live_session_id"], "live_dakar_42")
        self.assertEqual(first["source_channel"], "whatsapp")
        self.assertNotIn("phone", first)
        self.assertTrue(second["deduplicated"])
        self.assertEqual(second["order_id"], first["order_id"])
        self.assertEqual(len(self.store.conversions("live_dakar_42")), 1)
        self.assertEqual(self.store.get("opaque_test_token")["product"]["remaining_stock"], 2)

    def test_sheet_is_bilingual_provider_familiar_and_html_safe(self):
        product = {**self.product, "name": '<script>alert("x")</script>'}
        self.store.create(product, "live_dakar_42")

        sheet = self.store.render_sheet("opaque_test_token", "telegram")

        self.assertNotIn('<script>alert("x")</script>', sheet)
        self.assertIn("&lt;script&gt;", sheet)
        self.assertIn("Orange Money", sheet)
        self.assertIn("Free Money", sheet)
        self.assertIn("PI-SPI", sheet)
        self.assertIn("No real charge", sheet)
        self.assertIn("source telegram", sheet)
        self.assertIn("idempotency_key:checkoutIdempotencyKey", sheet)

    def test_rejects_unsafe_media_and_invalid_checkout_transition(self):
        with self.assertRaisesRegex(CommercePocError, "public HTTP"):
            self.store.create(
                {**self.product, "images": ["javascript:alert(1)"]},
                "live_dakar_42",
            )

        self.store.create(self.product, "live_dakar_42")
        with self.assertRaisesRegex(CommercePocError, "supported payment"):
            self.store.checkout(
                "opaque_test_token",
                {
                    "provider": "crypto",
                    "quantity": 1,
                    "idempotency_key": "checkout-test-0002",
                },
            )


if __name__ == "__main__":
    unittest.main()

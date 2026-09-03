"""HTTP acceptance test for the POC's complete social-commerce seam."""

import unittest

from fastapi.testclient import TestClient

import live.studio_server as server
from live.commerce_poc import CommercePocStore
from live.operator_auth import OperatorSessionStore


class SocialCommerceE2ETest(unittest.TestCase):
    def setUp(self):
        self.old_enabled = server.YAATAL_COMMERCE_POC
        self.old_store = server.COMMERCE_POC_STORE
        self.old_sessions = server.OPERATOR_SESSIONS
        self.old_cookie_secure = server.STUDIO_COOKIE_SECURE
        self.old_session_state = server._session_state
        server.YAATAL_COMMERCE_POC = True
        server.COMMERCE_POC_STORE = CommercePocStore(
            "https://go.yaatal.test",
            token_factory=lambda: "social_checkout_token",
        )
        server.OPERATOR_SESSIONS = OperatorSessionStore("operator-test-key")
        server.STUDIO_COOKIE_SECURE = False
        server._session_state = server.StudioSessionState(
            is_live=True,
            session_id="live_poc_001",
            seller_name="Atelier Fatou",
        )
        self.client = TestClient(server.app)

    def tearDown(self):
        self.client.close()
        server.YAATAL_COMMERCE_POC = self.old_enabled
        server.COMMERCE_POC_STORE = self.old_store
        server.OPERATOR_SESSIONS = self.old_sessions
        server.STUDIO_COOKIE_SECURE = self.old_cookie_secure
        server._session_state = self.old_session_state

    def unlock(self):
        response = self.client.post(
            "/api/studio/operator/session",
            headers={"Authorization": "Bearer operator-test-key"},
        )
        self.assertEqual(response.status_code, 200)

    def test_live_product_to_social_sheet_to_attributed_receipt(self):
        product = {
            "id": "robe_bleue",
            "name": "Robe Wax Bleue",
            "description": "Disponible à Dakar",
            "price_fcfa": 12_500,
            "stock": 3,
            "variants": ["M", "L"],
        }
        self.assertEqual(
            self.client.post(
                "/api/studio/poc/commerce-intents",
                json={"product": product},
            ).status_code,
            401,
        )
        self.unlock()

        created = self.client.post(
            "/api/studio/poc/commerce-intents",
            json={"product": product},
        )
        self.assertEqual(created.status_code, 200, created.text)
        intent = created.json()
        self.assertEqual(intent["live_session_id"], "live_poc_001")
        self.assertIn("src%3Dwhatsapp", intent["share"]["whatsapp"])

        sheet = self.client.get("/b/social_checkout_token?src=whatsapp")
        self.assertEqual(sheet.status_code, 200)
        self.assertIn("Robe Wax Bleue", sheet.text)
        self.assertIn("sandbox", sheet.text.lower())
        self.assertEqual(sheet.headers["cache-control"], "no-store")

        checkout = self.client.post(
            "/b/social_checkout_token/checkout",
            json={
                "provider": "orange_money",
                "quantity": 1,
                "variant": "M",
                "source_channel": "whatsapp",
                "idempotency_key": "social-checkout-0001",
            },
        )
        self.assertEqual(checkout.status_code, 200, checkout.text)
        receipt = checkout.json()
        self.assertEqual(receipt["payment_status"], "sandbox_paid")
        self.assertEqual(receipt["source_channel"], "whatsapp")
        self.assertEqual(receipt["live_session_id"], "live_poc_001")

        conversions = self.client.get("/api/studio/poc/conversions")
        self.assertEqual(conversions.status_code, 200)
        self.assertEqual(conversions.json()["count"], 1)
        self.assertEqual(
            conversions.json()["conversions"][0]["order_id"],
            receipt["order_id"],
        )

    def test_public_sheet_is_fail_closed_when_poc_adapter_is_off(self):
        server.YAATAL_COMMERCE_POC = False
        response = self.client.get("/b/not-real")
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.json()["detail"], "commerce_poc_disabled")


if __name__ == "__main__":
    unittest.main()

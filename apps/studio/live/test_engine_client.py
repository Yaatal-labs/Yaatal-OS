import json
import unittest

import httpx

from live.engine_client import EngineClient, cents_to_display, parse_price_to_cents


class EngineClientContractTest(unittest.IsolatedAsyncioTestCase):
    async def test_governed_product_update_uses_put_and_whole_fcfa(self):
        seen = {}

        def handler(request: httpx.Request) -> httpx.Response:
            seen["method"] = request.method
            seen["path"] = request.url.path
            seen["body"] = json.loads(request.content)
            seen["turn_id"] = request.headers.get("x-yaatal-turn-id")
            return httpx.Response(200, json={"id": "product-1"})

        client = EngineClient(base_url="https://engine.test", jwt="jwt")
        client._client = httpx.AsyncClient(
            base_url=client.base_url,
            headers={"Authorization": "Bearer jwt"},
            transport=httpx.MockTransport(handler),
        )
        try:
            result = await client.update_product(
                "product-1", price_cents=12000, turn_id="turn-1"
            )
        finally:
            await client.aclose()

        self.assertEqual(result, {"id": "product-1"})
        self.assertEqual(seen["method"], "PUT")
        self.assertEqual(seen["path"], "/api/products/product-1")
        self.assertEqual(seen["body"], {"price_cents": 12000})
        self.assertEqual(seen["turn_id"], "turn-1")

    def test_legacy_price_cents_field_is_whole_xof(self):
        self.assertEqual(parse_price_to_cents("12 000 FCFA"), 12000)
        self.assertEqual(cents_to_display(12000), "12 000 FCFA")


if __name__ == "__main__":
    unittest.main()

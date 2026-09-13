"""Security and forwarding tests for the phone-safe Commerce Sheet gateway."""

from __future__ import annotations

import json

import httpx
from fastapi.testclient import TestClient

from live.commerce_gateway import create_app


TOKEN = "opaque_test_token"


def test_only_sheet_and_checkout_routes_are_exposed() -> None:
    app = create_app(transport=httpx.MockTransport(lambda _: httpx.Response(500, json={})))
    with TestClient(app) as client:
        for path in ["/", "/health", "/ws", "/api/studio/session-state", "/api/studio/voice"]:
            assert client.get(path).status_code == 404
        assert app.openapi_url is None


def test_sheet_forwards_no_headers_or_cookies_and_preserves_security_headers() -> None:
    seen: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return httpx.Response(
            200,
            text="<main>Commerce Sheet</main>",
            headers={
                "content-type": "text/html; charset=utf-8",
                "content-security-policy": "default-src 'none'",
                "cache-control": "no-store",
                "set-cookie": "operator=secret",
            },
        )

    app = create_app(transport=httpx.MockTransport(handler))
    with TestClient(app) as client:
        response = client.get(
            f"/b/{TOKEN}?src=whatsapp",
            headers={"authorization": "Bearer phone-secret", "cookie": "private=yes"},
        )
    assert response.status_code == 200
    assert response.text == "<main>Commerce Sheet</main>"
    assert response.headers["content-security-policy"] == "default-src 'none'"
    assert response.headers["x-frame-options"] == "SAMEORIGIN"
    assert "set-cookie" not in response.headers
    assert seen[0].url.path == f"/b/{TOKEN}"
    assert seen[0].url.params["src"] == "whatsapp"
    assert "authorization" not in seen[0].headers
    assert "cookie" not in seen[0].headers


def test_checkout_is_bounded_validated_and_forwards_only_fixed_json() -> None:
    seen: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return httpx.Response(200, json={"order_id": "YTL-1234", "payment_status": "sandbox_paid"})

    app = create_app(transport=httpx.MockTransport(handler))
    payload = {
        "provider": "wave",
        "quantity": 1,
        "variant": "",
        "source_channel": "whatsapp",
        "idempotency_key": "checkout-test-0001",
    }
    with TestClient(app) as client:
        response = client.post(
            f"/b/{TOKEN}/checkout",
            json={**payload, "operator_token": "must-not-forward"},
        )
        assert response.status_code == 400
        assert not seen
        response = client.post(f"/b/{TOKEN}/checkout", json=payload)
    assert response.status_code == 200
    assert seen[0].method == "POST"
    assert seen[0].url.path == f"/b/{TOKEN}/checkout"
    assert json.loads(seen[0].content) == payload


def test_rejects_invalid_routes_inputs_upstreams_and_responses() -> None:
    for upstream in ["https://127.0.0.1:8484", "http://example.com:8484", "http://user:pass@127.0.0.1:8484"]:
        try:
            create_app(upstream)
        except ValueError:
            pass
        else:
            raise AssertionError(f"unsafe upstream accepted: {upstream}")

    wrong_type = httpx.MockTransport(lambda _: httpx.Response(200, json={"not": "html"}))
    with TestClient(create_app(transport=wrong_type)) as client:
        assert client.get(f"/b/{TOKEN}").status_code == 502
        assert client.get(f"/b/{TOKEN}?src=javascript:alert(1)").status_code == 404
        assert client.post(f"/b/{TOKEN}/checkout", content=b"{" * 20_000).status_code == 413


def test_caps_streams_and_never_forwards_upstream_error_bodies() -> None:
    class OversizedStream(httpx.AsyncByteStream):
        async def __aiter__(self):
            for _ in range(513):
                yield b"x" * 1024

    oversized = httpx.MockTransport(
        lambda _: httpx.Response(200, headers={"content-type": "text/html"}, stream=OversizedStream())
    )
    with TestClient(create_app(transport=oversized)) as client:
        response = client.get(f"/b/{TOKEN}")
    assert response.status_code == 502
    assert "x" * 100 not in response.text

    leaked = httpx.MockTransport(
        lambda _: httpx.Response(500, text="traceback operator_token=secret")
    )
    with TestClient(create_app(transport=leaked)) as client:
        response = client.get(f"/b/{TOKEN}")
    assert response.status_code == 502
    assert "traceback" not in response.text
    assert "secret" not in response.text

"""Phone-safe gateway for the public Yaatal Commerce Sheet.

The Studio operator service remains loopback-only. This separate app exposes
only the opaque sheet and its bounded sandbox-checkout action to a phone.
"""

from __future__ import annotations

import ipaddress
import json
import os
import re
from typing import Any
from urllib.parse import urlparse

import httpx
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, Response


TOKEN_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_-]{7,127}$")
IDEMPOTENCY_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.:-]{7,127}$")
SOURCES = {"copy", "livestream", "telegram", "whatsapp", "bobo", "unknown"}
PROVIDERS = {"wave", "orange_money", "free_money", "mixx", "bank"}
CHECKOUT_FIELDS = {"provider", "quantity", "variant", "source_channel", "idempotency_key"}
PUBLIC_HEADERS = {
    "cache-control",
    "content-security-policy",
    "referrer-policy",
    "x-content-type-options",
}
MAX_CHECKOUT_BYTES = 16 * 1024
MAX_RESPONSE_BYTES = 512 * 1024


def _upstream(value: str) -> str:
    parsed = urlparse(value.strip().rstrip("/"))
    try:
        address = ipaddress.ip_address(parsed.hostname or "")
    except ValueError as exc:
        raise ValueError("commerce gateway upstream must be a loopback IP") from exc
    if (
        parsed.scheme != "http"
        or not address.is_loopback
        or parsed.username
        or parsed.password
        or parsed.query
        or parsed.fragment
        or parsed.path not in {"", "/"}
        or parsed.port is None
    ):
        raise ValueError("commerce gateway upstream must be loopback HTTP with an explicit port")
    return f"http://{parsed.netloc}"


def _error(status: int, code: str, message: str) -> JSONResponse:
    return JSONResponse({"error": code, "message": message}, status_code=status)


def _token(value: str) -> str | None:
    return value if TOKEN_RE.fullmatch(value) else None


def _checkout(value: Any) -> dict[str, Any] | None:
    if not isinstance(value, dict) or not set(value).issubset(CHECKOUT_FIELDS):
        return None
    provider = value.get("provider")
    quantity = value.get("quantity")
    variant = value.get("variant", "")
    source = value.get("source_channel", "unknown")
    key = value.get("idempotency_key")
    if (
        provider not in PROVIDERS
        or isinstance(quantity, bool)
        or not isinstance(quantity, int)
        or not 1 <= quantity <= 10
        or not isinstance(variant, str)
        or len(variant) > 48
        or any(ord(char) < 32 for char in variant)
        or source not in SOURCES
        or not isinstance(key, str)
        or not IDEMPOTENCY_RE.fullmatch(key)
    ):
        return None
    return {
        "provider": provider,
        "quantity": quantity,
        "variant": variant,
        "source_channel": source,
        "idempotency_key": key,
    }


def create_app(
    upstream: str | None = None,
    *,
    transport: httpx.AsyncBaseTransport | None = None,
) -> FastAPI:
    base = _upstream(upstream or os.getenv("YAATAL_COMMERCE_UPSTREAM", "http://127.0.0.1:8484"))
    app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)

    async def forward(method: str, path: str, *, body: dict[str, Any] | None = None) -> Response:
        try:
            async with httpx.AsyncClient(
                base_url=base,
                follow_redirects=False,
                timeout=httpx.Timeout(8.0),
                transport=transport,
            ) as client:
                async with client.stream(method, path, json=body) as result:
                    content = bytearray()
                    async for chunk in result.aiter_bytes():
                        if len(content) + len(chunk) > MAX_RESPONSE_BYTES:
                            return _error(502, "commerce_response_invalid", "Commerce Sheet returned an invalid response")
                        content.extend(chunk)
                    status_code = result.status_code
                    content_type = result.headers.get("content-type", "")
                    public_headers = {key: value for key, value in result.headers.items() if key.lower() in PUBLIC_HEADERS}
        except httpx.HTTPError:
            return _error(502, "commerce_unavailable", "Commerce Sheet is temporarily unavailable")
        if not 200 <= status_code < 300:
            if method == "GET" and status_code == 404:
                return _error(404, "commerce_sheet_not_found", "Commerce Sheet not found")
            if method == "POST" and status_code in {400, 404, 409, 422}:
                return _error(status_code, "checkout_rejected", "Checkout could not be completed")
            return _error(502, "commerce_unavailable", "Commerce Sheet is temporarily unavailable")
        if method == "GET" and not content_type.lower().startswith("text/html"):
            return _error(502, "commerce_response_invalid", "Commerce Sheet returned an invalid response")
        if method == "POST" and not content_type.lower().startswith("application/json"):
            return _error(502, "commerce_response_invalid", "Commerce Sheet returned an invalid response")
        public_headers["Content-Type"] = content_type or ("text/html; charset=utf-8" if method == "GET" else "application/json")
        public_headers["X-Frame-Options"] = "SAMEORIGIN"
        return Response(bytes(content), status_code=status_code, headers=public_headers)

    @app.get("/b/{token}")
    async def commerce_sheet(token: str, src: str = "unknown") -> Response:
        safe_token = _token(token)
        if safe_token is None or src not in SOURCES:
            return _error(404, "commerce_sheet_not_found", "Commerce Sheet not found")
        return await forward("GET", f"/b/{safe_token}?src={src}")

    @app.post("/b/{token}/checkout")
    async def commerce_checkout(token: str, request: Request) -> Response:
        safe_token = _token(token)
        if safe_token is None:
            return _error(404, "commerce_sheet_not_found", "Commerce Sheet not found")
        raw = bytearray()
        async for chunk in request.stream():
            if len(raw) + len(chunk) > MAX_CHECKOUT_BYTES:
                return _error(413, "checkout_request_too_large", "Checkout request is too large")
            raw.extend(chunk)
        try:
            payload = _checkout(json.loads(bytes(raw)))
        except (json.JSONDecodeError, UnicodeDecodeError):
            payload = None
        if payload is None:
            return _error(400, "invalid_checkout", "Checkout request is invalid")
        return await forward("POST", f"/b/{safe_token}/checkout", body=payload)

    return app


app = create_app()

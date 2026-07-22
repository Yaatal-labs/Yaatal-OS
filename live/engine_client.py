"""Yaatal Engine API client — shared by agent-loop, obs-controller, and studio_server.

Handles JWT auth (env var or login), catalog fetches, product updates, and
live-session management. Every method degrades gracefully: on connection error
it returns None / empty / False so callers can fall back to standalone behavior.

Env vars:
  ENGINE_API_URL   — base URL (default http://yaatal-engine:8080)
  STUDIO_JWT       — pre-authenticated JWT token (preferred)
  ENGINE_API_EMAIL — login email (fallback if no JWT)
  ENGINE_API_PASSWORD — login password (fallback if no JWT)
"""

from __future__ import annotations

import asyncio
import logging
import os
import time
from typing import Optional

import httpx

logger = logging.getLogger(__name__)

DEFAULT_BASE_URL = os.getenv("ENGINE_API_URL", "http://yaatal-engine:8080")
_TIMEOUT = httpx.Timeout(5.0, connect=3.0)


class EngineClient:
    """Async client for the Yaatal Engine API with auto-JWT and graceful fallback."""

    def __init__(
        self,
        base_url: str | None = None,
        jwt: str | None = None,
        email: str | None = None,
        password: str | None = None,
    ):
        self.base_url = (base_url or DEFAULT_BASE_URL).rstrip("/")
        self._jwt = jwt or os.getenv("STUDIO_JWT")
        self._email = email or os.getenv("ENGINE_API_EMAIL", "ops@yaatal.dev")
        self._password = password or os.getenv("ENGINE_API_PASSWORD", "YaatalOps2026!")
        self._jwt_expires: float = 0.0
        self._client: httpx.AsyncClient | None = None
        self._lock = asyncio.Lock()

    # ─── lifecycle ──────────────────────────────────────────────

    async def _ensure_client(self) -> httpx.AsyncClient:
        if self._client is None or self._client.is_closed:
            headers = {}
            if self._jwt:
                headers["Authorization"] = f"Bearer {self._jwt}"
            self._client = httpx.AsyncClient(
                base_url=self.base_url,
                headers=headers,
                timeout=_TIMEOUT,
            )
        return self._client

    async def aclose(self):
        if self._client and not self._client.is_closed:
            await self._client.aclose()

    # ─── auth ───────────────────────────────────────────────────

    async def _ensure_jwt(self) -> bool:
        """Ensure we have a valid JWT. Login if needed.

        Returns True if authed (or if no auth needed), False if auth failed.
        """
        if self._jwt and time.time() < self._jwt_expires:
            return True
        # If a static JWT is provided via env, use it directly (no expiry check)
        if self._jwt and not self._email:
            return True
        # Try login
        try:
            client = await self._ensure_client()
            resp = await client.post(
                "/api/auth/login",
                json={"email": self._email, "password": self._password},
            )
            resp.raise_for_status()
            data = resp.json()
            self._jwt = data.get("token") or data.get("jwt") or data.get("access_token")
            if self._jwt:
                self._jwt_expires = time.time() + 3600  # assume 1h
                # Update client headers (client is guaranteed non-None after _ensure_client)
                if self._client is not None:
                    self._client.headers["Authorization"] = f"Bearer {self._jwt}"
                logger.info("Engine JWT acquired for %s", self._email)
                return True
        except Exception as e:
            logger.warning("Engine login failed: %s — continuing without auth", e)
        return False

    # ─── health ─────────────────────────────────────────────────

    async def health(self) -> bool:
        """Check if Engine is reachable."""
        try:
            client = await self._ensure_client()
            resp = await client.get("/health")
            return resp.status_code == 200
        except Exception:
            return False

    # ─── catalog ────────────────────────────────────────────────

    async def get_catalog(self) -> list[dict]:
        """GET /api/catalog — all active products. Returns [] on failure."""
        try:
            client = await self._ensure_client()
            resp = await client.get("/api/catalog")
            resp.raise_for_status()
            data = resp.json()
            if isinstance(data, list):
                return data
            return data.get("products", data.get("catalog", []))
        except Exception as e:
            logger.warning("get_catalog failed: %s", e)
            return []

    async def get_product(self, product_id: str | int) -> Optional[dict]:
        """GET /api/catalog/:id — single product. Returns None on failure."""
        try:
            client = await self._ensure_client()
            resp = await client.get(f"/api/catalog/{product_id}")
            resp.raise_for_status()
            return resp.json()
        except Exception as e:
            logger.warning("get_product(%s) failed: %s", product_id, e)
            return None

    # ─── product updates (authed — Harness-gated execution only) ────
    #
    # ARCHITECTURE: The model NEVER calls these methods directly.
    # Only the agent loop calls update_product() AFTER the Harness
    # edge-turn returns Allow. This is the Harness-approved execution
    # path, not a model→Engine bypass.
    #
    # The old convenience wrappers set_price() and mark_sold_out() have
    # been removed — they were direct-write shortcuts that bypassed the
    # Harness policy gate. All writes must go through update_product()
    # as part of a Harness-approved execution.

    async def update_product(
        self, product_id: str | int, price_cents: int | None = None,
        stock: int | None = None, is_active: bool | None = None,
    ) -> Optional[dict]:
        """POST /api/products/:id — update product price/stock/active.

        This is the Harness-approved execution path. Only called by
        the agent loop after the Harness edge-turn returns Allow.
        The model NEVER calls this directly.

        Returns response dict on success, None on failure.
        """
        if not await self._ensure_jwt():
            logger.warning("update_product: no JWT, skipping Engine update")
            return None
        payload: dict = {}
        if price_cents is not None:
            payload["price_cents"] = price_cents
        if stock is not None:
            payload["stock"] = stock
        if is_active is not None:
            payload["is_active"] = is_active
        if not payload:
            return None
        try:
            client = await self._ensure_client()
            resp = await client.post(f"/api/products/{product_id}", json=payload)
            resp.raise_for_status()
            result = resp.json()
            logger.info("Product %s updated on Engine: %s", product_id, payload)
            return result
        except Exception as e:
            logger.warning("update_product(%s) failed: %s", product_id, e)
            return None

    # NOTE: set_price() and mark_sold_out() convenience wrappers have been
    # removed. They were direct-write shortcuts that let the model bypass
    # the Harness policy gate. All Engine writes now go through
    # update_product() as part of Harness-approved execution in the
    # agent loop's _execute_* methods.

    # ─── live sessions (authed) ─────────────────────────────────

    async def create_live_session(self, payload: dict | None = None) -> Optional[dict]:
        """POST /api/live-sessions — create a live session on Engine.

        Returns session dict on success, None on failure.
        """
        if not await self._ensure_jwt():
            logger.warning("create_live_session: no JWT, skipping")
            return None
        body = payload or {}
        try:
            client = await self._ensure_client()
            resp = await client.post("/api/live-sessions", json=body)
            resp.raise_for_status()
            result = resp.json()
            logger.info("Live session created on Engine: %s", result.get("id", "?"))
            return result
        except Exception as e:
            logger.warning("create_live_session failed: %s", e)
            return None

    async def end_live_session(self, session_id: str | int) -> Optional[dict]:
        """POST /api/live-sessions/:id/end — end a live session.

        Returns response dict on success, None on failure.
        """
        if not await self._ensure_jwt():
            return None
        try:
            client = await self._ensure_client()
            resp = await client.post(f"/api/live-sessions/{session_id}/end", json={})
            resp.raise_for_status()
            result = resp.json()
            logger.info("Live session %s ended on Engine", session_id)
            return result
        except Exception as e:
            logger.warning("end_live_session(%s) failed: %s", session_id, e)
            return None

    async def get_session_products(self) -> list[dict]:
        """GET /api/live-sessions/current/products — products queued for current session.

        Returns [] on failure.
        """
        if not await self._ensure_jwt():
            return []
        try:
            client = await self._ensure_client()
            resp = await client.get("/api/live-sessions/current/products")
            resp.raise_for_status()
            data = resp.json()
            if isinstance(data, list):
                return data
            return data.get("products", [])
        except Exception as e:
            logger.warning("get_session_products failed: %s", e)
            return []


# ─── Module-level singleton (lazy) ────────────────────────────────

_singleton: EngineClient | None = None


async def get_engine_client() -> EngineClient:
    """Get the shared EngineClient singleton."""
    global _singleton
    if _singleton is None:
        _singleton = EngineClient()
    return _singleton


# ─── Price helpers ────────────────────────────────────────────────

def parse_price_to_cents(price_str: str) -> Optional[int]:
    """Parse a price string like '12 000 FCFA' or '12000' to cents.

    Returns cents (int) or None if unparseable.
    """
    import re
    digits = re.sub(r'[^\d]', '', price_str)
    if not digits:
        return None
    try:
        return int(digits) * 100  # FCFA has no subdivision, but cents is the Engine format
    except ValueError:
        return None


def cents_to_display(cents: int | None) -> str:
    """Convert price_cents to display string: '12 000 FCFA'."""
    if cents is None:
        return "— FCFA"
    fcfa = cents // 100
    return f"{fcfa:,} FCFA".replace(",", " ")


def engine_product_to_dict(p: dict) -> dict:
    """Normalize an Engine product dict to a consistent shape for the OBS controller."""
    price_cents = p.get("price_cents")
    return {
        "id": str(p.get("id", "")),
        "name": p.get("name", "Unknown Product"),
        "price": p.get("price_display") or cents_to_display(price_cents),
        "price_cents": price_cents,
        "stock": p.get("stock"),
        "stock_status": p.get("stock_status", "in_stock"),
        "category": p.get("category", ""),
        "images": p.get("images", []),
        "image_path": (p.get("images") or [None])[0] if p.get("images") else None,
        "description": p.get("description"),
        "is_active": p.get("is_active", True),
    }
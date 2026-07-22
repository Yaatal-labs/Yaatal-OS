"""Yaatal Harness edge-turn client — the policy gate between Model and Engine.

ARCHITECTURE RULE: The model NEVER calls Engine directly.
  Model detects intent → harness_client.propose() → Harness validates (policy + audit)
  → Allow/Deny → only on Allow: agent loop executes (OBS overlay + Engine update).

This client sends EdgeTurnRequest to the Harness HTTP endpoint
(POST http://localhost:8090/edge-turn) and receives an EdgeTurnResponse
with the decision (allow/deny), tool name, product_id, price_fcfa, confidence,
and audit_event_id.

Env vars:
  HARNESS_URL — base URL (default http://localhost:8090)
"""

from __future__ import annotations

import logging
import os
import uuid
from dataclasses import dataclass
from typing import Optional

import httpx

logger = logging.getLogger(__name__)

DEFAULT_HARNESS_URL = os.getenv("HARNESS_URL", "http://localhost:8090")
_TIMEOUT = httpx.Timeout(5.0, connect=3.0)


@dataclass
class EdgeTurnResponse:
    """Parsed response from Harness edge-turn endpoint."""
    decision: str          # "allow" | "deny"
    tool: str              # "studio.update_price_overlay" | "studio.mark_sold_out_overlay" | "studio.switch_product" | "none"
    product_id: Optional[str] = None
    price_fcfa: Optional[int] = None
    confidence: float = 0.0
    audit_event_id: Optional[str] = None

    @property
    def allowed(self) -> bool:
        return self.decision == "allow"

    @classmethod
    def from_dict(cls, data: dict) -> "EdgeTurnResponse":
        return cls(
            decision=data.get("decision", "deny"),
            tool=data.get("tool", "none"),
            product_id=data.get("product_id"),
            price_fcfa=data.get("price_fcfa"),
            confidence=data.get("confidence", 0.0),
            audit_event_id=data.get("audit_event_id"),
        )


class HarnessClient:
    """HTTP client for the Harness edge-turn endpoint.

    Sends proposals (transcript + model backend) to the Harness, which
    validates against policy and audit rules, then returns Allow/Deny
    with a tool name and parameters.

    If the Harness is unreachable, returns None — the caller MUST NOT
    execute any Engine writes (no fallback to direct Engine).
    """

    def __init__(self, base_url: str | None = None):
        self.base_url = (base_url or DEFAULT_HARNESS_URL).rstrip("/")
        self._run_id: str | None = None

    @property
    def run_id(self) -> str:
        """Lazily generate a run_id for this session if not set."""
        if self._run_id is None:
            self._run_id = str(uuid.uuid4())
        return self._run_id

    @run_id.setter
    def run_id(self, value: str):
        self._run_id = value

    async def propose(
        self,
        transcript_text: str,
        language: str = "wo",
        confidence: float = 0.9,
        model_backend: str = "mock",
    ) -> Optional[EdgeTurnResponse]:
        """Send an EdgeTurnRequest to the Harness.

        Args:
            transcript_text: The seller's transcribed speech.
            language: ISO code for the transcript language (wo, fr, en).
            confidence: STT confidence (0.0–1.0).
            model_backend: "mock" or "minimind" — identifies which model
                produced the transcript/intent.

        Returns:
            EdgeTurnResponse on success (HTTP 200), or None on failure
            (connection error, non-200, parse error). Callers MUST treat
            None as "deny" — never execute Engine writes without an
            explicit Allow from the Harness.
        """
        payload = {
            "version": "edge-turn.v1",
            "run_id": self.run_id,
            "source": "seller_speech",
            "transcript": {
                "text": transcript_text,
                "language": language,
                "confidence": confidence,
            },
            "model_backend": model_backend,
        }

        try:
            async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
                resp = await client.post(
                    f"{self.base_url}/edge-turn",
                    json=payload,
                )
                if resp.status_code != 200:
                    logger.warning(
                        "Harness edge-turn returned %d: %s",
                        resp.status_code,
                        resp.text[:200],
                    )
                    return None
                data = resp.json()
                response = EdgeTurnResponse.from_dict(data)
                logger.info(
                    "Harness decision: %s tool=%s product=%s price=%s audit=%s",
                    response.decision,
                    response.tool,
                    response.product_id,
                    response.price_fcfa,
                    response.audit_event_id,
                )
                return response
        except httpx.ConnectError as e:
            logger.warning("Harness unreachable at %s: %s — NOT executing (no fallback to direct Engine)", self.base_url, e)
            return None
        except Exception as e:
            logger.warning("Harness edge-turn failed: %s — NOT executing (no fallback to direct Engine)", e)
            return None

    async def health(self) -> bool:
        """Check if the Harness is reachable."""
        try:
            async with httpx.AsyncClient(timeout=3.0) as client:
                resp = await client.get(f"{self.base_url}/health")
                return resp.status_code == 200
        except Exception:
            return False


# ─── Module-level singleton (lazy) ────────────────────────────────

_singleton: HarnessClient | None = None


async def get_harness_client() -> HarnessClient:
    """Get the shared HarnessClient singleton."""
    global _singleton
    if _singleton is None:
        _singleton = HarnessClient()
    return _singleton
"""Governed transcript-to-commerce execution for Yaatal Studio.

This module is the only Studio path allowed to turn a transcript into an
Engine mutation. The model proposes through Harness; Studio executes only an
explicit ``allow`` and records a digest-only durable receipt.
"""

from __future__ import annotations

import math
import uuid
from dataclasses import dataclass
from typing import Any

try:
    from .engine_client import EngineClient
    from .harness_client import EdgeTurnResponse, HarnessHttpClient
    from .turn_ledger import TurnLedger, TurnLedgerError, transcript_digest
except ImportError:  # direct ``python live/studio_server.py`` compatibility
    from engine_client import EngineClient
    from harness_client import EdgeTurnResponse, HarnessHttpClient
    from turn_ledger import TurnLedger, TurnLedgerError, transcript_digest


MAX_TRANSCRIPT_CHARS = 2_000
SUPPORTED_LANGUAGES = {"wo", "wolof", "fr", "french", "wo-fr", "mixed", "auto", "en"}


@dataclass
class GovernedTurnError(RuntimeError):
    code: str
    retryable: bool = False

    def __str__(self) -> str:
        return self.code


class GovernedTurnRuntime:
    """Validate, govern, execute, and receipt one seller turn."""

    def __init__(
        self,
        harness: HarnessHttpClient,
        engine: EngineClient,
        ledger: TurnLedger,
        model_backend: str = "mock",
    ):
        self.harness = harness
        self.engine = engine
        self.ledger = ledger
        self.model_backend = model_backend

    async def process(
        self,
        transcript: str,
        language: str,
        confidence: float,
        turn_id: str,
    ) -> dict[str, Any]:
        normalized_turn_id = self._validate_input(transcript, language, confidence, turn_id)
        cached = self.ledger.get(normalized_turn_id)
        if cached is not None:
            cached["deduplicated"] = True
            return cached

        response = await self.harness.propose(
            transcript_text=transcript,
            language=language,
            confidence=confidence,
            model_backend=self.model_backend,
            run_id=normalized_turn_id,
        )
        if response is None:
            raise GovernedTurnError("harness_unavailable", retryable=True)

        receipt = self._base_receipt(response, transcript, normalized_turn_id)
        if response.decision == "allow":
            receipt["execution_status"] = await self._execute(response, normalized_turn_id)
        else:
            receipt["execution_status"] = "not_executed"

        try:
            return self.ledger.record(receipt)
        except TurnLedgerError as error:
            raise GovernedTurnError("turn_receipt_failed", retryable=True) from error

    async def _execute(self, response: EdgeTurnResponse, turn_id: str) -> str:
        product_id = response.product_id
        if not product_id:
            raise GovernedTurnError("allowed_action_missing_product", retryable=False)

        if response.tool == "studio.update_price_overlay":
            price = response.price_fcfa
            if not isinstance(price, int) or isinstance(price, bool):
                raise GovernedTurnError("allowed_action_missing_price", retryable=False)
            result = await self.engine.update_product(
                product_id,
                price_cents=price,
                turn_id=turn_id,
            )
            if result is None:
                raise GovernedTurnError("engine_price_update_failed", retryable=True)
            return "engine_applied"

        if response.tool == "studio.mark_sold_out_overlay":
            result = await self.engine.update_product(product_id, stock=0, turn_id=turn_id)
            if result is None:
                raise GovernedTurnError("engine_stock_update_failed", retryable=True)
            return "engine_applied"

        if response.tool == "studio.switch_product":
            # Switching the visual focus is a Studio/OBS action. Harness has
            # already checked that this product belongs to the active Engine
            # context, so no Engine write is needed.
            return "overlay_applied"

        raise GovernedTurnError("unsupported_allowed_tool", retryable=False)

    @staticmethod
    def _base_receipt(
        response: EdgeTurnResponse,
        transcript: str,
        turn_id: str,
    ) -> dict[str, Any]:
        proposal = None
        if response.decision == "allow":
            proposal = {
                "tool": response.tool,
                "product_id": response.product_id,
                "confidence": response.confidence,
            }
            if response.price_fcfa is not None:
                proposal["price_fcfa"] = response.price_fcfa
        return {
            "version": "studio-turn.v1",
            "type": "governed_action",
            "turn_id": turn_id,
            "transcript_sha256": transcript_digest(transcript),
            "decision": response.decision,
            "reason_code": response.reason_code,
            "proposal": proposal,
            "audit_event_count": response.audit_event_count,
            "deduplicated": False,
        }

    @staticmethod
    def _validate_input(
        transcript: str,
        language: str,
        confidence: float,
        turn_id: str,
    ) -> str:
        if not isinstance(transcript, str) or not transcript.strip():
            raise GovernedTurnError("transcript_required")
        if len(transcript) > MAX_TRANSCRIPT_CHARS:
            raise GovernedTurnError("transcript_too_long")
        if not isinstance(language, str) or language.strip().lower() not in SUPPORTED_LANGUAGES:
            raise GovernedTurnError("unsupported_language")
        if (
            isinstance(confidence, bool)
            or not isinstance(confidence, (int, float))
            or not math.isfinite(confidence)
            or not 0.0 <= confidence <= 1.0
        ):
            raise GovernedTurnError("invalid_confidence")
        try:
            return str(uuid.UUID(turn_id))
        except (ValueError, TypeError, AttributeError) as error:
            raise GovernedTurnError("turn_id_must_be_uuid") from error

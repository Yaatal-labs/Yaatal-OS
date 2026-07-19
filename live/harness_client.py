"""Client for the governed Yaatal Harness edge-turn CLI."""

import json
import math
import os
import subprocess
import uuid
from typing import Callable, Optional

CONTRACT_VERSION = "edge-turn.v1"
ALLOWED_TOOLS = {
    "studio.update_price_overlay",
    "studio.mark_sold_out_overlay",
    "studio.switch_product",
}


class HarnessClientError(RuntimeError):
    """The Harness process or its response violated the edge-turn contract."""


class HarnessClient:
    """Run one edge turn over JSON stdin/stdout without a shell."""

    def __init__(
        self,
        binary: Optional[str] = None,
        model_backend: str = "mock",
        timeout_seconds: Optional[float] = None,
        run: Callable = subprocess.run,
    ):
        self.binary = binary or os.getenv("YAATAL_HARNESS_BIN", "")
        if not self.binary:
            raise HarnessClientError("YAATAL_HARNESS_BIN is required")
        if model_backend not in {"mock", "minimind"}:
            raise HarnessClientError("model_backend must be mock or minimind")
        if timeout_seconds is None:
            # ponytail: the MiniMind backend itself allows up to 180s (see
            # yaatal-edge-turn's MinimindHttpBackend), but a live stream can't
            # stall that long waiting on one turn. Default to a bounded
            # client-side timeout and fail closed (deny/skip) instead of
            # blocking OBS; callers that genuinely need to wait longer can
            # still pass timeout_seconds explicitly (e.g. offline testing).
            timeout_seconds = 25.0 if model_backend == "minimind" else 10.0
        if (
            isinstance(timeout_seconds, bool)
            or not isinstance(timeout_seconds, (int, float))
            or not math.isfinite(timeout_seconds)
            or timeout_seconds <= 0
        ):
            raise HarnessClientError("timeout_seconds must be a positive finite number")
        self.model_backend = model_backend
        self.timeout_seconds = float(timeout_seconds)
        self._run = run

    def propose(
        self,
        text: str,
        language: str = "mixed",
        confidence: float = 1.0,
        run_id: Optional[str] = None,
    ) -> dict:
        if not isinstance(text, str) or not text.strip():
            raise HarnessClientError("transcript text is required")
        if (
            isinstance(confidence, bool)
            or not isinstance(confidence, (int, float))
            or not math.isfinite(confidence)
        ):
            raise HarnessClientError("transcript confidence must be finite")
        if not 0.0 <= confidence <= 1.0:
            raise HarnessClientError("transcript confidence must be between 0 and 1")

        request_id = run_id or str(uuid.uuid4())
        try:
            request_id = str(uuid.UUID(request_id))
        except (ValueError, TypeError, AttributeError) as exc:
            raise HarnessClientError("run_id must be a UUID") from exc

        payload = {
            "version": CONTRACT_VERSION,
            "run_id": request_id,
            "source": "seller_speech",
            "transcript": {
                "text": text,
                "language": language,
                "confidence": float(confidence),
            },
            "model_backend": self.model_backend,
        }
        try:
            completed = self._run(
                [self.binary],
                input=json.dumps(payload, ensure_ascii=False),
                text=True,
                capture_output=True,
                timeout=self.timeout_seconds,
                check=False,
            )
        except (OSError, subprocess.SubprocessError) as exc:
            raise HarnessClientError(f"Harness process failed: {exc}") from exc

        if completed.returncode != 0:
            detail = (completed.stderr or "").strip()
            raise HarnessClientError(
                f"Harness exited {completed.returncode}: {detail or 'no error detail'}"
            )
        try:
            response = json.loads(completed.stdout)
        except (TypeError, json.JSONDecodeError) as exc:
            raise HarnessClientError("Harness stdout was not one JSON value") from exc
        return self._validate_response(response, request_id)

    @staticmethod
    def _validate_response(response: object, run_id: str) -> dict:
        if not isinstance(response, dict):
            raise HarnessClientError("Harness response must be an object")
        allowed = {
            "version",
            "run_id",
            "decision",
            "reason_code",
            "proposal",
            "audit_event_count",
        }
        required = {
            "version",
            "run_id",
            "decision",
            "reason_code",
            "audit_event_count",
        }
        if set(response) - allowed or not required.issubset(response):
            raise HarnessClientError("Harness response keys violate edge-turn.v1")
        if response["version"] != CONTRACT_VERSION or response["run_id"] != run_id:
            raise HarnessClientError("Harness response version/run_id mismatch")
        if response["decision"] not in {"allow", "deny", "noop"}:
            raise HarnessClientError("Harness decision is invalid")
        if not isinstance(response["reason_code"], str):
            raise HarnessClientError("Harness reason_code must be a string")
        count = response["audit_event_count"]
        if not isinstance(count, int) or isinstance(count, bool) or count < 2:
            raise HarnessClientError("Harness audit_event_count must be at least two")

        proposal = response.get("proposal")
        if response["decision"] == "allow":
            HarnessClient._validate_proposal(proposal)
        elif proposal is not None:
            raise HarnessClientError("Denied/noop response must not carry a proposal")
        return response

    @staticmethod
    def _validate_proposal(proposal: object) -> None:
        if not isinstance(proposal, dict):
            raise HarnessClientError("Allowed response requires a proposal object")
        allowed = {"tool", "product_id", "price_fcfa", "confidence"}
        required = {"tool", "product_id", "confidence"}
        if set(proposal) - allowed or not required.issubset(proposal):
            raise HarnessClientError("Proposal keys violate edge-turn.v1")
        tool = proposal["tool"]
        if tool not in ALLOWED_TOOLS:
            raise HarnessClientError("Proposal tool is not allowed")
        if not isinstance(proposal["product_id"], str) or not proposal["product_id"].strip():
            raise HarnessClientError("Proposal product_id is required")
        confidence = proposal["confidence"]
        if (
            not isinstance(confidence, (int, float))
            or isinstance(confidence, bool)
            or not math.isfinite(confidence)
            or not 0.0 <= confidence <= 1.0
        ):
            raise HarnessClientError("Proposal confidence is invalid")

        price = proposal.get("price_fcfa")
        if tool == "studio.update_price_overlay":
            if not isinstance(price, int) or isinstance(price, bool) or not 1 <= price <= 10_000_000:
                raise HarnessClientError("Price proposal requires valid price_fcfa")
        elif price is not None:
            raise HarnessClientError("price_fcfa is not allowed for this tool")

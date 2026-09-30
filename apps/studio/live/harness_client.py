"""Yaatal Harness edge-turn clients — the policy gate between Model and Engine.

ARCHITECTURE RULE: The model NEVER calls Engine directly.
  Model detects intent → harness_client.propose() → Harness validates (policy + audit)
  → Allow/Deny → only on Allow: agent loop executes (OBS overlay + Engine update).

Two transport mechanisms are provided:

  1. **HarnessHttpClient** (HTTP, default)
     Sends EdgeTurnRequest to the Harness HTTP endpoint
     (POST http://localhost:8090/edge-turn) and receives an EdgeTurnResponse.
     Env: HARNESS_URL (default http://localhost:8090)

  2. **HarnessCliClient** (CLI subprocess, fallback)
     Runs one edge turn over JSON stdin/stdout via the Harness CLI binary.
     Env: HARNESS_CLI_PATH or YAATAL_HARNESS_BIN (path to the binary)

Transport selection (used by the orchestrator):
  - If HARNESS_URL is set → HarnessHttpClient
  - Else if HARNESS_CLI_PATH (or YAATAL_HARNESS_BIN) is set → HarnessCliClient
  - Else → None (no-op, log warning — model NEVER touches Engine directly)

The HTTP client returns ``EdgeTurnResponse`` (dataclass with ``.allowed``).
The CLI client returns a raw ``dict`` matching the edge-turn.v1 contract.

A shared ``EdgeTurnResponse`` wrapper is provided so callers can treat both
transports uniformly when desired.
"""

from __future__ import annotations

import json
import logging
import math
import os
import re
import subprocess
import uuid
from dataclasses import dataclass
from typing import Callable, Optional

import httpx

logger = logging.getLogger(__name__)

# ─── Shared constants ─────────────────────────────────────────────

CONTRACT_VERSION = "edge-turn.v1"
ALLOWED_TOOLS = {
    "studio.update_price_overlay",
    "studio.mark_sold_out_overlay",
    "studio.switch_product",
}
_IDENTIFIER = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$")

# ─── EdgeTurnResponse (shared wrapper) ─────────────────────────────


@dataclass
class EdgeTurnResponse:
    """Parsed response from Harness edge-turn endpoint.

    Works for both HTTP and CLI transports — normalises the raw CLI dict
    into the same shape the HTTP client returns.
    """

    decision: str          # "allow" | "deny" | "noop"
    tool: str              # "studio.update_price_overlay" | … | "none"
    product_id: Optional[str] = None
    price_fcfa: Optional[int] = None
    confidence: float = 0.0
    audit_event_id: Optional[str] = None
    audit_event_count: int = 0
    reason_code: str = ""
    run_id: Optional[str] = None
    raw: Optional[dict] = None  # full raw response dict (CLI transport)

    @property
    def allowed(self) -> bool:
        return self.decision == "allow"

    @classmethod
    def from_dict(cls, data: dict) -> "EdgeTurnResponse":
        """Build from the authoritative nested ``edge-turn.v1`` response.

        Older Studio code expected flattened HTTP fields even though Harness
        HTTP returns the same nested ``proposal`` object as its CLI. Accept a
        legacy flattened response only for backwards compatibility.
        """
        proposal = data.get("proposal") or {}
        return cls(
            decision=data.get("decision", "deny"),
            tool=proposal.get("tool", data.get("tool", "none")),
            product_id=proposal.get("product_id", data.get("product_id")),
            price_fcfa=proposal.get("price_fcfa", data.get("price_fcfa")),
            confidence=proposal.get("confidence", data.get("confidence", 0.0)),
            audit_event_id=data.get("audit_event_id"),
            audit_event_count=data.get("audit_event_count", 0),
            reason_code=data.get("reason_code", ""),
            run_id=data.get("run_id"),
            raw=data,
        )

    @classmethod
    def from_cli_dict(cls, data: dict) -> "EdgeTurnResponse":
        """Build from a CLI subprocess response (edge-turn.v1 raw dict).

        The CLI response uses a nested ``proposal`` object, while the HTTP
        response flattens tool/product_id/price_fcfa/confidence. This
        normalises both into the same EdgeTurnResponse shape.
        """
        proposal = data.get("proposal") or {}
        return cls(
            decision=data.get("decision", "deny"),
            tool=proposal.get("tool", "none"),
            product_id=proposal.get("product_id"),
            price_fcfa=proposal.get("price_fcfa"),
            confidence=proposal.get("confidence", 0.0),
            audit_event_id=None,
            audit_event_count=data.get("audit_event_count", 0),
            reason_code=data.get("reason_code", ""),
            run_id=data.get("run_id"),
            raw=data,
        )


# ─── CLI subprocess transport (HarnessCliClient) ──────────────────


class HarnessClientError(RuntimeError):
    """The Harness process or its response violated the edge-turn contract."""


class HarnessCliClient:
    """Run one edge turn over JSON stdin/stdout without a shell.

    This is the CLI subprocess transport, kept as a fallback for when the
    Harness HTTP endpoint is not available but the CLI binary is.
    """

    def __init__(
        self,
        binary: Optional[str] = None,
        model_backend: str = "mock",
        timeout_seconds: Optional[float] = None,
        run: Callable = subprocess.run,
    ):
        self.binary = binary or os.getenv("HARNESS_CLI_PATH") or os.getenv("YAATAL_HARNESS_BIN", "")
        if not self.binary:
            raise HarnessClientError("HARNESS_CLI_PATH or YAATAL_HARNESS_BIN is required")
        if model_backend not in {"mock", "minimind"}:
            raise HarnessClientError("model_backend must be mock or minimind")
        if timeout_seconds is None:
            # The MiniMind backend itself allows up to 180s (see
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
        """Send an edge-turn request to the Harness CLI and return the raw dict.

        Raises ``HarnessClientError`` on any contract violation or process
        failure. Callers MUST treat any exception as "deny" — never execute
        Engine writes without an explicit Allow from the Harness.
        """
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
            # Harness stderr may contain model output or a reflected request.
            # Keep seller speech out of Studio logs and exception surfaces.
            raise HarnessClientError(f"Harness exited {completed.returncode}")
        try:
            response = json.loads(completed.stdout)
        except (TypeError, json.JSONDecodeError) as exc:
            raise HarnessClientError("Harness stdout was not one JSON value") from exc
        return self._validate_response(response, request_id)

    async def propose_async(
        self,
        transcript_text: str,
        language: str = "wo",
        confidence: float = 0.9,
        model_backend: str = "mock",
    ) -> Optional[EdgeTurnResponse]:
        """Async wrapper matching the HarnessHttpClient.propose() signature.

        Runs the blocking CLI ``propose()`` in a thread and returns an
        ``EdgeTurnResponse`` (or None on failure, matching HTTP semantics).
        """
        import asyncio

        try:
            raw = await asyncio.to_thread(
                self.propose, transcript_text, language, confidence,
            )
            return EdgeTurnResponse.from_cli_dict(raw)
        except HarnessClientError as e:
            logger.warning(
                "Harness CLI edge-turn failed: %s — NOT executing (no fallback to direct Engine)", e
            )
            return None

    async def health(self) -> bool:
        """Check if the CLI binary exists and is executable."""
        try:
            import shutil
            return shutil.which(self.binary) is not None or os.path.isfile(self.binary)
        except Exception:
            return False

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
        if not isinstance(response["reason_code"], str) or not _IDENTIFIER.fullmatch(
            response["reason_code"]
        ):
            raise HarnessClientError("Harness reason_code must be a bounded identifier")
        count = response["audit_event_count"]
        if not isinstance(count, int) or isinstance(count, bool) or count < 2:
            raise HarnessClientError("Harness audit_event_count must be at least two")

        proposal = response.get("proposal")
        if response["decision"] == "allow":
            HarnessCliClient._validate_proposal(proposal)
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
        if not isinstance(proposal["product_id"], str) or not _IDENTIFIER.fullmatch(
            proposal["product_id"]
        ):
            raise HarnessClientError("Proposal product_id must be a bounded identifier")
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


# ─── HTTP transport (HarnessHttpClient) ───────────────────────────

DEFAULT_HARNESS_URL = os.getenv("HARNESS_URL", "http://localhost:8090")
_TIMEOUT = httpx.Timeout(5.0, connect=3.0)


class HarnessHttpClient:
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
        run_id: str | None = None,
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
        if model_backend not in {"mock", "minimind"}:
            logger.warning("unsupported Harness model backend: %s", model_backend)
            return None
        request_id = run_id or str(uuid.uuid4())
        try:
            request_id = str(uuid.UUID(request_id))
        except (ValueError, TypeError, AttributeError):
            logger.warning("Harness run_id must be a UUID")
            return None

        payload = {
            "version": CONTRACT_VERSION,
            "run_id": request_id,
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
                        "Harness edge-turn returned %d; NOT executing",
                        resp.status_code,
                    )
                    return None
                data = resp.json()
                validated = HarnessCliClient._validate_response(data, request_id)
                response = EdgeTurnResponse.from_dict(validated)
                logger.info(
                    "Harness decision: %s tool=%s product=%s price=%s audit_count=%s",
                    response.decision,
                    response.tool,
                    response.product_id,
                    response.price_fcfa,
                    response.audit_event_count,
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


# ─── Backward-compat alias ────────────────────────────────────────
# Existing code that imports ``HarnessClient`` gets the HTTP client (the
# default transport). CLI users should import ``HarnessCliClient`` explicitly.

HarnessClient = HarnessHttpClient


# ─── Transport selection factory ──────────────────────────────────


def select_harness_transport() -> Optional[HarnessHttpClient | HarnessCliClient]:
    """Pick the Harness transport based on environment variables.

    Priority:
      1. HARNESS_URL set → HarnessHttpClient (HTTP, default)
      2. HARNESS_CLI_PATH or YAATAL_HARNESS_BIN set → HarnessCliClient (CLI subprocess)
      3. Neither set → None (no-op; log warning, model never touches Engine)

    Returns:
        A Harness client instance or None.
    """
    harness_url = os.getenv("HARNESS_URL", "")
    cli_path = os.getenv("HARNESS_CLI_PATH") or os.getenv("YAATAL_HARNESS_BIN", "")

    if harness_url:
        logger.info("Harness transport: HTTP (%s)", harness_url)
        return HarnessHttpClient(base_url=harness_url)

    if cli_path:
        model_backend = os.getenv("YAATAL_EDGE_MODEL_BACKEND", "mock")
        try:
            logger.info("Harness transport: CLI subprocess (%s)", cli_path)
            return HarnessCliClient(binary=cli_path, model_backend=model_backend)
        except HarnessClientError as e:
            logger.warning("Harness CLI client init failed: %s — no-op mode", e)
            return None

    logger.warning(
        "No Harness transport configured (set HARNESS_URL or HARNESS_CLI_PATH) "
        "— model intents will be blocked (no fallback to direct Engine)"
    )
    return None


# ─── Module-level singletons (lazy) ───────────────────────────────

_http_singleton: HarnessHttpClient | None = None


async def get_harness_client() -> HarnessHttpClient:
    """Get the shared HarnessHttpClient singleton (HTTP transport)."""
    global _http_singleton
    if _http_singleton is None:
        _http_singleton = HarnessHttpClient()
    return _http_singleton

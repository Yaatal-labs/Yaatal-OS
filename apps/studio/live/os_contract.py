"""Sanitized Yaatal OS sidecar contract for the Studio runtime.

This module is intentionally narrow. It publishes only local runtime health,
readiness progress, and redacted governed-turn metadata to the Tauri host. It
must never become a second Engine, Harness, or voice-client API.
"""

from __future__ import annotations

import re
import uuid
from typing import Any, Iterable


OS_CONTRACT_VERSION = "yaatal.studio.os.v1"
STUDIO_VOICE_PROTOCOL_VERSION = "studio-voice.v1"
EDGE_TURN_PROTOCOL_VERSION = "edge-turn.v1"
TURN_RECEIPT_VERSION = "studio-turn.v1"

_SAFE_DECISIONS = {"allow", "deny", "noop"}
_SAFE_ACTIONS = {
    "studio.update_price_overlay",
    "studio.mark_sold_out_overlay",
    "studio.switch_product",
}
_SAFE_STATUS = {"pending", "running", "passed", "failed", "skipped", "not_run"}
_IDENTIFIER = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$")


def _safe_identifier(value: object) -> str | None:
    if isinstance(value, str) and _IDENTIFIER.fullmatch(value):
        return value
    return None


def _safe_turn_id(value: object) -> str | None:
    try:
        return str(uuid.UUID(str(value)))
    except (ValueError, TypeError, AttributeError):
        return None


def redact_receipt(receipt: object) -> dict[str, Any] | None:
    """Return allowlisted governed-turn metadata, never seller content.

    Transcript digests are intentionally excluded as well: even a digest can
    become correlatable when callers know likely seller phrases.
    """
    if not isinstance(receipt, dict):
        return None
    turn_id = _safe_turn_id(receipt.get("turn_id"))
    decision = receipt.get("decision")
    if turn_id is None or decision not in _SAFE_DECISIONS:
        return None

    event: dict[str, Any] = {
        "type": "governed_action",
        "turn_id": turn_id,
        "decision": decision,
    }
    proposal = receipt.get("proposal")
    action = _safe_identifier(proposal.get("tool")) if isinstance(proposal, dict) else None
    if action in _SAFE_ACTIONS:
        event["action"] = action
    reason_code = _safe_identifier(receipt.get("reason_code"))
    if reason_code is not None:
        event["reason_code"] = reason_code
    execution_status = _safe_identifier(receipt.get("execution_status"))
    if execution_status is not None:
        event["execution_status"] = execution_status
    count = receipt.get("audit_event_count")
    if isinstance(count, int) and not isinstance(count, bool) and 0 <= count <= 1_000_000:
        event["audit_event_count"] = count
    if isinstance(receipt.get("deduplicated"), bool):
        event["deduplicated"] = receipt["deduplicated"]
    recorded_at = receipt.get("recorded_at")
    if isinstance(recorded_at, str) and len(recorded_at) <= 64:
        event["recorded_at"] = recorded_at
    return event


def redact_events(receipts: Iterable[object]) -> list[dict[str, Any]]:
    """Redact a bounded receipt collection for the OS event poller."""
    events: list[dict[str, Any]] = []
    for receipt in receipts:
        event = redact_receipt(receipt)
        if event is not None:
            events.append(event)
    return events


def readiness_summary(result: object) -> dict[str, Any]:
    """Strip readiness descriptions/details, which may contain service data."""
    if result is None:
        return {"status": "not_run", "steps": []}

    overall = getattr(result, "overall", "pending")
    raw_steps = getattr(result, "steps", [])
    status = overall if overall in _SAFE_STATUS else "pending"
    steps: list[dict[str, Any]] = []
    if isinstance(raw_steps, list):
        for step in raw_steps:
            name = _safe_identifier(getattr(step, "name", None))
            step_status = getattr(step, "status", "pending")
            duration = getattr(step, "duration_ms", 0)
            if name is None or step_status not in _SAFE_STATUS:
                continue
            safe_step: dict[str, Any] = {"name": name, "status": step_status}
            if isinstance(duration, int) and not isinstance(duration, bool) and duration >= 0:
                safe_step["duration_ms"] = duration
            steps.append(safe_step)
    return {"status": status, "steps": steps}


def build_status(*, ledger_available: bool, readiness: object) -> dict[str, Any]:
    """Build the complete sidecar status payload without endpoint/config data."""
    return {
        "version": OS_CONTRACT_VERSION,
        "service": "studio",
        "health": "ok",
        "protocols": {
            "voice": STUDIO_VOICE_PROTOCOL_VERSION,
            "governed_turn": EDGE_TURN_PROTOCOL_VERSION,
            "receipt": TURN_RECEIPT_VERSION,
        },
        "ledger_available": bool(ledger_available),
        "readiness": readiness_summary(readiness),
    }


def build_events(receipts: Iterable[object]) -> dict[str, Any]:
    """Build the complete redacted event payload for the local OS host."""
    events = redact_events(receipts)
    return {
        "version": OS_CONTRACT_VERSION,
        "events": events,
        "count": len(events),
    }

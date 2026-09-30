"""Digest-only idempotency ledger for governed Studio turns.

The ledger is deliberately small and append-only. It never stores seller
speech, audio, model prompts, credentials, or model output. Once a turn
receipt is committed, Studio can acknowledge a retry after a network drop or
process restart without executing the action again. Before that commit,
Engine writes are absolute values so an ambiguous transport retry cannot
compound commerce state.
"""

from __future__ import annotations

import hashlib
import json
import os
import threading
import time
import uuid
from pathlib import Path
from typing import Any, Optional


LEDGER_VERSION = "studio-turn.v1"
_FORBIDDEN_KEYS = {
    "audio",
    "audio_base64",
    "prompt",
    "seller_speech",
    "text",
    "transcript",
}


def _contains_forbidden_content(value: object) -> bool:
    if isinstance(value, dict):
        return any(
            key in _FORBIDDEN_KEYS or _contains_forbidden_content(nested)
            for key, nested in value.items()
        )
    if isinstance(value, list):
        return any(_contains_forbidden_content(item) for item in value)
    return False


class TurnLedgerError(RuntimeError):
    """The Studio cannot guarantee a durable idempotency receipt."""


def transcript_digest(text: str) -> str:
    """Return the only transcript representation allowed in the ledger."""
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


class TurnLedger:
    """Thread-safe append-only receipt store indexed by UUID turn id."""

    def __init__(self, path: str | os.PathLike[str]):
        self.path = Path(path)
        self._lock = threading.Lock()
        self._receipts: dict[str, dict[str, Any]] = {}
        self._preflight()
        self._load()

    def _preflight(self) -> None:
        if not str(self.path).strip():
            raise TurnLedgerError("turn ledger path must not be empty")
        try:
            self.path.parent.mkdir(parents=True, exist_ok=True)
            self.path.touch(exist_ok=True)
        except OSError as error:
            raise TurnLedgerError("turn ledger is not writable") from error

    def _load(self) -> None:
        try:
            with self.path.open("r", encoding="utf-8") as handle:
                for line in handle:
                    try:
                        receipt = json.loads(line)
                        self._validate_receipt(receipt)
                    except (json.JSONDecodeError, TurnLedgerError):
                        continue
                    self._receipts[receipt["turn_id"]] = receipt
        except OSError as error:
            raise TurnLedgerError("turn ledger cannot be read") from error

    def get(self, turn_id: str) -> Optional[dict[str, Any]]:
        normalized = str(uuid.UUID(turn_id))
        with self._lock:
            receipt = self._receipts.get(normalized)
            return dict(receipt) if receipt is not None else None

    def record(self, receipt: dict[str, Any]) -> dict[str, Any]:
        """Durably record a completed turn, returning the canonical receipt."""
        canonical = dict(receipt)
        canonical.setdefault("version", LEDGER_VERSION)
        canonical.setdefault("recorded_at", time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()))
        canonical["turn_id"] = str(uuid.UUID(str(canonical.get("turn_id", ""))))
        self._validate_receipt(canonical)

        encoded = json.dumps(canonical, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
        with self._lock:
            existing = self._receipts.get(canonical["turn_id"])
            if existing is not None:
                return dict(existing)
            try:
                with self.path.open("a", encoding="utf-8", newline="\n") as handle:
                    handle.write(encoded + "\n")
                    handle.flush()
                    os.fsync(handle.fileno())
            except OSError as error:
                raise TurnLedgerError("turn receipt could not be committed") from error
            self._receipts[canonical["turn_id"]] = canonical
        return dict(canonical)

    def recent(self, limit: int = 50) -> list[dict[str, Any]]:
        bounded = max(1, min(int(limit), 100))
        with self._lock:
            return [dict(value) for value in list(self._receipts.values())[-bounded:]][::-1]

    @staticmethod
    def _validate_receipt(receipt: object) -> None:
        if not isinstance(receipt, dict):
            raise TurnLedgerError("turn receipt must be an object")
        if receipt.get("version") != LEDGER_VERSION:
            raise TurnLedgerError("turn receipt version mismatch")
        try:
            uuid.UUID(str(receipt.get("turn_id", "")))
        except (ValueError, TypeError, AttributeError) as error:
            raise TurnLedgerError("turn receipt id must be a UUID") from error
        digest = receipt.get("transcript_sha256")
        if (
            not isinstance(digest, str)
            or len(digest) != 64
            or any(character not in "0123456789abcdef" for character in digest)
        ):
            raise TurnLedgerError("turn receipt requires a SHA-256 transcript digest")
        if _contains_forbidden_content(receipt):
            raise TurnLedgerError("turn receipt contains forbidden raw content")

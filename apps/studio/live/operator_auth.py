"""Single-tenant operator sessions for the Studio control plane."""

from __future__ import annotations

import hashlib
import hmac
import secrets
import threading
import time
from typing import Optional


SESSION_COOKIE = "yaatal_studio_session"


class OperatorSessionStore:
    """Exchange one server-owned control token for short-lived HTTP-only sessions."""

    def __init__(self, control_token: str = "", ttl_seconds: int = 8 * 60 * 60):
        self._control_token = control_token
        self._ttl_seconds = max(300, min(int(ttl_seconds), 24 * 60 * 60))
        self._sessions: dict[str, float] = {}
        self._lock = threading.Lock()

    @property
    def configured(self) -> bool:
        return bool(self._control_token)

    @staticmethod
    def _digest(value: str) -> str:
        return hashlib.sha256(value.encode("utf-8")).hexdigest()

    def issue(self, authorization: Optional[str]) -> tuple[str, int] | None:
        if not self.configured or not authorization or not authorization.startswith("Bearer "):
            return None
        candidate = authorization.removeprefix("Bearer ")
        if not hmac.compare_digest(candidate, self._control_token):
            return None
        raw_session = secrets.token_urlsafe(32)
        expires_at = time.time() + self._ttl_seconds
        with self._lock:
            self._prune_locked()
            self._sessions[self._digest(raw_session)] = expires_at
        return raw_session, self._ttl_seconds

    def valid(self, raw_session: Optional[str]) -> bool:
        if not raw_session:
            return False
        digest = self._digest(raw_session)
        with self._lock:
            self._prune_locked()
            return self._sessions.get(digest, 0) > time.time()

    def revoke(self, raw_session: Optional[str]) -> None:
        if not raw_session:
            return
        with self._lock:
            self._sessions.pop(self._digest(raw_session), None)

    def _prune_locked(self) -> None:
        now = time.time()
        expired = [key for key, expires_at in self._sessions.items() if expires_at <= now]
        for key in expired:
            self._sessions.pop(key, None)


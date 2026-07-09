"""
Yaatal WhatsApp Source — feeds inbound WhatsApp messages into CommentMonitor.

The Yaatal Engine persists inbound WhatsApp messages to a `social_events`
table and exposes them at `GET /api/social/events` (authed, Bearer token).
This module polls that endpoint and calls the existing
`CommentMonitor.add_comment(platform, user, text)` seam for each new
message — the same seam platform comment APIs (Facebook/TikTok/YouTube)
are meant to use (see `live/agent_loop/orchestrator.py`). It does not
change CommentMonitor's shape at all.

Engine contract (`GET /api/social/events`):
  Query params: platform, kind, since (RFC3339, strictly-after), limit (1..200, default 50)
  Response: JSON array of {id, platform, kind, external_id, sender, body,
            received_at, created_at}, newest-first.

Disabled (no-op) unless `YAATAL_ENGINE_URL` is set — mirrors `nfc_delivery`'s
"Engine not configured, don't crash the stream" posture. `YAATAL_TOKEN` is
required to authenticate once enabled.
"""

import json
import logging
import os
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from typing import Callable, Optional

logger = logging.getLogger(__name__)

PLATFORM = "whatsapp"


class WhatsAppSource:
    """Polls the Engine for inbound WhatsApp messages and feeds them into
    a CommentMonitor, the same way a platform comment API would.

    Usage:
        comments = CommentMonitor()
        whatsapp = WhatsAppSource(comments)   # reads YAATAL_ENGINE_URL / YAATAL_TOKEN
        whatsapp.start()                      # no-op if Engine URL isn't set
        ...
        whatsapp.stop()
    """

    def __init__(self, comment_monitor, engine_url: Optional[str] = None,
                 token: Optional[str] = None, poll_interval: float = 3.0,
                 fetch: Optional[Callable[[str, str, Optional[str]], list]] = None):
        """
        Args:
            comment_monitor: CommentMonitor instance to feed via add_comment()
            engine_url: Engine base URL (default: env YAATAL_ENGINE_URL).
                Source is disabled (start() is a no-op) if empty.
            token: Bearer token (default: env YAATAL_TOKEN)
            poll_interval: Seconds between polls
            fetch: Injectable fetch(engine_url, token, since) -> list[dict],
                used by tests to avoid real network calls. Defaults to
                _fetch_events (stdlib urllib GET).
        """
        self.comment_monitor = comment_monitor
        self.engine_url = (engine_url if engine_url is not None
                            else os.environ.get("YAATAL_ENGINE_URL", "")).rstrip("/")
        self.token = token if token is not None else os.environ.get("YAATAL_TOKEN", "")
        self.poll_interval = poll_interval
        self._fetch = fetch or self._fetch_events
        self._since: Optional[str] = None
        self._seen_ids: set = set()
        self._running = False
        self._thread: Optional[threading.Thread] = None

    @property
    def enabled(self) -> bool:
        return bool(self.engine_url)

    def start(self):
        """Start polling (non-blocking). No-op if YAATAL_ENGINE_URL isn't set."""
        if not self.enabled:
            logger.info("WhatsApp source disabled — YAATAL_ENGINE_URL not set")
            return
        self._running = True
        self._thread = threading.Thread(target=self._loop, daemon=True)
        self._thread.start()
        logger.info("WhatsApp source started (poll=%ss)", self.poll_interval)

    def stop(self):
        """Stop polling."""
        self._running = False
        if self._thread:
            self._thread.join(timeout=2)
        logger.info("WhatsApp source stopped")

    def poll_once(self):
        """Fetch one page of events and feed new ones to the CommentMonitor.

        Split out from the sleep loop so it's directly testable and so a
        single poll failure never takes down the agent loop's stream.
        """
        try:
            events = self._fetch(self.engine_url, self.token, self._since)
        except (urllib.error.URLError, TimeoutError, ValueError, OSError) as e:
            logger.warning("WhatsApp poll failed (will retry): %s", e)
            return

        # Engine returns newest-first; replay oldest-first so comments land
        # on screen in arrival order.
        for event in reversed(events):
            self._handle_event(event)

    def _handle_event(self, event: dict):
        event_id = event.get("id")
        if event_id is not None:
            if event_id in self._seen_ids:
                return
            self._seen_ids.add(event_id)

        received_at = event.get("received_at")
        if received_at and (self._since is None or received_at > self._since):
            self._since = received_at

        body = event.get("body")
        if not body:
            return  # skip events with empty/None body

        sender = event.get("sender") or "unknown"
        self.comment_monitor.add_comment(PLATFORM, sender, body)

    def _fetch_events(self, engine_url: str, token: str,
                       since: Optional[str]) -> list:
        """Default fetch: GET /api/social/events over stdlib urllib.

        ponytail: stdlib urllib, not requests — mirrors nfc_delivery's
        DeliveryBridge.confirm_delivery; one polling GET doesn't earn a dep.
        """
        params = {"platform": PLATFORM}
        if since:
            params["since"] = since
        url = f"{engine_url}/api/social/events?{urllib.parse.urlencode(params)}"
        req = urllib.request.Request(
            url, headers={"Authorization": f"Bearer {token}"}, method="GET",
        )
        with urllib.request.urlopen(req, timeout=10) as resp:
            return json.loads(resp.read().decode())

    def _loop(self):
        while self._running:
            self.poll_once()
            time.sleep(self.poll_interval)

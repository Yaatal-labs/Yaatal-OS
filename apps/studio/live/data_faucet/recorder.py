"""
Yaatal Data Faucet — turns each livestream session into a local, append-only
training-data asset for the private Kallaama dataset (Wolof/French commerce
speech, ml/edge-voice-lane in Yaatal-Engine).

Every session produces exactly the kind of Wolof/French commerce language
the ML lane needs, and today it's discarded once the agent loop consumes it
(CommentMonitor.add_comment in orchestrator.py). SessionRecorder captures it
instead, gated on the seller's explicit per-rig opt-in.

Sovereignty: this module NEVER reads its own output back and NEVER uploads
anywhere. Data stays on the rig as JSONL files; the private ML lane collects
it out-of-band (rsync/USB/whatever the operator chooses). Disabled unless
BOTH the seller has opted in (YAATAL_DATA_CONSENT=1) AND the data dir is
writable — mirrors whatsapp_source.py's "don't crash the stream" posture:
every method is a cheap no-op when disabled.
"""

import hashlib
import json
import logging
import os
import time
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)

DEFAULT_DATA_DIR = "./data/kallaama"


def _pseudonym(handle: str) -> str:
    """8-hex-char sha256 of a raw handle/phone — never store the raw value."""
    return hashlib.sha256(handle.encode("utf-8")).hexdigest()[:8]


class SessionRecorder:
    """Records one livestream session's commerce language to local JSONL.

    Usage:
        recorder = SessionRecorder(session_id)   # reads YAATAL_DATA_CONSENT / YAATAL_DATA_DIR
        comments = CommentMonitor(recorder=recorder)
        ...
        recorder.record_utterance(session_id, "jeex na", lang="wolof")  # seam for later
    """

    def __init__(self, session_id: str, data_dir: Optional[str] = None,
                 consent: Optional[bool] = None):
        """
        Args:
            session_id: identifies this livestream session; also the default
                file stem — {data_dir}/{session_id}.jsonl
            data_dir: where JSONL/manifest files land (default: env
                YAATAL_DATA_DIR, or ./data/kallaama)
            consent: seller opt-in override for tests (default: env
                YAATAL_DATA_CONSENT == "1")
        """
        self.session_id = session_id
        self.consent = (os.environ.get("YAATAL_DATA_CONSENT") == "1"
                         if consent is None else bool(consent))
        self.data_dir = Path(data_dir if data_dir is not None
                              else os.environ.get("YAATAL_DATA_DIR", DEFAULT_DATA_DIR))
        self.started_at = time.time()
        self._counts = {"live_comment": 0, "utterance": 0}
        self.enabled = self.consent and self._writable_dir()
        if self.enabled:
            logger.info("SessionRecorder enabled: session=%s dir=%s",
                        session_id, self.data_dir)
        else:
            logger.debug("SessionRecorder disabled: session=%s consent=%s dir=%s",
                         session_id, self.consent, self.data_dir)

    def _writable_dir(self) -> bool:
        try:
            self.data_dir.mkdir(parents=True, exist_ok=True)
        except OSError:
            return False
        return os.access(self.data_dir, os.W_OK)

    def _path(self, session_id: str) -> Path:
        return self.data_dir / f"{session_id}.jsonl"

    def _append(self, session_id: str, record: dict) -> None:
        # Open/write/close per call: no held file handle, so a crash between
        # calls never loses a partial line or leaves a dangling descriptor.
        with open(self._path(session_id), "a", encoding="utf-8") as f:
            f.write(json.dumps(record, ensure_ascii=False) + "\n")
            f.flush()
            os.fsync(f.fileno())

    def record_comment(self, event) -> None:
        """Append one CommentEvent (from CommentMonitor.add_comment) as a
        live_comment record. Pseudonymizes the author — the raw handle/phone
        never touches disk."""
        if not self.enabled:
            return
        self._append(self.session_id, {
            "ts": event.timestamp,
            "session_id": self.session_id,
            "source": "live_comment",
            "platform": event.platform,
            "author": _pseudonym(event.user),
            "text": event.text,
            "is_question": event.is_question,
        })
        self._counts["live_comment"] += 1
        self.session_manifest()

    def record_utterance(self, session_id: str, text: str,
                          lang: Optional[str] = None,
                          speaker: str = "seller") -> None:
        """Append one voice utterance. ponytail: nothing calls this yet —
        it's the seam stt_listener.py's real transcripts will use once
        microphone STT lands; the mock inject_text() path stays as-is."""
        if not self.enabled:
            return
        self._append(session_id, {
            "ts": time.time(),
            "session_id": session_id,
            "source": "utterance",
            "speaker": speaker,
            "lang": lang,
            "text": text,
        })
        self._counts["utterance"] += 1
        self.session_manifest()

    def session_manifest(self, session_id: Optional[str] = None) -> dict:
        """Write/update {session_id}.meta.json from in-memory counters —
        makes the dataset self-describing without ever reading a data file
        back. No-op (returns {}) when disabled."""
        if not self.enabled:
            return {}
        sid = session_id or self.session_id
        manifest = {
            "session_id": sid,
            "started_at": self.started_at,
            "consent": True,
            "counts": dict(self._counts),
        }
        path = self.data_dir / f"{sid}.meta.json"
        path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2),
                         encoding="utf-8")
        return manifest

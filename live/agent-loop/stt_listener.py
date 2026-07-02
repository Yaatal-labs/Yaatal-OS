"""
Yaatal STT Listener — connects Voicebox (or any STT) to the agent loop.

Continuously captures audio from the seller's microphone, transcribes it
via Voicebox STT (or Faster-Whisper), and feeds TranscriptEvents to the
AgentLoop for intent detection.

In production, this connects to Voicebox's /transcribe endpoint or
Faster-Whisper directly. For now, it provides the interface and a
mock mode for testing.
"""

import logging
import threading
import time
from typing import Callable, Optional

from .orchestrator import TranscriptEvent

logger = logging.getLogger(__name__)


class STTListener:
    """Listens to seller speech and feeds transcripts to the agent loop.

    Production mode: captures audio from microphone, sends to Voicebox
    STT endpoint (POST /transcribe), receives transcript chunks.

    Mock mode: accepts text via inject_text() for testing without
    a microphone or STT engine.
    """

    def __init__(self, on_transcript: Callable[[TranscriptEvent], None],
                 language: str = "auto",
                 voicebox_host: str = "localhost",
                 voicebox_port: int = 17493):
        """
        Args:
            on_transcript: Callback when a transcript chunk is ready
            language: Preferred language (auto | wolof | fr | en)
            voicebox_host: Voicebox API host
            voicebox_port: Voicebox API port
        """
        self.on_transcript = on_transcript
        self.language = language
        self.voicebox_host = voicebox_host
        self.voicebox_port = voicebox_port
        self._running = False
        self._thread: Optional[threading.Thread] = None

    def start(self):
        """Start listening (non-blocking)."""
        self._running = True
        self._thread = threading.Thread(target=self._capture_loop, daemon=True)
        self._thread.start()
        logger.info("STT listener started (lang=%s)", self.language)

    def stop(self):
        """Stop listening."""
        self._running = False
        if self._thread:
            self._thread.join(timeout=2)
        logger.info("STT listener stopped")

    def inject_text(self, text: str, language: str = "fr",
                    confidence: float = 0.95):
        """Inject text directly (for testing or manual input).

        Bypasses the microphone → STT pipeline. Useful for testing
        the agent loop without audio hardware.
        """
        event = TranscriptEvent(
            text=text,
            language=language,
            timestamp=time.time(),
            confidence=confidence,
        )
        self.on_transcript(event)

    def _capture_loop(self):
        """Main capture loop.

        In production, this:
        1. Captures audio from the microphone (pyaudio / sounddevice)
        2. Sends chunks to Voicebox STT: POST http://host:port/transcribe
        3. Receives transcript text
        4. Creates TranscriptEvent and calls on_transcript

        For now, this is a placeholder that waits for inject_text() calls.
        """
        logger.info("STT capture loop running (mock mode — use inject_text)")
        while self._running:
            time.sleep(0.1)

    # ─── Production integration (future) ────────────────────────────

    def _transcribe_via_voicebox(self, audio_bytes: bytes) -> str:
        """Send audio to Voicebox STT endpoint.

        POST /transcribe
        -F "audio=@recording.wav"
        -F "model=whisper-turbo"

        Returns transcript text.
        """
        # TODO: implement when Voicebox is running
        # import requests
        # url = f"http://{self.voicebox_host}:{self.voicebox_port}/transcribe"
        # response = requests.post(url, files={"audio": audio_bytes},
        #                          data={"model": "whisper-turbo"})
        # return response.json().get("text", "")
        raise NotImplementedError("Voicebox STT integration not yet wired")

    def _transcribe_via_faster_whisper(self, audio_bytes: bytes) -> str:
        """Transcribe directly via Faster-Whisper (local, no Voicebox needed).

        Uses the Wolof fine-tuned model (cifope/whisper-small-wolof)
        when language=wo, or standard Whisper for French.
        """
        # TODO: implement when Faster-Whisper is installed
        # from faster_whisper import WhisperModel
        # model = WhisperModel("cifope/whisper-small-wolof", device="cpu")
        # segments, info = model.transcribe(audio_bytes, language=self.language)
        # return " ".join(segment.text for segment in segments)
        raise NotImplementedError("Faster-Whisper integration not yet wired")
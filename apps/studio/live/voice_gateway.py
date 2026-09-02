"""Authenticated Studio-to-Engine voice WebSocket gateway.

The browser never receives the Engine service JWT or an internal service URL.
It sends one complete WAV turn with a stable UUID; the gateway forwards audio
to Engine voice, then submits only the final subtitle to the governed Harness
path. Raw speech and transcripts are never written or publicly broadcast.
"""

from __future__ import annotations

import asyncio
import base64
import binascii
import json
import logging
import uuid
from dataclasses import dataclass, field
from typing import Awaitable, Callable
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from fastapi import WebSocket, WebSocketDisconnect
from websockets.asyncio.client import connect
from websockets.exceptions import ConnectionClosed

try:
    from .engine_client import EngineClient
    from .governed_turn import GovernedTurnError, GovernedTurnRuntime
except ImportError:  # direct ``python live/studio_server.py`` compatibility
    from engine_client import EngineClient
    from governed_turn import GovernedTurnError, GovernedTurnRuntime


logger = logging.getLogger(__name__)

MAX_BROWSER_FRAME_CHARS = 2_000_000
MAX_WAV_BYTES = 1_400_000
MAX_SUBTITLE_CHARS = 2_000
_CLIENT_TYPES = {"session_config", "audio_chunk", "client_ping", "close"}
_SERVER_TYPES = {
    "session_ready",
    "subtitle",
    "audio_chunk",
    "turn_end",
    "pong",
    "warning",
    "error",
}

RuntimeProvider = Callable[[], Awaitable[GovernedTurnRuntime]]
Broadcast = Callable[[dict], Awaitable[None]]


class VoiceProtocolError(ValueError):
    """A browser voice frame violated the constrained Studio contract."""

    def __init__(self, code: str):
        super().__init__(code)
        self.code = code


def build_engine_voice_url(engine_api_url: str, jwt: str, override: str = "") -> str:
    """Build the private Engine voice URL without exposing it to browser code."""
    raw = override.strip() if override else f"{engine_api_url.rstrip('/')}/api/voice/session"
    parts = urlsplit(raw)
    scheme_map = {"http": "ws", "https": "wss", "ws": "ws", "wss": "wss"}
    if parts.scheme not in scheme_map or not parts.netloc:
        raise VoiceProtocolError("invalid_engine_voice_url")
    query = [(key, value) for key, value in parse_qsl(parts.query) if key != "token"]
    query.append(("token", jwt))
    return urlunsplit((scheme_map[parts.scheme], parts.netloc, parts.path, urlencode(query), ""))


def _required_text(value: object, field_name: str, max_chars: int) -> str:
    if not isinstance(value, str) or not value.strip() or len(value) > max_chars:
        raise VoiceProtocolError(f"invalid_{field_name}")
    return value.strip()


def _optional_text(value: object, field_name: str, max_chars: int) -> str | None:
    if value is None:
        return None
    if not isinstance(value, str) or len(value) > max_chars:
        raise VoiceProtocolError(f"invalid_{field_name}")
    normalized = value.strip()
    return normalized or None


def _validated_wav(audio_base64: object) -> str:
    if not isinstance(audio_base64, str) or not audio_base64:
        raise VoiceProtocolError("audio_required")
    if len(audio_base64) > MAX_BROWSER_FRAME_CHARS:
        raise VoiceProtocolError("audio_too_large")
    try:
        audio = base64.b64decode(audio_base64, validate=True)
    except (binascii.Error, ValueError) as error:
        raise VoiceProtocolError("invalid_audio_base64") from error
    if len(audio) > MAX_WAV_BYTES:
        raise VoiceProtocolError("audio_too_large")
    if len(audio) < 44 or audio[:4] != b"RIFF" or audio[8:12] != b"WAVE":
        raise VoiceProtocolError("audio_must_be_wav")
    return audio_base64


@dataclass
class BrowserVoiceState:
    """Per-connection protocol and idempotency state; never persisted."""

    configured: bool = False
    session_id: str = ""
    language: str = "wo-fr"
    pending_turn_id: str | None = None
    subtitle_parts: list[str] = field(default_factory=list)
    final_subtitle_seen: bool = False

    def client_message(self, payload: object) -> dict:
        if not isinstance(payload, dict):
            raise VoiceProtocolError("voice_message_must_be_object")
        message_type = payload.get("type")
        if message_type not in _CLIENT_TYPES:
            raise VoiceProtocolError("voice_message_type_not_allowed")

        if message_type == "session_config":
            if self.configured:
                raise VoiceProtocolError("session_already_configured")
            session_id = _required_text(payload.get("session_id"), "session_id", 128)
            language = _optional_text(payload.get("lang"), "language", 16) or "wo-fr"
            if language.lower() not in {"wo", "wolof", "fr", "french", "en", "wo-fr", "mixed", "auto"}:
                raise VoiceProtocolError("invalid_language")
            self.configured = True
            self.session_id = session_id
            self.language = language.lower()
            return {
                "type": "session_config",
                "session_id": session_id,
                "persona": _optional_text(payload.get("persona"), "persona", 64),
                "lang": self.language,
                "market": _optional_text(payload.get("market"), "market", 64),
            }

        if message_type == "audio_chunk":
            if not self.configured:
                raise VoiceProtocolError("session_config_required")
            if self.pending_turn_id is not None:
                raise VoiceProtocolError("voice_turn_in_progress")
            try:
                turn_id = str(uuid.UUID(str(payload.get("turn_id", ""))))
            except (ValueError, TypeError, AttributeError) as error:
                raise VoiceProtocolError("turn_id_must_be_uuid") from error
            audio_base64 = _validated_wav(payload.get("audio_base64"))
            self.pending_turn_id = turn_id
            self.subtitle_parts.clear()
            self.final_subtitle_seen = False
            # Rebuild the message so callers cannot smuggle context injection,
            # model selection, credentials, or a transcript hint upstream.
            return {"type": "audio_chunk", "audio_base64": audio_base64}

        if message_type == "client_ping":
            return {"type": "client_ping"}
        return {"type": "close"}

    def record_subtitle(self, text: object, final_chunk: object) -> str | None:
        if not isinstance(text, str) or not isinstance(final_chunk, bool):
            raise VoiceProtocolError("invalid_subtitle")
        if not text.strip():
            return None
        self.subtitle_parts.append(text.strip())
        joined = " ".join(self.subtitle_parts)
        if len(joined) > MAX_SUBTITLE_CHARS:
            raise VoiceProtocolError("subtitle_too_long")
        if final_chunk:
            self.final_subtitle_seen = True
            return joined
        return None

    def finish_turn(self) -> tuple[str | None, bool]:
        turn_id = self.pending_turn_id
        final_seen = self.final_subtitle_seen
        self.pending_turn_id = None
        self.subtitle_parts.clear()
        self.final_subtitle_seen = False
        return turn_id, final_seen


class StudioVoiceGateway:
    """Bridge one authenticated browser session to one Engine voice session."""

    def __init__(
        self,
        engine: EngineClient,
        runtime_provider: RuntimeProvider,
        broadcast: Broadcast,
        *,
        engine_api_url: str,
        engine_voice_ws_url: str = "",
        transcript_confidence: float = 0.85,
    ):
        self.engine = engine
        self.runtime_provider = runtime_provider
        self.broadcast = broadcast
        self.engine_api_url = engine_api_url
        self.engine_voice_ws_url = engine_voice_ws_url
        self.transcript_confidence = max(0.0, min(float(transcript_confidence), 1.0))

    async def serve(self, browser: WebSocket) -> None:
        jwt = await self.engine.get_jwt()
        if not jwt:
            await browser.send_json(
                {"type": "studio_retryable_error", "code": "engine_voice_auth_unavailable", "retryable": True}
            )
            await browser.close(code=1013)
            return

        try:
            upstream_url = build_engine_voice_url(
                self.engine_api_url, jwt, self.engine_voice_ws_url
            )
            async with connect(
                upstream_url,
                open_timeout=5,
                close_timeout=2,
                ping_interval=20,
                ping_timeout=20,
                max_size=MAX_BROWSER_FRAME_CHARS,
            ) as upstream:
                await self._bridge(browser, upstream)
        except VoiceProtocolError as error:
            await self._safe_send(
                browser,
                {"type": "studio_error", "code": error.code, "retryable": False},
            )
            await self._safe_close(browser, 1008)
        except (OSError, asyncio.TimeoutError, ConnectionClosed):
            logger.warning("Engine voice transport unavailable")
            await self._safe_send(
                browser,
                {"type": "studio_retryable_error", "code": "engine_voice_unavailable", "retryable": True},
            )
            await self._safe_close(browser, 1013)
        except Exception as error:  # never include a token-bearing URL in logs
            logger.warning("Engine voice gateway failed (%s)", type(error).__name__)
            await self._safe_send(
                browser,
                {"type": "studio_retryable_error", "code": "voice_gateway_failed", "retryable": True},
            )
            await self._safe_close(browser, 1011)

    async def _bridge(self, browser: WebSocket, upstream) -> None:
        state = BrowserVoiceState()
        send_lock = asyncio.Lock()
        browser_available = True

        async def send_browser(message: dict) -> None:
            nonlocal browser_available
            if not browser_available:
                return
            async with send_lock:
                try:
                    await browser.send_json(message)
                except Exception:
                    # Once a WAV turn has crossed the boundary, finish it even
                    # if the operator's network drops. Governance and the
                    # durable receipt must not depend on the response socket.
                    browser_available = False

        async def browser_to_engine() -> None:
            while True:
                try:
                    raw = await browser.receive_text()
                except WebSocketDisconnect:
                    return
                if len(raw) > MAX_BROWSER_FRAME_CHARS:
                    await send_browser(
                        {"type": "studio_error", "code": "voice_frame_too_large", "retryable": False}
                    )
                    continue
                try:
                    payload = json.loads(raw)
                    forwarded = state.client_message(payload)
                except (json.JSONDecodeError, VoiceProtocolError) as error:
                    code = error.code if isinstance(error, VoiceProtocolError) else "invalid_voice_json"
                    await send_browser(
                        {"type": "studio_error", "code": code, "retryable": False}
                    )
                    continue
                await upstream.send(json.dumps(forwarded, separators=(",", ":")))
                if forwarded["type"] == "close":
                    return

        async def engine_to_browser() -> None:
            async for raw in upstream:
                if not isinstance(raw, str) or len(raw) > MAX_BROWSER_FRAME_CHARS:
                    raise VoiceProtocolError("invalid_engine_voice_frame")
                try:
                    message = json.loads(raw)
                except json.JSONDecodeError as error:
                    raise VoiceProtocolError("invalid_engine_voice_json") from error
                if not isinstance(message, dict) or message.get("type") not in _SERVER_TYPES:
                    raise VoiceProtocolError("invalid_engine_voice_message")

                # Raw subtitle text is allowed only on this authenticated socket.
                await send_browser(message)

                if message["type"] == "subtitle":
                    transcript = state.record_subtitle(
                        message.get("text"), message.get("final_chunk")
                    )
                    if transcript is not None:
                        await self._govern(
                            send_browser, state, transcript
                        )
                elif message["type"] == "turn_end":
                    turn_id, final_seen = state.finish_turn()
                    if turn_id and not final_seen:
                        await send_browser(
                            {
                                "type": "studio_retryable_error",
                                "code": "final_subtitle_missing",
                                "turn_id": turn_id,
                                "retryable": True,
                            }
                        )

        browser_task = asyncio.create_task(browser_to_engine())
        engine_task = asyncio.create_task(engine_to_browser())
        done, _ = await asyncio.wait(
            {browser_task, engine_task}, return_when=asyncio.FIRST_COMPLETED
        )

        if browser_task in done and state.pending_turn_id and not engine_task.done():
            # The client retains and retries the WAV with the same UUID. Give
            # the first in-flight turn time to commit its ledger receipt so a
            # retry observes deduplication instead of racing execution.
            try:
                await asyncio.wait_for(engine_task, timeout=90)
            except asyncio.TimeoutError:
                engine_task.cancel()
        else:
            for task in (browser_task, engine_task):
                if not task.done():
                    task.cancel()

        await asyncio.gather(browser_task, engine_task, return_exceptions=True)

    async def _govern(
        self,
        send_browser: Callable[[dict], Awaitable[None]],
        state: BrowserVoiceState,
        transcript: str,
    ) -> None:
        turn_id = state.pending_turn_id
        if turn_id is None:
            await send_browser(
                {"type": "studio_error", "code": "subtitle_without_active_turn", "retryable": False}
            )
            return
        try:
            runtime = await self.runtime_provider()
            receipt = await runtime.process(
                transcript=transcript,
                language=state.language,
                confidence=self.transcript_confidence,
                turn_id=turn_id,
            )
        except GovernedTurnError as error:
            await send_browser(
                {
                    "type": "studio_retryable_error" if error.retryable else "studio_error",
                    "code": error.code,
                    "turn_id": turn_id,
                    "retryable": error.retryable,
                }
            )
            return

        await send_browser({"type": "studio_governed_action", "result": receipt})
        # Public dashboard and OBS clients get the digest-only receipt, never
        # the transcript or audio that produced it. A reconnecting client still
        # gets its acknowledgement, but a deduplicated replay must not animate
        # or reapply an OBS Browser Source action.
        if not receipt.get("deduplicated", False):
            await self.broadcast({"type": "governed_action", "result": receipt})

    @staticmethod
    async def _safe_send(browser: WebSocket, message: dict) -> None:
        try:
            await browser.send_json(message)
        except Exception:
            pass

    @staticmethod
    async def _safe_close(browser: WebSocket, code: int) -> None:
        try:
            await browser.close(code=code)
        except Exception:
            pass

# Ollama Cloud + Yaatal Engine API → Studio live/ Wiring Plan

**Date:** 2026-07-12
**Author:** Hermes Agent (subagent research task)
**Status:** Research complete, ready for implementation

---

## 1. Ollama Cloud — Accessibility from VPS

### Findings

| Check | Result |
|-------|--------|
| `OLLAMA_BASE_URL` in env / `.bashrc` / `.env` | **Not set** anywhere |
| Hermes config (`~/.hermes/config.yaml`) | `provider: ollama-cloud` is configured as Hermes's default provider |
| `GET https://api.ollama.com/api/tags` | **200 OK** — returns 40+ models (glm-5.2, gemma3:4b, qwen3-coder, etc.) |
| `POST https://api.ollama.com/api/chat` (no auth) | **401 Unauthorized** — requires API key |
| Auth credentials | Stored in `~/.hermes/auth.json` (Hermes credential store, not readable directly) |
| Model cache | `~/.hermes/ollama_cloud_models_cache.json` confirms active connection |

### Verdict

**Ollama Cloud IS accessible from the VPS.** The endpoint is `https://api.ollama.com` and it uses an API key stored in Hermes's credential store. The VPS can reach it (we got a 401, not a timeout). To use it from the live/ layer, the API key needs to be exposed as an environment variable.

### Endpoint Shape (Ollama Cloud — OpenAI-compatible)

```
Base URL:  https://api.ollama.com
Endpoints:
  POST /api/chat     — chat completion (Ollama native format)
  POST /v1/chat/completions  — OpenAI-compatible format
  GET  /api/tags     — list available models
```

**Chat request shape:**
```json
POST /api/chat
{
  "model": "gemma3:4b",
  "messages": [
    {"role": "system", "content": "You are a Wolof/French intent parser..."},
    {"role": "user", "content": "Seller said: 'Biiñ nañ ko, amul ñu, 12 mille fcfa'"}
  ],
  "stream": false,
  "format": "json"   // force JSON output for structured intent
}
```

**Response shape:**
```json
{
  "model": "gemma3:4b",
  "message": {
    "role": "assistant",
    "content": "{\"intent\": \"sold_out\", \"price\": null, \"product\": null}"
  },
  "done": true
}
```

### Recommended Models for Intent Detection

| Model | Why |
|-------|-----|
| `gemma3:4b` | Small, fast, low-latency — ideal for real-time intent parsing |
| `ministral-3:3b` | Even smaller, good for <200ms response needs |
| `gemma3:12b` | Better Wolof/French understanding if latency allows |

---

## 2. Yaatal Engine API — Local Availability

### Findings

| Check | Result |
|-------|--------|
| `curl http://localhost:5150/health` | **Connection refused** (000) — Engine not running |
| `curl http://localhost:8080/health` | **Connection refused** (000) — Engine not running in Docker either |
| Engine repo location | `/workspace/Yaatal-Engine/` (NOT `/root/Yaatal-Engine/`) |
| Dev config (`config/development.yaml`) | `server.port: 5150`, `server.host: 0.0.0.0` |
| Docker compose | `docker-compose.dev.yml` exists (Postgres + PgBouncer, API service not in compose) |
| `.env` | Only `HF_TOKEN` — no JWT_SECRET, no DB URI overrides |

### Verdict

**Engine API is NOT currently running.** It needs to be started with `cargo run -p yaatal-api --bin yaatal_api-cli -- start` from `/workspace/Yaatal-Engine/`. When running, it listens on port **5150** (dev) or **8080** (Docker).

### Engine API Surface (from README + code)

```
GET  /health                    — health check
POST /api/auth/login            — JWT auth, returns token
GET  /api/products              — list products (requires auth)
POST /api/orders                — create order
POST /api/deliveries/confirm-by-code  — confirm delivery
POST /api/voice/transcribe      — voice transcription (existing)
GET  /api/feed                  — social feed
```

---

## 3. Orchestrator — Where LLM Replaces Rule-Based Intent Detection

**File:** `/root/Yaatal-Studio/live/agent-loop/orchestrator.py`

### Current Architecture (Rule-Based)

The `SpeechIntentDetector` class (line 109) uses regex patterns and string matching:

| Method | Lines | What it does | Replacement strategy |
|--------|-------|-------------|---------------------|
| `detect_price()` | 117-143 | Regex matches FCFA/Wolof number patterns | LLM extracts structured price from mixed Wolof/French/English speech |
| `detect_sold_out()` | 145-155 | String contains check against `SOLD_OUT_TRIGGERS` list | LLM classifies intent with cultural context |
| `detect_product_switch()` | 157-163 | String contains check against `PRODUCT_SWITCH_TRIGGERS` | LLM detects transition intent |
| `detect_product_mention()` | 165-180 | Fuzzy string match against product names | LLM + Engine API: semantic product matching |

### Exact Insertion Points

**Primary:** `SpeechIntentDetector` class (line 109) — add an `LLMIntentDetector` alongside it, selectable via config.

**In `AgentLoop.process_transcript()` (line 326):** This is where the detector is called. The call chain is:
1. Line 336: `self.detector.detect_sold_out(text)` → triggers `mark_sold_out` + `clip_moment`
2. Line 345: `self.detector.detect_product_switch(text)` → triggers `_switch_to_next_product()`
3. Line 351: `self.detector.detect_price(text)` → triggers `update_price` + `send_caption`
4. Line 363: `self.detector.detect_product_mention(text, products)` → triggers `switch_to_product`

**Replace strategy:** Keep `SpeechIntentDetector` as fast fallback. Add `LLMIntentDetector` that calls Ollama Cloud with a structured prompt, returns JSON, and the `process_transcript` method tries LLM first, falls back to regex if LLM is unavailable or slow (>1s timeout).

---

## 4. STT Listener — Where Ollama/Whisper Plugs In

**File:** `/root/Yaatal-Studio/live/agent-loop/stt_listener.py`

### Current Architecture

| Component | Lines | Status |
|-----------|-------|--------|
| `__init__()` | 33-49 | Configured for Voicebox host/port (default localhost:17493) |
| `inject_text()` | 65-78 | Mock mode — bypasses audio, feeds text directly |
| `_capture_loop()` | 80-93 | Placeholder, just sleeps |
| `_transcribe_via_voicebox()` | 97-112 | **Stub** — `NotImplementedError`, commented-out requests.post |
| `_transcribe_via_faster_whisper()` | 114-124 | **Stub** — `NotImplementedError`, commented-out faster_whisper code |

### Exact Insertion Points

**For Ollama Cloud (LLM-based intent — NOT STT):**
Ollama Cloud does NOT do speech-to-text. It would be wired into the **orchestrator** (see §3), not the STT listener. The STT listener transcribes audio → text, then the orchestrator parses intent from text.

**For STT (speech → text), three options:**

1. **Voicebox endpoint** (`_transcribe_via_voicebox`, line 97): Already stubbed out. Fill in the `httpx.post()` call to `http://{voicebox_host}:{voicebox_port}/transcribe` with multipart audio upload.

2. **Engine API voice transcription** (`POST /api/voice/transcribe`): The Engine already has this endpoint. Can be used as an alternative to Voicebox. URL: `http://localhost:5150/api/voice/transcribe`.

3. **Ollama Cloud audio model (future)**: If Ollama Cloud adds a Whisper/ASR endpoint, it would plug into `_transcribe_via_faster_whisper` or a new `_transcribe_via_ollama` method.

### Recommended Wiring

Replace `_transcribe_via_voicebox()` with a working implementation using `httpx`:

```python
async def _transcribe_via_voicebox(self, audio_bytes: bytes) -> str:
    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.post(
            f"http://{self.voicebox_host}:{self.voicebox_port}/transcribe",
            files={"audio": ("recording.wav", audio_bytes, "audio/wav")},
            data={"model": "whisper-turbo", "language": self.language},
        )
        response.raise_for_status()
        return response.json().get("text", "")
```

Add a fallback to Engine API:
```python
async def _transcribe_via_engine(self, audio_bytes: bytes) -> str:
    """Use Yaatal Engine's /api/voice/transcribe endpoint."""
    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.post(
            f"{os.getenv('ENGINE_API_URL', 'http://localhost:5150')}/api/voice/transcribe",
            files={"audio": ("recording.wav", audio_bytes, "audio/wav")},
            headers={"Authorization": f"Bearer {self._engine_token}"},
        )
        response.raise_for_status()
        return response.json().get("text", "")
```

---

## 5. Concrete Wiring Plan

### 5.1 New Files to Create

**`/root/Yaatal-Studio/live/agent-loop/llm_detector.py`** — LLM-based intent detector

```python
"""LLM-powered intent detection via Ollama Cloud.

Upgrade path from rule-based SpeechIntentDetector. Uses a small fast model
(gemma3:4b or ministral-3:3b) to parse mixed Wolof/French/English seller
speech into structured intents.

Falls back to SpeechIntentDetector on timeout or error.
"""
import os, json, logging, httpx
from typing import Optional
from .orchestrator import SpeechIntentDetector

logger = logging.getLogger(__name__)

INTENT_SYSTEM_PROMPT = """You are a live-commerce intent parser for Wolof/French/English mixed speech.
Given a seller's transcribed speech, output JSON with these fields:
{
  "intent": "price_change" | "sold_out" | "product_switch" | "product_mention" | "none",
  "price": "12 000 FCFA" or null,
  "product_name": "product name mentioned" or null,
  "confidence": 0.0-1.0
}
Rules:
- "12 mille" or "douze mille" = 12000 FCFA
- "amul" / "amul ñu" / "vendu" / "sold out" = sold_out intent
- "produit suivant" / "on passe à" / "lèegi" = product_switch intent
- Extract the exact product name if the seller mentions one
- Be conservative: if unsure, return "none"
"""

class LLMIntentDetector:
    def __init__(
        self,
        base_url: str = None,
        api_key: str = None,
        model: str = None,
        timeout: float = 1.5,
    ):
        self.base_url = base_url or os.getenv("OLLAMA_BASE_URL", "https://api.ollama.com")
        self.api_key = api_key or os.getenv("OLLAMA_API_KEY")
        self.model = model or os.getenv("OLLAMA_INTENT_MODEL", "gemma3:4b")
        self.timeout = timeout
        self.fallback = SpeechIntentDetector()
        self._client = httpx.AsyncClient(
            base_url=self.base_url,
            headers={"Authorization": f"Bearer {self.api_key}"} if self.api_key else {},
            timeout=self.timeout,
        )

    async def detect(self, text: str) -> dict:
        """Detect intent from seller speech. Returns structured dict."""
        try:
            resp = await self._client.post("/api/chat", json={
                "model": self.model,
                "messages": [
                    {"role": "system", "content": INTENT_SYSTEM_PROMPT},
                    {"role": "user", "content": f"Seller said: \"{text}\""},
                ],
                "stream": False,
                "format": "json",
            })
            resp.raise_for_status()
            data = resp.json()
            content = data["message"]["content"]
            return json.loads(content)
        except Exception as e:
            logger.warning("LLM intent detection failed (%s), falling back to regex", e)
            return self._regex_fallback(text)

    def _regex_fallback(self, text: str) -> dict:
        """Use rule-based detector as fallback."""
        price = self.fallback.detect_price(text)
        if self.fallback.detect_sold_out(text):
            return {"intent": "sold_out", "price": price, "product_name": None, "confidence": 0.8}
        if self.fallback.detect_product_switch(text):
            return {"intent": "product_switch", "price": None, "product_name": None, "confidence": 0.8}
        if price:
            return {"intent": "price_change", "price": price, "product_name": None, "confidence": 0.8}
        return {"intent": "none", "price": None, "product_name": None, "confidence": 0.0}
```

**`/root/Yaatal-Studio/live/agent-loop/engine_client.py`** — Engine API client

```python
"""Yaatal Engine API client for the live/ layer.

Fetches real product data, creates orders, confirms deliveries —
replacing the mock product dicts in LiveController.
"""
import os, logging, httpx
from dataclasses import dataclass
from typing import Optional

logger = logging.getLogger(__name__)

@dataclass
class EngineProduct:
    id: str
    name: str
    price: str
    stock: Optional[int]
    description: Optional[str]
    image_url: Optional[str]

class EngineClient:
    def __init__(self, base_url: str = None, token: str = None):
        self.base_url = base_url or os.getenv("ENGINE_API_URL", "http://localhost:5150")
        self._token = token
        self._client = httpx.AsyncClient(
            base_url=self.base_url,
            timeout=10.0,
            headers={"Authorization": f"Bearer {token}"} if token else {},
        )

    async def login(self, email: str, password: str) -> str:
        """Authenticate and store JWT token."""
        resp = await self._client.post("/api/auth/login", json={
            "email": email, "password": password,
        })
        resp.raise_for_status()
        self._token = resp.json()["token"]
        self._client.headers["Authorization"] = f"Bearer {self._token}"
        return self._token

    async def get_products(self) -> list[EngineProduct]:
        """Fetch product catalog from Engine."""
        resp = await self._client.get("/api/products")
        resp.raise_for_status()
        return [EngineProduct(**p) for p in resp.json().get("products", [])]

    async def create_order(self, product_id: str, buyer_pid: str,
                           quantity: int = 1) -> dict:
        """Create an order via Engine API."""
        resp = await self._client.post("/api/orders", json={
            "product_id": product_id,
            "buyer_pid": buyer_pid,
            "quantity": quantity,
        })
        resp.raise_for_status()
        return resp.json()

    async def confirm_delivery(self, code: str) -> dict:
        """Confirm delivery by code."""
        resp = await self._client.post("/api/deliveries/confirm-by-code", json={
            "code": code,
        })
        resp.raise_for_status()
        return resp.json()

    async def health(self) -> bool:
        """Check if Engine is running."""
        try:
            resp = await self._client.get("/health")
            return resp.status_code == 200
        except Exception:
            return False
```

### 5.2 Files to Edit

| File | Changes |
|------|---------|
| `live/agent-loop/orchestrator.py` | Add `LLMIntentDetector` import; in `AgentLoop.__init__`, instantiate `self.llm_detector = LLMIntentDetector()` if `OLLAMA_API_KEY` is set; in `process_transcript()`, call `self.llm_detector.detect(text)` first, fall back to `self.detector` (regex) on failure |
| `live/agent-loop/stt_listener.py` | Implement `_transcribe_via_voicebox()` with `httpx.AsyncClient`; add `_transcribe_via_engine()` fallback to Engine's `/api/voice/transcribe`; make `_capture_loop()` use these |
| `live/agent-loop/__init__.py` | Export `LLMIntentDetector`, `EngineClient` |
| `live/obs-controller/controller.py` | Add `from live.agent-loop.engine_client import EngineClient, EngineProduct`; add `Product.from_engine()` classmethod to map `EngineProduct → Product` |
| `live/mcp-server/server.py` | In `start_session` tool, optionally fetch products from Engine API instead of requiring them as MCP args |

### 5.3 Environment Variables to Add

Create `/root/Yaatal-Studio/live/.env`:

```bash
# Ollama Cloud (LLM intent detection)
OLLAMA_BASE_URL=https://api.ollama.com
OLLAMA_API_KEY=<from Hermes auth.json or Ollama Cloud dashboard>
OLLAMA_INTENT_MODEL=gemma3:4b
OLLAMA_INTENT_TIMEOUT=1.5

# Yaatal Engine API
ENGINE_API_URL=http://localhost:5150
ENGINE_API_EMAIL=<seller account email>
ENGINE_API_PASSWORD=<seller account password>
# Or pre-authenticated token:
ENGINE_API_TOKEN=<JWT from POST /api/auth/login>

# Voicebox STT (existing, already defaulted)
VOICEBOX_HOST=localhost
VOICEBOX_PORT=17493

# Feature flags
USE_LLM_INTENT=true      # set false to force regex-only mode
USE_ENGINE_PRODUCTS=true  # set false to use mock product dicts
```

### 5.4 Modified `process_transcript()` Flow

```python
# In AgentLoop.process_transcript() — new version:

async def process_transcript(self, event: TranscriptEvent):
    text = event.text
    logger.debug("Transcript (%s): %s", event.language, text)

    # Try LLM intent detection first (if enabled)
    if self.llm_detector and os.getenv("USE_LLM_INTENT", "true") == "true":
        intent = await self.llm_detector.detect(text)
        if intent["intent"] == "sold_out":
            product = self.controller.session.current_product
            if product:
                self.controller.mark_sold_out(product)
                self.controller.clip_moment()
            return
        if intent["intent"] == "product_switch":
            self._switch_to_next_product()
            return
        if intent["intent"] == "price_change" and intent["price"]:
            product = self.controller.session.current_product
            if product:
                self.controller.update_price(product, intent["price"])
                self.controller.send_caption(f"Prix: {intent['price']}")
            return
        if intent["intent"] == "product_mention" and intent["product_name"]:
            # Use Engine API for semantic product matching
            product = await self._find_product_by_name(intent["product_name"])
            if product:
                self.controller.switch_to_product(product)
                return
        # No intent — caption if high confidence
        if event.confidence > 0.7:
            self.controller.send_caption(text)
        return

    # Fallback: original rule-based detection (unchanged)
    # ... existing code lines 336-374 ...
```

### 5.5 Implementation Order

1. **Create `engine_client.py`** — no dependencies, testable standalone
2. **Create `llm_detector.py`** — depends only on httpx + Ollama Cloud
3. **Edit `stt_listener.py`** — implement Voicebox + Engine transcription
4. **Edit `orchestrator.py`** — wire LLM detector + Engine product lookup
5. **Edit `controller.py`** — add `Product.from_engine()` mapper
6. **Edit `__init__.py`** — export new classes
7. **Start Engine API** — `cd /workspace/Yaatal-Engine && cargo run -p yaatal-api --bin yaatal_api-cli -- start`
8. **Test end-to-end** — use `inject_text()` with Wolof/French phrases

---

## Summary

| Component | Status | Action |
|-----------|--------|--------|
| Ollama Cloud | ✅ Accessible from VPS (`https://api.ollama.com`, needs API key) | Export key as `OLLAMA_API_KEY` env var |
| Engine API | ❌ Not running (repo at `/workspace/Yaatal-Engine/`, port 5150) | Start with `cargo run -p yaatal-api` |
| Orchestrator | Rule-based regex, clear insertion points identified | Add `LLMIntentDetector` with regex fallback |
| STT Listener | Two stub methods (`NotImplementedError`) | Implement with httpx, add Engine API fallback |
| Product data | Mock `Product` dataclass in `controller.py` | Add `EngineClient.get_products()` → map to `Product` |
| New files | — | `llm_detector.py`, `engine_client.py` |
| Env vars | None configured | 8 vars in `/root/Yaatal-Studio/live/.env` |
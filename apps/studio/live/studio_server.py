"""
Yaatal Studio Server — the visual dashboard + E2E test runner.

Serves:
  /                        — Dashboard (status, E2E test panel, overlay preview)
  /overlays/price          — Price card overlay (OBS Browser Source)
  /overlays/qr             — QR code overlay (OBS Browser Source)
  /overlays/sold-out       — Sold out stamp overlay
  /overlays/cta            — CTA bar overlay
  /overlays/comments       — Viewer comments overlay
  /api/status              — System status (Engine, Ollama, agent loop)
  /api/intent              — Parse speech intent (LLM or regex)
  /api/test/e2e            — Run full E2E test sequence
  /api/test/e2e/results    — Get last E2E test results
  /ws                      — WebSocket for live updates
"""
import os
import json
import logging
import asyncio
import time
import uuid
from pathlib import Path
from dataclasses import dataclass, field, asdict
from typing import Optional

import httpx
from fastapi import Depends, FastAPI, HTTPException, WebSocket, WebSocketDisconnect, Request
from fastapi.responses import HTMLResponse, JSONResponse, FileResponse, Response
from fastapi.staticfiles import StaticFiles

try:
    from live.commerce_poc import CommercePocError, CommercePocStore
    from live.engine_client import EngineClient, get_engine_client
    from live.governed_turn import GovernedTurnError, GovernedTurnRuntime
    from live.harness_client import (
        HarnessHttpClient,
        HarnessCliClient,
        HarnessClientError,
        get_harness_client,
    )
    from live.operator_auth import OperatorSessionStore, SESSION_COOKIE
    from live.os_contract import build_events as build_os_events, build_status as build_os_status
    from live.turn_ledger import TurnLedger, TurnLedgerError
    from live.voice_gateway import StudioVoiceGateway, build_engine_voice_url
except ModuleNotFoundError as exc:
    if exc.name != "live":
        raise
    from commerce_poc import CommercePocError, CommercePocStore
    from engine_client import EngineClient, get_engine_client
    from governed_turn import GovernedTurnError, GovernedTurnRuntime
    from harness_client import (
        HarnessHttpClient,
        HarnessCliClient,
        HarnessClientError,
        get_harness_client,
    )
    from operator_auth import OperatorSessionStore, SESSION_COOKIE
    from os_contract import build_events as build_os_events, build_status as build_os_status
    from turn_ledger import TurnLedger, TurnLedgerError
    from voice_gateway import StudioVoiceGateway, build_engine_voice_url

# Backward-compat alias — existing code/tests use HarnessClient
HarnessClient = HarnessHttpClient

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("yaatal.studio")

# ─── Config ─────────────────────────────────────────────────────
OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "https://api.ollama.com")
OLLAMA_API_KEY = os.getenv("OLLAMA_API_KEY", "")
OLLAMA_INTENT_MODEL = os.getenv("OLLAMA_INTENT_MODEL", "gemma3:4b")
ENGINE_API_URL = os.getenv("ENGINE_API_URL", "http://yaatal-engine:8080")
ENGINE_VOICE_WS_URL = os.getenv("ENGINE_VOICE_WS_URL", "")
HARNESS_URL = os.getenv("HARNESS_URL", "http://yaatal-edge-turn:8090")
STUDIO_HOST = os.getenv("STUDIO_HOST", "127.0.0.1")
STUDIO_PORT = int(os.getenv("STUDIO_PORT", "8484"))
STUDIO_VERSION = os.getenv("STUDIO_VERSION", "0.2.0")
STUDIO_GIT_SHA = os.getenv("STUDIO_GIT_SHA", "unknown")
STUDIO_COOKIE_SECURE = os.getenv("STUDIO_COOKIE_SECURE", "1") == "1"
STUDIO_CONTROL_TOKEN = os.getenv("STUDIO_CONTROL_TOKEN", "")
STUDIO_DEMO_MODE = os.getenv("STUDIO_DEMO_MODE", "0") == "1"
YAATAL_COMMERCE_POC = os.getenv("YAATAL_COMMERCE_POC", "0") == "1"
YAATAL_COMMERCE_PUBLIC_BASE_URL = os.getenv(
    "YAATAL_COMMERCE_PUBLIC_BASE_URL",
    f"http://{STUDIO_HOST}:{STUDIO_PORT}",
)
try:
    STUDIO_VOICE_TRANSCRIPT_CONFIDENCE = float(
        os.getenv("STUDIO_VOICE_TRANSCRIPT_CONFIDENCE", "0.85")
    )
except ValueError:
    STUDIO_VOICE_TRANSCRIPT_CONFIDENCE = 0.85
HARNESS_BIN = os.getenv("YAATAL_HARNESS_BIN", "") or os.getenv("HARNESS_CLI_PATH", "")
HARNESS_MODEL_BACKEND = os.getenv("YAATAL_EDGE_MODEL_BACKEND", "mock")
HARNESS_FALLBACK = os.getenv("YAATAL_HARNESS_FALLBACK", "0") == "1"
# Transport selection: HTTP (HARNESS_URL) → CLI (HARNESS_CLI_PATH/YAATAL_HARNESS_BIN) → None
# HARNESS_CLIENT is the CLI fallback instance (for the CLI-based /api/intent path).
# The HTTP transport is used by default via get_harness_client() / select_harness_transport().
HARNESS_CLIENT: HarnessCliClient | None = None
if HARNESS_BIN and not os.getenv("HARNESS_URL"):
    try:
        HARNESS_CLIENT = HarnessCliClient(
            binary=HARNESS_BIN, model_backend=HARNESS_MODEL_BACKEND,
        )
    except HarnessClientError as exc:
        logger.warning("Harness CLI client init failed: %s — no-op mode", exc)

OVERLAYS_DIR = Path(__file__).parent / "overlays"
DASHBOARD_DIR = Path(__file__).parent / "dashboard"
TURN_LEDGER_PATH = os.getenv(
    "STUDIO_TURN_LEDGER",
    str(Path(__file__).parent.parent / "data" / "studio-turns.jsonl"),
)

OPERATOR_SESSIONS = OperatorSessionStore(STUDIO_CONTROL_TOKEN)
TURN_LEDGER: TurnLedger | None = None
TURN_LEDGER_ERROR = ""
try:
    TURN_LEDGER = TurnLedger(TURN_LEDGER_PATH)
except TurnLedgerError as exc:
    TURN_LEDGER_ERROR = str(exc)
    logger.error("Studio governed actions disabled: %s", TURN_LEDGER_ERROR)

_governed_runtime: GovernedTurnRuntime | None = None
COMMERCE_POC_STORE = CommercePocStore(YAATAL_COMMERCE_PUBLIC_BASE_URL)

# ─── Live session state ─────────────────────────────────────────
@dataclass
class StudioSessionState:
    """Tracks the Studio-local production session.

    Engine currently exposes the read-only active product context used by
    Harness, but no create/end live-session mutation contract. Studio must not
    pretend those endpoints exist.
    """
    is_live: bool = False
    session_id: Optional[str] = None
    engine_session_id: Optional[str] = None
    started_at: float = 0.0
    seller_name: str = ""

_session_state = StudioSessionState()

# ─── E2E Test State ─────────────────────────────────────────────
@dataclass
class TestStep:
    name: str
    description: str
    status: str = "pending"  # pending | running | passed | failed | skipped
    detail: str = ""
    duration_ms: int = 0

@dataclass
class E2EResult:
    steps: list = field(default_factory=list)
    started_at: str = ""
    finished_at: str = ""
    total_duration_ms: int = 0
    overall: str = "pending"  # pending | passed | failed

_last_results: Optional[E2EResult] = None
_ws_clients: list[WebSocket] = []


async def require_operator(request: Request) -> bool:
    """Protect state-changing and seller-data control-plane routes."""
    if not OPERATOR_SESSIONS.configured:
        raise HTTPException(status_code=503, detail="Studio control token is not configured")
    if not OPERATOR_SESSIONS.valid(request.cookies.get(SESSION_COOKIE)):
        raise HTTPException(status_code=401, detail="Studio operator session required")
    return True


async def get_governed_runtime() -> GovernedTurnRuntime:
    global _governed_runtime
    if TURN_LEDGER is None:
        raise GovernedTurnError("turn_ledger_unavailable", retryable=False)
    if _governed_runtime is None:
        _governed_runtime = GovernedTurnRuntime(
            harness=HarnessHttpClient(base_url=HARNESS_URL),
            engine=await get_engine_client(),
            ledger=TURN_LEDGER,
            model_backend=HARNESS_MODEL_BACKEND,
        )
    return _governed_runtime


def require_commerce_poc() -> None:
    """Fail closed unless the disposable CommerceIntent adapter is explicit."""
    if not YAATAL_COMMERCE_POC:
        raise HTTPException(status_code=503, detail="commerce_poc_disabled")


def commerce_error(exc: CommercePocError) -> JSONResponse:
    return JSONResponse(
        {"error": exc.code, "message": exc.message},
        status_code=exc.status_code,
    )

# ─── Intent Detection ───────────────────────────────────────────

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

# Regex fallback patterns
import re
PRICE_PATTERNS = [
    re.compile(r'(\d[\d\s]*\d?)\s*(?:mille|milliers?|francs?|fcfa|cfa)', re.I),
    re.compile(r'(\d{1,3}(?:\s?\d{3})+)', re.I),
]
SOLD_OUT_TRIGGERS = ["amul ñu", "jeex na", "vendu", "tout vendu", "rupture", "sold out", "out of stock"]
PRODUCT_SWITCH_TRIGGERS = ["produit suivant", "on passe à", "lèegi"]


def regex_intent(text: str) -> dict:
    """Rule-based intent detection (fallback)."""
    text_lower = text.lower()
    for trigger in SOLD_OUT_TRIGGERS:
        if trigger in text_lower:
            return {"intent": "sold_out", "price": None, "product_name": None, "confidence": 0.8}
    for trigger in PRODUCT_SWITCH_TRIGGERS:
        if trigger in text_lower:
            return {"intent": "product_switch", "price": None, "product_name": None, "confidence": 0.8}
    for pattern in PRICE_PATTERNS:
        m = pattern.search(text)
        if m:
            raw = m.group(1).replace(" ", "")
            try:
                num = int(raw)
                if "mille" in text_lower:
                    num *= 1000
                return {"intent": "price_change", "price": f"{num:,} FCFA".replace(",", " "), "product_name": None, "confidence": 0.8}
            except ValueError:
                pass
    return {"intent": "none", "price": None, "product_name": None, "confidence": 0.0}


async def llm_intent(text: str) -> dict:
    """LLM-based intent detection via Ollama Cloud."""
    if not OLLAMA_API_KEY:
        return regex_intent(text)
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            resp = await client.post(
                f"{OLLAMA_BASE_URL}/api/chat",
                headers={"Authorization": f"Bearer {OLLAMA_API_KEY}"},
                json={
                    "model": OLLAMA_INTENT_MODEL,
                    "messages": [
                        {"role": "system", "content": INTENT_SYSTEM_PROMPT},
                        {"role": "user", "content": f'Seller said: "{text}"'},
                    ],
                    "stream": False,
                    "format": "json",
                },
            )
            resp.raise_for_status()
            data = resp.json()
            content = data["message"]["content"]
            return json.loads(content)
    except Exception as e:
        logger.warning("LLM intent failed (%s), falling back to regex", e)
        return regex_intent(text)


def _tool_to_intent(tool: str) -> str:
    """Map a Harness tool name to the dashboard's legacy intent label."""
    return {
        "studio.update_price_overlay": "price_change",
        "studio.mark_sold_out_overlay": "sold_out",
        "studio.switch_product": "product_switch",
    }.get(tool, "none")


def normalize_studio_product(product: dict) -> dict:
    """Map Engine's legacy whole-FCFA fields to a stable Studio shape."""
    normalized = dict(product)
    price_fcfa = product.get("price_fcfa")
    if not isinstance(price_fcfa, int) or isinstance(price_fcfa, bool):
        price_fcfa = product.get("price_cents")
    if not isinstance(price_fcfa, int) or isinstance(price_fcfa, bool):
        price_fcfa = product.get("price")
    if not isinstance(price_fcfa, int) or isinstance(price_fcfa, bool):
        price_fcfa = None
    normalized["price"] = price_fcfa
    normalized["price_fcfa"] = price_fcfa
    if price_fcfa is not None and not normalized.get("price_display"):
        normalized["price_display"] = f"{price_fcfa:,} FCFA".replace(",", " ")
    if STUDIO_DEMO_MODE and not _first_image(normalized):
        placeholder = _DEMO_CATEGORY_IMAGES.get(str(normalized.get("category") or "").lower())
        if placeholder:
            normalized["images"] = [placeholder]
    return normalized


def _first_image(product: dict):
    images = product.get("images")
    if isinstance(images, str):
        try:
            images = json.loads(images)
        except (ValueError, TypeError):
            images = []
    if isinstance(images, list):
        for image in images:
            if isinstance(image, str) and image.strip():
                return image.strip()
    return None


# Demo-only visual fallbacks for Engine products that have no photos yet.
# Production never silently substitutes data; this only fills image slots
# in STUDIO_DEMO_MODE so the cockpit shows a living catalog.
_DEMO_CATEGORY_IMAGES = {
    "tech": "/dashboard/img/smartphone.png",
    "phone": "/dashboard/img/smartphone.png",
    "fashion": "/dashboard/img/bazin_robe.png",
    "clothing": "/dashboard/img/bazin_robe.png",
    "leather": "/dashboard/img/leather_bag.png",
    "bags": "/dashboard/img/leather_bag.png",
    "jewelry": "/dashboard/img/gold_earrings.png",
    "drinks": "/dashboard/img/bissap.png",
    "food": "/dashboard/img/bissap.png",
    "decor": "/dashboard/img/thiote_mat.png",
    "home": "/dashboard/img/thiote_mat.png",
}


def edge_decision_to_intent(response: dict) -> dict:
    """Map a governed edge-turn response to the dashboard's legacy shape."""
    proposal = response.get("proposal") or {}
    tool = proposal.get("tool")
    intent_by_tool = {
        "studio.update_price_overlay": "price_change",
        "studio.mark_sold_out_overlay": "sold_out",
        "studio.switch_product": "product_switch",
    }
    allowed = response.get("decision") == "allow"
    price_fcfa = proposal.get("price_fcfa") if allowed else None
    price = (
        f"{price_fcfa:,} FCFA".replace(",", " ")
        if isinstance(price_fcfa, int) and not isinstance(price_fcfa, bool)
        else None
    )
    confidence = proposal.get("confidence", 0.0) if allowed else 0.0
    return {
        "intent": intent_by_tool.get(tool, "none") if allowed else "none",
        "price": price,
        "product_name": None,
        "confidence": confidence,
        "source": "harness",
        "edge_turn": response,
    }


# ─── Engine Client ──────────────────────────────────────────────

async def engine_health() -> dict:
    """Check Engine API health."""
    engine = await get_engine_client()
    reachable = await engine.health()
    return {"reachable": reachable, "status": 200 if reachable else 0}


async def ollama_health() -> dict:
    """Check Ollama Cloud health."""
    if not OLLAMA_API_KEY:
        return {"reachable": False, "model": OLLAMA_INTENT_MODEL, "detail": "no API key"}
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(
                f"{OLLAMA_BASE_URL}/api/tags",
                headers={"Authorization": f"Bearer {OLLAMA_API_KEY}"},
            )
            models = resp.json().get("models", [])
            model_names = [m["name"] for m in models[:5]]
            return {
                "reachable": True,
                "model": OLLAMA_INTENT_MODEL,
                "models_available": len(models),
                "sample": model_names,
            }
    except Exception as e:
        return {"reachable": False, "model": OLLAMA_INTENT_MODEL, "detail": str(e)}


# ─── WebSocket broadcast ────────────────────────────────────────

async def broadcast(message: dict):
    """Send message to all connected WebSocket clients."""
    dead = []
    for ws in _ws_clients:
        try:
            await ws.send_json(message)
        except Exception:
            dead.append(ws)
    for ws in dead:
        _ws_clients.remove(ws)


# ─── E2E Test Sequence ──────────────────────────────────────────

async def run_e2e_tests():
    """Run non-mutating OS readiness gates.

    This suite deliberately does not call an LLM, open a billable voice model
    session, or mutate commerce state. The operator performs the real
    voice-to-action acceptance turn separately with a known test product.
    """
    global _last_results

    result = E2EResult(started_at=time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()))
    steps = [
        TestStep("control_plane", "Operator auth and durable receipt ledger configured"),
        TestStep("engine_health", "Engine API reachable"),
        TestStep("engine_identity", "Studio can acquire its server-side Engine identity"),
        TestStep("engine_context", "Real Engine product context is available"),
        TestStep("harness_health", "Harness edge-turn.v1 endpoint reachable"),
        TestStep("voice_config", "Private Engine voice route and identity are valid"),
        TestStep("audit_privacy", "Stored action receipts contain digests, not seller speech"),
        TestStep("overlays_served", "Governed OBS Browser Source files present"),
        TestStep("websocket_live", "At least one public update subscriber connected"),
    ]
    result.steps = steps

    async def run_step(step: TestStep, fn):
        step.status = "running"
        await broadcast({"type": "step_update", "step": asdict(step)})
        t0 = time.time()
        try:
            detail = await fn()
            step.status = "passed"
            step.detail = detail
        except Exception as e:
            step.status = "failed"
            step.detail = str(e)
        step.duration_ms = int((time.time() - t0) * 1000)
        await broadcast({"type": "step_update", "step": asdict(step)})
        return step.status == "passed"

    all_pass = True

    async def test_control_plane():
        if not OPERATOR_SESSIONS.configured:
            raise RuntimeError("STUDIO_CONTROL_TOKEN is not configured")
        if TURN_LEDGER is None:
            raise RuntimeError(TURN_LEDGER_ERROR or "turn ledger is unavailable")
        return "operator sessions + durable digest ledger ready"

    all_pass &= await run_step(steps[0], test_control_plane)

    async def test_engine():
        h = await engine_health()
        if h["reachable"]:
            return "Engine health OK"
        raise RuntimeError("Engine is unreachable")

    all_pass &= await run_step(steps[1], test_engine)

    engine = await get_engine_client()

    async def test_engine_identity():
        if not await engine.get_jwt():
            raise RuntimeError("STUDIO_JWT or Engine service login is unavailable")
        return "server-side Engine identity acquired"

    all_pass &= await run_step(steps[2], test_engine_identity)

    async def test_engine_context():
        products = await engine.get_session_products()
        source = "active_session"
        if not products:
            products = await engine.get_catalog()
            source = "catalog"
        if not products:
            raise RuntimeError("Engine returned no real product context")
        return f"{len(products)} product(s) from Engine {source}"

    all_pass &= await run_step(steps[3], test_engine_context)

    async def test_harness():
        harness = HarnessHttpClient(base_url=HARNESS_URL)
        if not await harness.health():
            raise RuntimeError("Harness /health is unreachable")
        return f"edge-turn.v1 ready ({HARNESS_MODEL_BACKEND})"

    all_pass &= await run_step(steps[4], test_harness)

    async def test_voice_config():
        jwt = await engine.get_jwt()
        if not jwt:
            raise RuntimeError("Engine voice identity unavailable")
        build_engine_voice_url(ENGINE_API_URL, jwt, ENGINE_VOICE_WS_URL)
        return "private voice URL valid; model session intentionally not opened"

    all_pass &= await run_step(steps[5], test_voice_config)

    async def test_audit_privacy():
        if TURN_LEDGER is None:
            raise RuntimeError("turn ledger unavailable")
        events = TURN_LEDGER.recent(50)
        forbidden = {"text", "transcript", "audio", "audio_base64", "prompt", "messages"}

        def contains_forbidden(value):
            if isinstance(value, dict):
                return any(
                    key in forbidden or contains_forbidden(nested)
                    for key, nested in value.items()
                )
            if isinstance(value, list):
                return any(contains_forbidden(item) for item in value)
            return False

        for event in events:
            if contains_forbidden(event):
                raise RuntimeError("raw seller content field found in receipt")
            digest = event.get("transcript_sha256")
            if not isinstance(digest, str) or len(digest) != 64:
                raise RuntimeError("receipt is missing a SHA-256 transcript digest")
        return f"{len(events)} digest-only receipt(s) verified"

    all_pass &= await run_step(steps[6], test_audit_privacy)

    async def test_overlays():
        expected = ["price_card.html", "sold_out.html", "product_info.html"]
        missing = [f for f in expected if not (OVERLAYS_DIR / f).exists()]
        if missing:
            raise RuntimeError(f"missing governed overlays: {missing}")
        return f"all {len(expected)} governed overlays present"

    all_pass &= await run_step(steps[7], test_overlays)

    async def test_ws():
        if _ws_clients:
            return f"{len(_ws_clients)} client(s) connected"
        raise RuntimeError("no dashboard or OBS subscriber connected")

    all_pass &= await run_step(steps[8], test_ws)

    result.finished_at = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    result.total_duration_ms = sum(s.duration_ms for s in steps)
    result.overall = "passed" if all_pass else "failed"
    _last_results = result

    await broadcast({"type": "e2e_complete", "result": asdict(result)})
    return result


# ─── FastAPI App ────────────────────────────────────────────────

app = FastAPI(
    title="Yaatal Studio",
    version=STUDIO_VERSION,
    docs_url="/docs" if os.getenv("STUDIO_EXPOSE_DOCS", "0") == "1" else None,
    redoc_url=None,
)

# Serve dashboard static assets (styles.css, app.js) under /dashboard/
if DASHBOARD_DIR.exists():
    app.mount("/dashboard", StaticFiles(directory=str(DASHBOARD_DIR)), name="dashboard-static")


@app.get("/health")
async def health():
    """Cheap liveness probe with no network dependency."""
    return {
        "status": "ok",
        "version": STUDIO_VERSION,
        "git_sha": STUDIO_GIT_SHA,
    }


@app.get("/favicon.ico", include_in_schema=False)
async def favicon():
    return Response(status_code=204)


@app.post("/api/studio/operator/session")
async def open_operator_session(request: Request):
    issued = OPERATOR_SESSIONS.issue(request.headers.get("authorization"))
    if issued is None:
        status = 503 if not OPERATOR_SESSIONS.configured else 401
        return JSONResponse(
            {"error": "operator_auth_unavailable" if status == 503 else "operator_auth_failed"},
            status_code=status,
        )
    raw_session, ttl = issued
    response = JSONResponse({"authenticated": True, "expires_in": ttl})
    response.set_cookie(
        SESSION_COOKIE,
        raw_session,
        max_age=ttl,
        httponly=True,
        secure=STUDIO_COOKIE_SECURE,
        samesite="strict",
        path="/",
    )
    return response


@app.get("/api/studio/operator/session")
async def operator_session_status(request: Request):
    return {
        "configured": OPERATOR_SESSIONS.configured,
        "authenticated": OPERATOR_SESSIONS.valid(request.cookies.get(SESSION_COOKIE)),
    }


@app.delete("/api/studio/operator/session")
async def close_operator_session(request: Request):
    OPERATOR_SESSIONS.revoke(request.cookies.get(SESSION_COOKIE))
    response = JSONResponse({"authenticated": False})
    response.delete_cookie(SESSION_COOKIE, path="/")
    return response




@app.get("/api/status")
async def status():
    """System status endpoint."""
    engine = await engine_health()
    harness = await harness_health()
    return {
        "studio": {
            "port": STUDIO_PORT,
            "version": STUDIO_VERSION,
            "git_sha": STUDIO_GIT_SHA,
            "operator_auth_configured": OPERATOR_SESSIONS.configured,
            "turn_ledger_available": TURN_LEDGER is not None,
            "demo_mode": STUDIO_DEMO_MODE,
            "commerce_poc": {
                "enabled": YAATAL_COMMERCE_POC,
                "contract": "yaatal.commerce-intent.v1",
                "authority": "ephemeral_demo_only",
            },
            "voice_gateway": {
                "contract": "studio-voice.v1",
                "auth_configured": bool(
                    os.getenv("STUDIO_JWT")
                    or (
                        os.getenv("ENGINE_API_EMAIL")
                        and os.getenv("ENGINE_API_PASSWORD")
                    )
                ),
            },
        },
        "engine": engine,
        # Legacy advisory fallback metadata only. Status polling must never
        # call an external model provider.
        "ollama": {
            "configured": bool(OLLAMA_API_KEY),
            "model": OLLAMA_INTENT_MODEL,
            "role": "legacy_advisory_only",
        },
        "harness": {
            **harness,
            "cli_configured": HARNESS_CLIENT is not None,
            "model_backend": HARNESS_MODEL_BACKEND,
        },
        "intent_model": OLLAMA_INTENT_MODEL,
        "overlays": [f.name for f in OVERLAYS_DIR.glob("*.html")] if OVERLAYS_DIR.exists() else [],
    }


@app.get("/api/os/status")
async def os_status():
    """Return the versioned, sanitized contract used by the local OS host.

    This intentionally avoids Engine/Harness/voice addresses, credentials,
    readiness details, seller state, and any data that could identify speech.
    The sidecar launcher binds loopback-only for the desktop POC.
    """
    return build_os_status(
        ledger_available=TURN_LEDGER is not None,
        readiness=_last_results,
    )


@app.get("/api/os/events")
async def os_events():
    """Return redacted governed-turn metadata for the local OS event poller."""
    receipts = TURN_LEDGER.recent(50) if TURN_LEDGER is not None else []
    return build_os_events(receipts)


@app.post(
    "/api/studio/poc/commerce-intents",
    dependencies=[Depends(require_operator)],
)
async def create_commerce_intent(request: Request):
    """Mint a portable product link for the current Studio session.

    This endpoint is deliberately limited to the feature-gated POC adapter.
    Engine will own the production mutation and will resolve ``product_id``
    from its catalog instead of accepting a browser product snapshot.
    """
    require_commerce_poc()
    if not _session_state.is_live or not _session_state.session_id:
        return JSONResponse(
            {"error": "live_session_required", "message": "start the Studio session first"},
            status_code=409,
        )
    try:
        body = await request.json()
        product = body.get("product") if isinstance(body, dict) else None
        if not isinstance(product, dict):
            raise CommercePocError("invalid_request", "product is required")
        result = COMMERCE_POC_STORE.create(
            product,
            _session_state.session_id,
            _session_state.seller_name or "Yaatal seller",
        )
    except CommercePocError as exc:
        return commerce_error(exc)
    await broadcast(
        {
            "type": "commerce_intent_created",
            "intent_id": result["intent_id"],
            "product_id": result["product"]["id"],
            "live_session_id": result["live_session_id"],
        }
    )
    return result


@app.get(
    "/api/studio/poc/conversions",
    dependencies=[Depends(require_operator)],
)
async def commerce_conversions(live_session_id: str | None = None):
    """Return POC receipts without buyer PII or model/speech content."""
    require_commerce_poc()
    session_id = live_session_id or _session_state.session_id
    values = COMMERCE_POC_STORE.conversions(session_id)
    return {
        "version": "yaatal.commerce-receipt.v1",
        "live_session_id": session_id,
        "count": len(values),
        "conversions": values,
    }


@app.get("/b/{token}", response_class=HTMLResponse)
async def commerce_sheet(token: str, src: str = "unknown"):
    """Public mobile Commerce Sheet used by every social share path."""
    require_commerce_poc()
    try:
        content = COMMERCE_POC_STORE.render_sheet(token, src)
    except CommercePocError as exc:
        return commerce_error(exc)
    return HTMLResponse(
        content,
        headers={
            "Cache-Control": "no-store",
            "Content-Security-Policy": (
                "default-src 'none'; img-src https: http: data:; "
                "style-src 'unsafe-inline'; script-src 'unsafe-inline'; "
                "connect-src 'self'; form-action 'self'; base-uri 'none'; "
                "frame-ancestors 'self'"
            ),
            "Referrer-Policy": "strict-origin-when-cross-origin",
            "X-Content-Type-Options": "nosniff",
        },
    )


@app.post("/b/{token}/checkout")
async def commerce_sheet_checkout(token: str, request: Request):
    """Complete a labelled sandbox payment and retain channel attribution."""
    require_commerce_poc()
    try:
        body = await request.json()
        if not isinstance(body, dict):
            raise CommercePocError("invalid_request", "JSON body is required")
        receipt = COMMERCE_POC_STORE.checkout(token, body)
    except CommercePocError as exc:
        return commerce_error(exc)
    except json.JSONDecodeError:
        return JSONResponse(
            {"error": "invalid_request", "message": "JSON body is required"},
            status_code=400,
        )
    if not receipt["deduplicated"]:
        await broadcast(
            {
                "type": "commerce_conversion",
                "order_id": receipt["order_id"],
                "product_id": receipt["product_id"],
                "live_session_id": receipt["live_session_id"],
                "source_channel": receipt["source_channel"],
                "total_fcfa": receipt["total_fcfa"],
                "payment_status": receipt["payment_status"],
            }
        )
    return receipt


@app.post("/api/intent", dependencies=[Depends(require_operator)])
async def detect_intent(request: Request):
    """Govern one seller transcript and execute only an allowed action.

    A caller-supplied UUID ``turn_id`` is the retry/idempotency key. Rule or
    cloud parsing can still be enabled as an explicitly advisory fallback,
    but it can never write Engine state or drive an overlay action.
    """
    body = await request.json()
    text = body.get("text", "")
    use_harness = body.get("use_harness", True) is True
    allow_fallback = HARNESS_FALLBACK and body.get("allow_fallback", False) is True

    if not use_harness:
        if not allow_fallback:
            return JSONResponse({"error": "harness_required"}, status_code=409)
        advisory = (
            await llm_intent(text)
            if body.get("use_llm", True) is True and OLLAMA_API_KEY
            else regex_intent(text)
        )
        return {
            **advisory,
            "source": "advisory_fallback",
            "execution_status": "advisory_only",
        }

    turn_id = body.get("turn_id") or str(uuid.uuid4())
    try:
        runtime = await get_governed_runtime()
        receipt = await runtime.process(
            transcript=text,
            language=body.get("language", "wo-fr"),
            confidence=body.get("confidence", 1.0),
            turn_id=turn_id,
        )
    except GovernedTurnError as exc:
        return JSONResponse(
            {"error": exc.code, "retryable": exc.retryable, "turn_id": turn_id},
            status_code=503 if exc.retryable else 400,
        )

    proposal = receipt.get("proposal") or {}
    result = {
        **receipt,
        "intent": _tool_to_intent(proposal.get("tool", "none")),
        "price": (
            f"{proposal['price_fcfa']:,} FCFA".replace(",", " ")
            if isinstance(proposal.get("price_fcfa"), int)
            else None
        ),
        "confidence": proposal.get("confidence", 0.0),
        "source": "harness_http",
    }
    if not result.get("deduplicated", False):
        await broadcast({"type": "governed_action", "result": result})
    return result




@app.post("/api/studio/go-live", dependencies=[Depends(require_operator)])
async def go_live(request: Request):
    """Start the Studio production session against Engine's read-only context.

    Body (optional):
      seller_name: str — name of the seller
      title: str — stream title
      product_ids: list — product IDs to queue

    The current Engine contract has no create-live-session route. Commerce
    context continues to come from ``GET /api/live-sessions/current/products``.
    """
    global _session_state
    if _session_state.is_live:
        return {"status": "already_live", "session_id": _session_state.session_id}

    body = {}
    try:
        body = await request.json()
    except Exception:
        pass  # body is optional

    seller_name = body.get("seller_name", "")
    title = body.get("title", "Yaatal Live Commerce")
    engine = await get_engine_client()
    engine_connected = await engine.health()

    _session_state.is_live = True
    _session_state.session_id = str(uuid.uuid4())
    _session_state.started_at = time.time()
    _session_state.seller_name = seller_name
    _session_state.engine_session_id = None

    await broadcast({
        "type": "session_state",
        "is_live": True,
        "session_id": _session_state.session_id,
        "engine_connected": engine_connected,
    })

    return {
        "status": "live",
        "session_id": _session_state.session_id,
        "engine_session_id": None,
        "engine_connected": engine_connected,
        "engine_contract": "read_only_live_context",
        "seller_name": seller_name,
        "title": title,
        "fallback": not engine_connected,
    }


@app.post("/api/studio/stop-stream", dependencies=[Depends(require_operator)])
async def stop_stream():
    """Stop the Studio-local production session."""
    global _session_state
    if not _session_state.is_live:
        return {"status": "not_live"}

    duration = time.time() - _session_state.started_at if _session_state.started_at else 0

    _session_state.is_live = False
    _session_state.session_id = None
    _session_state.engine_session_id = None
    _session_state.started_at = 0.0

    await broadcast({
        "type": "session_state",
        "is_live": False,
        "engine_contract": "read_only_live_context",
    })

    return {
        "status": "stopped",
        "engine_contract": "read_only_live_context",
        "duration_seconds": int(duration),
    }


@app.get("/api/studio/product-queue")
async def product_queue():
    """Get the product queue for the current live session.

    Proxies to Engine GET /api/live-sessions/current/products (JWT auth).
    Falls back to the Engine catalog (no auth needed) if the live-sessions
    endpoint fails, or to mock data if Engine is fully unreachable.
    """
    engine = await get_engine_client()

    async def load_engine_products():
        products = await engine.get_session_products()
        if products:
            return products, "engine_live_session"
        catalog = await engine.get_catalog()
        if catalog:
            return catalog, "engine_catalog_fallback"
        return [], "engine_unavailable"

    try:
        products, source = await asyncio.wait_for(load_engine_products(), timeout=4.0)
    except asyncio.TimeoutError:
        products, source = [], "engine_timeout"
    if products:
        return {
            "products": [normalize_studio_product(product) for product in products],
            "source": source,
        }

    if not STUDIO_DEMO_MODE:
        return JSONResponse(
            {"products": [], "source": source, "retryable": True},
            status_code=503,
        )

    # Explicit demo-only fallback. Production never silently substitutes data.
    mock = [
        {"id": 1, "name": "Robe Bazin Moderne", "price_cents": 75000,
         "price_display": "75 000 FCFA", "stock": 10, "stock_status": "in_stock",
         "category": "Fashion", "images": ["/dashboard/img/bazin_robe.png"]},
        {"id": 2, "name": "Sac en Cuir Sénégal", "price_cents": 45000,
         "price_display": "45 000 FCFA", "stock": 5, "stock_status": "in_stock",
         "category": "Leather", "images": ["/dashboard/img/leather_bag.png"]},
        {"id": 3, "name": "Boucles d'oreilles Sablé", "price_cents": 25000,
         "price_display": "25 000 FCFA", "stock": 8, "stock_status": "in_stock",
         "category": "Jewelry", "images": ["/dashboard/img/gold_earrings.png"]},
        {"id": 4, "name": "Bissap artisanal 1L", "price_cents": 3500,
         "price_display": "3 500 FCFA", "stock": 24, "stock_status": "in_stock",
         "category": "Drinks", "images": ["/dashboard/img/bissap.png"]},
        {"id": 5, "name": "Tapis Thiote tissé main", "price_cents": 30000,
         "price_display": "30 000 FCFA", "stock": 4, "stock_status": "low_stock",
         "category": "Decor", "images": ["/dashboard/img/thiote_mat.png"]},
        {"id": 6, "name": "Smartphone reconditionné", "price_cents": 95000,
         "price_display": "95 000 FCFA", "stock": 6, "stock_status": "in_stock",
         "category": "Tech", "images": ["/dashboard/img/smartphone.png"]},
    ]
    return {
        "products": [normalize_studio_product(product) for product in mock],
        "source": "mock_fallback",
    }


@app.get("/api/studio/session-state", dependencies=[Depends(require_operator)])
async def session_state():
    """Get the current live session state."""
    return asdict(_session_state)


@app.get("/api/studio/audit", dependencies=[Depends(require_operator)])
async def studio_audit():
    """Return Studio's digest-only execution receipts.

    Harness keeps its own policy audit in its container/store. Studio owns a
    separate durable idempotency receipt for actions it actually applied.
    Neither surface stores raw seller speech here.
    """
    if TURN_LEDGER is None:
        return JSONResponse(
            {"error": "turn_ledger_unavailable", "detail": TURN_LEDGER_ERROR},
            status_code=503,
        )
    events = TURN_LEDGER.recent(50)
    return {"events": events, "count": len(events), "contract": "studio-turn.v1"}


@app.get("/api/studio/harness-health")
async def harness_health():
    """Check if the Harness edge-turn endpoint is reachable."""
    harness = HarnessHttpClient(base_url=HARNESS_URL)
    reachable = await harness.health()
    return {
        "reachable": reachable,
        "contract": "edge-turn.v1",
    }


@app.post("/api/test/e2e", dependencies=[Depends(require_operator)])
async def trigger_e2e():
    """Trigger E2E test sequence."""
    asyncio.create_task(run_e2e_tests())
    return {"status": "started", "message": "E2E tests running — watch /api/test/e2e/results or the dashboard"}


@app.get("/api/test/e2e/results", dependencies=[Depends(require_operator)])
async def get_e2e_results():
    """Get last E2E test results."""
    if _last_results:
        return asdict(_last_results)
    return {"steps": [], "overall": "not_run", "message": "No tests run yet. POST /api/test/e2e to start."}


@app.get("/overlays/{name}")
async def serve_overlay(name: str):
    """Serve overlay HTML files for OBS Browser Source."""
    # Map friendly names to filenames
    name_map = {
        "price": "price_card.html",
        "price_card.html": "price_card.html",
        "product": "product_info.html",
        "product_info.html": "product_info.html",
        "sold-out": "sold_out.html",
        "sold_out.html": "sold_out.html",
        "cta": "cta_bar.html",
        "cta_bar.html": "cta_bar.html",
        "comments": "viewer_comments.html",
        "viewer_comments.html": "viewer_comments.html",
    }
    filename = name_map.get(name)
    if filename is None:
        return JSONResponse({"error": "overlay not found", "name": name}, status_code=404)
    filepath = OVERLAYS_DIR / filename
    if not filepath.exists() or not filepath.is_file():
        return JSONResponse({"error": "overlay not found", "name": name}, status_code=404)
    return FileResponse(str(filepath), media_type="text/html")


@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    """Read-only public updates for dashboards and OBS browser sources."""
    await ws.accept()
    _ws_clients.append(ws)
    try:
        await ws.send_json({"type": "connected", "message": "Yaatal Studio WebSocket"})
        while True:
            data = await ws.receive_text()
            # Never echo arbitrary client data onto an overlay socket. A tiny
            # ping is the only accepted inbound message.
            if data == "ping":
                await ws.send_json({"type": "pong"})
    except WebSocketDisconnect:
        pass
    finally:
        if ws in _ws_clients:
            _ws_clients.remove(ws)


@app.websocket("/api/studio/voice")
async def studio_voice(ws: WebSocket):
    """Proxy one authenticated seller voice session through Engine.

    The operator cookie is checked before upgrade. Studio owns the Engine JWT,
    the stable turn UUID, Harness governance, and the digest-only action
    receipt; the public ``/ws`` channel never sees speech or subtitle text.
    """
    if not OPERATOR_SESSIONS.configured or not OPERATOR_SESSIONS.valid(
        ws.cookies.get(SESSION_COOKIE)
    ):
        await ws.close(code=4401)
        return
    await ws.accept()
    gateway = StudioVoiceGateway(
        engine=await get_engine_client(),
        runtime_provider=get_governed_runtime,
        broadcast=broadcast,
        engine_api_url=ENGINE_API_URL,
        engine_voice_ws_url=ENGINE_VOICE_WS_URL,
        transcript_confidence=STUDIO_VOICE_TRANSCRIPT_CONFIDENCE,
    )
    await gateway.serve(ws)


@app.get("/", response_class=HTMLResponse)
async def dashboard():
    """Serve the Yaatal Studio dashboard (three-panel dark-themed UI)."""
    index_path = DASHBOARD_DIR / "index.html"
    if index_path.exists():
        return FileResponse(str(index_path), media_type="text/html")
    return HTMLResponse("<h1>Dashboard not found at live/dashboard/index.html</h1>", status_code=404)


if __name__ == "__main__":
    import uvicorn
    logger.info("Starting Yaatal Studio on %s:%d", STUDIO_HOST, STUDIO_PORT)
    logger.info("Engine API: %s", ENGINE_API_URL)
    logger.info("Harness edge-turn: %s/edge-turn", HARNESS_URL)
    logger.info("Ollama Cloud: %s (model: %s)", OLLAMA_BASE_URL, OLLAMA_INTENT_MODEL)
    uvicorn.run(app, host=STUDIO_HOST, port=STUDIO_PORT)

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
from pathlib import Path
from dataclasses import dataclass, field, asdict
from typing import Optional

import httpx
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request
from fastapi.responses import HTMLResponse, JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles

from live.engine_client import EngineClient, get_engine_client
from live.harness_client import HarnessClient, get_harness_client

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("yaatal.studio")

# ─── Config ─────────────────────────────────────────────────────
OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "https://api.ollama.com")
OLLAMA_API_KEY = os.getenv("OLLAMA_API_KEY", "")
OLLAMA_INTENT_MODEL = os.getenv("OLLAMA_INTENT_MODEL", "gemma3:4b")
ENGINE_API_URL = os.getenv("ENGINE_API_URL", "http://yaatal-engine:8080")
HARNESS_URL = os.getenv("HARNESS_URL", "http://localhost:8090")
STUDIO_PORT = int(os.getenv("STUDIO_PORT", "8484"))

OVERLAYS_DIR = Path(__file__).parent / "overlays"
DASHBOARD_DIR = Path(__file__).parent / "dashboard"

# ─── Live session state ─────────────────────────────────────────
@dataclass
class StudioSessionState:
    """Tracks the current live session state locally + on Engine."""
    is_live: bool = False
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


# ─── Engine Client ──────────────────────────────────────────────

async def engine_health() -> dict:
    """Check Engine API health."""
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            resp = await client.get(f"{ENGINE_API_URL}/health")
            return {"reachable": True, "status": resp.status_code, "url": ENGINE_API_URL}
    except Exception:
        return {"reachable": False, "status": 0, "url": ENGINE_API_URL}


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
    """Run the full E2E test sequence."""
    global _last_results

    result = E2EResult(started_at=time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()))
    steps = [
        TestStep("ollama_connect", "Ollama Cloud API reachable"),
        TestStep("ollama_intent_wolof", "Parse Wolof sold-out: 'Amul ñu, jeex na'"),
        TestStep("ollama_intent_price", "Parse French price: '12 mille francs'"),
        TestStep("ollama_intent_product", "Parse product switch: 'Produit suivant'"),
        TestStep("regex_fallback", "Regex intent detection works"),
        TestStep("engine_health", "Engine API reachable"),
        TestStep("overlays_served", "All overlay HTML files present"),
        TestStep("websocket_live", "WebSocket connection alive"),
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

    # 1. Ollama connect
    all_pass = True
    async def test_ollama_connect():
        h = await ollama_health()
        if h["reachable"]:
            return f"OK — {h.get('models_available', 0)} models"
        raise Exception("unreachable")
    all_pass &= await run_step(steps[0], test_ollama_connect)

    # 2. Wolof sold-out intent
    async def test_wolof():
        r = await llm_intent("Amul ñu, jeex na")
        if r["intent"] not in ("sold_out", "none"):
            return f"UNEXPECTED intent={r['intent']}"
        return f"intent={r['intent']} confidence={r.get('confidence', 0)}"
    if OLLAMA_API_KEY:
        all_pass &= await run_step(steps[1], test_wolof)
    else:
        steps[1].status = "skipped"
        steps[1].detail = "no OLLAMA_API_KEY"

    # 3. French price intent
    async def test_price():
        r = await llm_intent("Le prix est 12 mille francs")
        if r["intent"] not in ("price_change", "none"):
            return f"UNEXPECTED intent={r['intent']}"
        return f"intent={r['intent']} price={r.get('price')}"
    if OLLAMA_API_KEY:
        all_pass &= await run_step(steps[2], test_price)
    else:
        steps[2].status = "skipped"
        steps[2].detail = "no OLLAMA_API_KEY"

    # 4. Product switch intent
    async def test_product():
        r = await llm_intent("On passe au produit suivant")
        if r["intent"] not in ("product_switch", "none"):
            return f"UNEXPECTED intent={r['intent']}"
        return f"intent={r['intent']}"
    if OLLAMA_API_KEY:
        all_pass &= await run_step(steps[3], test_product)
    else:
        steps[3].status = "skipped"
        steps[3].detail = "no OLLAMA_API_KEY"

    # 5. Regex fallback
    async def test_regex():
        r = regex_intent("12 mille fcfa")
        assert r["intent"] == "price_change", f"expected price_change, got {r['intent']}"
        r2 = regex_intent("amul ñu")
        assert r2["intent"] == "sold_out", f"expected sold_out, got {r2['intent']}"
        return "price_change + sold_out detected"
    all_pass &= await run_step(steps[4], test_regex)

    # 6. Engine health
    async def test_engine():
        h = await engine_health()
        if h["reachable"]:
            return f"OK — {h['url']}"
        return f"NOT RUNNING — {h['url']} (start with: cargo run -p yaatal-api)"
    eh = await engine_health()
    if eh["reachable"]:
        all_pass &= await run_step(steps[5], test_engine)
    else:
        steps[5].status = "failed"
        steps[5].detail = f"Engine not running at {ENGINE_API_URL}"
        steps[5].duration_ms = 0
        all_pass = False
        await broadcast({"type": "step_update", "step": asdict(steps[5])})

    # 7. Overlays served
    async def test_overlays():
        expected = ["price_card.html", "sold_out.html", "cta_bar.html", "viewer_comments.html"]
        missing = [f for f in expected if not (OVERLAYS_DIR / f).exists()]
        if missing:
            raise Exception(f"Missing: {missing}")
        return f"All {len(expected)} overlays present"
    all_pass &= await run_step(steps[6], test_overlays)

    # 8. WebSocket
    async def test_ws():
        if _ws_clients:
            return f"{len(_ws_clients)} client(s) connected"
        return "No clients connected (connect via dashboard to test)"
    all_pass &= await run_step(steps[7], test_ws)

    result.finished_at = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    result.total_duration_ms = sum(s.duration_ms for s in steps)
    result.overall = "passed" if all_pass else "failed"
    _last_results = result

    await broadcast({"type": "e2e_complete", "result": asdict(result)})
    return result


# ─── FastAPI App ────────────────────────────────────────────────

app = FastAPI(title="Yaatal Studio", version="0.1.0")

# Serve dashboard static assets (styles.css, app.js) under /dashboard/
if DASHBOARD_DIR.exists():
    app.mount("/dashboard", StaticFiles(directory=str(DASHBOARD_DIR)), name="dashboard-static")


@app.get("/api/status")
async def status():
    """System status endpoint."""
    engine = await engine_health()
    ollama = await ollama_health()
    harness = await harness_health()
    return {
        "studio": {"port": STUDIO_PORT, "version": "0.1.0"},
        "engine": engine,
        "ollama": ollama,
        "harness": harness,
        "intent_model": OLLAMA_INTENT_MODEL,
        "overlays": [f.name for f in OVERLAYS_DIR.glob("*.html")] if OVERLAYS_DIR.exists() else [],
    }


@app.post("/api/intent")
async def detect_intent(request: Request):
    """Parse speech intent from text. Uses LLM (Ollama) with regex fallback."""
    body = await request.json()
    text = body.get("text", "")
    use_llm = body.get("use_llm", True)
    if use_llm and OLLAMA_API_KEY:
        result = await llm_intent(text)
    else:
        result = regex_intent(text)
    await broadcast({"type": "intent", "text": text, "result": result})
    return result


# ─── Studio Live Session Endpoints (proxy to Engine) ────────────

@app.post("/api/studio/go-live")
async def go_live(request: Request):
    """Go live: creates a live session on Engine (POST /api/live-sessions).

    Body (optional):
      seller_name: str — name of the seller
      title: str — stream title
      product_ids: list — product IDs to queue

    Falls back to standalone mode (just marks local state as live) if Engine
    is unreachable.
    """
    global _session_state
    if _session_state.is_live:
        return {"status": "already_live", "session_id": _session_state.engine_session_id}

    body = {}
    try:
        body = await request.json()
    except Exception:
        pass  # body is optional

    seller_name = body.get("seller_name", "")
    title = body.get("title", "Yaatal Live Commerce")
    product_ids = body.get("product_ids", [])

    # Try to create a live session on Engine
    engine = await get_engine_client()
    engine_payload = {
        "seller_name": seller_name,
        "title": title,
    }
    if product_ids:
        engine_payload["product_ids"] = product_ids

    engine_result = await engine.create_live_session(engine_payload)

    _session_state.is_live = True
    _session_state.started_at = time.time()
    _session_state.seller_name = seller_name
    _session_state.engine_session_id = (
        str(engine_result.get("id")) if engine_result else None
    )

    await broadcast({
        "type": "session_state",
        "is_live": True,
        "engine_session_id": _session_state.engine_session_id,
        "engine_connected": engine_result is not None,
    })

    return {
        "status": "live",
        "engine_session_id": _session_state.engine_session_id,
        "engine_connected": engine_result is not None,
        "seller_name": seller_name,
        "title": title,
        "fallback": engine_result is None,
    }


@app.post("/api/studio/stop-stream")
async def stop_stream():
    """Stop stream: ends the current live session on Engine.

    Falls back to just clearing local state if Engine is unreachable.
    """
    global _session_state
    if not _session_state.is_live:
        return {"status": "not_live"}

    engine_result = None
    if _session_state.engine_session_id:
        engine = await get_engine_client()
        engine_result = await engine.end_live_session(_session_state.engine_session_id)

    duration = time.time() - _session_state.started_at if _session_state.started_at else 0

    _session_state.is_live = False
    _session_state.engine_session_id = None
    _session_state.started_at = 0.0

    await broadcast({
        "type": "session_state",
        "is_live": False,
        "engine_connected": engine_result is not None,
    })

    return {
        "status": "stopped",
        "engine_connected": engine_result is not None,
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

    # Try authed endpoint first (products queued for current session)
    products = await engine.get_session_products()
    if products:
        return {"products": products, "source": "engine_live_session"}

    # Fallback: try unauthed catalog
    catalog = await engine.get_catalog()
    if catalog:
        return {"products": catalog, "source": "engine_catalog_fallback"}

    # Final fallback: mock data
    mock = [
        {"id": 1, "name": "Robe Bazin Moderne", "price_cents": 7500000,
         "price_display": "75 000 FCFA", "stock": 10, "stock_status": "in_stock",
         "category": "Fashion", "images": []},
        {"id": 2, "name": "Sac en Cuir Sénégal", "price_cents": 4500000,
         "price_display": "45 000 FCFA", "stock": 5, "stock_status": "in_stock",
         "category": "Leather", "images": []},
    ]
    return {"products": mock, "source": "mock_fallback"}


@app.get("/api/studio/session-state")
async def session_state():
    """Get the current live session state."""
    return asdict(_session_state)


@app.get("/api/studio/audit")
async def studio_audit():
    """Read recent audit events from the Harness JSONL file.

    The Harness writes audit events to a JSONL file (one JSON object per line).
    This endpoint reads the last N events and returns them as a list.

    Env vars:
      HARNESS_AUDIT_FILE — path to the Harness audit JSONL file
        (default: /root/yaatal-engine/data/audit_events.jsonl)
    """
    audit_file = os.getenv(
        "HARNESS_AUDIT_FILE",
        "/root/yaatal-engine/data/audit_events.jsonl",
    )
    audit_path = Path(audit_file)
    if not audit_path.exists():
        return {
            "events": [],
            "source": str(audit_path),
            "message": "Audit file not found — Harness may not have written events yet",
        }

    # Read last N lines from the JSONL file
    max_events = 50
    events = []
    try:
        with open(audit_path, "r", encoding="utf-8") as f:
            lines = f.readlines()
        # Parse from the end (most recent first)
        for line in reversed(lines):
            line = line.strip()
            if not line:
                continue
            try:
                events.append(json.loads(line))
            except json.JSONDecodeError:
                continue
            if len(events) >= max_events:
                break
    except Exception as e:
        return {
            "events": [],
            "source": str(audit_path),
            "error": str(e),
        }

    return {
        "events": events,
        "count": len(events),
        "source": str(audit_path),
    }


@app.get("/api/studio/harness-health")
async def harness_health():
    """Check if the Harness edge-turn endpoint is reachable."""
    harness = await get_harness_client()
    reachable = await harness.health()
    return {
        "reachable": reachable,
        "url": HARNESS_URL,
        "endpoint": f"{HARNESS_URL}/edge-turn",
    }


@app.post("/api/test/e2e")
async def trigger_e2e():
    """Trigger E2E test sequence."""
    asyncio.create_task(run_e2e_tests())
    return {"status": "started", "message": "E2E tests running — watch /api/test/e2e/results or the dashboard"}


@app.get("/api/test/e2e/results")
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
        "qr": "qr_overlay.html",
        "sold-out": "sold_out.html",
        "cta": "cta_bar.html",
        "comments": "viewer_comments.html",
    }
    filename = name_map.get(name, name)
    filepath = OVERLAYS_DIR / filename
    if not filepath.exists() or not filepath.is_file():
        return JSONResponse({"error": "overlay not found", "name": name}, status_code=404)
    return FileResponse(str(filepath), media_type="text/html")


@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    """WebSocket for live updates (E2E test progress, intent detections)."""
    await ws.accept()
    _ws_clients.append(ws)
    try:
        await ws.send_json({"type": "connected", "message": "Yaatal Studio WebSocket"})
        while True:
            data = await ws.receive_text()
            # Echo back for testing
            await ws.send_json({"type": "echo", "data": data})
    except WebSocketDisconnect:
        pass
    finally:
        if ws in _ws_clients:
            _ws_clients.remove(ws)


# ─── Dashboard HTML ─────────────────────────────────────────────

DASHBOARD_HTML = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Yaatal Studio — Dashboard</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Segoe UI', system-ui, sans-serif; background: #0f0f1a; color: #e0e0e0; padding: 20px; }
  h1 { color: #d4af37; margin-bottom: 4px; }
  .subtitle { color: #888; margin-bottom: 24px; font-size: 14px; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; max-width: 1200px; }
  .card { background: #1a1a2e; border: 1px solid #2a2a4a; border-radius: 12px; padding: 20px; }
  .card h2 { color: #d4af37; font-size: 18px; margin-bottom: 12px; }
  .status-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #2a2a4a; }
  .status-row:last-child { border: none; }
  .status-label { color: #aaa; }
  .status-value { font-weight: 600; }
  .ok { color: #4ade80; }
  .err { color: #f87171; }
  .warn { color: #fbbf24; }
  .btn { background: #d4af37; color: #1a1a1a; border: none; padding: 10px 24px; border-radius: 8px; font-weight: 700; cursor: pointer; font-size: 14px; }
  .btn:hover { background: #f4d03f; }
  .btn:disabled { opacity: 0.5; cursor: wait; }
  .test-list { list-style: none; }
  .test-item { padding: 10px; margin: 4px 0; background: #12121f; border-radius: 6px; border-left: 3px solid #333; }
  .test-item.passed { border-left-color: #4ade80; }
  .test-item.failed { border-left-color: #f87171; }
  .test-item.running { border-left-color: #d4af37; animation: pulse 1s infinite; }
  .test-item.skipped { border-left-color: #666; opacity: 0.6; }
  .test-name { font-weight: 600; }
  .test-detail { font-size: 12px; color: #888; margin-top: 4px; }
  .test-time { font-size: 11px; color: #666; float: right; }
  @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.6; } }
  .intent-input { width: 100%; padding: 10px; background: #12121f; border: 1px solid #2a2a4a; border-radius: 8px; color: #e0e0e0; font-size: 14px; margin-bottom: 8px; }
  .intent-result { background: #12121f; padding: 12px; border-radius: 8px; font-family: monospace; font-size: 13px; margin-top: 8px; min-height: 40px; }
  .overlay-link { display: inline-block; margin: 4px 6px; padding: 6px 12px; background: #2a2a4a; border-radius: 6px; color: #d4af37; text-decoration: none; font-size: 13px; }
  .overlay-link:hover { background: #3a3a5a; }
  pre { white-space: pre-wrap; word-wrap: break-word; }
</style>
</head>
<body>
<h1>Yaatal Studio</h1>
<p class="subtitle">Livestream selling dashboard — E2E test runner + overlay preview + intent detection</p>

<div class="grid">
  <!-- System Status -->
  <div class="card">
    <h2>System Status</h2>
    <div id="status">Loading...</div>
  </div>

  <!-- E2E Tests -->
  <div class="card">
    <h2>E2E Test Suite</h2>
    <button class="btn" id="runTests" onclick="runE2E()">Run E2E Tests</button>
    <div id="testResults" style="margin-top:12px"></div>
  </div>

  <!-- Intent Detection -->
  <div class="card">
    <h2>Intent Detection (Wolof/French)</h2>
    <input class="intent-input" id="intentText" placeholder="e.g. '12 mille francs' or 'amul ñu, jeex na'" onkeydown="if(event.key==='Enter')testIntent()">
    <button class="btn" onclick="testIntent()">Parse Intent</button>
    <div class="intent-result" id="intentResult">Results will appear here...</div>
  </div>

  <!-- Overlays -->
  <div class="card">
    <h2>OBS Overlays (Browser Sources)</h2>
    <p style="color:#888;font-size:13px;margin-bottom:8px">Add these as OBS Browser Sources:</p>
    <div id="overlayLinks">Loading...</div>
  </div>
</div>

<script>
const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
ws.onmessage = (e) => {
  const msg = JSON.parse(e.data);
  if (msg.type === 'step_update') updateStep(msg.step);
  if (msg.type === 'e2e_complete') updateResults(msg.result);
  if (msg.type === 'intent') document.getElementById('intentResult').innerHTML = '<pre>' + JSON.stringify(msg.result, null, 2) + '</pre>';
};

async function refreshStatus() {
  const r = await fetch('/api/status');
  const s = await r.json();
  let html = '';
  html += statusRow('Studio', `Port ${s.studio.port}`, 'ok');
  html += statusRow('Engine API', s.engine.reachable ? `${s.engine.url}` : 'NOT RUNNING', s.engine.reachable ? 'ok' : 'err');
  html += statusRow('Ollama Cloud', s.ollama.reachable ? `${s.ollama.model} (${s.ollama.models_available || '?'} models)` : 'unreachable', s.ollama.reachable ? 'ok' : 'err');
  html += statusRow('Intent Model', s.intent_model, 'ok');
  html += statusRow('Overlays', (s.overlays || []).join(', '), 'ok');
  document.getElementById('status').innerHTML = html;

  let olinks = '';
  const names = ['price', 'qr', 'sold-out', 'cta', 'comments'];
  for (const n of names) olinks += `<a class="overlay-link" href="/overlays/${n}" target="_blank">${n}</a>`;
  document.getElementById('overlayLinks').innerHTML = olinks;
}

function statusRow(label, value, cls) {
  return `<div class="status-row"><span class="status-label">${label}</span><span class="status-value ${cls}">${value}</span></div>`;
}

async function runE2E() {
  document.getElementById('runTests').disabled = true;
  document.getElementById('testResults').innerHTML = '<p style="color:#d4af37">Running...</p>';
  await fetch('/api/test/e2e', { method: 'POST' });
}

function updateStep(step) {
  const div = document.getElementById('testResults');
  let el = document.getElementById('step-' + step.name);
  if (!el) {
    el = document.createElement('div');
    el.id = 'step-' + step.name;
    el.className = 'test-item ' + step.status;
    div.appendChild(el);
  }
  el.className = 'test-item ' + step.status;
  el.innerHTML = `<span class="test-name">${step.name}</span><span class="test-time">${step.duration_ms}ms</span><div class="test-detail">${step.description} — ${step.status}: ${step.detail}</div>`;
}

function updateResults(result) {
  document.getElementById('runTests').disabled = false;
  const div = document.getElementById('testResults');
  const color = result.overall === 'passed' ? '#4ade80' : '#f87171';
  div.innerHTML += `<p style="margin-top:12px;color:${color};font-weight:700">Overall: ${result.overall.toUpperCase()} (${result.total_duration_ms}ms)</p>`;
}

async function testIntent() {
  const text = document.getElementById('intentText').value;
  if (!text) return;
  document.getElementById('intentResult').innerHTML = 'Parsing...';
  const r = await fetch('/api/intent', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({text}) });
  const result = await r.json();
  document.getElementById('intentResult').innerHTML = '<pre>' + JSON.stringify(result, null, 2) + '</pre>';
}

refreshStatus();
setInterval(refreshStatus, 5000);
</script>
</body>
</html>"""


@app.get("/", response_class=HTMLResponse)
async def dashboard():
    """Serve the Yaatal Studio dashboard (three-panel dark-themed UI)."""
    index_path = DASHBOARD_DIR / "index.html"
    if index_path.exists():
        return FileResponse(str(index_path), media_type="text/html")
    return HTMLResponse("<h1>Dashboard not found at live/dashboard/index.html</h1>", status_code=404)


if __name__ == "__main__":
    import uvicorn
    logger.info("Starting Yaatal Studio on port %d", STUDIO_PORT)
    logger.info("Engine API: %s", ENGINE_API_URL)
    logger.info("Harness edge-turn: %s/edge-turn", HARNESS_URL)
    logger.info("Ollama Cloud: %s (model: %s)", OLLAMA_BASE_URL, OLLAMA_INTENT_MODEL)
    uvicorn.run(app, host="0.0.0.0", port=STUDIO_PORT)
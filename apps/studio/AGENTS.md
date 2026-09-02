# AGENTS.md

This file provides guidance to coding agents (Claude Code, Codex CLI, OpenCode)
working in this repository. It is the agent-facing entry point.

## What this is

**Yaatal Studio** is the content production and livestream-selling stack for African social
commerce. It combines voice I/O (Voicebox fork), video production (MoneyPrinterTurbo fork),
and a live OBS integration layer (`live/`) for real-time seller tools: agent-assisted selling,
NFC controls, QR overlays, and HTML browser sources.

**Prime directive — `live/` is the active layer.** All runnable production code lives under
`live/`. The `voice/` and `video/` directories contain **vendored upstream forks** (MIT) — treat
them as read-only dependencies. Do not modify vendored code unless explicitly asked; upstream
sync is a separate workflow. The `yaatal/` directory holds proprietary models and prompts — also
not the active code surface unless a task targets it specifically.

## Tech stack

- **Language:** Python 3.11
- **Framework:** FastAPI + uvicorn
- **Key deps:** `fastapi`, `uvicorn`, `httpx`, `websockets`, `mcp` (FastMCP), `obsws-python`
- **OBS integration:** obsws-python WebSocket client → OBS Studio
- **Overlays:** Static HTML files (OBS Browser Source), no build step

## Destructive command policy (VPS hardening)

**Never run these commands** — they are blocked by the Claude Code PreToolUse hook and the `yaatal-guard` shell wrapper:

- `rm -rf target` / `rm -rf /` — wipes build artifacts or worse
- `git push --force` / `git push -f` — rewrites shared history
- `git reset --hard` — discards uncommitted work
- `cargo clean` — forces full rebuild (30+ min on this VPS)
- `DROP TABLE` / `TRUNCATE` — data loss
- `docker stop` / `docker rm -f` on `coolify*` or `*postgres*` containers — takes down infra
- `pg_dropdatabase` / `dropdb` — data loss

If a task genuinely requires one of these, ask the founder first. The guard script lives at `/usr/local/bin/yaatal-guard`.

## Architecture (the big picture — spans many files)

### `live/` — the OBS livestream selling layer (active code)

- **`obs-controller/`** — Python wrapper around `obsws-python` (MIT). Manages OBS scenes, product
  overlays, sold-out stamps, replay buffer clipping, live captions. Not wired to Engine yet —
  products come as dicts.
- **`mcp-server/`** — FastMCP server exposing OBS control as MCP tools (`yaatal_live.start_session`,
  `go_live`, `switch_product`, `update_price`, `mark_sold_out`, `clip_moment`, `send_caption`, etc.).
  Allows the gateway to drive livestream sessions via MCP.
- **`agent-loop/`** — The brain of the livestream. Listens to seller speech (Voicebox STT), monitors
  viewer comments, watches engagement metrics, and orchestrates OBS via MCP tools. Detects Wolof +
  French speech intents (price, sold-out, product switch). **Has a mock mode** (`STTListener.mock`)
  for testing without a microphone or STT engine — use `inject_text()` to feed transcripts.
- **`nfc-controller/`** — Physical NFC card reader → OBS actions (seller's physical controller).
- **`nfc-delivery/`** — **Delivery confirmation only.** Customer taps NFC tag in the delivered package → `https://yaatal.shop/d/{delivery_code}` → confirms delivery to Yaatal Engine → closes order. NOT a product page, NOT tap-to-buy. Viewers buy via QR codes on the stream overlay → `live_links` → Engine marketplace (BOBO checkout).
- **`qr-overlay/`** — Generates QR codes for OBS stream overlays. Deep links to Engine marketplace
  (`/m/{merchant}`, `/i/{product}`, `/c/{product}`, `/l/{session}/{product}`). QR is display-only;
  Engine handles all commerce.
- **`overlays/`** — HTML Browser Source templates for OBS: `price_card.html`, `product_info.html`,
  `cta_bar.html`, `sold_out.html`, `viewer_comments.html`. These are loaded as OBS Browser Sources —
  no server-side rendering, just static HTML with CSS animations.
- **`scenes/`** — OBS scene collection JSON (importable into OBS Studio).
- **`multistream/`** — RTMP routing config templates for Facebook, YouTube, TikTok multistreaming.

### `voice/` — vendored Voicebox (MIT, read-only)

TTS/STT desktop app (Tauri/Rust/React). Engines: Kokoro, Piper, XTTS, Bark. STT: Whisper.
Exposes `voicebox.speak` and `voicebox.transcribe` MCP tools.

### `video/` — vendored MoneyPrinterTurbo (MIT, read-only)

Script-to-video pipeline: script → footage → TTS → subtitles → compose. Gradio webui.

### `yaatal/` — proprietary IP (Wolof models, prompts, detection, SDK)

Not the active code surface for Studio tasks unless explicitly targeted.

## Running the live layer

```bash
cd /root/Yaatal-Studio

# Install deps for a specific module
pip install -r live/nfc-delivery/requirements.txt

# Run the NFC delivery bridge
uvicorn live.nfc-delivery.server:create_delivery_server --factory --host 0.0.0.0 --port 8484

# Run the MCP server (OBS control)
python -m live.mcp-server.server

# Run the agent loop in mock mode (no mic/STT needed)
python -c "
from live.agent_loop import AgentLoop
from live.agent_loop.stt_listener import STTListener
listener = STTListener(mock=True)
listener.inject_text('Le prix est quinze mille francs')  # simulates seller speech
"
```

**Studio runs on port 8484** behind Traefik at **`studio.njooba.com`**.

## Configuration model

- No config framework — each module reads env vars or local files directly.
- `nfc-delivery` expects Engine API URL via env (`ENGINE_API_URL` or similar).
- OBS WebSocket connection: host/port/password from env or defaults (`localhost:4455`).

## Testing notes

- **agent-loop mock mode:** `STTListener(mock=True)` + `inject_text()` lets you test intent
  detection without a microphone or STT engine. Use this for unit tests and agent demos.
- No test suite exists yet — if adding tests, use `pytest` and keep them in a `tests/` dir.
- Python 3.11 is available with `fastapi`, `uvicorn`, `httpx`, `websockets` already installed.

## Architecture — who does what

- **Engine** = Point of Truth. Commerce state (products, orders, deliveries, payments). The source of truth.
- **BOBO** = Marketplace. Public checkout, KYC, escrow. Customer-facing commerce layer.
- **LiveKit** = African reality. Low-bandwidth video calls / live sessions for phone-based commerce.
- **USSD/SMS** = African reality. Offline commerce for customers without smartphones.
- **Harness** = Socials + runtime. Agent governance — audits every model action, controls social channels (Telegram, WhatsApp). The trust boundary.
- **Studio** = Merchant cockpit. OBS, live overlays, product queue, agent loop. Seller's interface to Engine + Harness.
- **NFC** = Delivery confirmation ONLY. Customer taps NFC tag in package → confirms delivery → Engine closes order. NOT tap-to-buy.
- **QR overlay** = Viewer buy path. Viewers scan QR on stream → `live_links` → Engine marketplace (BOBO checkout).

When adding Engine wiring, keep the standalone interface as a fallback/test path.

## Source-of-truth docs

`README.md` is current and contains the full directory structure, license architecture, and
Wolof model inventory. Trust it over any other doc in this repo.

## VPS dev workflow

See Engine's `docs/VPS-DEV-WORKFLOW-RESEARCH.md` for the multi-agent setup (Hermes + Claude Code + Codex).
The Studio shares the same VPS and guard infrastructure as Engine and SDK.
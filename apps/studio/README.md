# Yaatal-Studio

🇬🇧 English · [🇫🇷 Français](README.fr.md)

Social commerce tooling tailored to the African market — voice + video content
production and OBS livestream selling for Wolof/French commerce.

## What is this?

Yaatal-Studio is the content-production and livestream layer of the Yaatal
stack. **The runnable surface today is the `live/` cockpit**: Engine-backed
product context, authenticated seller push-to-talk, governed Harness actions,
and receipt-driven OBS Browser Source overlays. Voice inference stays behind
Yaatal Engine's WebSocket contract; Studio does not vendor or select the
serving model. Video-generation layers remain planned.

Deployment and acceptance truth: [`docs/STUDIO-OS-CLOSURE-RUNBOOK.md`](docs/STUDIO-OS-CLOSURE-RUNBOOK.md).

## Status: built vs planned

| Layer | Status |
|---|---|
| `live/studio_server.py`, `live/dashboard` | ✅ Built on `yaatal/studio-os-closure` — short-lived operator session, same-origin Engine voice proxy, 16 kHz push-to-talk, stable-UUID retry, Harness-gated Engine updates, digest-only receipts, and non-mutating OS readiness gates |
| `live/obs_controller` | ✅ Built — OBS control via obsws-python (verified against obsws-python 1.8.0) |
| `live/mcp_server` | ✅ Built — 15 OBS tools over MCP (FastMCP, stdio) |
| `live/agent_loop` | ✅ Built (prototype) — rule-based Wolof/French fallback plus an optional governed `edge-turn.v1` bridge to the Engine-aware Harness; STT input is mock-only (`inject_text`); comment input has a real, platform-generic Engine source (`WhatsAppSource`, polls `/api/social/events` — `platform="whatsapp"` default, `platform="telegram"` works the moment the Engine ingests Telegram) alongside the mock `add_comment()` path |
| `live/nfc_controller` | ✅ Built (prototype) — card registry + tap handler; hardware read loop is mock-only |
| `live/nfc_delivery` | ✅ Built — confirm-by-code wired to the live Engine endpoint; status-by-code still stub |
| `live/qr_overlay` | ✅ Built — QR generation + OBS overlay; the deep-link routes it encodes are not served by the Engine yet |
| `live/overlays`, `live/scenes`, `live/multistream` | ✅ Built — HTML overlays, scene blueprint (not an importable OBS collection), RTMP configs |
| `live/data_faucet` | ✅ Built — consent-gated, local-only comment recorder for Kallaama. The governed cockpit deliberately does **not** persist its voice audio or subtitle; dataset capture remains a separate consented path |
| Engine voice service | ✅ Studio wiring built; live proof requires the stacked Engine `speech-core-livekit-seam-v3` + `qwen25-omni-voice-backend` branches and a configured private Qwen/vLLM-Omni service |
| `voice/` (legacy Voicebox content fork) | 🔲 Planned — not required by the Engine-owned live voice seam |
| `video/` (MoneyPrinterTurbo + MotionForge forks) | 🔲 Planned — not yet vendored |
| `yaatal/` (Wolof models, prompts, detection, commerce, sdk) | 🔲 Specs only — READMEs describe the plan; no models or code yet |
| `integrations/` (meta-ads / dsers / shopify MCPs) | 🔲 Specs only |

## License architecture

Everything **currently in this repo** is original Yaatal Labs work.
The `live/` layer modules marked MIT below are intended for release under
MIT; `agent_loop`, `nfc_controller`, `nfc_delivery`, `qr_overlay`,
`data_faucet`, and everything under `yaatal/` are proprietary. (License
files are not yet committed — they land with the first tagged release.)

| Layer | License | Source |
|---|---|---|
| `live/obs_controller/` | MIT (intended) | Original — wraps [obsws-python](https://github.com/aatikturk/obsws-python) (MIT) |
| `live/mcp_server/` | MIT (intended) | Original — FastMCP server for OBS control |
| `live/agent_loop/` | Proprietary | Original — STT intent detection, comment monitoring, engagement watching |
| `live/nfc_controller/` | Proprietary | Original — NFC card reader → OBS actions (seller's physical controller) |
| `live/nfc_delivery/` | Proprietary | Original — NFC delivery confirmation bridge to Yaatal Engine |
| `live/qr_overlay/` | Proprietary | Original — QR codes on OBS stream → deep links to Engine marketplace |
| `live/overlays/` | MIT (intended) | Original — HTML Browser Source templates |
| `live/scenes/` | MIT (intended) | Original — OBS scene blueprint JSON |
| `live/multistream/` | MIT (intended) | Original — RTMP routing config templates |
| `live/data_faucet/` | Proprietary | Original — consent-gated session recorder feeding the private Kallaama dataset |

Planned vendored upstreams (MIT — each will carry its upstream LICENSE
when imported):

| Planned layer | Upstream |
|---|---|
| `voice/voicebox/` | [jamiepine/voicebox](https://github.com/jamiepine/voicebox) (MIT) |
| `video/MoneyPrinterTurbo/` | [harry0703/MoneyPrinterTurbo](https://github.com/harry0703/MoneyPrinterTurbo) (MIT) |
| `video/composition/motionforge/` | [codedbytahir/motionforge](https://github.com/codedbytahir/motionforge) (MIT) |

OBS Studio (GPLv2) is used as-is via its WebSocket API — a clean license
boundary that does not trigger GPL obligations on Yaatal's code. No AGPL
dependencies. (Remotion was rejected for its source-available paid license;
OpenMontage for AGPL.)

## Directory structure (current)

```
Yaatal-Studio/
├── live/                             # OBS livestream selling layer (BUILT)
│   ├── obs_controller/               # Python wrapper around obsws-python
│   ├── mcp_server/                   # FastMCP server — OBS control as MCP tools
│   ├── agent_loop/                   # STT intent detection + comment monitor + engagement
│   ├── nfc_controller/               # Physical NFC cards → seller controls the stream
│   ├── nfc_delivery/                 # NFC delivery confirmation → Engine closes order
│   ├── qr_overlay/                   # QR codes on stream → deep links → Engine marketplace
│   ├── overlays/                     # HTML Browser Source templates (price, CTA, etc.)
│   ├── scenes/                       # OBS scene blueprint JSON (manual setup — see its README)
│   ├── multistream/                  # RTMP routing configs (Facebook, YouTube, TikTok)
│   └── data_faucet/                  # Consent-gated session recorder → local JSONL for Kallaama
│
├── yaatal/                           # Proprietary layer — SPECS ONLY today
│   ├── wolof-models/                 # (planned) Wolof TTS/STT models + training scripts
│   ├── prompts/                      # (planned) Wolof/French prompt templates
│   ├── detection/                    # (planned) African market signal detection
│   ├── commerce/                     # (spec) points to Yaatal-Engine (separate repo)
│   └── sdk/                          # (spec) points to Yaatal-SDK (separate repo)
│
└── integrations/                     # SPECS ONLY — meta-ads / dsers / shopify MCPs
```

Planned (not yet in the repo): `voice/voicebox/`, `video/MoneyPrinterTurbo/`,
`video/composition/motionforge/`.

## Wolof model inventory

Moved to [`docs/WOLOF-MODEL-INVENTORY.md`](docs/WOLOF-MODEL-INVENTORY.md) —
the license-vetted third-party HF fallback models (TTS + STT/ASR). The plan
of record is the in-house models below.


## AI models: target vs current

Studio's intent detection and voice wiring **target Yaatal's in-house
models**, trained in the Engine repo's `ml/edge-voice-lane` branch (R&D
lane, not merged to `main`) — the third-party HF Wolof models in [`docs/WOLOF-MODEL-INVENTORY.md`](docs/WOLOF-MODEL-INVENTORY.md) are the
**fallback**, not the plan.

| Role | Target model | Status in Studio today |
|---|---|---|
| Live ears + mouth | Yelly-O / Qwen2.5-Omni | ✅ Studio speaks the authoritative Engine voice WebSocket; runtime qualification/deployment of the private vLLM-Omni backend is still required |
| Governed action proposal | MiniMind through Harness `edge-turn.v1` | ✅ Contract and execution path built; Harness supports `mock`/`minimind`, fails closed, and must be deployed with real Engine context |
| Cloud planner | Qwen3.8-27B | 🔲 Serving lane exists outside Studio; it is not yet an `edge-turn.v1` Harness backend and Studio does not pretend otherwise |

The legacy `live/agent_loop` still has mock STT and rule fallback. The primary
cockpit path no longer depends on it: Engine/Qwen produces the subtitle,
Harness/MiniMind proposes, policy decides, and Studio executes only an Allow.
MiniMind-O remains a useful distillation target, not a reason to bypass those
runtime boundaries.

## Getting started (live/ layer)

```bash
git clone https://github.com/Yaatal-labs/Yaatal-Studio.git
cd Yaatal-Studio

# Governed Studio cockpit (configure .env.example first)
python -m pip install -r requirements.txt
python -m uvicorn live.studio_server:app --host 0.0.0.0 --port 8484

# OBS control + MCP server
pip install -r live/obs_controller/requirements.txt   # obsws-python, mcp

# Run the MCP server (OBS must be running with WebSocket enabled, port 4455)
python -m live.mcp_server.server

# Serve the overlays for OBS browser sources (separate terminal)
cd live/overlays && python -m http.server 8000

# Optional: standalone NFC delivery confirmation server
pip install -r live/nfc_delivery/requirements.txt
uvicorn --factory live.nfc_delivery.server:app_factory --port 8080
```

The agent loop's STT input and the NFC reader run in mock mode out of the box
(`STTListener.inject_text(...)`, `NFCReader.inject_tap(...)`) — real
microphone STT and the ACR122U reader are integration work, tracked in the
roadmap. Comment input has one real platform source: `WhatsAppSource`
(`live/agent_loop/whatsapp_source.py`) polls the Engine's `GET
/api/social/events` and feeds `CommentMonitor.add_comment(...)` — the same
seam the mock/manual `add_comment()` calls use. It requires the Engine
deployed with that endpoint live and `YAATAL_ENGINE_URL` / `YAATAL_TOKEN`
set (it's a no-op without an Engine URL); carrying real WhatsApp traffic
also requires WhatsApp webhook credentials configured Engine-side. Facebook
Live / TikTok Live / YouTube Live chat comment sources are still planned.

Every session's comment traffic is also the exact Wolof/French commerce
language the private ML lane (Kallaama dataset, `ml/edge-voice-lane` in
Yaatal-Engine) trains on — `live/data_faucet` (`SessionRecorder`) captures
it instead of letting the agent loop discard it after use. It's opt-in and
local-only: disabled unless the seller has set `YAATAL_DATA_CONSENT=1` on
that rig **and** `YAATAL_DATA_DIR` (default `./data/kallaama`) is writable;
when either is missing every method is a no-op. Comments are pseudonymized
(8-hex sha256 of the handle/phone, raw value never written) and appended to
one JSONL file per session — nothing is read back and nothing leaves the
box; the private ML lane collects the files out-of-band. `record_utterance()`
is the matching seam for voice transcripts, wired for later — the agent
loop's STT is still mock-only, so nothing calls it yet.

## Roadmap

1. **Vendor the forks** — import Voicebox, MoneyPrinterTurbo, MotionForge with their MIT licenses
2. **Wire Wolof TTS** — integrate `bilalfaye/speecht5_tts-wolof` (MIT) into Voicebox as a custom engine
3. **Wire Wolof STT** — load `cifope/whisper-small-wolof` (Apache 2.0) into Faster-Whisper
4. **French TTS** — configure Kokoro (Apache 2.0, already in Voicebox) for French narration
5. **Video pipeline** — adapt MoneyPrinterTurbo for Wolof/French scripts
6. **Composition** — replace Remotion (source-available, paid >3 employees) with MotionForge (MIT)
7. **Live selling** — wire OBS MCP server to gateway, test with real sellers in Dakar
8. **Live captions** — STT → `send_caption` → OBS stream (French first, Wolof as STT improves)
9. **Agent loop hardening** — real microphone STT, remaining platform comment APIs (Facebook Live, TikTok Live, YouTube Live chat — WhatsApp is done via `WhatsAppSource`), native-speaker review of the Wolof trigger lexicon; once real STT lands, wire its transcripts into `SessionRecorder.record_utterance()` (`live/data_faucet` — the seam already exists, unused until then)
10. **NFC controller hardware** — nfcpy/ACR122U read loop (currently mock)
11. **Detection layer** — African market signal detection (TikTok Senegal, Instagram diaspora, Google Trends)
12. **Engine integration** — see "Engine gaps" below; product catalog → scenes, sold-out → inventory, clips → video pipeline, NFC registry → Engine catalog

## Hybrid flow (résumé)

**Merchant proposes / model executes / Engine disposes.** Studio produces the
livestream and the physical-world triggers — QR deep links carrying a
`live_session_id` so sales are attributed to the stream that drove them, and
NFC package stickers carrying one-time delivery codes so a customer tap
confirms delivery, releases escrow, and closes the order Engine-side. Full
flow diagram, deep-link table, NFC mechanics, and the Engine-gaps ledger:
[`docs/COMMERCE-FLOW.md`](docs/COMMERCE-FLOW.md).


## License

- The planned vendored upstreams will retain their MIT licenses when imported
- All original work in this repo is © Yaatal Labs, all rights reserved
  (per-module licensing per the table above lands with the first release)

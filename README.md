# Yaatal-Studio

Social commerce tooling tailored to the African market — voice + video content
production and OBS livestream selling for Wolof/French commerce.

## What is this?

Yaatal-Studio is the content-production and livestream layer of the Yaatal
stack. **What exists in this repo today is the `live/` layer** (OBS livestream
selling) plus design specs for the rest. The voice and video layers are
planned vendored forks that have **not been imported yet**.

## Status: built vs planned

| Layer | Status |
|---|---|
| `live/obs_controller` | ✅ Built — OBS control via obsws-python (verified against obsws-python 1.8.0) |
| `live/mcp_server` | ✅ Built — 15 OBS tools over MCP (FastMCP, stdio) |
| `live/agent_loop` | ✅ Built (prototype) — rule-based Wolof/French intent detection; STT input is mock-only (`inject_text`) |
| `live/nfc_controller` | ✅ Built (prototype) — card registry + tap handler; hardware read loop is mock-only |
| `live/nfc_delivery` | ⚠️ Scaffold — URL generation + standalone page work; Engine client is stubs (see Engine gap below) |
| `live/qr_overlay` | ✅ Built — QR generation + OBS overlay; the deep-link routes it encodes are not served by the Engine yet |
| `live/overlays`, `live/scenes`, `live/multistream` | ✅ Built — HTML overlays, scene blueprint (not an importable OBS collection), RTMP configs |
| `voice/` (Voicebox fork) | 🔲 Planned — not yet vendored |
| `video/` (MoneyPrinterTurbo + MotionForge forks) | 🔲 Planned — not yet vendored |
| `yaatal/` (Wolof models, prompts, detection, commerce, sdk) | 🔲 Specs only — READMEs describe the plan; no models or code yet |
| `integrations/` (meta-ads / dsers / shopify MCPs) | 🔲 Specs only |

## License architecture

Everything **currently in this repo** is original Yaatal Labs work.
The `live/` layer modules marked MIT below are intended for release under
MIT; `agent_loop`, `nfc_controller`, `nfc_delivery`, `qr_overlay`, and
everything under `yaatal/` are proprietary. (License files are not yet
committed — they land with the first tagged release.)

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
│   ├── nfc_viewer/                   # DEPRECATED — replaced by nfc_delivery
│   ├── qr_overlay/                   # QR codes on stream → deep links → Engine marketplace
│   ├── overlays/                     # HTML Browser Source templates (price, CTA, etc.)
│   ├── scenes/                       # OBS scene blueprint JSON (manual setup — see its README)
│   └── multistream/                  # RTMP routing configs (Facebook, YouTube, TikTok)
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

Verified against the HuggingFace API (July 2026):

### TTS (Wolof)
| Model | License | Downloads | Notes |
|---|---|---|---|
| `bilalfaye/speecht5_tts-wolof` | **MIT** ✅ | 5.5K | SpeechT5 fine-tuned for Wolof, custom tokenizer |
| `bilalfaye/speecht5_tts-wolof-v0.2` | MIT ✅ | 1.2K | v0.2, wo+fr |
| `Moustapha91/TTS_WOLOF_FINAL` | **MIT** ✅ | 2 | SpeechT5, loss 0.3705 |
| `galsenai/parler-tts-mini-v1-wolof` | ⚠️ No license | 125 | ParlerTTS, 877M params |
| `aliounetoure1/spark-tts-wolof-men-v1` | ⚠️ No license | 30 | Spark TTS, male voice |
| `aliounetoure1/spark-tts-wolof-women-v1` | ⚠️ No license | 31 | Spark TTS, female voice |

### STT / ASR (Wolof)
| Model | License | Downloads | Notes |
|---|---|---|---|
| `cifope/whisper-small-wolof` | **Apache 2.0** ✅ | 917 | Whisper-small on FLEURS, WER 0.92 (needs improvement) |
| `speechbrain/asr-wav2vec2-dvoice-wolof` | **Apache 2.0** ✅ | 926 | SpeechBrain dVoice (license verified July 2026) |
| `BenDaouda/wav2vec2-large-xls-r-1b-wolof-VoiceToText` | ⚠️ No license | 128 | Wav2Vec2-XLS-R-1B |
| `BenDaouda/wav2vec2-large-xls-wolof-asr` | ⚠️ No license | 106 | Wav2Vec2-large |
| `kingabzpro/wav2vec2-large-xlsr-53-wolof` | ⚠️ No license | 175 | Wav2Vec2-XLSR-53 |
| `abdouaziiz/wav2vec2-xls-r-300m-wolof-lm` | ⚠️ No license | 63 | With LM head |

**Only models with explicit MIT/Apache licenses are safe for commercial use.**
Models with no license field are "all rights reserved" by default. Yaatal's
path: start from `bilalfaye/speecht5_tts-wolof` (MIT) for TTS and
`cifope/whisper-small-wolof` (Apache 2.0) or
`speechbrain/asr-wav2vec2-dvoice-wolof` (Apache 2.0) for STT, then fine-tune
on Yaatal's Wolof data.

## Getting started (live/ layer)

```bash
git clone https://github.com/Yaatal-labs/Yaatal-Studio.git
cd Yaatal-Studio

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

The agent loop and NFC reader run in mock mode out of the box
(`STTListener.inject_text(...)`, `NFCReader.inject_tap(...)`) — real
microphone STT and the ACR122U reader are integration work, tracked in the
roadmap.

## Roadmap

1. **Vendor the forks** — import Voicebox, MoneyPrinterTurbo, MotionForge with their MIT licenses
2. **Wire Wolof TTS** — integrate `bilalfaye/speecht5_tts-wolof` (MIT) into Voicebox as a custom engine
3. **Wire Wolof STT** — load `cifope/whisper-small-wolof` (Apache 2.0) into Faster-Whisper
4. **French TTS** — configure Kokoro (Apache 2.0, already in Voicebox) for French narration
5. **Video pipeline** — adapt MoneyPrinterTurbo for Wolof/French scripts
6. **Composition** — replace Remotion (source-available, paid >3 employees) with MotionForge (MIT)
7. **Live selling** — wire OBS MCP server to gateway, test with real sellers in Dakar
8. **Live captions** — STT → `send_caption` → OBS stream (French first, Wolof as STT improves)
9. **Agent loop hardening** — real microphone STT, platform comment APIs, native-speaker review of the Wolof trigger lexicon
10. **NFC controller hardware** — nfcpy/ACR122U read loop (currently mock)
11. **Detection layer** — African market signal detection (TikTok Senegal, Instagram diaspora, Google Trends)
12. **Engine integration** — see "Engine gaps" below; product catalog → scenes, sold-out → inventory, clips → video pipeline, NFC registry → Engine catalog

## Hybrid flow: merchant proposes / model executes / engine disposes

> **Status: design.** The Studio side of this flow is built (QR generation,
> NFC bridge, overlays). The Engine side is **not implemented yet** — see
> "Engine gaps" below. Until it lands, generated QR/NFC URLs point at routes
> the Engine does not serve.

```
MERCHANT PROPOSES
  → Signals intent: "I want to sell these products on a live stream"
  → Provides product data, images, prices
  → Packs orders with NFC delivery tags for fulfillment

MODEL EXECUTES (Yaatal-Studio)
  → Agent loop orchestrates the livestream (STT, comments, OBS)
  → QR codes on screen → deep links to Engine marketplace
  → NFC controller lets seller control stream via physical cards
  → Replay clips → video pipeline → Reels/TikTok content

ENGINE DISPOSES (Yaatal Engine)
  → Serves marketplace pages (store, item details, checkout)
  → Processes orders, payments, inventory
  → NFC delivery confirmation → closes order, releases payment
  → Attributes sales to livestream sessions
```

### Sales channel: QR codes → deep links → Engine marketplace

During the livestream, QR codes are displayed on the OBS stream.
Viewers scan with their phone camera → deep link opens → lands on
the Yaatal Engine marketplace.

| Deep link | Destination | When |
|---|---|---|
| `yaatal.shop/m/{merchant}` | Merchant store | Start/end of stream |
| `yaatal.shop/i/{product}` | Item details | During product showcase |
| `yaatal.shop/c/{product}` | Direct checkout | Impulse buy moment |
| `yaatal.shop/l/{session}/{product}` | Live session item (attributed) | During stream — tracks sale to the live |

The `/l/{session_id}/` prefix lets the Engine attribute purchases to
specific livestream sessions — measuring which streams drive the most sales.

### Delivery: NFC confirmation → Engine closes order

Each shipped package includes an NFC sticker with a unique delivery code.
When the customer receives it, they tap the sticker with their phone →
opens `yaatal.shop/d/{delivery_code}` → confirms delivery → the Engine
marks the order delivered, releases payment to the merchant, and triggers
post-delivery flows (review request, re-order prompt).

The delivery code is one-time-use — the same tag can't confirm twice.

### Engine gaps (required before this flow works end-to-end)

As of 2026-07 the Engine (Yaatal-Engine repo) exposes a JSON API only.
This flow needs, on the Engine side:

1. **Marketplace pages** for the `/m /i /c` deep links (or a web app serving them)
2. **Live-session attribution** — `/l/{session}/{product}` routes + attribution on orders
3. **Delivery codes** — a one-time-use `delivery_code` generated at ship time
   (today deliveries are confirmed by *id* with the buyer's JWT via
   `POST /api/deliveries/{id}/confirm`, which cannot serve an anonymous NFC tap)
4. **Public confirm-by-code endpoint** (e.g. `POST /api/deliveries/confirm-by-code`)
   and the `/d/{code}` confirmation page

The escrow-release plumbing already exists — the Engine's confirm handler
releases held BOBO payments — so the gap is the code-based public entry
point, not the payment logic.

## License

- The planned vendored upstreams will retain their MIT licenses when imported
- All original work in this repo is © Yaatal Labs, all rights reserved
  (per-module licensing per the table above lands with the first release)

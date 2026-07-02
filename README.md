# Yaatal-Studio

Social commerce tooling tailored to the African market — voice + video content production for Wolof/French commerce.

## What is this?

Yaatal-Studio is a content production stack for African social commerce. It combines:
- **Voice I/O** — TTS, STT, voice cloning, dictation (forked from Voicebox, MIT)
- **Video production** — script-to-video pipelines, composition, UGC generation (forked from MoneyPrinterTurbo, MIT)
- **Wolof language support** — custom TTS/STT models for the Senegalese market (Yaatal's IP)

## License architecture

| Layer | License | Source |
|---|---|---|
| `voice/voicebox/` | MIT | Forked from [jamiepine/voicebox](https://github.com/jamiepine/voicebox) |
| `video/MoneyPrinterTurbo/` | MIT | Forked from [harry0703/MoneyPrinterTurbo](https://github.com/harry0703/MoneyPrinterTurbo) |
| `video/composition/motionforge/` | MIT | Forked from [codedbytahir/motionforge](https://github.com/codedbytahir/motionforge) |
| `live/obs-controller/` | MIT | Original — wraps [obsws-python](https://github.com/aatikturk/obsws-python) (MIT) |
| `live/mcp-server/` | MIT | Original — FastMCP server for OBS control |
| `live/agent-loop/` | Proprietary | Original — STT intent detection, comment monitoring, engagement watching |
| `live/nfc-controller/` | Proprietary | Original — NFC card reader → OBS actions |
| `live/nfc-viewer/` | Proprietary | Original — NFC tap-to-buy web server (FastAPI) |
| `live/overlays/` | MIT | Original — HTML Browser Source templates |
| `live/scenes/` | MIT | Original — OBS scene collection JSON |
| `live/multistream/` | MIT | Original — RTMP routing config templates |
| `yaatal/` | Proprietary (Yaatal Labs) | Original work — Wolof models, prompts, detection, commerce backend |

All vendored upstreams are MIT-licensed. The `yaatal/` directory is proprietary IP.
OBS Studio (GPLv2) is used as-is via WebSocket API — a clean license boundary that
does not trigger GPL obligations on Yaatal's code. No AGPL dependencies.

## Directory structure

```
Yaatal-Studio/
├── voice/
│   └── voicebox/                    # MIT — studio shell (Tauri/Rust/React)
│       ├── engines/                  # TTS engines: Kokoro, Piper, XTTS, Bark
│       ├── stt/                      # Whisper STT
│       ├── mcp-server/               # voicebox.speak, .transcribe
│       └── tauri/                    # Desktop app (Rust)
│
├── video/
│   ├── MoneyPrinterTurbo/           # MIT — pipeline engine (95k stars)
│   │   ├── app/                      # Script → footage → TTS → subtitles → compose
│   │   └── webui/                    # Gradio UI
│   └── composition/
│       └── motionforge/              # MIT — Remotion alternative (React + WebCodecs)
│
├── live/                             # OBS livestream selling layer
│   ├── obs-controller/               # Python wrapper around obsws-python (MIT)
│   ├── mcp-server/                   # FastMCP server — OBS control as MCP tools
│   ├── agent-loop/                   # STT intent detection + comment monitor + engagement
│   ├── nfc-controller/               # Physical NFC cards → seller controls the stream
│   ├── nfc-viewer/                   # NFC tap-to-buy web server for viewers
│   ├── overlays/                     # HTML Browser Source templates (price, CTA, etc.)
│   ├── scenes/                       # OBS scene collection JSON (importable)
│   └── multistream/                  # RTMP routing configs (Facebook, YouTube, TikTok)
│
├── yaatal/                           # Proprietary — Yaatal's IP
│   ├── wolof-models/                 # Wolof TTS/STT models + training scripts
│   ├── prompts/                      # Wolof/French prompt templates
│   ├── detection/                    # African market signal detection
│   ├── commerce/                     # Rust/Loco backend, Postgres, Qdrant
│   └── sdk/                          # TypeScript SDK
│
└── integrations/
    ├── meta-ads-mcp/                 # Diaspora ad targeting (Paris, NYC, Dakar)
    ├── dsers-mcp/                    # Product sourcing
    └── shopify-mcp/                  # Or Yaatal's own commerce API
```

## Wolof model inventory

Verified on HuggingFace (July 2026):

### TTS (Wolof)
| Model | License | Downloads | Notes |
|---|---|---|---|
| `bilalfaye/speecht5_tts-wolof` | **MIT** ✅ | 1,362 | SpeechT5 fine-tuned for Wolof, custom tokenizer |
| `bilalfaye/speecht5_tts-wolof-v0.2` | MIT ✅ | 115 | v0.2 |
| `Moustapha91/TTS_WOLOF_FINAL` | **MIT** ✅ | 2 | SpeechT5, loss 0.3705 |
| `galsenai/parler-tts-mini-v1-wolof` | ⚠️ No license | 10 | ParlerTTS, 877M params |
| `aliounetoure1/spark-tts-wolof-men-v1` | ⚠️ No license | 30 | Spark TTS, male voice |
| `aliounetoure1/spark-tts-wolof-women-v1` | ⚠️ No license | 31 | Spark TTS, female voice |

### STT / ASR (Wolof)
| Model | License | Downloads | Notes |
|---|---|---|---|
| `cifope/whisper-small-wolof` | **Apache 2.0** ✅ | 18 | Whisper-small on FLEURS, WER 0.92 (needs improvement) |
| `BenDaouda/wav2vec2-large-xls-r-1b-wolof-VoiceToText` | ⚠️ No license | 128 | Wav2Vec2-XLS-R-1B |
| `BenDaouda/wav2vec2-large-xls-wolof-asr` | ⚠️ No license | 106 | Wav2Vec2-large |
| `kingabzpro/wav2vec2-large-xlsr-53-wolof` | ⚠️ No license | 175 | Wav2Vec2-XLSR-53 |
| `speechbrain/asr-wav2vec2-dvoice-wolof` | ⚠️ No license | 42 | SpeechBrain dVoice |
| `abdouaziiz/wav2vec2-xls-r-300m-wolof-lm` | ⚠️ No license | 63 | With LM head |

**Only models with explicit MIT/Apache licenses are safe for commercial use.** Models with no license field are "all rights reserved" by default. Yaatal's path: start from `bilalfaye/speecht5_tts-wolof` (MIT) for TTS and `cifope/whisper-small-wolof` (Apache 2.0) for STT, then fine-tune both on Yaatal's Wolof data.

## Getting started

```bash
# Clone with submodules
git clone https://github.com/Yaatal-labs/Yaatal-Studio.git
cd Yaatal-Studio

# Voice layer setup
cd voice/voicebox
just setup   # creates Python venv, installs deps

# Video layer setup
cd video/MoneyPrinterTurbo
cp config.example.toml config.toml
pip install -r requirements.txt
```

## Roadmap

1. **Wire Wolof TTS** — integrate `bilalfaye/speecht5_tts-wolof` (MIT) into Voicebox as a custom engine
2. **Wire Wolof STT** — load `cifope/whisper-small-wolof` (Apache 2.0) into Faster-Whisper
3. **French TTS** — configure Kokoro (Apache 2.0, already in Voicebox) for French narration
4. **Video pipeline** — adapt MoneyPrinterTurbo for Wolof/French scripts
5. **Composition** — replace Remotion (source-available, paid >3 employees) with MotionForge (MIT)
6. **Live selling** — wire OBS MCP server to gateway, test with real sellers in Dakar
7. **Live captions** — Voicebox STT → `send_caption` → OBS stream (French first, Wolof as STT improves)
8. **Agent loop** — STT intent detection auto-updates prices, detects sold-outs, surfaces comments, auto-clips spikes
9. **NFC controller** — physical NFC cards for sellers to control the stream without keyboard
10. **NFC viewer** — tap-to-buy NFC cards shipped with products, web server for product pages
11. **Detection layer** — build African market signal detection (TikTok Senegal, Instagram diaspora, Google Trends)
12. **Commerce backend** — wire Yaatal Rust/Loco backend as the commerce platform
13. **Engine integration** — connect live/ layer to Yaatal Engine (product catalog → scenes, sold-out → inventory, clips → MoneyPrinterTurbo, NFC registry → Engine catalog)

## License

- Vendored upstreams retain their MIT licenses (see each subdirectory's LICENSE file)
- The `yaatal/` directory and all original work in this repo are © Yaatal Labs, all rights reserved
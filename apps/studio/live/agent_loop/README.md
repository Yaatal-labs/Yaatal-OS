# Yaatal Agent Loop

The brain of the livestream — listens to the seller's speech and the
audience's comments, detects intents, and orchestrates OBS automatically.

## What it does

| Detection | Trigger | Action |
|---|---|---|
| **Price mentioned** | Seller says "12 mille" or "12000 FCFA" | `update_price` overlay + `send_caption` |
| **Sold out** | Seller says "vendu", "amul", "sold out" | `mark_sold_out` + `clip_moment` |
| **Product switch** | Seller says "produit suivant", "bi ñëw" | `switch_to_next_product` + chapter |
| **Product mention** | Seller says a product name | `switch_to_product` (semantic match future) |
| **Comment spike** | Comment velocity 3x baseline | Auto `clip_moment` |
| **Engagement drop** | Comment velocity < 0.5x baseline | Suggest product switch to seller |
| **Price question** | Viewer comments "combien?" | Flash price on screen |

## Components

| Module | Role |
|---|---|
| `orchestrator.py` | AgentLoop — ties STT, comments, engagement → OBS actions |
| `stt_listener.py` | Captures seller speech → Voicebox/Faster-Whisper → TranscriptEvent |
| `whatsapp_source.py` | Polls Engine `GET /api/social/events` → feeds `CommentMonitor.add_comment()` |
| `SpeechIntentDetector` | Rule-based Wolof/French intent parsing (price, sold-out, switch) |
| `CommentMonitor` | Receives platform comments, detects questions, calculates velocity |
| `EngagementWatcher` | Monitors viewer count + comment velocity, detects spikes/drops |

## Usage

```python
from live.obs_controller.controller import LiveController, Product
from live.agent_loop import (
    AgentLoop, CommentMonitor, EngagementWatcher, STTListener
)

# Connect to OBS
controller = LiveController(host="localhost", port=4455)

# Start session with products
controller.start_session("Seller Diop", [
    Product(id="001", name="Sac en cuir", price="15,000 FCFA"),
    Product(id="002", name="Montre", price="8,000 FCFA"),
])

# Wire up the agent loop
comments = CommentMonitor()
engagement = EngagementWatcher()
agent = AgentLoop(controller, comments, engagement)

# STT listener feeds transcripts to the agent
stt = STTListener(on_transcript=agent.process_transcript, language="auto")
stt.start()
agent.start()

# WhatsApp comments, polled from the Engine (no-op unless YAATAL_ENGINE_URL is set)
from live.agent_loop import WhatsAppSource
whatsapp = WhatsAppSource(comments)  # reads YAATAL_ENGINE_URL / YAATAL_TOKEN from env
whatsapp.start()

# Go live
controller.go_live()

# Other platforms still feed comments manually — Facebook/TikTok/YouTube
# Live comment APIs are not wired yet (see the repo README's roadmap):
# comments.add_comment("facebook", "Awa", "Combien le sac?")
# engagement.update(EngagementMetrics(viewer_count=150, comment_velocity=8.0))

# Mock test (no microphone needed):
# stt.inject_text("Le sac est à quinze mille francs", language="fr")
# → agent detects price → updates overlay to "15,000 FCFA"
# stt.inject_text("C'est vendu!", language="fr")
# → agent detects sold-out → stamps + clips

# End
agent.stop()
stt.stop()
whatsapp.stop()
controller.end_session()
```

## Wolof + French intent detection

The SpeechIntentDetector recognizes:

| Intent | Wolof | French |
|---|---|---|
| **Price** | junni, fukki junni, ñar fukki junni | mille, francs, FCFA, CFA |
| **Sold out** | amul, amul ñu, suñu, jekhsaal | vendu, tout vendu, rupture, stock épuisé |
| **Switch product** | bi ëww, lëgi | produit suivant, on passe à |

## Governed edge-turn path

To route seller transcripts through the Engine-aware edge Harness, pass a
resolver to `AgentLoop`. The resolver receives the existing `TranscriptEvent`
and returns one validated `edge-turn.v1` decision; local OBS actions remain
limited to the three Studio overlay tools.

```python
from live.harness_client import HarnessClient

harness = HarnessClient(
    binary="/path/to/yaatal-edge-turn",
    model_backend="mock",  # use "minimind" when the local server is ready
)
agent = AgentLoop(
    controller,
    comments,
    engagement,
    proposal_resolver=lambda event: harness.propose(
        event.text, event.language, event.confidence
    ),
    fallback_to_rules=False,
)
```

`fallback_to_rules` is deliberately off by default. A Harness process failure
can use the existing rule detector only when this flag is explicitly enabled;
invalid or unsafe Harness decisions never enter that fallback. The Studio HTTP
server uses the same client when `YAATAL_HARNESS_BIN` is set. Its `/api/intent`
endpoint permits fallback only when the operator sets
`YAATAL_HARNESS_FALLBACK=1` and the request includes `allow_fallback: true`.

Studio binds to `127.0.0.1` by default so seller speech and Harness control stay
on the device. Set `STUDIO_HOST` only when remote access is deliberately
required and protected by the deployment environment.

When the Yaatal Engine is wired, product mention detection upgrades from
string matching to Qdrant + BGE-M3 semantic search (seller says something
fuzzy → nearest product match).

## License

© Yaatal Labs. Proprietary.
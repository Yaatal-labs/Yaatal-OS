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

# Go live
controller.go_live()

# In production: platform APIs feed comments
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
controller.end_session()
```

## Wolof + French intent detection

The SpeechIntentDetector recognizes:

| Intent | Wolof | French |
|---|---|---|
| **Price** | junni, fukki junni, ñar fukki junni | mille, francs, FCFA, CFA |
| **Sold out** | amul, amul ñu, suñu, jekhsaal | vendu, tout vendu, rupture, stock épuisé |
| **Switch product** | bi ëww, lëgi | produit suivant, on passe à |

When the Yaatal Engine is wired, product mention detection upgrades from
string matching to Qdrant + BGE-M3 semantic search (seller says something
fuzzy → nearest product match).

## License

© Yaatal Labs. Proprietary.
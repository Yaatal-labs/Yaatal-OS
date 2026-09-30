# Yaatal NFC Controller

Physical NFC cards that the seller taps to control the livestream —
no keyboard, no leaving the camera frame.

## Hardware

| Component | Cost | Notes |
|---|---|---|
| USB NFC reader (ACR122U) | ~$15-20 | Plug-and-play on Linux/macOS/Windows |
| NTAG215 NFC tags | ~$0.30 each | Same as Amiibo cards, writable |
| Python: nfcpy | Free | `pip install nfcpy` |

## Card types

| Card | Tap action | Color convention |
|---|---|---|
| **Product card** | Switch to product scene + load overlays | One color per product (red, blue, etc.) |
| **SOLD card** | Mark current product sold out + clip moment | Black |
| **NEXT card** | Switch to next product | Green |
| **PRICE card** | Update price (label = price, e.g. "15,000 FCFA") | Yellow |
| **LIVE card** | Toggle stream on/off | White |
| **CLIP card** | Save replay buffer clip | Purple |

## Setup

1. Plug in USB NFC reader
2. `pip install nfcpy`
3. Tap each card on the reader to get its UID
4. Register cards:

```python
from live.nfc_controller import CardRegistry, NFCTapHandler
from live.obs_controller.controller import LiveController, Product

controller = LiveController(host="localhost", port=4455)
registry = CardRegistry("nfc_cards.json")
handler = NFCTapHandler(controller, registry)

# Register a product card (tap card first to get UID)
handler.register_product_card(
    uid="04:A3:12:5F:8B",
    product_id="001",
    label="Sac en cuir",
    color="red",
)

# Register action cards
handler.register_action_card(uid="04:D1:55:E8:7F", card_type="sold", label="SOLD")
handler.register_action_card(uid="04:E2:88:1B:04", card_type="next", label="NEXT")
handler.register_action_card(uid="04:F9:33:AC:56", card_type="live", label="GO LIVE")

# Register price cards (label IS the price)
handler.register_action_card(uid="04:1A:6D:90:C3", card_type="price", label="5,000 FCFA")
handler.register_action_card(uid="04:5B:2E:7D:F1", card_type="price", label="10,000 FCFA")

# Start listening
handler.start()

# Start session
controller.start_session("Seller Diop", [
    Product(id="001", name="Sac en cuir", price="15,000 FCFA"),
    Product(id="002", name="Montre", price="8,000 FCFA"),
])

# Now the seller taps cards:
#   - Tap "Sac en cuir" card → scene switches, overlays load
#   - Tap "15,000 FCFA" price card → price updates on screen
#   - Tap "SOLD" card → sold-out stamp + clip saved
#   - Tap "NEXT" card → switches to Montre
#   - Tap "GO LIVE" card → stream starts
```

## Example registry

See `example_registry.json` for a sample card registry with 9 cards
(2 products + SOLD + NEXT + LIVE + 3 price cards + CLIP).

## Mock mode (no hardware)

```python
# Test without a physical reader:
handler.reader.inject_tap("04:A3:12:5F:8B")  # Product card
handler.reader.inject_tap("04:1A:6D:90:C3")  # Price: 5,000 FCFA
handler.reader.inject_tap("04:D1:55:E8:7F")  # SOLD
```

## Debounce

Same card tapped within 1.5 seconds is ignored — prevents double-reads
from the NFC reader holding the tag.

## License

© Yaatal Labs. Proprietary.
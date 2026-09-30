"""
Yaatal NFC Controller — physical card reader for livestream selling.

The seller has NFC cards/tags on their desk. Tapping a card triggers
an OBS action via the LiveController — no keyboard, no leaving the
camera frame. This is the seller's physical controller.

Card types:
  - PRODUCT cards: one per product → tap to switch scene + load overlays
  - SOLD card: tap to mark current product sold out + clip moment
  - PRICE card: tap to enter price-update mode (next tap = new price)
  - NEXT card: tap to switch to next product
  - LIVE card: tap to go live / end stream

Hardware:
  - USB NFC reader (ACR122U or similar, ~$15-20)
  - NTAG215 NFC tags/cards (same as Amiibo cards, ~$0.30 each)
  - Python: nfcpy or pyscard library for reading

NOT wired to Yaatal Engine yet — product-to-card mapping is done via
a local JSON registry. Engine integration will sync the registry with
the Engine's product catalog.
"""

import json
import logging
import threading
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable, Optional

logger = logging.getLogger(__name__)


@dataclass
class NFCCard:
    """A physical NFC card mapped to an action."""
    uid: str  # NFC tag UID (hex string, e.g. "04:A3:12:5F:8B")
    card_type: str  # product | sold | price | next | live | custom
    label: str  # Human-readable label (e.g. "Sac en cuir", "SOLD")
    product_id: Optional[str] = None  # For product cards
    action: Optional[str] = None  # For custom cards
    color: str = ""  # Physical card color (for identification)


@dataclass
class NFCTapEvent:
    """A single NFC tap detection."""
    uid: str
    card: Optional[NFCCard]  # None if card is not registered
    timestamp: float = field(default_factory=time.time)


class CardRegistry:
    """Manages NFC card → action mappings.

    Cards are stored in a JSON file for persistence across sessions.
    In production, this syncs with the Yaatal Engine product catalog.
    """

    def __init__(self, registry_path: str = "nfc_cards.json"):
        self.registry_path = Path(registry_path)
        self.cards: dict[str, NFCCard] = {}
        self.load()

    def load(self):
        """Load card registry from JSON file."""
        if self.registry_path.exists():
            data = json.loads(self.registry_path.read_text())
            self.cards = {
                uid: NFCCard(**card_data)
                for uid, card_data in data.items()
            }
            logger.info("Loaded %d NFC cards from %s",
                        len(self.cards), self.registry_path)
        else:
            logger.info("No card registry found at %s — starting fresh",
                        self.registry_path)

    def save(self):
        """Save card registry to JSON file."""
        data = {
            uid: {
                "uid": card.uid,
                "card_type": card.card_type,
                "label": card.label,
                "product_id": card.product_id,
                "action": card.action,
                "color": card.color,
            }
            for uid, card in self.cards.items()
        }
        self.registry_path.write_text(json.dumps(data, indent=2))
        logger.info("Saved %d cards to %s", len(self.cards), self.registry_path)

    def register_card(self, card: NFCCard):
        """Register or update a card."""
        self.cards[card.uid] = card
        self.save()
        logger.info("Registered card %s: %s (%s)",
                    card.uid, card.label, card.card_type)

    def unregister_card(self, uid: str):
        """Remove a card from the registry."""
        if uid in self.cards:
            del self.cards[uid]
            self.save()
            logger.info("Unregistered card %s", uid)

    def get_card(self, uid: str) -> Optional[NFCCard]:
        """Look up a card by UID."""
        return self.cards.get(uid)

    def list_cards(self) -> list[NFCCard]:
        """List all registered cards."""
        return list(self.cards.values())


class NFCReader:
    """Reads NFC tags from a USB reader.

    Production mode: uses nfcpy or pyscard to read from an ACR122U reader.
    Mock mode: accepts UIDs via inject_tap() for testing without hardware.
    """

    def __init__(self, on_tap: Callable[[NFCTapEvent], None]):
        """
        Args:
            on_tap: Callback when an NFC tag is tapped
        """
        self.on_tap = on_tap
        self._running = False
        self._thread: Optional[threading.Thread] = None
        self._reader = None  # nfc.Reader or similar

    def start(self):
        """Start listening for NFC taps (non-blocking)."""
        self._running = True
        self._thread = threading.Thread(target=self._read_loop, daemon=True)
        self._thread.start()
        logger.info("NFC reader started")

    def stop(self):
        """Stop listening."""
        self._running = False
        if self._thread:
            self._thread.join(timeout=2)
        if self._reader:
            self._reader.close()
        logger.info("NFC reader stopped")

    def inject_tap(self, uid: str):
        """Inject a tap manually (for testing without hardware).

        Args:
            uid: NFC tag UID as hex string (e.g. "04:A3:12:5F:8B")
        """
        event = NFCTapEvent(uid=uid, card=None)
        self.on_tap(event)

    def _read_loop(self):
        """Main read loop.

        In production, this uses nfcpy to continuously poll for tags:
            import nfc
            clf = nfc.ContactlessFrontend()
            clf.open('usb')  # or 'tty:USB0'
            clf.connect(rdwr={'on-connect': self._on_tag})

        For now, this is a placeholder that waits for inject_tap() calls.
        """
        logger.info("NFC read loop running (mock mode — use inject_tap)")
        while self._running:
            time.sleep(0.1)

    def _on_tag(self, tag):
        """Callback for nfcpy when a tag is detected."""
        uid = ":".join(f"{b:02X}" for b in tag.identifier)
        event = NFCTapEvent(uid=uid, card=None)
        self.on_tap(event)
        return True  # Keep reader active


class NFCTapHandler:
    """Routes NFC taps to OBS actions via the LiveController.

    This is the bridge between physical cards and the stream:
      Product card tap → switch_product
      SOLD card tap → mark_sold_out + clip_moment
      NEXT card tap → switch to next product
      PRICE card tap → enter price update mode
      LIVE card tap → go_live / end_stream toggle
    """

    # Debounce: ignore taps within this window (prevents double-reads)
    DEBOUNCE_SECONDS = 1.5

    def __init__(self, controller, registry: CardRegistry):
        """
        Args:
            controller: LiveController instance (from obs_controller)
            registry: CardRegistry for card lookups
        """
        self.controller = controller
        self.registry = registry
        self._last_tap_time: float = 0
        self._last_tap_uid: str = ""
        self._price_update_mode: bool = False
        self._price_update_product_id: Optional[str] = None

        self.reader = NFCReader(on_tap=self._handle_tap)

    def start(self):
        """Start listening for NFC taps."""
        self.reader.start()

    def stop(self):
        """Stop listening."""
        self.reader.stop()

    def _handle_tap(self, event: NFCTapEvent):
        """Process an NFC tap — route to the appropriate OBS action."""
        # Debounce: same card tapped within 1.5s = ignore
        now = time.time()
        if (event.uid == self._last_tap_uid and
                now - self._last_tap_time < self.DEBOUNCE_SECONDS):
            logger.debug("Debounced tap: %s", event.uid)
            return
        self._last_tap_time = now
        self._last_tap_uid = event.uid

        # Look up the card
        card = self.registry.get_card(event.uid)
        event.card = card

        if card is None:
            logger.warning("Unknown card tapped: %s — not in registry",
                           event.uid)
            # In production: could prompt seller to register the card
            return

        logger.info("Card tapped: %s (%s) → %s",
                    card.label, card.card_type, card.uid)

        # Route to action
        if card.card_type == "product":
            self._on_product_card(card)
        elif card.card_type == "sold":
            self._on_sold_card()
        elif card.card_type == "next":
            self._on_next_card()
        elif card.card_type == "price":
            self._on_price_card(card)
        elif card.card_type == "live":
            self._on_live_card()
        elif card.card_type == "custom":
            self._on_custom_card(card)
        else:
            logger.warning("Unknown card type: %s", card.card_type)

    def _on_product_card(self, card: NFCCard):
        """Product card tapped — switch to that product's scene."""
        if not self.controller.session:
            logger.warning("No active session — tap ignored")
            return

        # Find the product in the session
        for i, product in enumerate(self.controller.session.products):
            if product.id == card.product_id:
                self.controller.session.current_product_index = i
                self.controller.switch_to_product(product)
                self.controller.mark_product_chapter(product)
                self.controller.clear_sold_out(product)
                logger.info("Switched to product: %s via NFC", product.name)
                return

        logger.warning("Product %s not found in session", card.product_id)

    def _on_sold_card(self):
        """SOLD card tapped — mark current product sold out + clip."""
        if not self.controller.session or not self.controller.session.current_product:
            logger.warning("No current product — SOLD tap ignored")
            return

        product = self.controller.session.current_product
        self.controller.mark_sold_out(product)
        clip_path = self.controller.clip_moment()
        logger.info("Marked sold out via NFC: %s (clip: %s)",
                    product.name, clip_path)

    def _on_next_card(self):
        """NEXT card tapped — switch to next product."""
        if not self.controller.session:
            return

        session = self.controller.session
        if session.current_product_index < len(session.products) - 1:
            session.current_product_index += 1
            product = session.current_product
            self.controller.switch_to_product(product)
            self.controller.mark_product_chapter(product)
            logger.info("Next product via NFC: %s", product.name)
        else:
            logger.info("No more products — at end of session")

    def _on_price_card(self, card: NFCCard):
        """PRICE card tapped — enter price update mode.

        In price update mode, the next product card tap sets the price
        for the current product (the card's label contains the new price).

        This is a simpler alternative to STT-based price detection —
        the seller has pre-labeled price cards (5k, 10k, 15k, 20k, 25k FCFA).
        """
        # If the card has a label that looks like a price, apply it directly
        if card.label and any(c.isdigit() for c in card.label):
            if self.controller.session and self.controller.session.current_product:
                product = self.controller.session.current_product
                self.controller.update_price(product, card.label)
                logger.info("Price updated via NFC: %s → %s",
                            product.name, card.label)
        else:
            # Toggle price update mode (next tap sets the price)
            self._price_update_mode = not self._price_update_mode
            logger.info("Price update mode: %s", self._price_update_mode)

    def _on_live_card(self):
        """LIVE card tapped — toggle stream on/off."""
        if self.controller.session:
            if self.controller.session.is_live:
                self.controller.end_stream()
                logger.info("Stream ended via NFC")
            else:
                self.controller.go_live()
                logger.info("Gone live via NFC")
        else:
            logger.warning("No active session — LIVE tap ignored")

    def _on_custom_card(self, card: NFCCard):
        """Custom card — execute the action string."""
        action = card.action or ""
        if action == "clip":
            self.controller.clip_moment()
            logger.info("Moment clipped via NFC")
        elif action == "duck_music":
            self.controller.duck_background_music("background_music")
        elif action == "restore_music":
            self.controller.restore_background_music("background_music")
        elif action == "virtual_cam":
            self.controller.start_virtual_camera()
        else:
            logger.info("Custom action: %s", action)

    # ─── Card registration (for setup) ──────────────────────────────

    def register_product_card(self, uid: str, product_id: str,
                              label: str, color: str = ""):
        """Register a product card during setup.

        The seller taps a card on the reader, and this function maps it
        to a product ID from the Yaatal Engine catalog.
        """
        card = NFCCard(
            uid=uid,
            card_type="product",
            label=label,
            product_id=product_id,
            color=color,
        )
        self.registry.register_card(card)

    def register_action_card(self, uid: str, card_type: str,
                             label: str, action: str = "",
                             color: str = ""):
        """Register an action card (SOLD, NEXT, LIVE, PRICE, custom)."""
        card = NFCCard(
            uid=uid,
            card_type=card_type,
            label=label,
            action=action,
            color=color,
        )
        self.registry.register_card(card)
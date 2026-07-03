"""
Yaatal Agent Loop — the brain of the livestream.

Listens to the seller's speech (Voicebox STT), monitors viewer comments,
watches engagement metrics, and orchestrates OBS via the MCP tools.

This is Level 1 (agent-assisted) + Level 2 (agent-driven):
  - Detects when seller says a price → auto-updates price overlay
  - Detects when seller says "sold out" → auto-stamps + clips
  - Surfaces viewer comments on screen
  - Detects engagement drops → suggests product switch
  - Auto-clips moment when comment velocity spikes

NOT wired to Yaatal Engine yet — product matching is done via simple
string matching. Engine integration will provide semantic product matching
via Qdrant + BGE-M3.
"""

import logging
import re
import threading
import time
from collections import deque
from dataclasses import dataclass, field
from typing import Callable, Optional

logger = logging.getLogger(__name__)


# ─── Speech intent detection (Wolof + French) ───────────────────────

# Price patterns — FCFA format (Senegal/West Africa)
# Every pattern requires a currency cue (mille/francs/FCFA/junni) so that
# unrelated numbers ("3 000 personnes qui regardent") never become the price.
PRICE_PATTERNS = [
    # French digits + cue: "12 mille" / "12 mille francs" / "12 000 FCFA"
    re.compile(r'(\d[\d\s]*\d|\d)\s*(?:mille|milliers?|francs?|fcfa|cfa)', re.I),
    # French written numbers + cue: "douze mille" / "cinquante mille francs"
    re.compile(
        r'(deux|trois|quatre|cinq|six|sept|huit|neuf|dix|onze|douze|treize|'
        r'quatorze|quinze|seize|vingt|trente|quarante|cinquante|soixante|cent)'
        r'\s+(?:mille|francs?)', re.I),
    # Wolof number words (basic — extend as STT improves)
    re.compile(r'(fukki?\s+junni|junni?\s+(?:ak\s+\w+)?|ñaari?\s+fukki?\s+junni)', re.I),
]

# French written numbers → value (used by the written-number pattern above)
FRENCH_NUMBER_WORDS = {
    "deux": 2, "trois": 3, "quatre": 4, "cinq": 5, "six": 6, "sept": 7,
    "huit": 8, "neuf": 9, "dix": 10, "onze": 11, "douze": 12, "treize": 13,
    "quatorze": 14, "quinze": 15, "seize": 16, "vingt": 20, "trente": 30,
    "quarante": 40, "cinquante": 50, "soixante": 60, "cent": 100,
}

# Sold-out triggers — Wolof + French
# Keep triggers unambiguous: a false sold-out stamps the product on stream
# and fires an auto-clip. Common words ("suñu" = "our", bare "amul" =
# "there isn't", "ñépp" = "all", "c'est tout") are deliberately excluded
# because they appear constantly in ordinary selling speech.
SOLD_OUT_TRIGGERS = [
    # Wolof
    "jeex na",         # "it is finished"
    "amul ñu",         # "there is none of it"
    "dara desul",      # "nothing remains"
    # French
    "vendu",           # "sold"
    "tout vendu",      # "all sold"
    "rupture",         # "out of stock"
    "stock épuisé",    # "stock exhausted"
    "plus en stock",   # "no more in stock"
    # English (mixed speech is common)
    "sold out",
    "out of stock",
    "all gone",
]

# Product switch triggers
PRODUCT_SWITCH_TRIGGERS = [
    # French
    "produit suivant",
    "next produit",
    "on passe à",
    "deuxième produit",
    "troisième produit",
    # Wolof
    "lèegi",           # "now" — contextual
    "bi ñëw",          # "the next one"
]


@dataclass
class TranscriptEvent:
    """One chunk of seller speech transcribed by Voicebox STT."""
    text: str
    language: str  # wolof | french | mixed
    timestamp: float
    confidence: float = 0.0


@dataclass
class CommentEvent:
    """One viewer comment from the platform (Facebook/TikTok/YouTube)."""
    platform: str
    user: str
    text: str
    timestamp: float
    is_question: bool = False
    highlighted: bool = False


@dataclass
class EngagementMetrics:
    """Current stream engagement snapshot."""
    viewer_count: int = 0
    comment_velocity: float = 0.0  # comments per minute
    reaction_count: int = 0
    timestamp: float = field(default_factory=time.time)


class SpeechIntentDetector:
    """Parses seller speech for intents: price changes, sold-outs, product switches.

    This is a rule-based detector — fast and predictable. When the Yaatal Engine
    is wired, this can be upgraded to LLM-based intent parsing via Qdrant semantic
    matching (seller says something fuzzy → BGE-M3 embeds → nearest product match).
    """

    def detect_price(self, text: str) -> Optional[str]:
        """Extract a price from seller speech.

        Returns formatted price string (e.g. "12 000 FCFA") or None.
        """
        for pattern in PRICE_PATTERNS:
            match = pattern.search(text)
            if not match:
                continue
            raw = match.group(1)
            # The ×1000 cue ("mille") lives in the full match, not in the
            # captured number group — "12 mille francs" captures "12".
            full = match.group(0).lower()

            word_val = FRENCH_NUMBER_WORDS.get(raw.lower().strip())
            digits = re.sub(r'[^0-9]', '', raw)
            if word_val is not None:
                val = word_val
            elif digits:
                val = int(digits)
            else:
                continue  # Wolof word pattern — no numeric value yet

            if 'mille' in full or 'millier' in full:
                val *= 1000
            return f"{val:,} FCFA".replace(",", " ")
        return None

    def detect_sold_out(self, text: str) -> bool:
        """Check if the seller declared a product sold out."""
        text_lower = text.lower().strip()
        return any(trigger in text_lower for trigger in SOLD_OUT_TRIGGERS)

    def detect_product_switch(self, text: str) -> bool:
        """Check if the seller wants to switch to the next product."""
        text_lower = text.lower().strip()
        for trigger in PRODUCT_SWITCH_TRIGGERS:
            if trigger in text_lower:
                return True
        return False

    def detect_product_mention(self, text: str,
                               products: list) -> Optional[str]:
        """Try to match seller speech to a product by name.

        Simple fuzzy string matching. When Engine is wired, this becomes
        semantic search via Qdrant + BGE-M3.
        """
        text_lower = text.lower()
        for product in products:
            if product.name.lower() in text_lower:
                return product.id
            # Also check first word of product name
            first_word = product.name.lower().split()[0] if product.name else ""
            if first_word and len(first_word) > 3 and first_word in text_lower:
                return product.id
        return None


class CommentMonitor:
    """Monitors viewer comments from streaming platforms.

    In production, this connects to Facebook Graph API, TikTok Live API,
    YouTube Live Chat API. For now, it accepts comments via a callback
    and processes them for display + question detection.
    """

    # Comment patterns that indicate a question
    QUESTION_PATTERNS = [
        re.compile(r'combien', re.I),        # "how much" (French)
        re.compile(r'prix', re.I),            # "price" (French)
        re.compile(r'ñaata', re.I),           # "how much" (Wolof: "ñaata la")
        re.compile(r'\?', re.I),              # Question mark
        re.compile(r'how much', re.I),        # English
        re.compile(r'price', re.I),           # English
        re.compile(r'shipping', re.I),        # English
        re.compile(r'livraison', re.I),       # French
        re.compile(r'dakar', re.I),           # Location questions
    ]

    def __init__(self, max_history: int = 100):
        self.comments: deque[CommentEvent] = deque(maxlen=max_history)
        self.on_comment: Optional[Callable[[CommentEvent], None]] = None

    def is_question(self, text: str) -> bool:
        """Detect if a comment is asking a question (especially about price)."""
        for pattern in self.QUESTION_PATTERNS:
            if pattern.search(text):
                return True
        return False

    def add_comment(self, platform: str, user: str, text: str):
        """Process an incoming comment from a platform."""
        is_q = self.is_question(text)
        event = CommentEvent(
            platform=platform,
            user=user,
            text=text,
            timestamp=time.time(),
            is_question=is_q,
            highlighted=is_q,  # Highlight questions on screen
        )
        self.comments.append(event)
        logger.debug("Comment from %s on %s: %s (question=%s)",
                      user, platform, text, is_q)
        if self.on_comment:
            self.on_comment(event)

    def get_velocity(self, window_seconds: int = 60) -> float:
        """Calculate comment velocity (comments per minute)."""
        now = time.time()
        recent = sum(1 for c in self.comments
                     if now - c.timestamp < window_seconds)
        return recent / (window_seconds / 60)


class EngagementWatcher:
    """Watches stream engagement metrics and detects spikes/drops.

    Monitors viewer count and comment velocity. When engagement drops,
    suggests a product switch. When comment velocity spikes, triggers
    an auto-clip (the audience is reacting to something worth capturing).
    """

    def __init__(self, spike_threshold: float = 3.0,
                 drop_threshold: float = 0.5):
        self.spike_threshold = spike_threshold  # 3x normal = spike
        self.drop_threshold = drop_threshold    # 0.5x normal = drop
        self.baseline_velocity: float = 0.0
        self.last_viewer_count: int = 0
        self.history: deque[EngagementMetrics] = deque(maxlen=60)

        # Callbacks
        self.on_engagement_spike: Optional[Callable] = None
        self.on_engagement_drop: Optional[Callable] = None

    def update(self, metrics: EngagementMetrics):
        """Process a new engagement snapshot."""
        self.history.append(metrics)

        # Update baseline (average of last 10 samples)
        recent = list(self.history)[-10:]
        avg_velocity = sum(m.comment_velocity for m in recent) / len(recent)
        self.baseline_velocity = avg_velocity

        # Detect spike
        if (self.baseline_velocity > 0 and
                metrics.comment_velocity >
                self.baseline_velocity * self.spike_threshold):
            logger.info("Engagement spike: %.1f comments/min (baseline %.1f)",
                        metrics.comment_velocity, self.baseline_velocity)
            if self.on_engagement_spike:
                self.on_engagement_spike(metrics)

        # Detect drop
        if (self.baseline_velocity > 1.0 and
                metrics.comment_velocity <
                self.baseline_velocity * self.drop_threshold):
            logger.info("Engagement drop: %.1f comments/min (baseline %.1f)",
                        metrics.comment_velocity, self.baseline_velocity)
            if self.on_engagement_drop:
                self.on_engagement_drop(metrics)

        self.last_viewer_count = metrics.viewer_count


class AgentLoop:
    """Orchestrates the livestream by connecting STT, comments, and OBS.

    This is the main agent loop that ties everything together:
    1. Voicebox STT transcribes seller speech → SpeechIntentDetector
    2. Intent detected → calls OBS MCP tool (update_price, mark_sold_out, etc.)
    3. CommentMonitor surfaces questions on screen
    4. EngagementWatcher auto-clips spikes and suggests switches on drops

    The loop runs in a background thread and calls the OBS MCP server
    via the LiveController (not over the network — direct Python calls
    for low latency, since STT → overlay update needs to be <500ms).
    """

    def __init__(self, controller, comment_monitor: CommentMonitor,
                 engagement_watcher: EngagementWatcher):
        """
        Args:
            controller: LiveController instance (from obs_controller)
            comment_monitor: CommentMonitor for viewer comments
            engagement_watcher: EngagementWatcher for metrics
        """
        self.controller = controller
        self.comment_monitor = comment_monitor
        self.engagement_watcher = engagement_watcher
        self.detector = SpeechIntentDetector()

        # Wire callbacks
        self.comment_monitor.on_comment = self._handle_comment
        self.engagement_watcher.on_engagement_spike = self._handle_spike
        self.engagement_watcher.on_engagement_drop = self._handle_drop

        self._running = False
        self._thread: Optional[threading.Thread] = None

    def process_transcript(self, event: TranscriptEvent):
        """Process a transcript chunk from Voicebox STT.

        Called by the STT listener whenever new speech is transcribed.
        Detects intents and triggers OBS actions.
        """
        text = event.text
        logger.debug("Transcript (%s): %s", event.language, text)

        if not self.controller.session:
            logger.debug("No active session — transcript ignored")
            return

        # Check for sold-out first (highest priority)
        if self.detector.detect_sold_out(text):
            product = self.controller.session.current_product
            if product:
                logger.info("Sold-out detected for %s: %s", product.name, text)
                self.controller.mark_sold_out(product)
                self.controller.clip_moment()
            return

        # Check for product switch
        if self.detector.detect_product_switch(text):
            logger.info("Product switch detected: %s", text)
            self._switch_to_next_product()
            return

        # Check for price mention
        price = self.detector.detect_price(text)
        if price:
            product = self.controller.session.current_product
            if product:
                logger.info("Price detected for %s: %s → %s",
                            product.name, text, price)
                self.controller.update_price(product, price)
                self.controller.send_caption(f"Prix: {price}")
            return

        # Check for product mention (seller talking about a specific product)
        if self.controller.session:
            current = self.controller.session.current_product
            product_id = self.detector.detect_product_mention(
                text, self.controller.session.products)
            if product_id and (current is None or product_id != current.id):
                logger.info("Product mention detected: %s → switching", product_id)
                self.controller.switch_to_product(
                    next(p for p in self.controller.session.products
                         if p.id == product_id))
                return

        # No intent detected — push as caption if confidence is high
        if event.confidence > 0.7:
            self.controller.send_caption(text)

    def _handle_comment(self, event: CommentEvent):
        """Handle a viewer comment — push to OBS overlay."""
        # In production, this calls the OBS browser source overlay
        # via postMessage or SetInputSettings to update the comments HTML
        logger.info("Comment: %s: %s (question=%s)",
                    event.user, event.text, event.is_question)

        # If it's a price question and we have a current product,
        # the price is already on screen — but flash it
        if event.is_question and self.controller.session:
            product = self.controller.session.current_product
            if product and "combien" in event.text.lower():
                # Re-send price as caption to reinforce
                self.controller.send_caption(f"{product.name}: {product.price}")

    def _handle_spike(self, metrics: EngagementMetrics):
        """Engagement spike — something interesting is happening. Clip it."""
        logger.info("Auto-clipping due to engagement spike")
        self.controller.clip_moment()

    def _handle_drop(self, metrics: EngagementMetrics):
        """Engagement dropping — suggest a product switch to the seller."""
        logger.info("Engagement dropping — suggesting product switch")
        # In production, this sends a whisper to the seller's earpiece
        # or displays a suggestion on a monitor they can see
        # For now, just log it
        if self.controller.session:
            current = self.controller.session.current_product_index
            total = len(self.controller.session.products)
            if current < total - 1:
                next_product = self.controller.session.products[current + 1]
                logger.info("Suggestion: switch to %s (%s)",
                            next_product.name, next_product.price)
                # In production: earpiece whisper or monitor overlay

    def _switch_to_next_product(self):
        """Switch to the next product in the session."""
        if not self.controller.session:
            return
        session = self.controller.session
        if session.current_product_index < len(session.products) - 1:
            session.current_product_index += 1
            product = session.current_product
            self.controller.switch_to_product(product)
            self.controller.mark_product_chapter(product)
            logger.info("Switched to next product: %s", product.name)
        else:
            logger.info("No more products — at end of session")

    def start(self):
        """Start the agent loop (non-blocking)."""
        self._running = True
        self._thread = threading.Thread(target=self._loop, daemon=True)
        self._thread.start()
        logger.info("Agent loop started")

    def stop(self):
        """Stop the agent loop."""
        self._running = False
        if self._thread:
            self._thread.join(timeout=2)
        logger.info("Agent loop stopped")

    def _loop(self):
        """Main loop — placeholder for periodic checks.

        The actual processing happens via process_transcript() (called by STT)
        and the comment/engagement callbacks. This loop handles periodic
        engagement metric polling (in production, fed by platform APIs).
        """
        while self._running:
            time.sleep(5)
            # In production, poll platform APIs here for:
            # - Facebook Live viewer count + comments
            # - TikTok Live comments
            # - YouTube Live chat
            # Then call:
            #   self.comment_monitor.add_comment(platform, user, text)
            #   self.engagement_watcher.update(metrics)
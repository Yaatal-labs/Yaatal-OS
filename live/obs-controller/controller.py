"""
Yaatal Live — OBS controller for real human livestream sellers.

Wraps obsws-python (MIT) to provide live-selling-specific functions:
- Scene switching per product
- Dynamic price/product overlays
- Sold-out stamps
- Replay buffer clipping for content repurposing
- Recording chaptered by product
- Multi-platform stream control
- Live captions via Voicebox STT → SendStreamCaption

NOT wired to Yaatal Engine yet — standalone module.
Product data comes from dicts, not the Engine API. Engine wiring is planned.
"""

import logging
from dataclasses import dataclass, field
from typing import Optional

from obsws_python import ReqClient

logger = logging.getLogger(__name__)


@dataclass
class Product:
    """A product being sold on a livestream.

    This is a standalone dataclass — NOT wired to the Yaatal Engine.
    When Engine wiring is added, this will be replaced by or mapped from
    the Engine's product catalog model.
    """
    id: str
    name: str
    price: str  # e.g. "12,000 FCFA"
    cta: str = "Achetez maintenant"  # Call to action
    image_path: Optional[str] = None  # Path to product image file
    description: Optional[str] = None
    stock: Optional[int] = None
    language: str = "wolof"  # wolof | french | mixed


@dataclass
class LiveSession:
    """Tracks the state of a single livestream selling session."""
    seller_name: str
    products: list[Product] = field(default_factory=list)
    current_product_index: int = 0
    is_live: bool = False
    is_recording: bool = False
    replay_buffer_active: bool = False
    clips_saved: list[str] = field(default_factory=list)

    @property
    def current_product(self) -> Optional[Product]:
        if 0 <= self.current_product_index < len(self.products):
            return self.products[self.current_product_index]
        return None


class LiveController:
    """High-level OBS controller for livestream selling.

    Wraps obsws-python ReqClient with live-selling-specific operations.
    Communicates with OBS via WebSocket (port 4455 by default).

    OBS itself is GPLv2 — this controller talks to it via WebSocket API,
    which is a clean license boundary. No GPL obligation on this code.
    """

    # OBS input kinds we use
    TEXT_INPUT = "text_gdiplus_v2"  # Windows text source
    TEXT_INPUT_MAC = "text_ft2_source"  # macOS/Linux text source
    IMAGE_INPUT = "image_source"
    BROWSER_INPUT = "browser_source"
    MEDIA_INPUT = "ffmpeg_source"

    def __init__(self, host: str = "localhost", port: int = 4455,
                 password: str = "", timeout: int = 5):
        self.client = ReqClient(host=host, port=port,
                                password=password, timeout=timeout)
        self.session: Optional[LiveSession] = None
        logger.info("Connected to OBS at %s:%d", host, port)

    def disconnect(self):
        if self.client:
            self.client.disconnect()
            logger.info("Disconnected from OBS")

    # ─── Scene management ───────────────────────────────────────────

    def create_product_scene(self, product: Product,
                             scene_name: str = None) -> str:
        """Create an OBS scene for a product with overlays.

        Adds: camera (assumed existing), product image, price text,
        product name text, CTA text.

        Args:
            product: Product data
            scene_name: Override scene name (defaults to "Product_{id}")

        Returns:
            The scene name created
        """
        name = scene_name or f"Product_{product.id}"
        self.client.create_scene(name)
        logger.info("Created scene: %s", name)

        # Product name text overlay (top-left)
        self.client.create_input(
            sceneName=name,
            inputName=f"{name}_product_name",
            inputKind=self.TEXT_INPUT,
            inputSettings={"text": product.name},
            sceneItemEnabled=True,
        )

        # Price text overlay (top-right, large)
        self.client.create_input(
            sceneName=name,
            inputName=f"{name}_price",
            inputKind=self.TEXT_INPUT,
            inputSettings={"text": product.price},
            sceneItemEnabled=True,
        )

        # CTA text overlay (bottom)
        self.client.create_input(
            sceneName=name,
            inputName=f"{name}_cta",
            inputKind=self.TEXT_INPUT,
            inputSettings={"text": product.cta},
            sceneItemEnabled=True,
        )

        # Sold out stamp (hidden initially)
        self.client.create_input(
            sceneName=name,
            inputName=f"{name}_sold_out",
            inputKind=self.TEXT_INPUT,
            inputSettings={"text": "VENDU / SOLD OUT"},
            sceneItemEnabled=False,
        )

        # Product image (if provided)
        if product.image_path:
            self.client.create_input(
                sceneName=name,
                inputName=f"{name}_product_image",
                inputKind=self.IMAGE_INPUT,
                inputSettings={"file": product.image_path},
                sceneItemEnabled=True,
            )

        return name

    def switch_to_product(self, product: Product):
        """Switch the live scene to a product's scene."""
        scene_name = f"Product_{product.id}"
        self.client.set_current_program_scene(scene_name)
        logger.info("Switched to product scene: %s (%s)",
                    product.name, scene_name)

    def switch_to_scene(self, scene_name: str):
        """Switch to any scene by name."""
        self.client.set_current_program_scene(scene_name)
        logger.info("Switched to scene: %s", scene_name)

    def remove_product_scene(self, product: Product):
        """Remove a product's scene (cleanup after session)."""
        scene_name = f"Product_{product.id}"
        self.client.remove_scene(scene_name)
        logger.info("Removed scene: %s", scene_name)

    # ─── Dynamic overlays ───────────────────────────────────────────

    def update_price(self, product: Product, new_price: str):
        """Update the price text overlay for a product in real-time.

        This is the killer feature — the seller says a price, STT parses it,
        and the on-screen price updates without leaving the camera frame.
        """
        input_name = f"Product_{product.id}_price"
        self.client.set_input_settings(input_name, {"text": new_price}, True)
        product.price = new_price
        logger.info("Updated price for %s: %s", product.name, new_price)

    def update_product_name(self, product: Product, new_name: str):
        """Update the product name overlay."""
        input_name = f"Product_{product.id}_product_name"
        self.client.set_input_settings(input_name, {"text": new_name}, True)
        product.name = new_name
        logger.info("Updated product name: %s", new_name)

    def update_cta(self, product: Product, new_cta: str):
        """Update the call-to-action overlay."""
        input_name = f"Product_{product.id}_cta"
        self.client.set_input_settings(input_name, {"text": new_cta}, True)
        product.cta = new_cta
        logger.info("Updated CTA for %s: %s", product.name, new_cta)

    def mark_sold_out(self, product: Product):
        """Show the SOLD OUT stamp for a product."""
        scene_name = f"Product_{product.id}"
        input_name = f"{scene_name}_sold_out"
        item_id = self.client.get_scene_item_id(scene_name, input_name)
        self.client.set_scene_item_enabled(scene_name, item_id, True)
        logger.info("Marked sold out: %s", product.name)

    def clear_sold_out(self, product: Product):
        """Hide the SOLD OUT stamp (for next product)."""
        scene_name = f"Product_{product.id}"
        input_name = f"{scene_name}_sold_out"
        item_id = self.client.get_scene_item_id(scene_name, input_name)
        self.client.set_scene_item_enabled(scene_name, item_id, False)
        logger.info("Cleared sold out: %s", product.name)

    def show_overlay(self, scene_name: str, input_name: str, show: bool = True):
        """Show or hide any overlay by name."""
        item_id = self.client.get_scene_item_id(scene_name, input_name)
        self.client.set_scene_item_enabled(scene_name, item_id, show)

    # ─── Stream control ─────────────────────────────────────────────

    def go_live(self, welcome_scene: str = "Welcome"):
        """Start streaming and recording.

        Switches to welcome scene, starts stream, starts recording,
        arms replay buffer.
        """
        self.client.set_current_program_scene(welcome_scene)
        self.client.start_stream()
        self.client.start_record()
        self.client.start_replay_buffer()
        if self.session:
            self.session.is_live = True
            self.session.is_recording = True
            self.session.replay_buffer_active = True
        logger.info("Went live — stream + record + replay buffer started")

    def end_stream(self, outro_scene: str = "Outro"):
        """End the livestream gracefully."""
        self.client.set_current_program_scene(outro_scene)
        self.client.stop_stream()
        self.client.stop_virtual_cam()
        self.client.stop_replay_buffer()
        # Keep recording running for a few seconds to capture outro
        self.client.stop_record()
        if self.session:
            self.session.is_live = False
            self.session.is_recording = False
            self.session.replay_buffer_active = False
        logger.info("Stream ended")

    def start_virtual_camera(self):
        """Start OBS Virtual Camera for TikTok Live Studio bridge."""
        self.client.start_virtual_cam()
        logger.info("Virtual camera started — select in TikTok Live Studio")

    def stop_virtual_camera(self):
        self.client.stop_virtual_cam()
        logger.info("Virtual camera stopped")

    # ─── Recording + chapters ───────────────────────────────────────

    def mark_product_chapter(self, product: Product):
        """Add a chapter marker in the recording for this product.

        OBS 30.2+ with Hybrid MP4 format required.
        Creates searchable chapters in the recording — one per product.
        """
        chapter_name = f"{product.name} - {product.price}"
        self.client.create_record_chapter(chapter_name)
        logger.info("Chapter marked: %s", chapter_name)

    def clip_moment(self) -> str:
        """Save the replay buffer — clips the last N seconds.

        Returns the filename of the saved clip.
        This clip can be sent to MoneyPrinterTurbo for Reels/TikTok repurposing.
        """
        self.client.save_replay_buffer()
        result = self.client.get_last_replay_buffer_replay()
        clip_path = result.replay_buffer_replay_path if result else "unknown"
        if self.session:
            self.session.clips_saved.append(clip_path)
        logger.info("Moment clipped: %s", clip_path)
        return clip_path

    # ─── Live captions ──────────────────────────────────────────────

    def send_caption(self, text: str):
        """Send CEA-608 caption text over the stream.

        This is how Voicebox STT output gets onto the live stream.
        The gateway transcribes the seller's Wolof/French speech via
        Voicebox, then calls this to push captions to viewers.

        Note: CEA-608 captions work on RTMP targets (YouTube, Facebook).
        TikTok Live Studio via Virtual Camera may not show captions.
        """
        self.client.send_stream_caption(text)
        logger.debug("Caption sent: %s", text)

    # ─── Audio ──────────────────────────────────────────────────────

    def duck_background_music(self, source_name: str, level_db: float = -20.0):
        """Lower background music volume (e.g. when seller is speaking)."""
        self.client.set_input_volume(source_name, vol_db=level_db)

    def restore_background_music(self, source_name: str, level_db: float = -10.0):
        """Restore background music volume."""
        self.client.set_input_volume(source_name, vol_db=level_db)

    def mute_seller(self, mic_source: str):
        """Mute the seller's microphone."""
        self.client.set_input_mute(mic_source, True)

    def unmute_seller(self, mic_source: str):
        """Unmute the seller's microphone."""
        self.client.set_input_mute(mic_source, False)

    # ─── Screenshots ────────────────────────────────────────────────

    def capture_product_frame(self, product: Product,
                              output_path: str = None) -> str:
        """Screenshot the current product scene for listing photos.

        Captures the composited OBS output — product + overlays + camera.
        Useful for auto-generating product listing images from live frames.
        """
        source_name = f"Product_{product.id}"
        path = output_path or f"/tmp/yaatal_product_{product.id}.png"
        self.client.save_source_screenshot(
            name=source_name,
            img_format="png",
            file_path=path,
            width=1080,
            height=1920,
            quality=100,
        )
        logger.info("Product frame captured: %s", path)
        return path

    # ─── Session lifecycle ──────────────────────────────────────────

    def start_session(self, seller_name: str, products: list[Product]):
        """Initialize a live selling session.

        Creates scenes for all products, sets up the session tracker.
        Does NOT go live — call go_live() separately.
        """
        self.session = LiveSession(seller_name=seller_name, products=products)

        # Create welcome and outro scenes if they don't exist
        for scene in ["Welcome", "Outro"]:
            try:
                self.client.create_scene(scene)
            except Exception:
                pass  # Scene may already exist

        # Create a scene for each product
        for product in products:
            self.create_product_scene(product)

        # Start recording (but not streaming yet)
        self.client.start_record()
        self.client.start_replay_buffer()
        self.session.is_recording = True
        self.session.replay_buffer_active = True

        logger.info("Session started: %s, %d products",
                    seller_name, len(products))

    def end_session(self):
        """Clean up after the session ends.

        Removes product scenes, stops recording/replay buffer.
        """
        if not self.session:
            return

        if self.session.is_live:
            self.end_stream()

        for product in self.session.products:
            self.remove_product_scene(product)

        if self.session.is_recording:
            self.client.stop_record()
        if self.session.replay_buffer_active:
            self.client.stop_replay_buffer()

        logger.info("Session ended. Clips saved: %d",
                    len(self.session.clips_saved))
        self.session = None
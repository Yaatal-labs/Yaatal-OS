"""
Yaatal QR Overlay — QR codes on the OBS stream linking to the marketplace.

During a livestream, a QR code is displayed on screen. Viewers scan it
with their phone camera → opens a deep link → lands on the marketplace /
merchant store / item details / checkout flow.

The QR code points to the Yaatal Engine's marketplace URLs, NOT a separate
web server. The Engine handles the actual commerce (product pages, cart,
checkout, orders). This module only generates the QR codes and displays
them as OBS overlays.

Deep link structure:
  https://yaatal.shop/m/{merchant_id}           → merchant store
  https://yaatal.shop/i/{product_id}            → item details
  https://yaatal.shop/c/{product_id}            → direct checkout
  https://yaatal.shop/l/{session_id}/{product}  → live session item (tracked)

The live session link includes the stream session ID so the Engine can
attribute the purchase to the specific livestream that drove it.
"""

import logging
import time
from dataclasses import dataclass
from typing import Optional

logger = logging.getLogger(__name__)


@dataclass
class QRTarget:
    """A QR code target URL displayed on the stream."""
    url: str
    label: str  # Short text shown below QR ("Scan to buy", "Scanner pour acheter")
    product_id: Optional[str] = None
    merchant_id: Optional[str] = None
    session_id: Optional[str] = None  # Live session for attribution
    checkout: bool = False  # Direct to checkout vs. item details


class QRURLBuilder:
    """Builds deep link URLs for the Yaatal Engine marketplace.

    The Engine serves these URLs — this module just constructs them
    and generates QR codes that point to them.
    """

    def __init__(self, base_url: str = "https://yaatal.shop"):
        self.base_url = base_url.rstrip("/")

    def merchant_store(self, merchant_id: str) -> str:
        """URL to a merchant's store page."""
        return f"{self.base_url}/m/{merchant_id}"

    def item_details(self, product_id: str,
                     session_id: str = None) -> str:
        """URL to a product's detail page on the marketplace.

        If session_id is provided, the URL includes live stream attribution
        so the Engine knows this visitor came from a specific livestream.
        """
        if session_id:
            return f"{self.base_url}/l/{session_id}/{product_id}"
        return f"{self.base_url}/i/{product_id}"

    def checkout(self, product_id: str,
                 session_id: str = None) -> str:
        """URL to direct checkout for a product.

        Bypasses the detail page — goes straight to checkout.
        Useful for impulse buys during the live.
        """
        if session_id:
            return f"{self.base_url}/l/{session_id}/{product_id}?checkout=1"
        return f"{self.base_url}/c/{product_id}"

    def live_session(self, session_id: str,
                     product_id: str = None) -> str:
        """URL to the live session page (or a specific product in it)."""
        if product_id:
            return f"{self.base_url}/l/{session_id}/{product_id}"
        return f"{self.base_url}/l/{session_id}"


class QROverlayController:
    """Manages QR code overlays on the OBS stream.

    Generates QR codes and displays them as browser sources in OBS.
    The QR code is rendered as an HTML page that the OBS Browser Source
    loads. When the product changes, the QR URL updates.

    The actual QR rendering is done client-side in the browser source
    (using a JavaScript QR library), so no server-side image generation
    is needed. The overlay HTML receives the URL via postMessage or
    URL parameters and renders the QR code.
    """

    def __init__(self, controller, url_builder: QRURLBuilder):
        """
        Args:
            controller: LiveController instance
            url_builder: QRURLBuilder for constructing marketplace URLs
        """
        self.controller = controller
        self.url_builder = url_builder
        self.current_session_id: Optional[str] = None

    def set_session_id(self, session_id: str):
        """Set the current live session ID for QR attribution."""
        self.current_session_id = session_id

    def show_product_qr(self, product_id: str, checkout: bool = False,
                        label: str = None) -> str:
        """Display a QR code for a product on the OBS stream.

        The QR code links to the marketplace item details (or checkout
        if checkout=True). Viewers scan → land on the Engine's product
        page → browse → checkout.

        Args:
            product_id: The product ID (Engine catalog ID)
            checkout: If True, link to direct checkout. If False, item details.
            label: Custom label text below QR (default: auto)

        Returns:
            The URL encoded in the QR code
        """
        if checkout:
            url = self.url_builder.checkout(product_id, self.current_session_id)
            label = label or "Scanner pour acheter / Scan to buy"
        else:
            url = self.url_builder.item_details(product_id, self.current_session_id)
            label = label or "Scanner pour voir / Scan to view"

        # Update the QR overlay browser source in OBS
        # The overlay HTML (qr_overlay.html) reads the URL from settings
        overlay_input = "QR_Overlay"
        scene_name = self.controller.session.current_product and \
                     f"Product_{self.controller.session.current_product.id}"

        if scene_name:
            try:
                self.controller.client.set_input_settings(
                    overlay_input,
                    {
                        "url": self._build_overlay_url(url, label),
                        "width": 300,
                        "height": 380,
                    },
                    True,
                )
                self.controller.client.set_scene_item_enabled(
                    scene_name,
                    self.controller.client.get_scene_item_id(scene_name, overlay_input),
                    True,
                )
            except Exception as e:
                logger.warning("Could not update QR overlay: %s", e)

        logger.info("QR shown for product %s: %s", product_id, url)
        return url

    def show_merchant_qr(self, merchant_id: str,
                         label: str = "Scanner pour visiter la boutique") -> str:
        """Display a QR code linking to the merchant's store.

        Used at the start/end of the stream to drive viewers to the
        merchant's marketplace store page.

        Args:
            merchant_id: The merchant's Engine ID
            label: Text below the QR code

        Returns:
            The URL encoded in the QR code
        """
        url = self.url_builder.merchant_store(merchant_id)
        # Update overlay (same as product QR but with merchant URL)
        try:
            self.controller.client.set_input_settings(
                "QR_Overlay",
                {
                    "url": self._build_overlay_url(url, label),
                    "width": 300,
                    "height": 380,
                },
                True,
            )
        except Exception as e:
            logger.warning("Could not update merchant QR overlay: %s", e)

        logger.info("Merchant QR shown: %s", url)
        return url

    def hide_qr(self):
        """Hide the QR code overlay from the stream."""
        if not self.controller.session:
            return
        scene_name = f"Product_{self.controller.session.current_product.id}" \
            if self.controller.session.current_product else None
        if scene_name:
            try:
                self.controller.client.set_scene_item_enabled(
                    scene_name,
                    self.controller.client.get_scene_item_id(scene_name, "QR_Overlay"),
                    False,
                )
            except Exception as e:
                logger.warning("Could not hide QR overlay: %s", e)

    def _build_overlay_url(self, qr_url: str, label: str) -> str:
        """Build the browser source URL for the QR overlay HTML.

        The qr_overlay.html template reads URL parameters to know what
        URL to encode in the QR and what label to show.
        """
        from urllib.parse import urlencode
        params = urlencode({"url": qr_url, "label": label})
        # Local file path for the overlay HTML
        return f"http://localhost:8000/qr_overlay.html?{params}"
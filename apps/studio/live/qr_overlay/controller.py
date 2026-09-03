"""
Yaatal QR Overlay — QR codes on the OBS stream linking to the marketplace.

During a livestream, a QR code is displayed on screen. Viewers scan it
with their phone camera → opens a deep link → lands on the marketplace /
merchant store / item details / checkout flow.

The QR code points to the Yaatal Engine's marketplace URLs, NOT a separate
web server. The Engine handles the actual commerce (product pages, cart,
checkout, orders). This module only generates the QR codes and displays
them as OBS overlays.

Wired to the Yaatal Engine:
  - Fetches product info from Engine GET /api/catalog/:id for display labels
  - Generates QR codes with Engine product URLs:
    Product info: https://engine.njooba.com/i/:product_id
    Checkout:     https://engine.njooba.com/c/:product_id
    Live session: https://engine.njooba.com/l/:session_id/:product_id

Deep link structure:
  https://engine.njooba.com/m/{merchant_id}           → merchant store
  https://engine.njooba.com/i/{product_id}            → item details
  https://engine.njooba.com/c/{product_id}            → direct checkout
  https://engine.njooba.com/l/{session_id}/{product}  → live session item (tracked)

The live session link includes the stream session ID so the Engine can
attribute the purchase to the specific livestream that drove it.
"""

import io
import logging
import os
import time
from dataclasses import dataclass
from typing import Optional

import httpx

logger = logging.getLogger(__name__)

# ─── Config ────────────────────────────────────────────────────────────
ENGINE_API_URL = os.getenv("ENGINE_API_URL", "http://yaatal-engine:8080").rstrip("/")
ENGINE_CHECKOUT_BASE = os.getenv("ENGINE_CHECKOUT_BASE", "https://engine.njooba.com").rstrip("/")


@dataclass
class QRTarget:
    """A QR code target URL displayed on the stream."""
    url: str
    label: str  # Short text shown below QR ("Scan to buy", "Scanner pour acheter")
    product_id: Optional[str] = None
    merchant_id: Optional[str] = None
    session_id: Optional[str] = None  # Live session for attribution
    checkout: bool = False  # Direct to checkout vs. item details
    product_name: Optional[str] = None  # Fetched from Engine
    price_display: Optional[str] = None  # Fetched from Engine


class QRURLBuilder:
    """Builds deep link URLs for the Yaatal Engine marketplace.

    The Engine serves these URLs — this module just constructs them
    and generates QR codes that point to them.
    """

    def __init__(self, base_url: str = ENGINE_CHECKOUT_BASE):
        self.base_url = base_url.rstrip("/")

    def merchant_store(self, merchant_id: str) -> str:
        """URL to a merchant's store page."""
        return f"{self.base_url}/m/{merchant_id}"

    def item_details(self, product_id: str,
                     session_id: Optional[str] = None) -> str:
        """URL to a product's detail page on the marketplace.

        If session_id is provided, the URL includes live stream attribution
        so the Engine knows this visitor came from a specific livestream.
        """
        if session_id:
            return f"{self.base_url}/l/{session_id}/{product_id}"
        return f"{self.base_url}/i/{product_id}"

    def checkout(self, product_id: str,
                 session_id: Optional[str] = None) -> str:
        """URL to direct checkout for a product.

        Bypasses the detail page — goes straight to checkout.
        Useful for impulse buys during the live.
        """
        if session_id:
            return f"{self.base_url}/l/{session_id}/{product_id}?checkout=1"
        return f"{self.base_url}/c/{product_id}"

    def live_session(self, session_id: str,
                     product_id: Optional[str] = None) -> str:
        """URL to the live session page (or a specific product in it)."""
        if product_id:
            return f"{self.base_url}/l/{session_id}/{product_id}"
        return f"{self.base_url}/l/{session_id}"


class EngineProductFetcher:
    """Fetches product info from Engine for QR display labels."""

    def __init__(self, engine_api_url: str = ENGINE_API_URL):
        self.engine_api_url = engine_api_url.rstrip("/")

    async def fetch_product(self, product_id: str) -> Optional[dict]:
        """Fetch a product from Engine GET /api/catalog/:id.

        Returns the product dict or None if not found / Engine unreachable.
        """
        url = f"{self.engine_api_url}/api/catalog/{product_id}"
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                resp = await client.get(url)
                if resp.status_code == 200:
                    return resp.json()
                logger.warning("Engine product fetch %s returned %s",
                               product_id, resp.status_code)
                return None
        except Exception as e:
            logger.warning("Engine product fetch failed for %s: %s", product_id, e)
            return None


class QROverlayController:
    """Manages QR code overlays on the OBS stream.

    Generates QR codes and displays them as browser sources in OBS.
    The QR code is rendered as an HTML page that the OBS Browser Source
    loads. When the product changes, the QR URL updates.

    The actual QR rendering is done client-side in the browser source
    (using a JavaScript QR library), so no server-side image *generation*
    is needed — but `qr_overlay.html` itself must be reachable by OBS.
    Serve it with any static server (e.g. `python -m http.server 8000`
    from this directory) and pass that base as `overlay_base`, or host a
    copy anywhere OBS can reach.

    Updates go over the OBS WebSocket: changing the browser source URL
    (SetInputSettings) reloads the overlay with the new QR target.

    Product info (name, price) is fetched from the Engine API to enrich
    the QR overlay label. If Engine is unreachable, the QR still shows
    with a generic label.
    """

    def __init__(self, controller, url_builder: QRURLBuilder,
                 overlay_base: str = "http://localhost:8000",
                 product_fetcher: EngineProductFetcher = None):
        """
        Args:
            controller: LiveController instance
            url_builder: QRURLBuilder for constructing marketplace URLs
            overlay_base: Base URL where qr_overlay.html is served
            product_fetcher: EngineProductFetcher for product info (optional)
        """
        self.controller = controller
        self.url_builder = url_builder
        self.overlay_base = overlay_base.rstrip("/")
        self.product_fetcher = product_fetcher or EngineProductFetcher()
        self.current_session_id: Optional[str] = None

    def set_session_id(self, session_id: str):
        """Set the current live session ID for QR attribution."""
        self.current_session_id = session_id

    async def show_product_qr(self, product_id: str, checkout: bool = False,
                              label: str = None) -> QRTarget:
        """Display a QR code for a product on the OBS stream.

        Fetches product info from Engine for the display label.
        The QR code links to the marketplace item details (or checkout
        if checkout=True). Viewers scan → land on the Engine's product
        page → browse → checkout.

        Args:
            product_id: The product ID (Engine catalog ID)
            checkout: If True, link to direct checkout. If False, item details.
            label: Custom label text below QR (default: auto from Engine product)

        Returns:
            QRTarget with the URL and product info
        """
        # Fetch product info from Engine for label enrichment
        product = await self.product_fetcher.fetch_product(product_id)

        if checkout:
            url = self.url_builder.checkout(product_id, self.current_session_id)
            default_label = "Scanner pour acheter / Scan to buy"
        else:
            url = self.url_builder.item_details(product_id, self.current_session_id)
            default_label = "Scanner pour voir / Scan to view"

        # Enrich label with product name + price from Engine
        if product and not label:
            name = product.get("name", "")
            price = product.get("price_display", "")
            if name and price:
                default_label = f"{name} — {price}"

        label = label or default_label

        target = QRTarget(
            url=url,
            label=label,
            product_id=product_id,
            session_id=self.current_session_id,
            checkout=checkout,
            product_name=product.get("name") if product else None,
            price_display=product.get("price_display") if product else None,
        )

        # Update the QR overlay browser source in OBS
        overlay_input = "QR_Overlay"
        session = self.controller.session
        current = session.current_product if session else None
        scene_name = f"Product_{current.id}" if current else None

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
        return target

    def show_merchant_qr(self, merchant_id: str,
                         label: str = "Scanner pour visiter la boutique") -> QRTarget:
        """Display a QR code linking to the merchant's store.

        Used at the start/end of the stream to drive viewers to the
        merchant's marketplace store page.

        Args:
            merchant_id: The merchant's Engine ID
            label: Text below the QR code

        Returns:
            QRTarget with the URL
        """
        url = self.url_builder.merchant_store(merchant_id)
        target = QRTarget(url=url, label=label, merchant_id=merchant_id)

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
        return target

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
        return f"{self.overlay_base}/qr_overlay.html?{params}"


# ─── Server-side QR code generation (for standalone API / testing) ────

def generate_qr_image(url: str, size: int = 10, border: int = 2) -> bytes:
    """Generate a QR code as PNG bytes using the qrcode library.

    Args:
        url: The URL to encode in the QR code
        size: Pixel size per QR module (default 10)
        border: Border modules around QR (default 2)

    Returns:
        PNG image bytes
    """
    import qrcode

    qr = qrcode.QRCode(
        version=None,  # auto-detect
        error_correction=qrcode.constants.ERROR_CORRECT_M,
        box_size=size,
        border=border,
    )
    qr.add_data(url)
    qr.make(fit=True)

    img = qr.make_image(fill_color="black", back_color="white")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


# ─── FastAPI server (standalone QR generation API) ────────────────────

def create_qr_server(url_builder: QRURLBuilder = None,
                     product_fetcher: EngineProductFetcher = None):
    """Create a FastAPI app for QR code generation and management.

    Routes:
      GET /qr/product/{product_id}          — QR PNG for product info URL
      GET /qr/checkout/{product_id}         — QR PNG for checkout URL
      GET /qr/live/{session_id}/{product_id} — QR PNG for live session URL
      GET /qr/merchant/{merchant_id}        — QR PNG for merchant store URL
      GET /api/qr/target/{product_id}       — JSON with QR target info + product
      GET /api/qr/target/{product_id}?checkout=1 — JSON with checkout target

    Run with: uvicorn live.qr_overlay.server:app_factory --factory --port 8001
    """
    from fastapi import FastAPI, Query
    from fastapi.responses import Response, JSONResponse

    if url_builder is None:
        url_builder = QRURLBuilder()
    if product_fetcher is None:
        product_fetcher = EngineProductFetcher()

    app = FastAPI(title="Yaatal QR Overlay", version="0.2.0")

    @app.get("/qr/product/{product_id}")
    async def qr_product(product_id: str):
        """Generate QR code PNG for a product info URL (/i/:product_id)."""
        url = url_builder.item_details(product_id)
        return Response(generate_qr_image(url), media_type="image/png")

    @app.get("/qr/checkout/{product_id}")
    async def qr_checkout(product_id: str):
        """Generate QR code PNG for a checkout URL (/c/:product_id)."""
        url = url_builder.checkout(product_id)
        return Response(generate_qr_image(url), media_type="image/png")

    @app.get("/qr/live/{session_id}/{product_id}")
    async def qr_live(session_id: str, product_id: str,
                      checkout: bool = Query(False)):
        """Generate QR code PNG for a live session product URL (/l/:session/:product)."""
        if checkout:
            url = url_builder.checkout(product_id, session_id)
        else:
            url = url_builder.item_details(product_id, session_id)
        return Response(generate_qr_image(url), media_type="image/png")

    @app.get("/qr/merchant/{merchant_id}")
    async def qr_merchant(merchant_id: str):
        """Generate QR code PNG for a merchant store URL (/m/:merchant_id)."""
        url = url_builder.merchant_store(merchant_id)
        return Response(generate_qr_image(url), media_type="image/png")

    @app.get("/api/qr/target/{product_id}")
    async def qr_target_info(product_id: str,
                             checkout: bool = Query(False),
                             session_id: str = Query(None)):
        """Get QR target info as JSON, with product info from Engine.

        Returns the URL, label, and product details (name, price) from Engine.
        Falls back gracefully if Engine is unreachable.
        """
        if checkout:
            url = url_builder.checkout(product_id, session_id)
        else:
            url = url_builder.item_details(product_id, session_id)

        product = await product_fetcher.fetch_product(product_id)

        label = "Scanner pour acheter / Scan to buy" if checkout else "Scanner pour voir / Scan to view"
        if product:
            name = product.get("name", "")
            price = product.get("price_display", "")
            if name and price:
                label = f"{name} — {price}"

        return {
            "url": url,
            "label": label,
            "product_id": product_id,
            "checkout": checkout,
            "session_id": session_id,
            "product": product,
            "qr_png_url": f"/qr/{'checkout' if checkout else 'product'}/{product_id}",
        }

    @app.get("/api/qr/urls/{product_id}")
    async def qr_all_urls(product_id: str):
        """Get all Engine URL variants for a product."""
        return {
            "product_id": product_id,
            "item_details": url_builder.item_details(product_id),
            "checkout": url_builder.checkout(product_id),
            "urls": {
                "i": url_builder.item_details(product_id),
                "c": url_builder.checkout(product_id),
            },
        }

    return app


def app_factory():
    """Uvicorn factory: `uvicorn live.qr_overlay.controller:app_factory`."""
    return create_qr_server()
"""
Yaatal Live MCP Server — exposes OBS control as MCP tools.

This allows the gateway (OpenClaw fork) to control OBS livestream sessions
via MCP, the same protocol used by Voicebox and other Yaatal tools.

Tools exposed:
  - yaatal_live.start_session   — initialize a selling session with products
  - yaatal_live.go_live         — start streaming
  - yaatal_live.end_stream      — stop streaming
  - yaatal_live.switch_product  — switch to a product's scene
  - yaatal_live.update_price    — update price overlay in real-time
  - yaatal_live.mark_sold_out   — show SOLD OUT stamp
  - yaatal_live.clear_sold_out  — hide SOLD OUT stamp
  - yaatal_live.clip_moment     — save replay buffer clip
  - yaatal_live.send_caption    — push live captions to stream
  - yaatal_live.end_session     — clean up and end

NOT wired to Yaatal Engine yet — products come as dicts from the MCP caller.
When Engine wiring is added, the gateway will pull products from the Engine
catalog and pass them to start_session.
"""

import logging
from typing import Optional

from mcp.server.fastmcp import FastMCP

from live.obs_controller.controller import LiveController, Product

logger = logging.getLogger(__name__)

# Singleton controller — connects to OBS on first tool call
_controller: Optional[LiveController] = None

mcp = FastMCP(
    "yaatal-live",
    instructions=(
        "Yaatal Live — OBS control for livestream selling in West Africa. "
        "Tools manage scenes, overlays, streaming, clipping, and captions "
        "for real human sellers on camera."
    ),
)


def _get_controller(host: str = "localhost", port: int = 4455,
                    password: str = "") -> LiveController:
    global _controller
    if _controller is None:
        _controller = LiveController(host=host, port=port, password=password)
    return _controller


# ─── Session lifecycle ──────────────────────────────────────────────

@mcp.tool()
def start_session(
    seller_name: str,
    products: list[dict],
    obs_host: str = "localhost",
    obs_port: int = 4455,
    obs_password: str = "",
) -> str:
    """Initialize a livestream selling session.

    Creates OBS scenes for each product with overlays (name, price, CTA,
    sold-out stamp). Does NOT go live — call go_live() after.

    Args:
        seller_name: Name of the seller
        products: List of product dicts with keys:
            - id (str): Product identifier
            - name (str): Product name
            - price (str): Price text (e.g. "12,000 FCFA")
            - cta (str): Call to action (default: "Achetez maintenant")
            - image_path (str, optional): Path to product image
            - description (str, optional): Product description
            - stock (int, optional): Stock count
            - language (str): wolof | french | mixed
        obs_host: OBS WebSocket host
        obs_port: OBS WebSocket port
        obs_password: OBS WebSocket password

    Returns:
        Confirmation message with product count
    """
    ctrl = _get_controller(obs_host, obs_port, obs_password)
    product_objs = [
        Product(
            id=p["id"],
            name=p["name"],
            price=p["price"],
            cta=p.get("cta", "Achetez maintenant"),
            image_path=p.get("image_path"),
            description=p.get("description"),
            stock=p.get("stock"),
            language=p.get("language", "wolof"),
        )
        for p in products
    ]
    ctrl.start_session(seller_name, product_objs)
    return (f"Session started for {seller_name} with {len(product_objs)} "
            f"products. Scenes created. Call go_live() to start streaming.")


@mcp.tool()
def go_live() -> str:
    """Start streaming, recording, and replay buffer.

    Switches to Welcome scene, starts RTMP stream, starts recording,
    arms replay buffer. Make sure OBS stream settings are configured
    (RTMP key for Facebook/YouTube set in OBS profile).
    """
    ctrl = _get_controller()
    ctrl.go_live()
    return ("Live now — stream + recording + replay buffer active. "
            "If using TikTok, call start_virtual_camera() and select "
            "'OBS Virtual Camera' in TikTok Live Studio.")


@mcp.tool()
def end_stream() -> str:
    """End the livestream gracefully.

    Switches to Outro scene, stops stream, virtual camera, replay buffer,
    and recording.
    """
    ctrl = _get_controller()
    ctrl.end_stream()
    return "Stream ended."


@mcp.tool()
def end_session() -> str:
    """End the session and clean up all product scenes.

    Removes all product scenes from OBS, stops recording and replay buffer.
    Call after end_stream() for full cleanup.
    """
    ctrl = _get_controller()
    clip_count = len(ctrl.session.clips_saved) if ctrl.session else 0
    ctrl.end_session()
    return f"Session ended. {clip_count} clips saved for repurposing."


# ─── Product switching ──────────────────────────────────────────────

@mcp.tool()
def switch_product(product_id: str) -> str:
    """Switch the live scene to a product.

    Args:
        product_id: The ID of the product to switch to
    """
    ctrl = _get_controller()
    if not ctrl.session:
        return "Error: No active session. Call start_session() first."
    for i, product in enumerate(ctrl.session.products):
        if product.id == product_id:
            ctrl.session.current_product_index = i
            ctrl.switch_to_product(product)
            ctrl.mark_product_chapter(product)
            return (f"Switched to: {product.name} ({product.price}). "
                    f"Chapter marked in recording.")
    return f"Error: Product {product_id} not found in session."


# ─── Dynamic overlays ───────────────────────────────────────────────

@mcp.tool()
def update_price(product_id: str, new_price: str) -> str:
    """Update the price overlay for a product in real-time.

    The seller says a price, STT parses it, and this updates the on-screen
    price without leaving the camera frame.

    Args:
        product_id: The product ID
        new_price: New price text (e.g. "15,000 FCFA")
    """
    ctrl = _get_controller()
    if not ctrl.session:
        return "Error: No active session."
    for product in ctrl.session.products:
        if product.id == product_id:
            ctrl.update_price(product, new_price)
            return f"Price updated: {product.name} → {new_price}"
    return f"Error: Product {product_id} not found."


@mcp.tool()
def update_cta(product_id: str, new_cta: str) -> str:
    """Update the call-to-action overlay for a product.

    Args:
        product_id: The product ID
        new_cta: New CTA text (e.g. "Last 5 in stock!")
    """
    ctrl = _get_controller()
    if not ctrl.session:
        return "Error: No active session."
    for product in ctrl.session.products:
        if product.id == product_id:
            ctrl.update_cta(product, new_cta)
            return f"CTA updated: {product.name} → {new_cta}"
    return f"Error: Product {product_id} not found."


@mcp.tool()
def mark_sold_out(product_id: str) -> str:
    """Show the SOLD OUT stamp for a product and clip the moment.

    Stamps "VENDU / SOLD OUT" on screen and saves a replay buffer clip
    for content repurposing (Reels/TikTok).

    Args:
        product_id: The product ID
    """
    ctrl = _get_controller()
    if not ctrl.session:
        return "Error: No active session."
    for product in ctrl.session.products:
        if product.id == product_id:
            ctrl.mark_sold_out(product)
            clip_path = ctrl.clip_moment()
            return (f"Sold out: {product.name}. Moment clipped: {clip_path}. "
                    f"Send clip to video pipeline for Reels.")
    return f"Error: Product {product_id} not found."


@mcp.tool()
def clear_sold_out(product_id: str) -> str:
    """Hide the SOLD OUT stamp (before showing next product).

    Args:
        product_id: The product ID
    """
    ctrl = _get_controller()
    if not ctrl.session:
        return "Error: No active session."
    for product in ctrl.session.products:
        if product.id == product_id:
            ctrl.clear_sold_out(product)
            return f"Cleared sold out: {product.name}"
    return f"Error: Product {product_id} not found."


# ─── Clipping ───────────────────────────────────────────────────────

@mcp.tool()
def clip_moment() -> str:
    """Save a replay buffer clip of the last few seconds.

    Use this for any moment worth repurposing — not just sold-outs.
    The clip can be sent to MoneyPrinterTurbo for Reels/TikTok generation.
    """
    ctrl = _get_controller()
    clip_path = ctrl.clip_moment()
    return f"Moment clipped: {clip_path}"


# ─── Captions ───────────────────────────────────────────────────────

@mcp.tool()
def send_caption(text: str) -> str:
    """Send live caption text to the stream.

    This is how Voicebox STT output reaches viewers. The gateway transcribes
    the seller's speech (Wolof/French) via Voicebox, then calls this to
    push captions.

    Note: CEA-608 captions work on RTMP targets (YouTube, Facebook).
    TikTok Live Studio via Virtual Camera may not display captions.

    Args:
        text: Caption text (Wolof or French)
    """
    ctrl = _get_controller()
    ctrl.send_caption(text)
    return f"Caption sent: {text}"


# ─── Virtual camera (TikTok bridge) ─────────────────────────────────

@mcp.tool()
def start_virtual_camera() -> str:
    """Start OBS Virtual Camera for TikTok Live Studio bridge.

    After calling this, the seller opens TikTok Live Studio and selects
    'OBS Virtual Camera' as their camera source. The OBS composite
    (camera + overlays + product images) appears on TikTok.
    """
    ctrl = _get_controller()
    ctrl.start_virtual_camera()
    return ("Virtual camera started. Open TikTok Live Studio → "
            "Settings → Camera → select 'OBS Virtual Camera'.")


@mcp.tool()
def stop_virtual_camera() -> str:
    """Stop the OBS Virtual Camera."""
    ctrl = _get_controller()
    ctrl.stop_virtual_camera()
    return "Virtual camera stopped."


# ─── Audio ──────────────────────────────────────────────────────────

@mcp.tool()
def duck_music(source_name: str = "background_music") -> str:
    """Lower background music volume (when seller is speaking).

    Args:
        source_name: Name of the background music source in OBS
    """
    ctrl = _get_controller()
    ctrl.duck_background_music(source_name)
    return f"Background music ducked: {source_name}"


@mcp.tool()
def restore_music(source_name: str = "background_music") -> str:
    """Restore background music volume.

    Args:
        source_name: Name of the background music source in OBS
    """
    ctrl = _get_controller()
    ctrl.restore_background_music(source_name)
    return f"Background music restored: {source_name}"


if __name__ == "__main__":
    mcp.run(transport="stdio")
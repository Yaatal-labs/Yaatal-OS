"""
Yaatal NFC Viewer — tap-to-buy for livestream viewers.

Each product shipped to a customer includes an NFC card. When the
customer taps the card with their phone, it opens a web page that:
  1. Identifies the product (via NFC URL with product ID)
  2. Shows the product that was being sold during the live stream
  3. Lets them buy it (links to the Yaatal Engine checkout)

This is the arbitrage engine's NFC "salt" applied to live commerce:
  - During the live: seller taps product card → scene loads
  - After the live: viewer taps their product card → re-order / discover
  - The NFC card bridges the physical product to the digital storefront

Wired to the Yaatal Engine commerce API:
  - Products fetched from Engine GET /api/catalog (cached for offline fallback)
  - Checkout redirects to Engine: https://engine.njooba.com/c/{product_id}
  - If Engine is unreachable, falls back to cached products or shows error

NFC URL format:
  https://yaatal.shop/p/{product_id}
  or
  https://yaatal.shop/nfc/{nfc_uid}

The NFC tag is written with this URL. Most phones automatically open
it when tapped (NDEF URI record).
"""

import json
import logging
import os
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

import httpx

logger = logging.getLogger(__name__)

# ─── Config ────────────────────────────────────────────────────────────
ENGINE_API_URL = os.getenv("ENGINE_API_URL", "http://yaatal-engine:8080").rstrip("/")
ENGINE_CHECKOUT_BASE = os.getenv("ENGINE_CHECKOUT_BASE", "https://engine.njooba.com").rstrip("/")
CATALOG_CACHE_TTL = int(os.getenv("CATALOG_CACHE_TTL", "300"))  # 5 min
CATALOG_CACHE_PATH = os.getenv(
    "CATALOG_CACHE_PATH",
    str(Path(__file__).parent / "catalog_cache.json"),
)


@dataclass
class ViewerProduct:
    """A product as shown to viewers via NFC tap."""
    id: str
    name: str
    price: str  # price_display from Engine (e.g. "15 000 FCFA")
    description: str = ""
    image_url: str = ""
    stream_session_id: Optional[str] = None
    seller_name: str = ""
    whatsapp_number: str = ""
    in_stock: bool = True
    restock_notification: bool = False
    # Engine-specific fields
    price_cents: int = 0
    stock_status: str = "in_stock"
    category: str = ""
    images: list = field(default_factory=list)


class EngineCatalog:
    """Product catalog backed by the Yaatal Engine API.

    Fetches products from Engine GET /api/catalog and caches them locally
    for offline fallback. Refreshes every CATALOG_CACHE_TTL seconds (default 5 min).
    """

    def __init__(self, engine_api_url: str = ENGINE_API_URL,
                 cache_path: str = CATALOG_CACHE_PATH,
                 cache_ttl: int = CATALOG_CACHE_TTL):
        self.engine_api_url = engine_api_url.rstrip("/")
        self.cache_path = Path(cache_path)
        self.cache_ttl = cache_ttl
        self._products: dict[str, ViewerProduct] = {}
        self._last_fetch: float = 0.0
        self._load_cache()

    def _load_cache(self):
        """Load cached products from local file (for offline fallback)."""
        if self.cache_path.exists():
            try:
                data = json.loads(self.cache_path.read_text())
                self._products = {
                    pid: ViewerProduct(**pdata)
                    for pid, pdata in data.items()
                }
                logger.info("Loaded %d products from cache %s",
                            len(self._products), self.cache_path)
            except Exception as e:
                logger.warning("Failed to load catalog cache: %s", e)

    def _save_cache(self):
        """Save current products to local cache file."""
        data = {
            pid: {
                "id": p.id,
                "name": p.name,
                "price": p.price,
                "description": p.description,
                "image_url": p.image_url,
                "stream_session_id": p.stream_session_id,
                "seller_name": p.seller_name,
                "whatsapp_number": p.whatsapp_number,
                "in_stock": p.in_stock,
                "price_cents": p.price_cents,
                "stock_status": p.stock_status,
                "category": p.category,
                "images": p.images,
            }
            for pid, p in self._products.items()
        }
        try:
            self.cache_path.write_text(json.dumps(data, indent=2))
        except Exception as e:
            logger.warning("Failed to save catalog cache: %s", e)

    def _parse_engine_product(self, ep: dict) -> ViewerProduct:
        """Convert an Engine catalog product response to ViewerProduct."""
        images = ep.get("images", [])
        image_url = images[0] if images else ""
        stock_status = ep.get("stock_status", "in_stock")
        in_stock = stock_status != "out_of_stock"
        return ViewerProduct(
            id=ep.get("id", ""),
            name=ep.get("name", ""),
            price=ep.get("price_display", ""),
            description=ep.get("description") or "",
            image_url=image_url,
            in_stock=in_stock,
            price_cents=ep.get("price_cents", 0),
            stock_status=stock_status,
            category=ep.get("category", ""),
            images=images,
        )

    async def refresh(self) -> bool:
        """Fetch fresh products from Engine GET /api/catalog.

        Returns True if refresh succeeded, False if Engine unreachable
        (cached products remain available as fallback).
        """
        url = f"{self.engine_api_url}/api/catalog"
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                resp = await client.get(url, params={"per_page": 100})
                resp.raise_for_status()
                data = resp.json()
                products = data.get("products", [])
                self._products = {
                    p["id"]: self._parse_engine_product(p)
                    for p in products
                    if p.get("id")
                }
                self._last_fetch = time.time()
                self._save_cache()
                logger.info("Fetched %d products from Engine catalog", len(self._products))
                return True
        except Exception as e:
            logger.warning("Engine catalog fetch failed, using cache: %s", e)
            return False

    async def ensure_fresh(self):
        """Refresh from Engine if cache is stale, or return cached data."""
        if time.time() - self._last_fetch > self.cache_ttl:
            await self.refresh()

    def get_product(self, product_id: str) -> Optional[ViewerProduct]:
        return self._products.get(product_id)

    async def get_product_fresh(self, product_id: str) -> Optional[ViewerProduct]:
        """Get a product, trying Engine first, falling back to cache."""
        # Try single-product fetch from Engine for freshest data
        url = f"{self.engine_api_url}/api/catalog/{product_id}"
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                resp = await client.get(url)
                if resp.status_code == 200:
                    return self._parse_engine_product(resp.json())
        except Exception as e:
            logger.warning("Engine single-product fetch failed, using cache: %s", e)
        # Fallback to cache
        return self.get_product(product_id)

    @property
    def products(self) -> dict[str, ViewerProduct]:
        return self._products

    def mark_sold_out(self, product_id: str):
        if product_id in self._products:
            self._products[product_id].in_stock = False
            self._products[product_id].stock_status = "out_of_stock"
            self._save_cache()
            logger.info("Marked sold out in viewer catalog: %s", product_id)


# Backward-compatible alias
ProductCatalog = EngineCatalog


# ─── NFC URL writer (for programming tags) ──────────────────────────

NFC_URL_TEMPLATE = "https://yaatal.shop/p/{product_id}"


def generate_nfc_url(product_id: str) -> str:
    """Generate the URL to write to an NFC tag for a product."""
    return NFC_URL_TEMPLATE.format(product_id=product_id)


def generate_nfc_urls_for_catalog(catalog: EngineCatalog) -> dict[str, str]:
    """Generate NFC URLs for all products in the catalog.

    Returns a dict of product_id → URL.
    """
    return {
        pid: generate_nfc_url(pid)
        for pid in catalog.products
    }


# ─── Engine checkout URL ─────────────────────────────────────────────

def engine_checkout_url(product_id: str,
                        base: str = ENGINE_CHECKOUT_BASE) -> str:
    """Build the Engine checkout URL for a product."""
    return f"{base}/c/{product_id}"


def engine_product_url(product_id: str,
                       base: str = ENGINE_CHECKOUT_BASE) -> str:
    """Build the Engine product info URL for a product."""
    return f"{base}/i/{product_id}"


# ─── HTML page generator ────────────────────────────────────────────

def generate_product_page(product: ViewerProduct,
                          checkout_base: str = ENGINE_CHECKOUT_BASE) -> str:
    """Generate an HTML page for a product (served when viewer taps NFC card).

    Mobile-first page optimized for the tap-to-buy flow.
    The viewer taps the card → phone opens this page → they see the product
    and can buy via the Engine checkout.
    """
    checkout = engine_checkout_url(product.id, checkout_base)

    stock_html = ""
    if not product.in_stock:
        stock_html = """
        <div class="sold-out-banner">
          <strong>Vendu / Sold Out</strong><br>
          <small>Tap below to be notified when it's back</small><br>
          <button class="restock-btn" onclick="requestRestock()">
            Notify me when back in stock
          </button>
        </div>
        """
    else:
        stock_html = f"""
        <div class="buy-section">
          <a href="{checkout}"
             class="buy-btn checkout-btn">
            🛒 Acheter maintenant / Buy now
          </a>
        </div>
        """

    image_html = f'<img class="product-image" src="{product.image_url}" alt="{product.name}">' if product.image_url else ""
    desc_html = f'<div class="product-description">{product.description}</div>' if product.description else ""

    return f"""<!DOCTYPE html>
<html lang="wo">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{product.name} — Yaatal</title>
    <style>
        * {{ margin: 0; padding: 0; box-sizing: border-box; }}
        body {{
            font-family: -apple-system, 'Segoe UI', Arial, sans-serif;
            background: #f5f5f5;
            color: #1a1a1a;
            padding: 20px;
            max-width: 500px;
            margin: 0 auto;
        }}
        .product-card {{
            background: white;
            border-radius: 16px;
            overflow: hidden;
            box-shadow: 0 2px 12px rgba(0,0,0,0.1);
            margin-top: 20px;
        }}
        .product-image {{
            width: 100%;
            aspect-ratio: 1;
            object-fit: cover;
            background: #eee;
            display: block;
        }}
        .product-info {{
            padding: 24px;
        }}
        .product-name {{
            font-size: 24px;
            font-weight: 700;
            margin-bottom: 8px;
        }}
        .product-price {{
            font-size: 28px;
            font-weight: 800;
            color: #c62828;
            margin-bottom: 16px;
        }}
        .product-description {{
            font-size: 15px;
            color: #666;
            line-height: 1.5;
            margin-bottom: 24px;
        }}
        .buy-section {{
            display: flex;
            flex-direction: column;
            gap: 12px;
        }}
        .buy-btn {{
            display: block;
            text-align: center;
            padding: 16px;
            border-radius: 12px;
            text-decoration: none;
            font-size: 16px;
            font-weight: 600;
            transition: transform 0.1s;
        }}
        .buy-btn:active {{ transform: scale(0.98); }}
        .checkout-btn {{
            background: #c62828;
            color: white;
        }}
        .sold-out-banner {{
            background: #fff3e0;
            border: 2px solid #ff9800;
            border-radius: 12px;
            padding: 20px;
            text-align: center;
        }}
        .sold-out-banner strong {{
            font-size: 22px;
            color: #e65100;
        }}
        .restock-btn {{
            background: #ff9800;
            color: white;
            border: none;
            padding: 12px 24px;
            border-radius: 8px;
            font-size: 14px;
            font-weight: 600;
            margin-top: 12px;
            cursor: pointer;
        }}
        .stream-badge {{
            display: inline-block;
            background: #e91e63;
            color: white;
            font-size: 11px;
            padding: 4px 10px;
            border-radius: 20px;
            margin-bottom: 12px;
        }}
    </style>
</head>
<body>
    <div class="product-card">
        {image_html}
        <div class="product-info">
            {f'<span class="stream-badge">🔴 Vu en direct / Live</span>' if product.stream_session_id else ''}
            <div class="product-name">{product.name}</div>
            <div class="product-price">{product.price}</div>
            {desc_html}
            {stock_html}
        </div>
    </div>
    <script>
        function requestRestock() {{
            alert('Nous vous préviendrons quand ce produit sera de nouveau disponible!');
        }}
    </script>
</body>
</html>"""


def _catalog_unavailable_page() -> str:
    """Generate a 'catalog unavailable' error page."""
    return """<!DOCTYPE html>
<html lang="wo">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Catalogue indisponible — Yaatal</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, 'Segoe UI', Arial, sans-serif;
            background: #f5f5f5; color: #1a1a1a;
            padding: 20px; max-width: 500px; margin: 0 auto;
        }
        .error-card {
            background: white; border-radius: 16px;
            padding: 32px 24px; text-align: center;
            box-shadow: 0 2px 12px rgba(0,0,0,0.1); margin-top: 40px;
        }
        .error-icon {
            width: 80px; height: 80px; border-radius: 50%;
            background: #ff9800; margin: 0 auto 20px;
            display: flex; align-items: center; justify-content: center;
            font-size: 40px; color: white;
        }
        .error-title { font-size: 22px; font-weight: 700; margin-bottom: 8px; }
        .error-subtitle { font-size: 14px; color: #666; line-height: 1.4; }
    </style>
</head>
<body>
    <div class="error-card">
        <div class="error-icon">⚠</div>
        <div class="error-title">Catalogue indisponible</div>
        <div class="error-subtitle">
            Le catalogue de produits est temporairement indisponible.<br>
            Veuillez réessayer plus tard.
        </div>
    </div>
</body>
</html>"""


# ─── FastAPI server (for serving NFC tap pages) ─────────────────────

def create_server(catalog: Optional[EngineCatalog] = None,
                  checkout_base: str = ENGINE_CHECKOUT_BASE):
    """Create a FastAPI app that serves NFC tap product pages.

    Routes:
      GET /p/{product_id}        — Product page (viewer taps NFC card)
      GET /nfc/{nfc_uid}         — Product page by NFC UID
      GET /api/products          — JSON product list (from Engine or cache)
      GET /api/catalog/refresh   — Force refresh from Engine
      POST /api/restock/{id}     — Request restock notification (placeholder)

    Run with: uvicorn live.nfc_viewer.server:app_factory --factory --port 8000
    """
    from fastapi import FastAPI, HTTPException
    from fastapi.responses import HTMLResponse, RedirectResponse, JSONResponse

    if catalog is None:
        catalog = EngineCatalog()

    app = FastAPI(title="Yaatal NFC Viewer", version="0.2.0")

    @app.get("/p/{product_id}", response_class=HTMLResponse)
    async def product_page(product_id: str):
        """Product page served when a viewer taps an NFC card.

        Fetches product from Engine (with cache fallback).
        Redirects to Engine checkout if product is in stock.
        """
        # Ensure catalog is fresh before lookup
        await catalog.ensure_fresh()

        # Try to get product — Engine first, cache fallback
        product = await catalog.get_product_fresh(product_id)
        if not product:
            raise HTTPException(status_code=404, detail="Product not found")
        return generate_product_page(product, checkout_base)

    @app.get("/buy/{product_id}")
    async def buy_redirect(product_id: str):
        """Direct redirect to Engine checkout (for NFC tags that skip the page)."""
        await catalog.ensure_fresh()
        product = await catalog.get_product_fresh(product_id)
        if not product:
            raise HTTPException(status_code=404, detail="Product not found")
        return RedirectResponse(
            url=engine_checkout_url(product_id, checkout_base),
            status_code=302,
        )

    @app.get("/nfc/{nfc_uid}", response_class=HTMLResponse)
    async def nfc_uid_page(nfc_uid: str):
        """Product page by NFC UID (alternative URL format).

        Some NFC tags are written with a UID-based URL instead of
        product ID. This looks up the product by UID mapping.
        """
        # TODO: When Engine is wired, look up product by NFC UID
        raise HTTPException(status_code=501,
                            detail="UID lookup not yet implemented — use /p/{product_id}")

    @app.get("/api/products")
    async def list_products():
        """List all products in the catalog (JSON API).

        Tries Engine first, falls back to cache.
        """
        await catalog.ensure_fresh()
        if not catalog.products:
            return JSONResponse(
                {"error": "catalog_unavailable", "products": {}},
                status_code=503,
            )
        return {
            pid: {
                "name": p.name,
                "price": p.price,
                "price_cents": p.price_cents,
                "in_stock": p.in_stock,
                "stock_status": p.stock_status,
                "category": p.category,
                "image_url": p.image_url,
                "checkout_url": engine_checkout_url(pid, checkout_base),
            }
            for pid, p in catalog.products.items()
        }

    @app.post("/api/catalog/refresh")
    async def refresh_catalog():
        """Force a refresh from Engine GET /api/catalog."""
        success = await catalog.refresh()
        return {
            "refreshed": success,
            "product_count": len(catalog.products),
        }

    @app.get("/api/catalog/health")
    async def catalog_health():
        """Check if the catalog has products (from Engine or cache)."""
        return {
            "product_count": len(catalog.products),
            "last_fetch": catalog._last_fetch,
            "cache_age_seconds": time.time() - catalog._last_fetch if catalog._last_fetch else None,
        }

    @app.post("/api/restock/{product_id}")
    async def request_restock(product_id: str):
        """Request a restock notification (placeholder)."""
        product = catalog.get_product(product_id)
        if not product:
            raise HTTPException(status_code=404, detail="Product not found")
        return {"status": "registered", "product": product_id}

    @app.post("/api/sold-out/{product_id}")
    async def mark_sold_out(product_id: str):
        """Mark a product as sold out (called by the live controller)."""
        catalog.mark_sold_out(product_id)
        return {"status": "sold_out", "product": product_id}

    return app


def app_factory():
    """Uvicorn factory: `uvicorn live.nfc_viewer.server:app_factory`."""
    return create_server(EngineCatalog())
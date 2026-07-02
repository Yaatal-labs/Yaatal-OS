"""
Yaatal NFC Viewer — tap-to-buy for livestream viewers.

Each product shipped to a customer includes an NFC card. When the
customer taps the card with their phone, it opens a web page that:
  1. Identifies the product (via NFC URL with product ID)
  2. Shows the product that was being sold during the live stream
  3. Lets them buy it (links to the Yaatal Engine commerce backend)

This is the arbitrage engine's NFC "salt" applied to live commerce:
  - During the live: seller taps product card → scene loads
  - After the live: viewer taps their product card → re-order / discover
  - The NFC card bridges the physical product to the digital storefront

The web server is a lightweight FastAPI app that serves product pages
and redirects to the Yaatal Engine checkout. NOT wired to the Engine
yet — product data comes from a local JSON file. Engine integration
will pull live product data from the Engine's commerce API.

NFC URL format:
  https://yaatal.shop/p/{product_id}
  or
  https://yaatal.shop/nfc/{nfc_uid}

The NFC tag is written with this URL. Most phones automatically open
it when tapped (NDEF URI record).
"""

import json
import logging
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)


@dataclass
class ViewerProduct:
    """A product as shown to viewers via NFC tap."""
    id: str
    name: str
    price: str
    description: str = ""
    image_url: str = ""
    stream_session_id: Optional[str] = None  # Which live session it was sold on
    seller_name: str = ""
    whatsapp_number: str = ""  # Direct contact for the seller
    in_stock: bool = True
    restock_notification: bool = False  # Can viewers request restock alerts?


class ProductCatalog:
    """Product catalog for NFC viewer pages.

    In production, this pulls from the Yaatal Engine commerce API.
    For now, it's a local JSON file.
    """

    def __init__(self, catalog_path: str = "viewer_products.json"):
        self.catalog_path = Path(catalog_path)
        self.products: dict[str, ViewerProduct] = {}
        self.load()

    def load(self):
        if self.catalog_path.exists():
            data = json.loads(self.catalog_path.read_text())
            self.products = {
                pid: ViewerProduct(**pdata)
                for pid, pdata in data.items()
            }
            logger.info("Loaded %d products from %s",
                        len(self.products), self.catalog_path)

    def save(self):
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
            }
            for pid, p in self.products.items()
        }
        self.catalog_path.write_text(json.dumps(data, indent=2))

    def get_product(self, product_id: str) -> Optional[ViewerProduct]:
        return self.products.get(product_id)

    def add_product(self, product: ViewerProduct):
        self.products[product.id] = product
        self.save()

    def mark_sold_out(self, product_id: str):
        if product_id in self.products:
            self.products[product_id].in_stock = False
            self.save()
            logger.info("Marked sold out in viewer catalog: %s", product_id)


# ─── NFC URL writer (for programming tags) ──────────────────────────

NFC_URL_TEMPLATE = "https://yaatal.shop/p/{product_id}"


def generate_nfc_url(product_id: str) -> str:
    """Generate the URL to write to an NFC tag for a product."""
    return NFC_URL_TEMPLATE.format(product_id=product_id)


def generate_nfc_urls_for_catalog(catalog: ProductCatalog) -> dict[str, str]:
    """Generate NFC URLs for all products in the catalog.

    Returns a dict of product_id → URL. The seller uses these to
    program NFC tags (via an NFC writer app on their phone, or
    the nfcpy library on the streaming machine).
    """
    return {
        pid: generate_nfc_url(pid)
        for pid in catalog.products
    }


# ─── HTML page generator ────────────────────────────────────────────

def generate_product_page(product: ViewerProduct,
                          base_url: str = "https://yaatal.shop") -> str:
    """Generate an HTML page for a product (served when viewer taps NFC card).

    This is a simple, mobile-first page optimized for the tap-to-buy flow.
    The viewer taps the card → phone opens this page → they see the product
    and can buy via WhatsApp or the Yaatal checkout.
    """
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
          <a href="https://wa.me/{product.whatsapp_number.replace('+','').replace(' ','')}"
             class="buy-btn whatsapp-btn">
            📱 Commander sur WhatsApp
          </a>
          <a href="{base_url}/checkout/{product.id}"
             class="buy-btn checkout-btn">
            🛒 Acheter maintenant
          </a>
        </div>
        """

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
        .seller-info {{
            font-size: 13px;
            color: #999;
            margin-bottom: 20px;
            padding-top: 16px;
            border-top: 1px solid #eee;
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
        .whatsapp-btn {{
            background: #25D366;
            color: white;
        }}
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
        {f'<img class="product-image" src="{product.image_url}" alt="{product.name}">' if product.image_url else ''}
        <div class="product-info">
            {f'<span class="stream-badge">🔴 Vu en direct / Live</span>' if product.stream_session_id else ''}
            <div class="product-name">{product.name}</div>
            <div class="product-price">{product.price}</div>
            <div class="product-description">{product.description}</div>
            {stock_html}
            <div class="seller-info">
                Vendu par {product.seller_name}<br>
                <a href="https://wa.me/{product.whatsapp_number.replace('+','').replace(' ','')}"
                   style="color: #25D366; text-decoration: none;">
                   WhatsApp: {product.whatsapp_number}
                </a>
            </div>
        </div>
    </div>
    <script>
        function requestRestock() {{
            // TODO: Wire to Yaatal Engine restock notification API
            alert('Nous vous préviendrons quand ce produit sera de nouveau disponible!');
        }}
    </script>
</body>
</html>"""


# ─── FastAPI server (for serving NFC tap pages) ─────────────────────

def create_server(catalog: ProductCatalog,
                  base_url: str = "https://yaatal.shop"):
    """Create a FastAPI app that serves NFC tap product pages.

    Routes:
      GET /p/{product_id}        — Product page (viewer taps NFC card)
      GET /nfc/{nfc_uid}         — Product page by NFC UID
      GET /api/products          — JSON product list
      POST /api/restock/{id}     — Request restock notification (placeholder)

    Run with: uvicorn nfc_viewer.server:create_server() --factory --port 8000
    """
    from fastapi import FastAPI, HTTPException
    from fastapi.responses import HTMLResponse

    app = FastAPI(title="Yaatal NFC Viewer", version="0.1.0")

    @app.get("/p/{product_id}", response_class=HTMLResponse)
    async def product_page(product_id: str):
        """Product page served when a viewer taps an NFC card."""
        product = catalog.get_product(product_id)
        if not product:
            raise HTTPException(status_code=404, detail="Product not found")
        return generate_product_page(product, base_url)

    @app.get("/nfc/{nfc_uid}", response_class=HTMLResponse)
    async def nfc_uid_page(nfc_uid: str):
        """Product page by NFC UID (alternative URL format).

        Some NFC tags are written with a UID-based URL instead of
        product ID. This looks up the product by UID mapping.
        """
        # TODO: When Engine is wired, look up product by NFC UID
        # For now, this is a placeholder
        raise HTTPException(status_code=501,
                            detail="UID lookup not yet implemented — use /p/{product_id}")

    @app.get("/api/products")
    async def list_products():
        """List all products in the catalog (JSON API)."""
        return {
            pid: {
                "name": p.name,
                "price": p.price,
                "in_stock": p.in_stock,
                "seller": p.seller_name,
            }
            for pid, p in catalog.products.items()
        }

    @app.post("/api/restock/{product_id}")
    async def request_restock(product_id: str):
        """Request a restock notification (placeholder).

        When Engine is wired, this creates a notification record in
        the Engine's database and triggers an alert when the product
        is back in stock.
        """
        product = catalog.get_product(product_id)
        if not product:
            raise HTTPException(status_code=404, detail="Product not found")
        # TODO: Wire to Yaatal Engine restock notification system
        return {"status": "registered", "product": product_id}

    @app.post("/api/sold-out/{product_id}")
    async def mark_sold_out(product_id: str):
        """Mark a product as sold out (called by the live controller).

        When a product sells out on stream, the agent loop or NFC
        controller calls this to update the viewer catalog. Viewers
        who tap the NFC card after this will see "Sold Out" + restock.
        """
        catalog.mark_sold_out(product_id)
        return {"status": "sold_out", "product": product_id}

    return app
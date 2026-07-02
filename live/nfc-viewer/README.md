# Yaatal NFC Viewer

Tap-to-buy for livestream viewers — the arbitrage engine's NFC "salt"
applied to live commerce.

## The flow

```
During live stream:
  Seller taps product NFC card → OBS scene loads → product shown on stream
  Seller sells the product → taps SOLD card → marked sold out + clipped

After the live (the salt):
  Product ships with an NFC card/sticker
  Customer taps card with phone → opens https://yaatal.shop/p/{product_id}
  → Sees the product page (same product from the stream)
  → Buys via WhatsApp or Yaatal checkout
  → If sold out → requests restock notification

The NFC card bridges the physical product to the digital storefront.
Repeat purchases, restock alerts, and brand recall — all from a tap.
```

## What this module does

| Component | Role |
|---|---|
| `ProductCatalog` | Product data (local JSON now, Yaatal Engine API later) |
| `generate_nfc_url()` | Creates the URL to write to NFC tags |
| `generate_product_page()` | Mobile-first HTML page for tap-to-buy |
| `create_server()` | FastAPI app serving product pages + API |

## NFC tag programming

Each NFC tag is written with an NDEF URI record:
```
https://yaatal.shop/p/{product_id}
```

When a customer taps the tag with their phone, the phone auto-opens
this URL. No app required — works on both Android and iOS.

```python
from live.nfc_viewer import generate_nfc_urls_for_catalog, ProductCatalog

catalog = ProductCatalog("viewer_products.json")
urls = generate_nfc_urls_for_catalog(catalog)

for product_id, url in urls.items():
    print(f"Product {product_id}: {url}")
    # Write this URL to an NFC tag using:
    #   - An NFC writer app on the seller's phone (easiest)
    #   - The nfcpy library on the streaming machine
    #   - An NFC programming device
```

## Running the server

```bash
pip install -r requirements.txt
uvicorn live.nfc_viewer.server:create_server --factory --port 8000
```

## Routes

| Route | Description |
|---|---|
| `GET /p/{product_id}` | Product page (viewer taps NFC card → phone opens this) |
| `GET /nfc/{nfc_uid}` | Product page by NFC UID (alternative format) |
| `GET /api/products` | JSON product list |
| `POST /api/restock/{product_id}` | Request restock notification |
| `POST /api/sold-out/{product_id}` | Mark sold out (called by live controller) |

## Integration with live stream

When a product sells out on the live stream:
1. Seller taps SOLD card → `NFCTapHandler._on_sold_card()`
2. `LiveController.mark_sold_out()` → stamps on OBS
3. **Also calls**: `POST /api/sold-out/{product_id}` on the viewer server
4. Viewer catalog updates → next person who taps the NFC card sees "Sold Out"

## Integration with Yaatal Engine (planned)

| Current | With Engine |
|---|---|
| `ProductCatalog` loads from JSON | Pulls from Engine commerce API |
| `POST /api/restock` placeholder | Creates notification in Engine DB |
| `POST /api/sold-out` updates local JSON | Updates Engine inventory + triggers restock flow |
| WhatsApp link static | Dynamic per-seller from Engine |
| Checkout URL placeholder | Real Engine checkout flow |

## License

© Yaatal Labs. Proprietary.
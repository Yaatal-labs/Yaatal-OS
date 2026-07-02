# Yaatal QR Overlay

QR codes displayed on the OBS livestream that link viewers to the
Yaatal Engine marketplace for purchasing.

## The flow

```
During livestream:
  Seller shows product → QR code appears on screen (bottom corner)
  Viewer opens phone camera → scans QR
  → Deep link opens: https://yaatal.shop/l/{session}/{product}
  → Lands on marketplace item details (served by Yaatal Engine)
  → Browses → adds to cart → checkout (Engine handles the commerce)
  → Engine attributes purchase to the livestream session

The QR overlay only generates QR codes. The Engine does all the commerce:
  - Product pages
  - Cart
  - Checkout
  - Order management
  - Payment processing
  - Delivery tracking
```

## Deep link structure

| URL | Destination | When to use |
|---|---|---|
| `yaatal.shop/m/{merchant_id}` | Merchant store page | Start/end of stream |
| `yaatal.shop/i/{product_id}` | Item details | During product showcase |
| `yaatal.shop/c/{product_id}` | Direct checkout | Impulse buy moment |
| `yaatal.shop/l/{session_id}/{product_id}` | Live session item (attributed) | During stream — tracks that the sale came from the live |

The `/l/{session_id}/` prefix lets the Engine attribute purchases to
specific livestream sessions — so you can measure which streams drive
the most sales.

## Usage

```python
from live.obs_controller.controller import LiveController, Product
from live.qr_overlay import QROverlayController, QRURLBuilder

controller = LiveController(host="localhost", port=4455)
url_builder = QRURLBuilder(base_url="https://yaatal.shop")
qr = QROverlayController(controller, url_builder)

# Set the current live session ID for attribution
qr.set_session_id("session_2026_07_02_001")

# Start of stream — show merchant store QR
qr.show_merchant_qr("merchant_diop_001")

# During product showcase — show item details QR
qr.show_product_qr("product_001")  # → yaatal.shop/l/session.../product_001

# Impulse buy moment — show direct checkout QR
qr.show_product_qr("product_001", checkout=True)  # → checkout page

# Hide QR when switching products
qr.hide_qr()
```

## Overlay HTML

`qr_overlay.html` is an OBS Browser Source that:
- Reads URL params (`?url=...&label=...`) to know what to encode
- Renders the QR code client-side (no server-side image generation)
- Uses `qrcode-generator` JS library (CDN, ~12KB)
- Shows a label below the QR ("Scanner pour acheter")
- Shows the short URL as a sublabel
- Animated pulse hint: "Ouvrez votre caméra"

## OBS setup

Add a Browser Source in OBS:
- URL: `http://localhost:8000/qr_overlay.html?url=https://yaatal.shop&label=Scan`
- Width: 300, Height: 380
- Place in bottom-right corner of each product scene

The `QROverlayController` updates this source dynamically via WebSocket
when products change — no manual QR updating needed.
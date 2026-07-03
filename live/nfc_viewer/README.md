# ⚠️ Deprecated — replaced by `nfc_delivery/`

This module was the original NFC tap-to-buy concept. It has been
replaced by `live/nfc_delivery/` which implements the correct architecture:

- **NFC = delivery confirmation** for the Yaatal Engine (not product pages)
- **Livestream sales = QR codes** on OBS → deep links → Engine marketplace

The hybrid flow is:
  - **Merchant proposes**: packs order, includes NFC delivery tag
  - **Model executes**: customer taps NFC on delivery → confirmation
  - **Engine disposes**: confirms delivery, closes order, releases payment

See:
- `live/nfc_delivery/` — delivery confirmation bridge
- `live/qr_overlay/` — QR codes on stream linking to Engine marketplace

This directory is kept for reference but will be removed in a future commit.
# Yaatal — Next Work TODO

> Updated July 22, 2026. Prioritized by what unblocks the most.

## Just Completed

- [x] Studio → Engine: agent loop (intents → product updates)
- [x] Studio → Engine: OBS controller (fetch product from Engine for overlays)
- [x] Studio → Engine: live sessions (go-live, stop-stream, product-queue endpoints)
- [x] Studio → Engine: NFC delivery (POST confirm-by-code to Engine)
- [x] Studio → Engine: NFC viewer (fetch /api/catalog, redirect to Engine checkout)
- [x] Studio → Engine: QR overlay (Engine product URLs in QR codes)
- [x] Studio dashboard: dark/light theme toggle
- [x] Wolof distillation: 2,176 SFT samples on HF
- [x] Clip4Clicks: Tauri scaffold + turnkey fixes

## Next — Prioritized

### 1. Studio → Engine wiring verification + Harness integration
**Status:** Code written, not tested end-to-end. Harness not wired.

- [ ] Test: agent loop detects price_change → verify Engine product updated
- [ ] Test: agent loop detects sold_out → verify Engine stock=0
- [ ] Test: OBS controller fetches product from Engine → verify overlay renders
- [ ] Test: go-live endpoint → verify Engine creates live session
- [ ] Test: NFC delivery → POST confirm-by-code → verify Engine closes order
- [ ] Test: NFC viewer → fetch catalog → verify product page + checkout redirect
- [ ] Test: QR overlay → verify Engine URLs in QR codes
- [ ] Wire Harness audit: Studio actions (price update, go-live, sold-out) should emit audit events
- [ ] Studio E2E test: update to cover the new Engine-wired endpoints

### 2. Alpine.js + HTMX adoption
**Status:** Discussed, not started. Strong fit for Yaatal.

- [ ] Add Alpine.js + HTMX script tags to dashboard index.html
- [ ] Refactor product gallery: `hx-get="/api/studio/product-queue" hx-trigger="load"` → server returns HTML fragments
- [ ] Refactor live chat: `hx-get="/api/studio/chat" hx-trigger="every 2s" hx-swap="beforeend"`
- [ ] Refactor approve/reject: `hx-post` → server returns updated row HTML
- [ ] Add server-side HTML fragment endpoints to studio_server.py (return HTMLResponse, not JSON)
- [ ] Migrate dashboard from 500-line app.js to ~50 lines of Alpine directives
- [ ] Test: offline degradation (HTMX falls back to normal links/forms)

### 3. Currency work
**Status:** FCFA only. No multi-currency, no exchange rates.

Current state:
- `products.price_cents` (integer) — FCFA in cents
- `orders.total_cents` (integer) — FCFA in cents
- `bobo_orders.total_xof` (bigint) + `currency` (text, default 'XOF')
- `format_price()` in catalog.rs → "X XXX FCFA"
- `formatFCFA()` in dashboard app.js → "75 000 FCFA"
- Harness: `MAX_PRICE_FCFA = 10,000,000`
- **No exchange rates, no EUR/USD conversion, no multi-currency display**

- [ ] Decide: does Yaatal need multi-currency? (FCFA is the market reality — XOF is the only currency that matters for Senegal/West Africa)
- [ ] If yes: add currency field to products, exchange rate table, display conversion
- [ ] If no: document that Yaatal is FCFA-only by design (XOF has no subunit — "cents" is a misnomer, it's whole FCFA × 100 for precision consistency with the `price_cents` pattern)
- [ ] Fix naming: `price_cents` implies subunits but XOF has none. Consider renaming to `price_xof` or document that `price_cents = FCFA × 100` (for integer precision, not because FCFA has cents)
- [ ] Harmonize: `bobo_orders.total_xof` (bigint, whole FCFA) vs `products.price_cents` (integer, FCFA×100) — pick one convention
- [ ] Studio: verify formatFCFA() matches Engine format_price() output exactly

### 4. WhatsApp linking
**Status:** Code built, blocked on Meta.

- [ ] Meta Business Account verification (your action)
- [ ] Get WABA credentials (WHATSAPP_TOKEN, WHATSAPP_PHONE_ID, WHATSAPP_APP_SECRET, WHATSAPP_VERIFY_TOKEN)
- [ ] Set env vars on Engine container + restart
- [ ] Register webhook: https://engine.njooba.com/webhooks/whatsapp
- [ ] Test: send WhatsApp message → verify auto-reply

### 5. GPU-gated work (all prepped, waiting on compute)

- [ ] Fine-tune Qwen3-Omni-30B on 2,176 SFT samples (MOH749/wolof-commerce-sft)
- [ ] Fine-tune MiniMind-O on text-only subset
- [ ] Eval students vs DeepSeek V4 Flash → promote if better
- [ ] Wolof T2A retrain on 109K rows (MOH749/wolof_t2a_large)
- [ ] Set up serving (vLLM for Qwen3-Omni) ONLY after eval passes

### 6. Clip4Clicks Tauri (laptop work)
**Status:** Scaffold on `tauri/desktop` branch. TODO.md has 10-item list.

- [ ] Frontend dashboard (2-3 days)
- [ ] Bundle ffmpeg + yt-dlp sidecars
- [ ] VPS sync wiring
- [ ] Local rendering pipeline
- [ ] Build + distribute

### 7. Studio frontend polish
- [ ] Wire dashboard "Go Live" button to /api/studio/go-live endpoint
- [ ] Wire product queue to /api/studio/product-queue (auto-refresh)
- [ ] Wire live chat to Engine social_events (real Telegram messages)
- [ ] Add OBS connection status indicator (live health)
- [ ] Mobile responsive testing on actual Android device
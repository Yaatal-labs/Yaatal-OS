# Social commerce vertical slice

## Purpose

Prove the portable path that works without privileged livestream APIs:

```text
seller selects the on-air product in Studio
  → Yaatal mints one opaque CommerceIntent
  → seller copies or shares the attributed social link
  → buyer taps it on the same phone used to watch or chat
  → the mobile Commerce Sheet opens
  → buyer chooses a provider and confirms a sandbox payment
  → Studio receives an attributed conversion receipt
```

The implementation under `apps/studio/live/commerce_poc.py` is an ephemeral,
feature-gated reference adapter. It proves the interaction and exact JSON
shapes; it is not the production source of truth. Yaatal Engine remains the
owner of product identity, inventory, orders, payments, and durable
CommerceIntent state.

## POC contract

### Create an intent

`POST /api/studio/poc/commerce-intents`

- Authentication: Studio operator HTTP-only session.
- Preconditions: `YAATAL_COMMERCE_POC=1` and an active Studio session.
- Request: `{ "product": ProductSnapshot }`.
- Response: `yaatal.commerce-intent.v1` with opaque public, livestream,
  WhatsApp, and Telegram links.
- Side effects: one in-memory immutable intent; one sanitized WebSocket event.

The POC accepts the Studio product snapshot. The Engine implementation must
instead accept `product_id`, derive merchant identity from the seller JWT, and
load price, stock, media, and ownership from Engine state.

### Open the Commerce Sheet

`GET /b/{opaque_token}?src={channel}`

- Authentication: public possession of the high-entropy token.
- Response: mobile bilingual HTML with product media, variants, amount, and
  familiar provider identities.
- Cache: `no-store`.
- Supported source values: `copy`, `livestream`, `telegram`, `whatsapp`,
  `bobo`, and `unknown`.

### Confirm sandbox checkout

`POST /b/{opaque_token}/checkout`

```json
{
  "provider": "wave",
  "quantity": 1,
  "variant": "M",
  "source_channel": "whatsapp",
  "idempotency_key": "browser-generated-uuid"
}
```

The response is `yaatal.commerce-receipt.v1`. `payment_status` is always
`sandbox_paid`; the page states plainly that no real debit occurs. Repeating
the same token and idempotency key returns the same order without a second
stock decrement or conversion.

### Read conversions

`GET /api/studio/poc/conversions?live_session_id={id}`

- Authentication: Studio operator HTTP-only session.
- Response: sanitized receipts only. No buyer phone, seller speech, audio,
  transcript, JWT, or provider credential is accepted or retained.

## Run locally

Set these server-owned environment variables before starting Yaatal OS:

```powershell
$env:STUDIO_CONTROL_TOKEN = "choose-a-local-operator-secret"
$env:STUDIO_COOKIE_SECURE = "0"
$env:STUDIO_DEMO_MODE = "1"
$env:YAATAL_COMMERCE_POC = "1"
$env:YAATAL_COMMERCE_PUBLIC_BASE_URL = "http://127.0.0.1:8484"
pnpm --filter @yaatal/os-shell tauri dev
```

Unlock Studio with the operator secret, arm the cockpit, select a demo
product, put it on air, and choose **Share checkout**. For a same-phone test,
replace the public base URL with a temporary HTTPS tunnel that forwards only
the intended POC surface. Do not expose an unprotected local development
server as a production endpoint.

## Acceptance evidence

```powershell
python -m pytest apps/studio/live/test_commerce_poc.py `
  apps/studio/live/test_social_commerce_e2e.py -q
pnpm test
pnpm check
pnpm build
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml
```

The HTTP acceptance test covers operator authorization, intent creation,
channel-specific links, page rendering, provider selection, idempotent sandbox
payment, livestream attribution, conversion reporting, and the disabled-mode
fail-closed behavior.

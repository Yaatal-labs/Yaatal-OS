# Yaatal Token Gateway

One OpenAI-compatible endpoint for every model Yaatal sells, billed in XOF (FCFA, the West African CFA franc) from a prepaid balance.
Agencies, apps built on the Yaatal OS and the OS itself call it with a Yaatal key. Behind it, each model
fails over across upstreams: the wholesale supplier, Workers AI (no key, over the AI binding), or any
OpenAI-compatible server such as a self-hosted model. Switching a model's supplier is one edit in
`src/models.ts`; clients keep the same model id.

| Route | Auth | Purpose |
| --- | --- | --- |
| `GET /` | none | Branded landing page (French). Its prompt box and example ideas open the Playground (the Yaatal OS) at `PLAYGROUND_URL/?prompt=…`; also the offer, FCFA prices from the catalog, the API quickstart, data handling, a featured Blueprint (`FEATURED_BLUEPRINT_ID`) and a WhatsApp button (`CONTACT_WHATSAPP`) |
| `GET /usage` | none | Usage page: paste a key to see balance and recent calls (the key stays in the tab) |
| `/voix/*`, `/agents/yaatal-voice/*` | none | The voice call, forwarded to the `yaatal-voice` Worker over the `VOICE` service binding. The hero's **Parler à Yaatal** button opens it in a sheet on this page (`/voix/embed.js`, loaded on first tap). Without the binding the page shows the prompt box instead |
| `GET /v1/models` | none | Models, tier, residency (`controlled` or `any`) and FCFA price per million tokens |
| `POST /v1/chat/completions` | Yaatal key | OpenAI chat completions, streaming or not. Optional `x-yaatal-data-class: sovereign\|operational\|public` (absent = `operational`; unknown → 400 `invalid_data_class`): `sovereign` is refused 403 `data_class_not_allowed`, before any upstream call, unless every upstream of the model is `controlled`. Optional `x-yaatal-no-failover: 1` tries only the first configured upstream |
| `GET /v1/balance` | Yaatal key | Balance and recent ledger rows |
| `POST /admin/accounts` | admin token | `{name, credit_xof?}` → account and its first key (shown once) |
| `POST /admin/accounts/:id/keys` | admin token | `{label}` → another key (shown once) |
| `PUT /admin/accounts/by-pid/:pid` | admin or issuer token | `{name?}` (≤ 80 chars) → idempotent upsert of the account for an Engine user pid (a UUID, else 400 `invalid_pid`): `{id, engine_pid, created, balance_xof}`. An issuer token creates it under its own issuer and gets 403 `forbidden` on another issuer's or an admin-only account |
| `GET /admin/accounts/by-pid/:pid` | admin or `CREDIT_TOKEN` | `{id, engine_pid, balance_xof}`, or 404 |
| `POST /admin/accounts/:id/credits` | admin token, or `CREDIT_TOKEN` | `{xof, note, payment_ref?}` → new balance and whether it was applied. With `CREDIT_TOKEN`, `payment_ref` is required (400 `payment_ref_required`) and this is, with the pid lookup above, the only route the token reaches (all others 401) |
| `POST /admin/keys/revoke` | admin token | `{key}` |
| `GET /admin/usage?days=30` | admin token | sign-ups, credits, billed usage, refused requests (empty balance, upstream down), per model, per account (top 50) and per day |

## Billing

- Balances and ledger amounts are integers in micro-XOF. A price in XOF per million tokens is exactly
  micro-XOF per token, so no floating point touches money.
- The upstream's reported `usage` is billed. When a stream reports none, tokens are estimated at about
  four characters each and the ledger row is marked `estimated`.
- A request needs a positive balance to start and is debited when it finishes. Output is capped per
  model, which bounds how far one request can overdraw; concurrent requests can each do so once.
- Failed upstream calls are never charged. Every balance change is one ledger row committed with it.
- Credits are granted through the admin routes. Taking payment (Wave, Orange Money, PI-SPI) is a
  separate step that ends in a credit call; it is not part of this Worker.
- A credit may carry `payment_ref`, the settlement's id from the rail that moved the money (or an
  operator's receipt when cash closes the sale). It is unique per account: crediting one settlement
  twice credits once and answers `applied: false`, so a replayed webhook or a retried bridge cannot
  pay it again. The reference is kept on the ledger row and shown in `GET /v1/balance`, so a balance
  can be reconciled against the payments that funded it. A credit with no reference is never
  deduplicated.

## Data

- Upstreams receive only the request body. `user`, `metadata`, `store` and `service_tier` are removed,
  and nothing identifying the Yaatal account or key is sent.
- Workers AI calls ask AI Gateway not to log (`cf-aig-collect-log: false`). The ledger stores counts and
  prices, never prompts or completions.
- Only the SHA-256 of each key is stored.

## Run locally

```sh
pnpm install
printf 'ADMIN_TOKEN=%s\n' "$(openssl rand -hex 24)" > .dev.vars   # plus WHOLESALE_BASE_URL / WHOLESALE_API_KEY if used
pnpm dev                                                          # applies migrations, serves :8787
pnpm check && pnpm test                                           # types, and the tests in workerd with fake upstreams
```

Workers AI upstreams need `wrangler login`; usage counts against that account.

## Use it from the Yaatal OS

Add a model with the **Ollama** provider (it speaks OpenAI chat completions): API URL = the gateway's
origin, API token = a Yaatal key, model = a public id such as `yaatal/glm-4.7-flash`. The OS ignores
per-model URLs while a platform AI Gateway is configured (`CF_AI_GATEWAY`), so run it without one for
Yaatal-billed models.

## Use it from the Yaatal Engine

The Engine's model cascade has an OpenAI-compatible tier (tier 2). Point it here and every Telegram,
WhatsApp or SMS reply is billed to that key: `OPENAI_BASE_URL` = the gateway origin + `/v1`,
`OPENAI_API_KEY` = a Yaatal key, `OPENAI_MODEL` = a public id such as `yaatal/deepseek-v4-flash`.

## Suppliers

A model can list OpenAI-compatible suppliers before Workers AI. Each one is off until its two secrets
are set (`wrangler secret put`, or `.dev.vars` locally); an unset supplier is skipped.

| Supplier | Secrets | Base URL |
| --- | --- | --- |
| Wholesale | `WHOLESALE_BASE_URL`, `WHOLESALE_API_KEY` | from the supplier |
| SiliconFlow | `SILICONFLOW_BASE_URL`, `SILICONFLOW_API_KEY` | `https://api.siliconflow.com/v1` |
| OpenRouter | `OPENROUTER_BASE_URL`, `OPENROUTER_API_KEY` | `https://openrouter.ai/api/v1` |

- A supplier receives only standard chat fields (messages, sampling, tools, response format), so a
  client cannot reach supplier features the price does not cover, such as OpenRouter's `models`.
- Each supplier entry declares the most it can cost. The catalog refuses to load if that is above the
  cost the model's FCFA price is based on. OpenRouter requests carry that cap as `max_price`, and
  `data_collection: "deny"` so no host that keeps prompts is used.
- Check a supplier's terms allow resale before turning it on.

## Before selling

- Confirm the tier prices in `src/models.ts` against the signed wholesale price sheet, and the wholesale
  model ids against its catalog.
- Deploying needs a real D1 database id, `ADMIN_TOKEN` and upstream secrets set with `wrangler secret put`.

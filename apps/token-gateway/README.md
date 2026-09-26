# Yaatal Token Gateway

One OpenAI-compatible endpoint for every model Yaatal sells, billed in FCFA from a prepaid balance.
Agencies, apps built on the Yaatal OS and the OS itself call it with a Yaatal key. Behind it, each model
fails over across upstreams: the wholesale supplier, Workers AI (no key, over the AI binding), or any
OpenAI-compatible server such as a self-hosted model. Switching a model's supplier is one edit in
`src/models.ts`; clients keep the same model id.

| Route | Auth | Purpose |
| --- | --- | --- |
| `GET /v1/models` | none | Models, tier and FCFA price per million tokens |
| `POST /v1/chat/completions` | Yaatal key | OpenAI chat completions, streaming or not |
| `GET /v1/balance` | Yaatal key | Balance and recent ledger rows |
| `POST /admin/accounts` | admin token | `{name, credit_fcfa?}` → account and its first key (shown once) |
| `POST /admin/accounts/:id/keys` | admin token | `{label}` → another key (shown once) |
| `POST /admin/accounts/:id/credits` | admin token | `{fcfa, note}` → new balance |
| `POST /admin/keys/revoke` | admin token | `{key}` |

## Billing

- Balances and ledger amounts are integers in micro-FCFA. A price in FCFA per million tokens is exactly
  micro-FCFA per token, so no floating point touches money.
- The upstream's reported `usage` is billed. When a stream reports none, tokens are estimated at about
  four characters each and the ledger row is marked `estimated`.
- A request needs a positive balance to start and is debited when it finishes. Output is capped per
  model, which bounds how far one request can overdraw; concurrent requests can each do so once.
- Failed upstream calls are never charged. Every balance change is one ledger row committed with it.
- Credits are granted through the admin routes. Taking payment (Wave, Orange Money, PI-SPI) is a
  separate step that ends in a credit call; it is not part of this Worker.

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
pnpm check && pnpm test                                           # types, and 17 tests in workerd with fake upstreams
```

Workers AI upstreams need `wrangler login`; usage counts against that account.

## Use it from the Yaatal OS

Add a model with the **Ollama** provider (it speaks OpenAI chat completions): API URL = the gateway's
origin, API token = a Yaatal key, model = a public id such as `yaatal/glm-4.7-flash`. The OS ignores
per-model URLs while a platform AI Gateway is configured (`CF_AI_GATEWAY`), so run it without one for
Yaatal-billed models.

## Before selling

- Confirm the tier prices in `src/models.ts` against the signed wholesale price sheet, and the wholesale
  model ids against its catalog.
- Deploying needs a real D1 database id, `ADMIN_TOKEN` and upstream secrets set with `wrangler secret put`.

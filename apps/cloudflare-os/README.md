# Yaatal on Cloudflare OS

Yaatal's creation workspace runs on upstream [Cloudflare OS](https://github.com/cloudflare/cloudflare-os)
instead of a bespoke agent runtime. The OS already ships agent chat, sandboxed Gadgets, Blueprints,
Gatekeepers and a human review gate for agent-written code; this folder only adapts it.

Customization order: `/admin` settings → `deployment.jsonc` → custom Gatekeeper → upstream fork, the
last only for a demonstrated gap. Yaatal Engine stays the authority for identity, merchant scope,
business data, payments and inference policy.

## Contents

| Path | Purpose |
| --- | --- |
| `upstream.json` | Pinned starter and upstream commits, and the required toolchain |
| `scripts/bootstrap.sh` | Clones the starter at the pin, checks out the pinned upstream, runs the overlay |
| `scripts/overlay.sh` | Copies `gatekeepers/*` into a checkout's upstream `packages/` (re-run after edits) |
| `gatekeepers/gatekeeper-yaatal` | Read-only Engine catalog for agents and Gadgets, pinned to one merchant |
| `yaatal/admin-settings.json` | Yaatal identity: site name, accent, announcement, agent instructions |
| `yaatal/apply-admin.mjs` | Applies the settings through the Admin API and verifies each field |
| `yaatal/lib.mjs` | Shared RPC sign-in and helpers (same Cap'n Web API the UI uses) |
| `yaatal/smoke/access.mjs` | Sign-in smoke: only the administrator gets the Admin API |
| `yaatal/smoke/agent-build.mjs` | One agent build per model on a fixed prompt with fictional data |
| `yaatal/smoke/review-changes.mjs` | Prints an agent's provisional code for human review |
| `yaatal/smoke/publish-blueprint.mjs` | Accepts reviewed changes (`--accept`), publishes and features a Blueprint |
| `yaatal/smoke/catalog-gatekeeper.mjs` | End-to-end catalog check through the OS, no model needed |

The agent instructions encode Yaatal's rules: models propose and the Engine disposes; no payments,
orders or messages; never invent prices or stock; treat personal data as sensitive; never trust a
merchant ID that arrives in model output.

## Run locally

```sh
apps/cloudflare-os/scripts/bootstrap.sh ../cfos          # starter + upstream at the pins
cd ../cfos/cloudflare-os && pnpm run-local               # http://localhost:8787, account "admin" is admin
```

Models on the Workers AI free tier, with no API key: sign in with `wrangler login` (OAuth), then start
with the AI Gateway over the Workers AI binding:

```sh
CF_AI_GATEWAY=default CF_AI_GATEWAY_ACCOUNT_ID=<your account id> CF_AI_GATEWAY_PROVIDERS=cloudflare \
  pnpm run-local --use-workers-ai-binding
```

AI bindings always reach your Cloudflare account, even in local dev; usage counts against the daily
free Neurons. Upstream's suggested Workers AI models are Paid-plan only, so add a free model by id.

Then, from this folder (`CFOS_DIR` is the starter checkout; keep credentials in an untracked file):

```sh
export CFOS_DIR=../../../cfos OS_CREDS_FILE=/path/outside/repo/creds.json   # {"admin": "...", "tester": "..."}
node yaatal/smoke/access.mjs
node yaatal/apply-admin.mjs
MODELS=@cf/nvidia/nemotron-3-120b-a12b node yaatal/smoke/agent-build.mjs
node yaatal/smoke/review-changes.mjs <workspaceId>
node yaatal/smoke/publish-blueprint.mjs <workspaceId> --title "Yaatal · Live-sale prep card" --accept
```

## Engine catalog Gatekeeper

`gatekeepers/gatekeeper-yaatal` gives agents and Gadgets the products of **one** Yaatal shop, read-only:

```ts
interface YaatalCatalogSession {
  listProducts(options?: { page?: number; category?: string }): Promise<CatalogPage>;
  getProduct(productId: string): Promise<CatalogProduct>;
}
```

It returns the unified shell's `CatalogProduct` / `CatalogPage` shapes, read from Engine's public
`GET /api/catalog` (active products only).

- **The deployment chooses the shop, never the model.** `YAATAL_MERCHANT_ID` is configuration and no
  method takes a merchant. A row from another merchant fails the whole read; another merchant's
  product id reads as "Product not found", the same as a missing one.
- **Validated both ways.** Product ids are checked before they reach a URL; Engine must answer 200
  JSON within 8 s and 1 MB with no redirect; image URLs with credentials or non-HTTP schemes are
  dropped; fields outside the DTO are not passed on.
- **Every read is an observation first.** If the person declines it, Engine is never called.
- **Unconfigured means unavailable.** Missing or unsafe settings raise "Yaatal catalog unavailable";
  agents are told to say so rather than invent products, prices or stock.
- **Text is plain text.** Gadgets must escape names and descriptions before putting them in HTML.

Every user sees the same public catalog, so every observer may keep what it reads. Private reads
(inactive products, orders) need a per-user Engine sign-in and observer verification first; they are
not part of this Gatekeeper.

Configure it locally in `<starter>/cloudflare-os/packages/gatekeeper-yaatal/.dev.vars` (untracked):

```sh
YAATAL_ENGINE_URL=https://engine.example.com/   # HTTPS; plain HTTP only on localhost/127.0.0.1/[::1]
YAATAL_MERCHANT_ID=<merchant profile id>
```

After `bootstrap.sh` (or `overlay.sh` on an existing checkout), in `<starter>/cloudflare-os`:

```sh
pnpm install
pnpm --filter @yaatal/gatekeeper-yaatal run types:generate
pnpm --filter @yaatal/gatekeeper-yaatal run types:check
pnpm --filter @yaatal/gatekeeper-yaatal run test:run    # denial and leak tests, in workerd
pnpm run-local
```

Each user opts in once (Connectors page, or `provisionAmbientAccount("yaatal")`); an admin can make it
automatic for everyone with `setGatekeeperMode("yaatal", "enabled")`. Workspaces then get it as the
`YAATAL_CATALOG` capsule. Check it end to end, without a model:

```sh
node yaatal/smoke/catalog-gatekeeper.mjs <workspaceId>
```

## Observed on the pin (local run, Workers AI free tier)

- Nemotron 3 Super built the live-sale prep Gadget from one prompt (141 s, no errors). Review found a
  blank UI (the platform has no `index.html`; `client.js` builds the UI) and unescaped `innerHTML`.
  One review note in the same chat produced a correct fix (227 s), which was accepted and published.
- Gemma 4 26B and GLM 4.7 Flash also built it without errors but inserted product names into
  `innerHTML` unescaped; GLM invented Wolof text. Review agent code before accepting it.
- Upstream issue cloudflare/cloudflare-os#54 (multi-turn 400s on some Workers AI models) did not
  affect these four models; `gpt-oss-120b` is reported affected.
- The catalog Gatekeeper read a live Engine end to end (20 of 30 products in about 0.5 s); path-like
  and unknown ids were refused, and a merchant passed in by the caller changed nothing.
- Agent-written Wolof is unreliable: the instructions ask for an editable Wolof field rather than
  generated Wolof.

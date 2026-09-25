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
| `scripts/bootstrap.sh` | Clones the starter at the pin and checks out the pinned upstream |
| `yaatal/admin-settings.json` | Yaatal identity: site name, accent, announcement, agent instructions |
| `yaatal/apply-admin.mjs` | Applies the settings through the Admin API and verifies each field |
| `yaatal/lib.mjs` | Shared RPC sign-in and helpers (same Cap'n Web API the UI uses) |
| `yaatal/smoke/access.mjs` | Sign-in smoke: only the administrator gets the Admin API |
| `yaatal/smoke/agent-build.mjs` | One agent build per model on a fixed prompt with fictional data |
| `yaatal/smoke/review-changes.mjs` | Prints an agent's provisional code for human review |
| `yaatal/smoke/publish-blueprint.mjs` | Accepts reviewed changes (`--accept`), publishes and features a Blueprint |

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

## Observed on the pin (local run, Workers AI free tier)

- Nemotron 3 Super built the live-sale prep Gadget from one prompt (141 s, no errors). Review found a
  blank UI (the platform has no `index.html`; `client.js` builds the UI) and unescaped `innerHTML`.
  One review note in the same chat produced a correct fix (227 s), which was accepted and published.
- Gemma 4 26B and GLM 4.7 Flash also built it without errors but inserted product names into
  `innerHTML` unescaped; GLM invented Wolof text. Review agent code before accepting it.
- Upstream issue cloudflare/cloudflare-os#54 (multi-turn 400s on some Workers AI models) did not
  affect these four models; `gpt-oss-120b` is reported affected.
- Agent-written Wolof is unreliable: the instructions ask for an editable Wolof field rather than
  generated Wolof.

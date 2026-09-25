# Studio Pi Copilot Pilot — r4 UPSTREAM-FIRST YAATAL ADAPTATION

> **Fresh-session entry.** Read this file, then report scope and gate before acting. Phase 0 read-only preflight was authorized and completed; results are below. Local setup, paid model calls and deployment still require their own scope/branch/write-set briefing and approval. No publish from unmerged branches.

- Branch: `yaatal/studio-pi-copilot-pilot` · Worktree: `C:/tmp/yaatal-studio-pi-copilot` · Base: `0b989cce4c56586d6604d495bffb568959980669`
- Plan revision: 2026-09-24 **r4** (upstream-first). Supersedes r3. Archive at `C:/tmp/pi-pilot-research/STUDIO-PI-COPILOT-PILOT.r3.archive.md`.
- Live state, open blocker and exact next commands: [`../CFOS-ADAPTATION-CHECKPOINT-HANDOFF.md`](../CFOS-ADAPTATION-CHECKPOINT-HANDOFF.md).

## What changed from r3

**Removed from the build scope** (start with the upstream product; justify any missing capability before adding code):
- `apps/studio-agent` Node/Pi service, second Pi provider, separately selected Pi versions, `@yaatal/studio-agent` package. Upstream's pinned lockfile owns its Pi dependencies; no global Pi install.
- New chat/SSE/session/approval stacks (`copilot_gateway.py`, `OperatorSessionStore` extensions, WhatsApp operator login endpoints).
- Custom generic model gateway (any provider credential or inference adapter in Studio).
- Four implementation lanes (A/B/C/N), their worker-model assignments, and all task IDs (A1-A4, S1-S3, U1, D1, N1).
- Old implementation write sets and gates G0-G5. Research findings and risks remain archived evidence, not a blanket cleanup backlog; authorization, isolation and no-payment boundaries remain mandatory.

**Removed as baseline prerequisites:**
- Bespoke VPS Tunnel/container/streaming setup. Reuse the starter's Access-protected deployment if chosen; do not remove authentication or origin-bypass checks.
- Mandatory NVIDIA tier switch and model bakeoff. NVIDIA remains an optional later A/B backend through Engine, requiring separate approval; production routing stays unchanged.

**Preserved as research archive** (for targeted gaps later, not as generic cleanup work): VPS probe results, Engine source inventory, Harness patterns, Studio surface notes, Pi SDK facts.

## Goal

Broader than merchant chat: a **Yaatal creation workspace** inside Cloudflare OS, plus read-only Engine integration when separately authorized. The OS already provides agent chat, sandboxed Gadgets, Blueprints, capability Gatekeepers and collaboration. Run/customize these; do not rebuild them.

## Verified facts (parent-provided; no web research)

- Cloudflare OS README explicitly invites copy/customize into Your Company OS. `cloudflare-os-starter` wraps a pinned upstream submodule. `/admin` supports name/logo/accent, agent instructions, connectors, featured Blueprints. `deployment.jsonc` controls identity/routing/storage/AI. Prefer `admin` → config → custom Gatekeeper → upstream fork ONLY for a demonstrated gap.
- Starter requires Node >=24.19.0, pnpm 11.17.0. No cloudflare-os references were found in searched package.json files under `C:/tmp` and the YAATAL workspace (bounded evidence, not proof of absence).
- `pnpm run-local` executes dependency install/build and starts wrangler/workerd, normally `localhost:8787`, `.wrangler` data. NOT read-only nor production deployment. First run should be isolated local upstream baseline, not production.
- Starter custom Gatekeeper paths verified: `packages/custom-gatekeeper/src/{types.d.ts,types-code.ts,custom.ts}`, `packages/custom-gatekeeper/wrangler.jsonc`, root `deployment.jsonc`. Its example verifier accepts every observer: unsafe unchanged for merchant data. Yaatal integration needs authenticated Engine principal mapping, merchant scope and observer policy; never trust model merchant IDs or map Access email to merchant automatically. Credentials belong server-side.
- Engine owns merchant identity, WhatsApp/Telegram plumbing, business state, payments, inference routing. `/api/ai/chat` is text-only, not automatically OpenAI/Pi native tool compatible. Engine inference adapter is an UNVERIFIED seam, not pre-approved rebuild. Baseline uses upstream supported model with non-sensitive evaluation content only.
- Existing upstream eval package: `packages/workshop-evals/package.json`; upstream-root `pnpm evals` / `pnpm evals:ui`. Package produces `.wrangler/evals/results.json` relative to its cwd. Inspect pinned eval configuration and approve model spend before running; reuse this framework.
- Prior authorized VPS probe did NOT find Pi in checked host paths; container/npx-cache followup was denied/unresolved. NO reinstall or repeat denied probe without fresh scope/authorization.
- Do not make WABA, NIM or merchant credentials prerequisites for a local UI baseline. Upstream documents local wrangler/workerd execution; verify the pinned setup's actual account/model requirements rather than promise credential-free agent execution. Real model execution needs an authorized provider, budget and suitable data.
- Own-server production workerd deployment tooling/docs are marked COMING SOON upstream. Local dev is not a VPS production recipe. The starter provides the supported Cloudflare deployment path; reuse its AI Gateway/Workers AI configuration if authorized rather than recreate it.
- Existing Studio live-commerce, Harness Pi bridge and both HTR-01 worktrees remain untouched. The bridge is not proven deployed end to end. Shell embedding and single-login parity are later integration checks, not prerequisites for the upstream baseline.

## Minimal phases

Phase 0 produced local read-only evidence and this plan update. Subsequent phases write local or remote state and need the stated approval. No existing Yaatal application code is touched by the baseline.

### Phase 0 — Complete; Docker-first follow-up checked
- Evidence: `docs/evidence/CFOS-00-LOCAL-PREFLIGHT.md` (scratch original: `C:/tmp/pi-pilot-research/gate0-local-preflight.md`). DeepSeek V4 Flash performed the bounded checks; parent independently repeated the key checks at `2026-09-25T04:16:57Z`.
- Branch remains `yaatal/studio-pi-copilot-pilot`; only the plan is untracked, with no tracked-file changes reported.
- Local Node `v22.18.0`, pnpm `10.18.2`: do not meet the starter's Node `>=24.19.0` / pnpm `11.17.0` requirements. The existing Yaatal toolchain stays unchanged.
- `C:/tmp/yaatal-cloudflare-os-eval` does not exist. No upstream checkout was identified by the bounded manifest searches under `C:/tmp` and the YAATAL workspace; this is not a system-wide absence claim.
- No local TCP listeners on `8787` or `3000` at verification time. Recheck before launch; this does not reserve the ports.
- Windows/workerd execution, browser sign-in and a real in-OS agent turn remain UNTESTED. No install, clone, server start, model call or VPS probe was performed in this gate.
- User requested existing local Docker reuse before VPS. The local Docker Desktop Linux daemon is reachable; parent verified image inventory and selected metadata. Evidence: `docs/evidence/CFOS-01-LOCAL-DOCKER-PREFLIGHT.md`.
- Existing `yaatal/inference-runtime:g0-local` (`8eae557cac0f`) declares source revision `a4f8328e31fdbe0711d3adde3e158cc18e8a319d`. That source uses a deterministic `ReferenceBackend`, not a real model, merchant API or Cloudflare OS. Do not spend OS acceptance testing on this fixture or count its fixed response/token usage as real inference.
- No identifiable Cloudflare OS, full Engine API or Studio application image was found in the local inventory. Existing stopped databases have unknown data provenance and must remain untouched.
- **Decision (2026-09-25):** there is no upstream Cloudflare OS image (no Dockerfile, compose or devcontainer; `run-local` uses wrangler/workerd on the host). A self-built dev container was proposed and the base-image pull was declined, so the chosen path is **portable sandbox-local tooling**: Node `v24.21.0` + pnpm `11.17.0` under `C:/tmp/yaatal-cloudflare-os-eval/.toolchain/`, activated by `.toolchain/env.sh`. No global Windows toolchain change.
- Sandbox pin recorded: starter `3d211477ad009e13a98d863d843e5c12a29ad02b`, upstream submodule `6478a1448a11524e2f7c2575ad66fab0bc47c433`. `.toolchain/` is untracked scratch and must never be committed.
- **Open blocker:** pnpm does not resolve/execute correctly in the sandbox toolchain (PATH precedence picks the global shim; the global shim then fails with `0xC0000142` and re-invokes itself). Root cause unconfirmed. Fix must stay sandbox-local. See the handoff document, section 5.
- Proposed source path remains `C:/tmp/yaatal-cloudflare-os-eval/`, branch `yaatal/cloudflare-os-adaptation`. In addition to checkout/build/cache/runtime files, Docker setup writes explicitly named test images/containers/network/volumes; list these before launch. No existing volume reuse, privileged/host networking or Docker socket mounts. Bind only a checked free `127.0.0.1` port. No global Pi install or VPS mutation. Pull/build/launch approval remains pending; this gate performed inventory only.

### Phase 1 — Isolated pinned upstream run (after authorization)
1. Reuse an existing checkout if suitable; otherwise create the separately scoped sandbox from a pinned `cloudflare-os-starter` revision, then `git submodule update --init`. Record both revisions.
2. Prefer the isolated local Docker environment above. From the starter root, `pnpm --dir cloudflare-os run-local` runs the UPSTREAM script (not a starter script) and installs/builds dependencies. First verify its pinned container bind/dependency requirements; containerization is an untested setup step, not a reason to rebuild the product. Do not confuse local-dev execution with production workerd deployment.
3. Browser smoke: the actual logged loopback URL loads, sign-in works and `/admin` is limited to the intended administrator. Do not assume a fresh account is already admin.
4. Agent smoke: select an authorized working model and complete one non-sensitive task; do not claim a default provider is already usable.
5. Record actual outputs, not mocks.

### Phase 2 — Yaatal identity + one Blueprint (after authorization)
1. `/admin`: set name/logo/accent, agent instructions (Yaatal context), connectors.
2. Instruct the in-OS agent to produce one useful Blueprint, e.g. **live-sale prep** Gadget that reads product data and prepares a prep card.
3. Agent-generated, versioned Gadget/Blueprint. No source-level Gatekeeper edits unless justified.
4. Engine data: if not yet authorized, label capability unavailable rather than fabricate business records.

### Phase 3 — Read-only Engine Gatekeeper (if no existing connector suffices)
1. Verify an existing OS connector/Blueprint can reach Engine's read-only merchant endpoints.
2. If not, smallest custom Gatekeeper: authenticated Engine principal mapping, merchant scope, observer policy. Test denial and leaks before real merchant data.
3. Credentials server-side only. Test foreign-merchant access, unauthorized observers and model-supplied IDs. Do not send merchant data through a baseline provider that bypasses Engine's required inference/data policy.

### Phase 4 — A/B evaluate, then approve promotion/rollback
1. Fixed upstream/model/data/task list. A = upstream default, B = Yaatal instructions/Blueprints.
2. Change one variable per round. Repeated paired runs. Metrics: actual success/time, provider-reported tokens/cost, failures, manual interventions (unknown = marked unavailable).
3. Security/isolation/real-data grounding = mandatory vetoes.
4. Keep candidate if repeatable task improvement AND no material cost/latency regression. No invented benchmarks.
5. Keep artifacts/logs and rollback pin/config/Blueprint revision.
6. After initial adoption: A = accepted pinned version, B = candidate update/customization, same method.
7. Upstream agent implements scoped Gadget changes; cheap workers do bounded setup/review; parent gates. No big multi-model study.

## Proposed sandbox path (not created now)

`C:/tmp/yaatal-cloudflare-os-eval` with branch `yaatal/cloudflare-os-adaptation` — ONLY after checking no existing deployment/repo should be reused. Report exact write set before install.

Authorized so far: plan/evidence files and completed read-only local checks, including local Docker inventory. Future baseline writes are the separate pinned checkout, isolated tooling/caches/build/runtime state and explicitly scoped disposable Docker resources. Adaptation starts with admin settings and agent-created Gadget/Blueprint revisions; `deployment.jsonc`, the existing custom Gatekeeper and eval cases change only when separately scoped. No production deploy, Engine config change, source fork or existing shell rewrite is authorized here.

## Compact in-OS agent brief (reusable for sessions)

"Reuse Blueprint first. Create a preview Yaatal live-sale prep Gadget: read only explicitly introduced resources. Never invent prices/stock. No business writes or payments. Ask on missing data. Produce preview/version and verification. Deployment/auth/kernel changes need separate approval. With no Engine data, label capability unavailable rather than fabricate business records."

## Source links

- https://github.com/cloudflare/cloudflare-os
- https://github.com/cloudflare/cloudflare-os-starter
- https://github.com/cloudflare/cloudflare-os-starter/blob/main/docs/customization.md
- https://github.com/cloudflare/cloudflare-os-starter/blob/main/packages/custom-gatekeeper/README.md
- Upstream eval at observed main commit `a43210a79720c50381f0f7e9719cff21ef0db74e` (research reference, not asserted deployment pin)
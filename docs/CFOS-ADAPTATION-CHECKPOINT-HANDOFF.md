# Cloudflare OS Adaptation — Checkpoint & Handoff

- Date: 2026-09-25
- Repository: `Yaatal-labs/Yaatal-OS`
- Worktree: `C:/tmp/yaatal-studio-pi-copilot`
- Branch: `yaatal/studio-pi-copilot-pilot` @ `0b989cce4c56586d6604d495bffb568959980669`
- Status: **documentation only**. No product code changed. Nothing deployed, nothing merged.
- Plan of record: [`docs/plans/STUDIO-PI-COPILOT-PILOT.md`](plans/STUDIO-PI-COPILOT-PILOT.md) (revision r4, upstream-first)

> Read the plan first, then this handoff. The plan carries scope and phase gates; this document carries
> the live state, the open blocker, and the exact next command sequence.

---

## 1. Scope (agreed direction)

Reduce the build to **Yaatal adaptation of upstream Cloudflare OS**, not a new product.

The governing correction, in the user's words: most of what we would write is already published in the
open-source OS, and the platform can modify itself. Code is cheap there. So the work is customization and
scope, with the OS's own agent doing the building.

Consequences already accepted:

- Do **not** rebuild agent runtime, sandboxing, Blueprints, Gadgets, session handling or chat UI.
- Do **not** introduce a second Pi provider, a second model gateway, or a second buyer bot.
- Prefer `/admin` → `deployment.jsonc` → custom Gatekeeper → upstream fork, in that order, and only
  fork upstream for a **demonstrated** gap.
- Yaatal Engine stays authoritative for merchant identity, business data, payments and inference policy.
- Evaluate by A/B using upstream's existing `packages/workshop-evals`, not a new eval framework.

---

## 2. Branch and worktree state

| Item | Value |
| --- | --- |
| Repo | `https://github.com/Yaatal-labs/Yaatal-OS.git` |
| Worktree | `C:/tmp/yaatal-studio-pi-copilot` |
| Branch | `yaatal/studio-pi-copilot-pilot` |
| Base | `0b989cce4c56586d6604d495bffb568959980669` (same commit as `yaatal/unified-ui-poc`) |
| On origin before this push | **no** — this branch was local-only |
| Tracked-file changes | none |
| New files | plan, this handoff, two evidence reports |

Sibling worktrees in this repo (do not disturb):

- `C:/Users/momo-/OneDrive/Desktop/YAATAL/Yaatal-OS` — `yaatal/os-real-surfaces`
- `C:/tmp/yaatal-os-harness-transport` — `yaatal/os-harness-transport`
- `C:/Users/momo-/OneDrive/Desktop/YAATAL/Yaatal-Engine/.worktrees/Yaatal-OS/poc-demo-closure`
- `C:/Users/momo-/OneDrive/Desktop/YAATAL/Yaatal-Engine/.worktrees/Yaatal-OS/unified-ui-poc`

---

## 3. Verified environment facts

Collected read-only on 2026-09-25. Nothing here is inferred from documentation.

### 3.1 Host

| Tool | Version | Note |
| --- | --- | --- |
| Node | `v22.18.0` | **below** the starter's `>=24.19.0` requirement |
| pnpm | `10.18.2` | **below** the starter's `11.17.0` requirement; matches the Yaatal-OS manifest pin |
| Docker CLI/server | `29.4.0` / `29.4.0`, `linux/amd64` | Docker Desktop, context `desktop-linux` |
| Docker endpoint | `npipe:////./pipe/dockerDesktopLinuxEngine` | local named pipe; no `DOCKER_HOST`/`DOCKER_CONTEXT` override |
| Free ports checked | `8787`, `3000` both idle at check time | snapshot only, not a reservation |

The host toolchain was **left unchanged**. No global Node upgrade, no Corepack activation, no new
version manager.

### 3.2 Upstream sandbox

| Item | Value |
| --- | --- |
| Path | `C:/tmp/yaatal-cloudflare-os-eval` |
| Branch | `yaatal/cloudflare-os-adaptation` |
| Starter revision | `3d211477ad009e13a98d863d843e5c12a29ad02b` (`Merge pull request #8 … upstream-alignment-ai-gateway`) |
| Upstream submodule | `cloudflare-os` @ `6478a1448a11524e2f7c2575ad66fab0bc47c433` |
| Starter requires | Node `>=24.19.0`, pnpm `11.17.0`, TypeScript 7, Wrangler |

### 3.3 Portable toolchain (sandbox-local)

| Item | Value |
| --- | --- |
| Node | `v24.21.0` (LTS "Krypton") at `.toolchain/node-v24.21.0-win-x64` — **verified** `node --version` |
| `node.exe` sha256 | `ba4e6d110e8c1592a1ecd390f6b05f3da124b13871a5be62b341a07a853c6c32` |
| Download | `https://nodejs.org/dist/v24.21.0/node-v24.21.0-win-x64.zip` (35.87 MB) |
| pnpm | `11.17.0` installed into `.toolchain/pnpm` via `npm install -g pnpm@11.17.0 --prefix` — install reported `added 1 package` |
| Activation script | `.toolchain/env.sh` (prepends sandbox paths, pins caches/stores inside the sandbox) |
| Total size | ~144 MB |

`.toolchain/` is untracked scratch and must never be committed.

---

## 4. Key finding: there is no official Cloudflare OS Docker image

This corrects the earlier assumption that a local image could simply be run.

- Upstream `cloudflare-os` contains **no** Dockerfile, **no** compose file and **no** devcontainer. The
  only `docker` match in upstream source is an unrelated Notion API import.
- `pnpm run-local` runs the whole stack on `wrangler`/`workerd` **directly on the host**, serving
  `http://localhost:8787` with data in `.wrangler`. Upstream states this is not a production recipe.
- The starter's supported path is `wrangler login` + `wrangler deploy` to Cloudflare — a hosted deploy
  protected by Cloudflare Access, not a container.
- Building a dev container around Node 24 + pnpm 11.17 is possible but is **our** wrapper, not an
  upstream artifact. A base-image pull was proposed and **denied**, so the host-portable-Node route
  (option 3) was chosen instead.

### 4.1 The one local Yaatal image is not the OS

`yaatal/inference-runtime:g0-local` (121 MB, image ID `sha256:8eae557cac0f…`) declares revision
`a4f8328e31fdbe0711d3adde3e158cc18e8a319d`. Reading that exact revision showed:

- `src/main.rs` constructs a `ReferenceBackend`, not a real model worker.
- `src/backend.rs` is an explicitly deterministic reference backend returning the literal string
  `reference response` with fixed token usage.
- `src/http.rs` requires explicit `YAATAL_INFERENCE_*` configuration; a bare `docker run` is not a
  verified startup recipe.

So it can validate an inference-contract transport at best. It is **not** Cloudflare OS, not the Engine
API, and must not be used for agent-quality or cost acceptance.

---

## 5. Open blocker

**pnpm does not resolve or execute correctly inside the sandbox toolchain.**

Observed, in order:

1. `corepack enable --install-directory .toolchain/shim` and `corepack prepare pnpm@11.17.0 --activate`
   both failed with `MODULE_NOT_FOUND` for a path mangled to `C:\c\tmp\…` — a POSIX-vs-Windows path
   mismatch between the bash-style PATH entry and the Corepack shim.
2. `npm install -g pnpm@11.17.0 --prefix C:/tmp/…/.toolchain/pnpm` **succeeded** and produced
   `pnpm`, `pnpm.cmd`, `pnpx`, `pnx` and friends.
3. `source .toolchain/env.sh` then `command -v pnpm` resolved to
   `/c/Users/momo-/AppData/Roaming/npm/pnpm` — the **global** install, not the sandbox one. So the
   sandbox `pnpm` directory was not winning PATH precedence.
4. That global shim reported `11.17.0` (it appears to read `packageManager` from the cwd's
   `package.json`) and then failed on `pnpm store path` with exit `3221225794` (`0xC0000142`,
   DLL initialisation failed), looping through a self-referential
   `pnpm add pnpm@11.17.0 …` invocation until interrupted.

**Root cause is not yet confirmed.** Working hypotheses, cheapest first:

- PATH precedence: the extensionless bash `pnpm` script in `.toolchain/pnpm` is not being selected ahead
  of the global shim; invoking the sandbox `pnpm.cmd` by absolute path may be sufficient.
- A stale `npm_config_*` / global npm shim interaction left over from earlier exports in the same shell
  session.
- The global pnpm shim being a Corepack or npm-created forwarder that re-resolves `packageManager`.

The fix must keep everything sandbox-local. Do not "solve" this by upgrading the global toolchain.

---

## 6. Next steps (exact order)

1. **Fix pnpm resolution.** Prefer invoking the sandbox binary by absolute path
   (`"$YAATAL_CFOS_TOOLCHAIN/pnpm/pnpm.cmd"` or the `.toolchain/pnpm/pnpm` script) rather than relying on
   bare `pnpm`. Confirm `pnpm --version` prints `11.17.0` **and** `command -v pnpm` points inside
   `.toolchain`. Start a clean shell if earlier exports polluted PATH.
2. **Install dependencies** from the starter root: `pnpm install`, then
   `pnpm --dir cloudflare-os install`. Confirm `node_modules` and the lockfile are used unchanged.
3. **Run the baseline**: `pnpm --dir cloudflare-os run-local` and open `http://localhost:8787`. This
   installs and builds first; expect a long first run.
4. **Smoke test against real behaviour** — the UI loads; sign-in works; `/admin` is limited to the
   intended administrator; one non-sensitive agent turn completes. Record actual output. A health
   endpoint or a fixture response does **not** pass this gate.
5. **Yaatal adaptation** via `/admin`: site name, logo, accent, agent instructions, connectors; then have
   the in-OS agent produce one scoped Blueprint (candidate: live-sale prep Gadget reading product data).
6. **Read-only Engine Gatekeeper** only if no existing connector or Blueprint reaches the Engine's
   merchant-scoped reads. Model-supplied merchant IDs must never be trusted.
7. **A/B evaluate** with upstream `packages/workshop-evals` — fixed model, data and task list; one
   variable per round; security, isolation and real-data grounding are vetoes.

---

## 7. Approval boundaries (still in force)

Authorized so far: this documentation, the read-only local checks, the sandbox clone, and the portable
Node/pnpm download into `.toolchain`.

Not authorized without a fresh, explicit decision:

- any VPS action, deployment, DNS, tunnel or Access change;
- any Yaatal Engine configuration or source change;
- any global Node/pnpm/toolchain change, or a global Pi install;
- starting, reusing or attaching to the stopped `yaatal-postgres` / `yaatal-pgbouncer` containers — their
  data provenance is unknown;
- pulling or building Docker images beyond what was already approved;
- reading credential, `.env` or secret values;
- publishing anything from an unmerged branch.

No model provider credentials are wired into the sandbox yet. Real agent execution will need an
authorized provider, a budget and non-sensitive test data.

---

## 8. Evidence

In-repo:

- [`docs/evidence/CFOS-00-LOCAL-PREFLIGHT.md`](evidence/CFOS-00-LOCAL-PREFLIGHT.md) — host toolchain,
  checkout absence, port state
- [`docs/evidence/CFOS-01-LOCAL-DOCKER-PREFLIGHT.md`](evidence/CFOS-01-LOCAL-DOCKER-PREFLIGHT.md) —
  Docker inventory, image provenance, the reference-backend finding
- [`docs/plans/STUDIO-PI-COPILOT-PILOT.md`](plans/STUDIO-PI-COPILOT-PILOT.md) — scope, phases, gates

Outside the repo (research scratch, not committed):

- `C:/tmp/pi-pilot-research/` — worker briefs, prompts, logs, the archived r3 plan
- `C:/tmp/yaatal-harness-delivery/` — Harness + `crates/yaatal-pi-bridge`, **including uncommitted
  HTR-01 work: preserve, do not copy into this branch**
- `C:/tmp/yaatal-os-harness-transport/` — OS-side HTR-01 counterpart: preserve

---

## 9. Reuse decisions carried forward

| Component | Decision |
| --- | --- |
| Cloudflare OS agent, sandbox, Blueprints, collaboration | **Run and customize.** Do not rebuild. |
| `/admin` + `deployment.jsonc` | Primary customization surface. |
| Custom Gatekeeper | The realistic Engine integration seam, only for a demonstrated gap. |
| Upstream `workshop-evals` | The A/B measurement tool. |
| Yaatal Engine | Authority for identity, merchant scope, business data, payments, inference policy. |
| Harness Pi bridge | Preserved as reference; not ported into this branch. |
| Studio live-commerce surfaces | Left intact. Shell embedding and single-login parity are later checks. |
| NVIDIA | Deferred, optional later backend behind the Engine. Nothing switched. |

---

## 10. Corrections this handoff makes to earlier notes

- "Local Docker image we can run and test before VPS" — no upstream image exists; the local Yaatal image
  is an inference-contract fixture. Docker-first now means a self-built dev container, which was declined
  in favour of portable host Node.
- Earlier plans assumed a Windows host toolchain upgrade was needed. It is not: `.toolchain` keeps Node
  24.21.0 sandbox-local.
- Earlier plans described a large `apps/studio-agent` service. That is **removed** from scope in favour of
  upstream customization.
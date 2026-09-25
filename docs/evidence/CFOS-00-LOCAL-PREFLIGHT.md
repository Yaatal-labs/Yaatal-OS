# Gate 0 — Local Preflight Report
**UTC**: Parent key-check verification at `2026-09-25T04:16:57Z`  
**Host**: MINGW64_NT-10.0 (Windows 10), bash via git-bash  
**Scope**: C:/tmp/pi-pilot-research (neutral root)  
**Constraints**: READ-ONLY; no installs, no downloads, no HTTP calls, no service manipulation

---

## 1.  Git — yaatal-studio-pi-copilot

| Property | Value |
|---|---|
| Branch | `yaatal/studio-pi-copilot-pilot` |
| HEAD | `0b989cce4c56586d6604d495bffb568959980669` |
| Untracked files | `docs/plans/STUDIO-PI-COPILOT-PILOT.md` (1 file) |
| Status | **PASS** — single expected plan file, nothing else dirty |

Worktrees linked from this repo:
- `C:/Users/momo-/OneDrive/Desktop/YAATAL/Yaatal-OS` — branch `yaatal/os-real-surfaces`, **clean**
- `C:/tmp/yaatal-os-harness-transport` — branch `yaatal/os-harness-transport`
- `C:/Users/momo-/OneDrive/Desktop/YAATAL/Yaatal-Engine/.worktrees/Yaatal-OS/poc-demo-closure`
- `C:/Users/momo-/OneDrive/Desktop/YAATAL/Yaatal-Engine/.worktrees/Yaatal-OS/unified-ui-poc`

---

## 2.  Live Toolchain

| Tool | Installed Version | Required (upstream starter) | Local manifest pin |
|---|---|---|---|
| node | **v22.18.0** | >=24.19.0 | — |
| npm | 11.5.2 | — | — |
| pnpm | **10.18.2** | 11.17.0 | 10.18.2 (Yaatal-OS package.json) |
| git | found | — | — |
| corepack | found | — | — |
| fnm | not found | — | — |
| nvm | not found | — | — |
| volta | not found | — | — |

**Verdict**: **BLOCKED** — Node < 24.19.0 and pnpm < 11.17.0 relative to upstream cloudflare-os-starter.  
Note: the local Yaatal-OS repo pins pnpm@10.18.2, not 11.17.0. The 11.17.0 requirement comes from the external upstream starter project, not from any local manifest.

Raw commands:
```
$ COREPACK_ENABLE_NETWORK=0 node --version
v22.18.0
$ COREPACK_ENABLE_NETWORK=0 pnpm --version
10.18.2
$ command -v fnm nvm volta
(empty — none found)
```

---

## 3.  cloudflare-os / cloudflare-os-starter Presence

| Check | Result |
|---|---|
| `C:/tmp/yaatal-cloudflare-os-eval` | **NOT FOUND** (directory does not exist) |
| `package.json` references to `cloudflare-os` under `C:/tmp` | **0 matches** (7 unrelated package.json found) |
| `package.json` references under `Desktop/YAATAL` | **0 matches** (6 unrelated package.json found) |
| `cloudflare-os` string in any file under `C:/tmp` | Found only in plan/research documents (not installed apps) |
| `cloudflare-os` string under `Desktop/YAATAL` | **0 matches** |

**Verdict**: **PASS (absent)** — No cloudflare-os checkout or starter exists in the searched roots. Bounded evidence: absence from these roots, not proof absent system-wide.

Related findings:
- `Yaatal-OS` at `C:/Users/momo-/OneDrive/Desktop/YAATAL/Yaatal-OS` is on branch `yaatal/os-real-surfaces`, clean, packageManager `pnpm@10.18.2`
- `yaatal-studio-pi-copilot` shares worktree with `Yaatal-OS` main checkout
- The plan document `STUDIO-PI-COPILOT-PILOT.md` references the external starter requirements (Node >=24.19.0, pnpm 11.17.0)

---

## 4.  Local TCP Listener Check (ports 8787, 3000)

```
PS> Get-NetTCPConnection -LocalPort 8787 → NOT_LISTENING
PS> Get-NetTCPConnection -LocalPort 3000 → NOT_LISTENING
```

**Verdict**: **PASS (idle)** — No process listening on either port. No-port-snapshot does not guarantee runtime support or functional acceptance. `netstat -an` via git-bash failed (grep exit 1, no output); PowerShell explicit invocation succeeded.

---

## 5.  Pass / Blocked / Unknown Matrix

| Check | Status | Detail |
|---|---|---|
| Git status (plan repo) | **PASS** | Clean, single expected untracked file |
| Toolchain present | **PASS** | node, npm, pnpm, git, corepack all found |
| Toolchain version match | **BLOCKED** | Node 22.18.0 < 24.19.0; pnpm 10.18.2 < 11.17.0 |
| cloudflare-os checkout absent | **PASS** | Not found in searched roots |
| Ports 8787/3000 idle | **PASS** | No listeners |
| Windows/workerd runtime | **UNKNOWN** | Not tested; no verification exists |
| VPS host state | **UNKNOWN** | Out of scope (no SSH access) |

---

## 6.  Recommended Next Step (isolated sandbox)

1. **Create sandbox** at `C:/tmp/yaatal-cloudflare-os-eval` with branch `yaatal/cloudflare-os-adaptation`
2. **Scoped toolchain** — obtain a compatible portable Node and pinned pnpm under `C:/tmp/yaatal-cloudflare-os-eval/.toolchain/`, only after setup approval. Use process-local PATH and explicitly sandbox package-manager caches/stores. Do NOT upgrade global Node/pnpm, activate Corepack globally or install a version manager. The draft's Corepack activation recommendation was not actually shell-local and is withdrawn.
3. **Clone starter** from `github.com/cloudflare/cloudflare-os-starter` (pinned revision), then `git submodule update --init`
4. **Verify** with `pnpm --dir cloudflare-os run-local` **only after authorization** — this installs, builds, and runs upstream baseline

**Write set** (not yet executed — requires Phase 1 authorization):
- `C:/tmp/yaatal-cloudflare-os-eval/` — starter checkout + submodule
- `C:/tmp/yaatal-cloudflare-os-eval/.pnpm-store/` — cache
- `C:/tmp/yaatal-cloudflare-os-eval/cloudflare-os/.wrangler/` plus upstream-generated build outputs inside the sandbox
- `C:/tmp/yaatal-cloudflare-os-eval/.toolchain/` — isolated tooling; no user-wide tooling installation

No global Pi install needed. WABA, NIM and merchant credentials are not baseline prerequisites. Verify the pinned local setup's actual account requirements; do not promise credential-free real agent execution. Model calls need an authorized provider and budget.

## Parent verification
Independently reran `node --version`, network-disabled `pnpm --version`, plan-repo status/branch, sandbox path existence and explicit PowerShell listening-port inspection. Actual outputs: `v22.18.0`, `10.18.2`, sole untracked plan on `yaatal/studio-pi-copilot-pilot`, `NOT_FOUND`, `8787: NO_LISTENER`, `3000: NO_LISTENER`. Combined verification command exited 0. No application tests or launch were performed.

---

*Report generated by Gate-0 preflight agent. Parent orchestrates and reviews; this agent does not execute any command from section 6 without explicit authorization.*
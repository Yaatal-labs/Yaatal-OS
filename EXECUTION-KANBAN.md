# Execution Kanban — BOBO ⇄ Engine (resumable handoff)

**Purpose:** the full execution board for the BOBO⇄Engine alignment + the delivery
marketplace + payments work. Designed so a **fresh session or a different model**
can resume cold. Last updated 2026-07-05.

---

## ▶ How to resume (read this first)

- **Working branch (all repos):** `claude/task-understanding-summary-xzadlz`.
- **Repos & bases (open PRs):**
  - BOBO `MouhamedN96/BOBO-` → PR **#4**, base `codex/bobo-engine-netlify-integration` (the real trunk; **`main` is frozen**).
  - Engine `Yaatal-labs/Yaatal-Engine` → PR **#34**, base `main`.
  - Strategy `MouhamedN96/yaatal-strategy` → PR **#1**, base `main` (private).
- **Read for detail before executing a card:**
  - `BOBO-ENGINE-ALIGNMENT.md` (the plan) + `BOBO-ENGINE-ALIGNMENT-PROGRESS.md` (what's done).
  - Engine `docs/DELIVERY-MARKETPLACE.md` (delivery design) and `docs/PAYMENTS-SEAM.md` (payments decision + step-by-step).
  - `YAATAL-STACK-MAP.md` (Engine, sanitized) for the system map.
- **CI gates:** BOBO — `pnpm install --frozen-lockfile`, `pnpm -r lint`, `pnpm type-check`; Cloudflare **Pages** is the real deploy. Engine — `cargo fmt --all --check`, `cargo check --workspace`, `cargo clippy --workspace --all-targets -- -D warnings`, `cargo test --workspace -- --test-threads=1`.
- **Conventions:** develop on the branch above; keep changes scoped per card; do not push to `main`; no model identifiers in committed artifacts.

---

## ✅ Done (in the open PRs, not yet merged to trunk)

| Card | Repo | Commit |
|---|---|---|
| Kill `@yaatal/client` collision + fix Netlify/Metro (plan #1) | BOBO | `5a81e69` |
| Finish Supabase excision (plan #3) | BOBO | `6b2b895` |
| `CLAUDE.md` + stale-doc banners (plan #6) | BOBO | `35f146e` |
| Delivery **hybrid port** — record lifecycle → Engine (plan #2) | BOBO | `6ab0479` |
| Remove dead direct-Dexchange `payment.service.ts` (payments step 2) | BOBO | `d28137d` |
| Alignment progress & decisions log | BOBO | `f9f6f86` |
| Cross-repo stack map + sanitize | Engine | `c45bddf`,`96fdc95` |
| `docs/DELIVERY-MARKETPLACE.md` design | Engine | `1b2cf15` |
| `docs/PAYMENTS-SEAM.md` decision | Engine | `663fa08` |
| Stack-map footer fix (review nit) | Engine / Strategy | `3c0da0e` / `146bcb0` |
| Full-fidelity stack-map mirror | Strategy | `c2d0874` |

---

## 🔄 In review (PRs open — merge when green + decisions closed)

- **PR #4 (BOBO)** — qodo: clean except the delivery-metadata decision (see Needs-Decision). Cloudflare **Pages ✅**; **Workers Build ❌** = stray infra (see Needs-Decision). 
- **PR #34 (Engine)** — docs only; no CI; qodo positive.
- **PR #1 (Strategy)** — docs only; qodo **clean (0 bugs)** after the footer fix.
- **Action:** open decisions below, then merge; un-freeze BOBO `main` onto the trunk.

---

## ⛔ Needs decision / external action (unblocks the rest)

| Card | Owner | Notes |
|---|---|---|
| **Delivery metadata during hybrid** | founder | `getDeliveryByOrder/Status` now return Engine-only data → `delivery_person_*`/`delivery_cost` blank (graceful, no crash). **Rec: accept degradation**; marketplace Phase 1 restores it server-side. Alt: interim PocketBase shadow-record join (adds PB coupling — against the migration). qodo review on PR #4. |
| **Delivery marketplace decisions** | founder | Build order (**rec: drivers-first**); model shape (**rec: unified `delivery_providers` registry + `delivery_drivers`**); KYC (**rec: reuse `bobo_kyc`**); approval (merchant-approves vs auto-approve-then-rate); payouts (deferred). See `docs/DELIVERY-MARKETPLACE.md` §7. |
| **Cloudflare stray Workers project** | founder/ops | "Workers Builds: bobo" fails independent of code (no `wrangler` config; Pages is green). Disconnect/configure that project in the Cloudflare dashboard. |
| **OM + Free merchant onboarding** | founder/biz | Critical path for the payment adapters — start the Orange/Sonatel + Free/Yas merchant applications in parallel; adapters slot in once sandbox creds land. |
| **Merge PRs + un-freeze `main`** | founder | After decisions above. |

---

## 📋 To do — ready now (no external dependency)

| Card | Repo | Detail / acceptance |
|---|---|---|
| **Payments Step 1 — consolidate `bobo_checkout` → `yaatal-payments`** | Engine | Route the checkout's payment-intent creation through `PaymentsService`/the crate instead of raw SQL; persist `rail`+`provider_ref` (migration); reconcile via the existing webhook router; keep the `503 requires Postgres` guard + HTTP shape; add request tests. Full steps in `docs/PAYMENTS-SEAM.md` §Step 1. **Acceptance:** one payment path; `cargo check/clippy/test` green. |
| **Delivery Phase 1 — driver entity + assignment on the Engine** | Engine → SDK → BOBO | *Gated on the model-shape decision.* Add `delivery_drivers` + `delivery_assignments` (migration + `yaatal-core` models) + self-signup/approval/assign endpoints; SDK `client.delivery.drivers`; re-point BOBO `DeliveryPersonRegistration` + `DeliveryDashboard`. Per `docs/DELIVERY-MARKETPLACE.md` Phase 1. **Acceptance:** a driver signs up via BOBO → appears in the Engine pool → is assignable to a delivery. |

---

## 🌵 Backlog — gated / future phases

| Card | Repo | Gate |
|---|---|---|
| Payments Step 3 — Orange Money adapter (fill `adapters/orange_money.rs`) | Engine | OM onboarding + sandbox creds |
| Payments Step 4 — Free Money adapter (fill `adapters/free_money.rs`) | Engine | Free onboarding; API discovery |
| Delivery Phase 2 — provider registry + `DeliveryProviderAdapter` trait + external-agency adapter + webhook ingestion | Engine | Phase 1 landed |
| Delivery Phase 3 — quotes/pricing + auto-selection | Engine | Phase 2 landed |
| SDK pin bump (plan #4) — `confirmByCode`, `delivery_code`/`code_used_at`, `live_session_id`, `yaatal` CLI | SDK → BOBO | SDK `claude/project-synthesis-jnami5` merge |
| Pass `live_session_id` through BOBO checkout (QR deep-link attribution) | BOBO | SDK bump above |
| Re-point remaining delivery screens (preferences, tracking) at the Engine; drop last PocketBase delivery bits | BOBO | Delivery phases 1–3 |
| Port `chat.service.ts` off PocketBase (or park with a note) | BOBO | after delivery |
| Payouts / disbursement design (driver/agency settlement, merchant payout) | Engine | payments + marketplace |

---

## Session/tooling notes (for the next runner)

- Subagent runs earlier hit an **account session limit**; worktree isolation isn't
  available (session root isn't one git repo) — use **manual `git worktree add`** for parallel work.
- `AskUserQuestion`, `Artifact`, and `send_later` intermittently need interactive
  approval / hit stream errors in this environment — fall back to prose + committed docs.
- MCP connector `cad50a44…` needs authorizing in claude.ai connector settings.

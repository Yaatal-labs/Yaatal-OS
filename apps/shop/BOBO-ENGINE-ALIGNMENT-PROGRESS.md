# BOBO ⇄ Engine — Alignment Progress & Decisions Log

*Companion to `BOBO-ENGINE-ALIGNMENT.md` (the plan). This is the running record
of what has been executed against that plan, the architecture decisions made,
and what is queued next. Last updated 2026-07-05.*

Work landed on the branch `claude/task-understanding-summary-xzadlz` across the
affected repos (BOBO based on the integration trunk `codex/bobo-engine-netlify-integration`).

---

## 1. Context correction (shaped everything)

The local BOBO checkout was frozen **`main`** (PowerSync/PocketBase/Supabase),
while the real trunk is `codex/bobo-engine-netlify-integration`. All BOBO work
was re-based onto that trunk — the alignment plan's items only make sense there.

---

## 2. Alignment plan — execution status

| # | Item | Status |
|---|---|---|
| 1 | Kill `@yaatal/client` collision + fix Netlify | ✅ done |
| 2 | Port delivery to the Engine | ✅ done (`delivery.service.engine.ts`; marketplace features staged) |
| 3 | Finish Supabase excision | ✅ done |
| 4 | Bump SDK pin when new surface merges | ⏳ pending SDK merge |
| 5 | Decide the payments seam | ✅ **decided** (direct rails, no aggregator) |
| 6 | Housekeeping (CLAUDE.md, stale docs) | ✅ done |

### Commits (BOBO, off the integration trunk)
| Commit | Item | Summary |
|---|---|---|
| `5a81e69` | #1 | Delete stale `packages/client/`, drop the Metro alias pinning it, fix `netlify.toml` |
| `6b2b895` | #3 | Finish Supabase excision (code + deps + lockfile pruned, SDK pin preserved) |
| `35f146e` | #6 | Add `CLAUDE.md`; stale banners on `REMOVAL_LOG.md`/`ARCHITECT.md` |
| `6ab0479` | #2 | Delivery hybrid port — record lifecycle → Engine, `confirmDelivery` added |
| `d28137d` | #5 | Remove dead direct-Dexchange `payment.service.ts` |

### Companion Engine docs (`Yaatal-labs/Yaatal-Engine`)
- `YAATAL-STACK-MAP.md` — cross-repo system map (sanitized; full copy in the private strategy repo).
- `docs/DELIVERY-MARKETPLACE.md` — delivery marketplace design.
- `docs/PAYMENTS-SEAM.md` — payments decision + plan.

Verification that actually ran: Supabase change passes `pnpm install --frozen-lockfile`;
the delivery hybrid port type-checks clean against the real SDK types.

---

## 3. Decisions made

### Delivery → a marketplace (design banked, Engine build pending sign-off)
- **Delivery port DONE:** delivery record lifecycle on the Engine via
  `delivery.service.engine.ts`. Merchant preferences, driver pool, quotes,
  assignment remain stubbed pending Engine marketplace.
- **Chat port DONE:** `chat.service.engine.ts` now Engine-backed.
- **AI port DONE:** `ai.service.engine.ts` now Engine-backed.
- **PocketBase fully removed** — 8 files deleted, npm dependency dropped.
- **Vision:** merchant preferences + **pluggable third-party carriers (API adapters)**
  + **individual driver self-signup**. BOBO already has the UI for all of it.
- **Shape (recommended):** unified `delivery_providers` registry
  (`bobo_managed | individual_driver | external_agency`) + a `delivery_drivers`
  entity + one `DeliveryProviderAdapter` trait; **drivers-first**; reuse `bobo_kyc`.
- **Open (need sign-off):** build order, model shape, KYC reuse, approval model
  (merchant-approves vs auto-approve-then-rate), payouts (deferred).

### Payments → direct rails, no aggregator (DECIDED)
- The Engine owns every rail via the `yaatal-payments` adapter trait; the app
  never touches a PSP. **Aggregator (Dexchange) rejected** (legitimacy/reliability
  + middleman risk vs. the sovereignty thesis).
- **Rails:** Wave **live**; **Orange Money** next (coverage); **Free Money** next
  (strategic — Free/Axian as a potential DC/infra partner; rail = relationship wedge).
- **Done:** removed the app-side Dexchange path (step 2).
- **Next:** consolidate `bobo_checkout` onto `yaatal-payments` (step 1, its own
  verified pass); then OM + Free adapters (gated on onboarding); payouts deferred.

---

## 4. Next actions (queued)

1. **Payments step 1** — consolidate `bobo_checkout` → `yaatal-payments` (Engine,
   verified; plan in `PAYMENTS-SEAM.md`).
2. **Delivery Phase 1** — `delivery_drivers` + `delivery_assignments` on the Engine
   + self-signup/approval/assign endpoints → re-point the two BOBO screens →
   SDK `client.delivery.drivers`.
3. **Start OM + Free merchant onboarding in parallel** — critical path for those adapters.
4. **SDK bumps** as each Engine surface lands. PocketBase is fully removed —
   no remaining PocketBase surfaces. Only delivery marketplace features
   (driver pool, quotes, assignment) remain stubbed pending Engine marketplace.
5. **Housekeeping** — un-freeze BOBO `main` onto the integration trunk.

---

## 5. Still open / needs a call

- Delivery marketplace open decisions (§3) before the Engine build starts.
- Payments step 1 go-ahead.

# Ship-Learn-Next Plan: Complete Unified UI

## Quest Overview

**Goal:** ship a populated, authenticated native Yaatal OS UI that transfers the
approved SELL and SHOP mock compositions without replacing existing Engine,
Harness, Studio, BOBO, or Commerce Sheet authority. The proof is visual and
end-to-end evidence, not a passing test count.

**Quest rule:** every rep follows **Ship → Learn → Next**. Produce an artifact,
record what actually happened, then use that evidence to scope the next rep.
Rep 1 starts immediately; do not wait for another planning pass.

**Source:**

- `docs/UNIFIED-UI-RECOVERY-HANDOFF.md` — current runtime boundaries, exact
  target files, and acceptance path.
- `docs/design/YAATAL-OS-UI-CONTRACT.md` — shell, theme, density, interaction,
  and accessibility contract.
- `docs/design/yaatal-os-sell-light.png`
- `docs/design/yaatal-os-sell-dark.png`
- `docs/design/yaatal-os-shop-light.png`
- `docs/design/yaatal-os-shop-dark.png`

**Starting point:** pushed base `8b7b307`; `check`, the full suite (**84/84**),
and production build pass. The current UI is **not full visual parity**:
populated native SELL/SHOP side-by-side screenshots and physical-phone E2E are
unproven.

### Core Lessons

1. Reuse working surfaces before replacing them. Studio owns seller/live behavior;
   BOBO owns catalog/product/checkout behavior; Yaatal OS owns the one persistent
   shell.
2. Real data beats mock-shaped filler. Product identity, stock, delivery,
   payments, voice, live status, and governance state must remain honest.
3. Layout is a product requirement. Match hierarchy, density, media emphasis,
   typography, theme, and responsive behavior before calling visual work done.
4. Tests prove contracts; screenshots prove visual transfer; a signed-in native
   and phone run proves the user journey. Each is necessary and none replaces the
   others.
5. Keep boundaries narrow. A visual gap is not permission to rewrite Engine or
   Harness, create a shell, or duplicate Studio/BOBO plumbing.

### Global guardrails

Do not research branches, rewrite Engine/Harness, create a new shell, duplicate
Studio/BOBO plumbing, invent data, change service boundaries speculatively, or
declare completion from tests alone. If an authenticated run proves a boundary
defect, record the request, response, product/session IDs, and visible symptom
before proposing a service change.

---

## Rep 1: Authenticated SELL Mock Parity

**Ship Goal:** transfer the approved SELL live-room composition into the existing
authenticated unified SELL workspace, using Studio’s live dashboard state, assets,
and visual patterns. Ship a real native SELL screenshot pair and a focused diff;
do not build a second cockpit.

**Timeline:** start immediately; ship the first evidence within 1–3 working days.

**Success Criteria:**

- [ ] `SellWorkspace.tsx` and `SellWorkspace.css` express a dominant real media
  stage with honest live status, elapsed state, and product truth.
- [ ] The selected product is clear in a dense horizontal product strip and still
  uses the existing validated product-selection path.
- [ ] Activity/governance is a compact right rail that renders actual Studio state
  or an explicit unavailable state.
- [ ] The bottom dock keeps live, share, SHOP, and microphone/voice availability
  compact and usable without inventing authority or assistant output.
- [ ] Signed-in native SELL evidence exists against the SELL light mock at
  1280x800; visible deltas are recorded, not hand-waved.
- [ ] Existing focused tests still pass; tests are recorded as regression evidence,
  not visual acceptance.

**What You’ll Learn/Practice:**

- Turning an approved layout into an existing data-bound component rather than a
  static imitation.
- Preserving honest unavailable state while improving density and hierarchy.
- Using live screenshot deltas to drive the next UI correction.

**Minimal Resources:**

- `apps/studio/live/dashboard/os.html`, `os.js`, `os.css`, and `img/`.
- `apps/desktop/src/unified/features/sell/SellWorkspace.tsx` and
  `SellWorkspace.css`.
- SELL light/dark references and the UI contract; no new design library.

**Action Steps:**

1. Open the SELL light mock beside the current signed-out preview and inventory
   only the stage, strip, activity rail, and control dock deltas.
2. Inspect the corresponding Studio `os.*` markup/CSS/assets and map each visual
   part to current real `SellWorkspace` state and callbacks.
3. Change only `SellWorkspace.tsx` and `SellWorkspace.css` to transfer those
   patterns while retaining adapter calls, product IDs, and native event behavior.
4. Launch the native unified app, sign in directly, connect Studio, and select a
   real queued product.
5. Capture native SELL at 1280x800 in light mode beside the reference; log exact
   mismatches in layout, spacing, media, controls, and unavailable states.
6. Run focused SELL tests and `pnpm --filter @yaatal/os-shell check`; ship the
   code plus screenshot/provenance artifact for this rep.

**After Shipping Reflection:**

- What did the real Studio session populate, and what remained unavailable?
- Which mock details transferred cleanly from Studio, and which were only visual
  assumptions?
- Did any current data contract prevent parity? Record evidence, not a guess.
- Rate the rep 1–10. What is the one highest-impact SELL correction to carry into
  the dark/compact pass?

---

## Rep 2: Authenticated SHOP Mock Parity

**Ship Goal:** transfer the approved SHOP desktop composition into the existing
authenticated SHOP workspace by reusing BOBO’s product media, detail, and checkout
patterns. Ship a real selected-product native SHOP view; do not replace the
existing Commerce Sheet authority.

**Timeline:** begin after Rep 1 reflection; ship within the next 1–3 working days.

**Success Criteria:**

- [ ] `ShopWorkspace.tsx` and `ShopWorkspace.css` provide the intended three
  regions: media/seller context, product truth/options, and purchase/delivery/
  governance action.
- [ ] **Open in SHOP** retains the selected SELL product ID and resolves fresh
  product truth instead of copied display-only data.
- [ ] Real media is prominent; a failure is explicit; variants, stock, delivery,
  and payments are never invented to fill the composition.
- [ ] The Commerce Sheet entry remains visibly tied to the current real product
  and preserves the existing public/phone path.
- [ ] Signed-in native SHOP evidence exists against the SHOP light mock at
  1280x800, with differences recorded.
- [ ] Focused SHOP tests and TypeScript checks remain green as regression gates.

**What You’ll Learn/Practice:**

- Adapting BOBO’s real product-detail and checkout hierarchy without carrying
  duplicate BOBO application chrome into the OS shell.
- Treating product continuity as both a visual and data-integrity requirement.
- Designing a purchase region that remains useful when authoritative information
  is missing.

**Minimal Resources:**

- `apps/shop/bobo-app/src/components/ProductCard.tsx`.
- `apps/shop/bobo-app/src/screens/customer/ProductDetailScreen.tsx` and
  `CheckoutScreen.tsx`.
- `apps/shop/bobo-app/src/theme/{colors,typography,spacing}.ts`.
- `apps/desktop/src/unified/features/shop/ShopWorkspace.tsx`, `ShopWorkspace.css`,
  plus the SHOP light reference.

**Action Steps:**

1. Compare the SHOP light mock with a real selected product and identify only the
   three-region, media, product truth, and purchase-path gaps.
2. Inventory BOBO’s reusable card, product-detail, checkout, and token patterns;
   retain the existing unified shell and adapter boundaries.
3. Transfer the necessary presentation into `ShopWorkspace.tsx` and
   `ShopWorkspace.css`; use `ShareDialog.tsx` only if existing Commerce Sheet
   framing needs a visual adjustment.
4. In the native app, select a real product in SELL, use **Open in SHOP**, and
   verify the displayed identity against fresh Engine product truth.
5. Capture authenticated SHOP light at 1280x800 beside the mock and write down
   visible deltas.
6. Run focused SHOP tests and `pnpm --filter @yaatal/os-shell check`; ship the
   smallest change set that produces the evidence.

**After Shipping Reflection:**

- Did SELL-to-SHOP continuity survive a real selection, refresh, and return?
- Which BOBO patterns improved the hierarchy without importing duplicate chrome?
- Which data fields were unavailable, and was that absence communicated honestly?
- Rate the rep 1–10. What is the one risk to test before responsive/theme work?

---

## Rep 3: Theme and Viewport Screenshot Matrix

**Ship Goal:** make the transferred SELL/SHOP UI hold its hierarchy across light,
dark, desktop, compact desktop, and narrow SHOP, then ship a complete screenshot
matrix with concrete deltas.

**Timeline:** begin after Rep 2; complete within 1–2 working days.

**Success Criteria:**

- [ ] SELL light and dark are captured at 1280x800 and 900x600.
- [ ] SHOP light and dark are captured at 1280x800 and 900x600.
- [ ] Narrow SHOP is captured in light and dark, with product-first reading order,
  purchase path, and Commerce Sheet entry intact.
- [ ] Switching theme preserves active workspace, selected product, shell locale,
  and live-session context.
- [ ] The header/rail/controls respect the 64 px header, 224/72 px rail, 44 px
  targets, visible focus, explicit dark tokens, and natural media exposure.
- [ ] Every screenshot carries commit, viewport, theme, native/signed-in state,
  and product ID; unresolved deltas have owners and next actions.

**What You’ll Learn/Practice:**

- Verifying responsive behavior as a composition problem, not just an overflow
  problem.
- Applying intentional dark tokens while preserving product media and contrast.
- Turning a screenshot matrix into a factual acceptance artifact.

**Minimal Resources:**

- All four approved PNGs and `YAATAL-OS-UI-CONTRACT.md`.
- `apps/desktop/src/unified/App.tsx`, `state.ts`, `styles.css`, and the SELL/SHOP
  CSS from Reps 1–2.
- The existing native launch and test commands in the recovery handoff.

**Action Steps:**

1. Make a capture checklist before editing: workspace, viewport, theme, selected
   product ID, session state, and reference PNG.
2. Test light/dark workspace switching in native mode; correct only shell/theme/
   responsive defects in `App.tsx`, `state.ts`, `styles.css`, or the relevant
   workspace CSS.
3. At 1280x800 and 900x600, capture populated SELL and SHOP in both themes.
4. At the narrow SHOP breakpoint, verify deliberate reflow, access to purchase,
   focus order, and Commerce Sheet entry; capture light and dark.
5. Compare every image to its approved mock, log visible differences, and make one
   bounded correction cycle rather than a speculative redesign.
6. Run `check` and the full suite; ship the matrix and its provenance.

**After Shipping Reflection:**

- Which breakpoint altered hierarchy rather than merely reducing whitespace?
- Did dark mode preserve product-media exposure and text/control contrast?
- Which screenshot has the most consequential remaining mismatch?
- Rate the rep 1–10. Is the UI ready for native/phone journey proof, and why?

---

## Rep 4: Native and Physical-Phone Journey Proof

**Ship Goal:** prove the real user path from native sign-in through one attributed,
idempotent SELL conversion using the physical-phone Commerce Sheet and sandbox
receipt.

**Timeline:** start after the visual matrix is acceptable; complete in 1–2 working
days, coordinated with direct user sign-in and a phone on the reachable network.

**Success Criteria:**

- [ ] The native app signs in directly and connects the owned Studio session.
- [ ] A real queued product is selected in SELL; live state, media, activity, and
  compact controls render without invented data.
- [ ] **Open in SHOP** carries the validated product identity and resolves fresh
  Engine product truth.
- [ ] A physical phone opens the Commerce Sheet for that product and reaches the
  sandbox receipt through the configured safe gateway.
- [ ] Exactly one attributed SELL conversion appears; a replay proves idempotency
  rather than producing another conversion.
- [ ] Evidence records commit, Engine/Studio/gateway endpoints, timestamps,
  redacted identifiers, screenshots, receipt result, and pass/fail outcome.

**What You’ll Learn/Practice:**

- Testing an integration through the real authority boundaries rather than mocked
  UI state.
- Separating sandbox receipt proof from any claim about production settlement.
- Writing reproducible evidence without leaking credentials, tokens, grants,
  cookies, nonces, or control URLs.

**Minimal Resources:**

- Recovery handoff launch constraints and environment variables.
- Existing native adapter, Studio gateway, and phone-safe Commerce Sheet gateway.
- A user-operated native sign-in and a physical phone; no new backend service.

**Action Steps:**

1. Confirm the deployed Engine health and read the current catalog; never hardcode
   the previous product, price, or stock.
2. Launch the native renderer with unified gates, then have the user sign in
   directly and connect Studio without sharing credentials.
3. Select a real queued product in SELL; record the redacted product/session
   provenance and open it in SHOP.
4. Set the confirmed phone-reachable Commerce Sheet base, keep Studio loopback
   only, and open the Sheet on a physical phone.
5. Complete the sandbox flow, collect receipt evidence, verify one attributed
   conversion, then repeat only the idempotent request path to verify no duplicate.
6. Shut down local processes if appropriate, redact sensitive output, and ship the
   E2E evidence with explicit unverified production-settlement caveats.

**After Shipping Reflection:**

- Where did the real journey diverge from the prepared visual/runtime plan?
- Did any boundary fail closed or leak duplicate state? What exact evidence shows
  that?
- Did the Commerce Sheet remain product-correct on the phone?
- Rate the rep 1–10. What evidence is still required before default rollout?

---

## Rep 5: Acceptance, Rollout, and Rollback Decision

**Ship Goal:** produce the acceptance packet and a reversible rollout decision
for the unified renderer. Retire the legacy/default path only after the evidence
packet proves the preceding reps.

**Timeline:** begin after Rep 4 reflection; complete within 1 working day after
all required evidence is available.

**Success Criteria:**

- [ ] The acceptance packet links the full screenshot matrix, code commit(s),
  test/check/build output, native/phone E2E provenance, receipt result, and
  attributed/idempotent conversion evidence.
- [ ] Each artifact identifies its commit, date/time, environment, viewport/theme
  where applicable, product/session IDs in redacted form, and the exact pass/fail
  claim it supports.
- [ ] Remaining gaps are stated plainly; no artifact is used to imply production
  money settlement, model-backed speech, or visual parity it did not prove.
- [ ] A named rollback tag/target and recovery steps are prepared before changing
  the default renderer or retiring a legacy path.
- [ ] The go/no-go decision is reviewable and limited to the evidence; default
  rollout occurs only on an affirmative acceptance decision.
- [ ] `pnpm --filter @yaatal/os-shell check`, full tests, and production build are
  rerun at the candidate commit and included in the packet.

**What You’ll Learn/Practice:**

- Treating release evidence and rollback as part of the shipped product.
- Making a narrow go/no-go decision instead of declaring success from effort or
  green tests.
- Preserving an auditable boundary between sandbox proof and production claims.

**Minimal Resources:**

- Artifacts from Reps 1–4, the recovery handoff, and the UI contract.
- Git history and the approved release/rollback procedure; no branch archaeology.

**Action Steps:**

1. Assemble a single acceptance index listing each screenshot, command result,
   native/phone artifact, commit, and provenance field.
2. Check the index against every Rep 5 criterion and mark missing evidence as a
   blocker rather than replacing it with prose.
3. Run the final check, full suite, and production build at the candidate commit;
   record output and tool versions.
4. Prepare the named rollback target and the exact condition that triggers it;
   do not retire the legacy/default path yet.
5. Review the packet with the decision-maker: approve rollout, hold for one
   bounded correction, or reject with the exact failing criterion.
6. Only after approval, switch the default/retire the legacy path according to the
   approved rollback plan; preserve the evidence packet.

**After Shipping Reflection:**

- Which artifact made the rollout decision easy, and which was hardest to obtain?
- Did the acceptance packet expose any claim that was stronger than its evidence?
- Was rollback concrete enough to execute under pressure?
- Rate the rep 1–10. What should become the template for the next UI transfer?

---

## Start Now

Rep 1 is the next action: compare the SELL light mock with a signed-in native
session, transfer only the mapped Studio patterns into `SellWorkspace`, and ship
the first populated 1280x800 light evidence. Learning here is doing better through
the next real artifact, not another research cycle.

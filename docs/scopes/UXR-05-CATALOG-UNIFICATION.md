# UXR-05 — catalog unification

Pickup document. Written 2026-09-03 for whoever takes this next; assume no memory of the
conversation it came from.

**Branch from `yaatal/os-real-surfaces`** (tip `8aa4ee5`). Not `yaatal/os-whatsapp-login`
— that is the auth lane (UXR-04/07) and the two were deliberately separated so either can
reach `main` without dragging the other. Putting work on the wrong one re-couples them.

## What is already done

`06cc701` landed the media half: seven 4:5 WebPs under
`apps/studio/live/dashboard/img/`, plus placeholder logic in `studio_server.py` and
`os.js`. That commit is explicit about the policy it chose, and it should be preserved:

> `# UXR-05: fallback-only, never a silent substitution — the placeholder is [marked]`

A missing image shows a *visibly* marked placeholder. It never quietly substitutes a
different product's photo, because a demo that silently shows the wrong picture is worse
than one that shows a gap.

**The board row for UXR-05 is stale** — it still reads "fixture unification pending",
which is now an accurate description of what remains rather than of the whole card.
Update it when you finish; a stale row is how work gets done twice.

## What remains

The card's own acceptance line: **SELL and SHOP show the same IDs, names, prices, stock
and optimized 4:5 media.**

The shape of this is narrower than "build a shared fixture", because SELL does not read a
fixture at all:

```
apps/studio/live/studio_server.py:483   products = await engine.get_session_products()
apps/studio/live/studio_server.py:486   products = await engine.get_catalog()
apps/studio/live/studio_server.py:963   (same pair, second call site)
```

SELL's source of truth is **the Engine**. So the task is not "write a JSON both read", it
is "make SHOP resolve the same canonical IDs the Engine already serves".

Suggested order:

1. Read the two `studio_server.py` call sites above and note what shape the Engine
   returns — ids, names, prices, stock, media references.
2. Find SHOP's equivalent. Start at `scripts/build-shop.mjs` and the bundled Shop output.
   Establish whether it calls the same Engine endpoint at runtime or ships a snapshot
   baked at build time. **Do not assume — check.**
3. If they diverge: prefer making SHOP read the same endpoint. If BOBO genuinely must
   ship a snapshot, generate that snapshot *from* the Engine catalog during
   `build-shop.mjs`, so drift becomes impossible rather than merely unlikely. A snapshot
   maintained by hand beside a live endpoint will diverge, and the divergence will first
   appear during a demo.
4. Map the seven committed WebPs onto the canonical product IDs.

## Do not touch

These belong to UXR-04/07 and are live on the other branch. Editing them here creates a
conflict that did not need to exist:

```
apps/desktop/src-tauri/src/session.rs
apps/desktop/src-tauri/src/main.rs
apps/desktop/src/main.ts
apps/desktop/src/shop.ts
```

If catalog work genuinely needs `main.ts` or `shop.ts`, say so on the board first rather
than resolving it in a merge later. That coordination note already exists under
"Write-set note — UXR-05 vs UXR-07" in `BOARD.md`.

## Done when

- Both panes render the same product IDs at **1280×800 and 900×600**
- The fallback-only placeholder rule still holds — no silent substitution
- The UXR-05 board row names the commit that did it

## Why it matters

**UXR-06 depends on this.** Its acceptance run is *Login → SELL → select product → SHOP
detail → Commerce Sheet → sandbox receipt*, and step three cannot pass if the two panes
disagree about what the catalogue contains. UXR-05 is the last functional blocker before
the POC is demonstrable; everything after it is a validation pass.

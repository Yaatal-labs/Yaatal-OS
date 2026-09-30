# UIR-02A React foundation checkpoint

Date: 10 September 2026
Commit tested/reviewed: c1268a1
Branch: yaatal/unified-ui-poc

The existing Vite/Tauri package contains the reviewed React shell, Radix-based shadcn primitives, approved theme tokens, self-hosted type, shared workspace selection, and native session adapter. The legacy entry is preserved exactly from baseline 68044e4 and remains the default. No prior branch work was reimplemented or cherry-picked.

## Verification

- pnpm check: passed.
- pnpm test: 30 shell tests and 3 protocol tests passed.
- Unified Vite build: passed before the final layout/accessibility fixes; full packaging acceptance remains pending.
- Spec review and code-quality review: approved.
- Browser inspection found no warning/error console messages. The mobile account dialog was corrected to fit at 390 px, navigation targets meet 44 px, and bronze small-text contrast uses a separate accessible token.
- Regression coverage includes deferred session restoration, native/renderer mismatch, validated session results, renderer isolation, and existing legacy behavior.

These checks cover the foundation only. SELL and SHOP currently contain honest placeholders. No native gateway, native commerce, packaged launch, or physical-phone acceptance is claimed.

## Confirmed dependencies

A read-only audit of Engine yaatal/os-integration at 4b7cb1a found no variants/options in the product model or CatalogProductResponse. BOBO has no alternative authoritative variant source. Studio's M/L examples occur only in manually supplied test fixtures. Preserve absent variants; variant acceptance remains blocked until an authoritative source exists.

Engine has reusable disposable-account setup in scripts/demo-loop.sh and credential fixtures in crates/yaatal-api/src/fixtures/users.yaml. Neither proves a usable account exists in the active database. No accounts were created and no credentials were copied or logged during this audit.

The unowned Studio on 8484 previously reported a different Engine origin. Unified acceptance should launch its own sidecar on 8485 with explicit source and Engine configuration, then verify actual health and provenance before use.

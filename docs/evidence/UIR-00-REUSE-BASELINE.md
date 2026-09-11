# UIR-00 reuse and baseline evidence

Date: 10 September 2026
OS branch: yaatal/unified-ui-poc
Baseline: 68044e440952b9442c38d539763542946dbdad19
Goal: lean unified UI, testable POC, verified commerce demo.

## Reuse decisions

- GitHub branch tips were read directly. os-real-surfaces (8c757ca) and poc-demo-closure (5587306) introduce zero commits outside this branch. Their UI, media, auth-race and embedded-commerce work is already present. No cherry-picks or duplicate implementation are needed.
- Engine local yaatal/wiki at df7d4007, docs/wiki/README.md: merchant-first Social Commerce OS; AI removes an access barrier rather than becoming dashboard decoration. It is an August 28 snapshot; newer September OS contracts govern this UI migration.
- Studio presence-sales-cockpit at 35a97b25 is explicitly a July adoption PLAN. Its one-window/shared-attribution ideas are useful; its proposed clip pipeline and second sidecar are not implemented OS features or part of this slice.
- OS approved design contract and four reference images remain the visual baseline.
- UXR-06A on poc-demo-closure documents working sharing, request cancellation and last-response-wins conversion refresh. Preserve those behaviors and tests in the React adapter.
- Reuse os-protocol sanitizers, existing Rust session and supervisor, BOBO pure catalog/media mappings, Studio live/commerce endpoints, and public Commerce Sheet. Replace iframe rendering only.
- GitHub OS wiki is enabled but its wiki Git repository was not available. The central wiki was found in the Engine yaatal/wiki worktree instead.

## Fresh checks

| Check | Result |
|---|---|
| pnpm check | Passed for shell and protocol |
| pnpm test | 18 shell + 3 protocol tests passed |
| cargo fmt --check | Passed |
| cargo test --locked with existing POC target cache | 4 tests passed |
| Engine GET /health | 200 |
| Studio GET /health and /api/os/status | 200 |
| Engine public catalog | 7 products; canonical Robe Wax Bleue present at 12,500 FCFA, stock 12 |
| Engine bootstrap path GET | 405: path exists but POST auth behavior is not yet validated |

The initial sandboxed Vitest run failed with EPERM opening vitest.mjs; the same tests passed outside the sandbox. This did not require moving the repo or reinstalling dependencies.

The first native build used the default target and failed linking when the C drive filled. Only compiler outputs created by that failed attempt were reclaimed; earlier build caches and sources were preserved. Reusing the existing POC target made the native baseline pass. Set CARGO_TARGET_DIR explicitly before further native builds, and keep build concurrency at one on this disk-constrained host.

## Runtime differences to resolve

- Engine is reachable at http://localhost:5150 (IPv6 loopback listener).
- Existing Studio on 127.0.0.1:8484 runs from the poc-demo-closure checkout and uses Engine http://100.121.164.39:18080. It has no reported Git SHA.
- Do not silently adopt that process for unified acceptance. Start an owned unified sidecar on a distinct loopback port, with the chosen Engine URL and source provenance recorded.
- Public base currently points at desktop loopback; physical-phone acceptance needs the existing tailnet/public gateway configured for Commerce Sheet paths.
- Canonical catalog response has no variants/options. Preserve variants when authoritative data supplies them and resolve that dependency before claiming variant acceptance.
- Legacy os_studio_bootstrap_grant returns a nonce to the iframe renderer. Exclude that command from the unified native registry; frontend feature flags alone are insufficient.

No unified runtime, end-to-end commerce, phone or visual acceptance is claimed by these baseline checks.

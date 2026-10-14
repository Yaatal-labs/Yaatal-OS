# OS integration checks

2026-10-14. Baseline: merged main `a002ff1`, with native navigation draft #23 at `7b1c164`.

## Commerce reporting

The operator query now includes Commerce Sheet buyer confirmation (`commerce.escrow_moved`, `trigger=confirm`) and disputes (`trigger=dispute`), alongside the older BOBO event family. Automatic and operator releases are excluded from buyer confirmations. Wave remains a count of webhook events, including redelivery, rather than unique successful payments.

The event names were checked against Engine main `3fec6c4`: `controllers/commerce.rs`, `controllers/bobo_orders.rs`, and `controllers/payments.rs`.

Verification: 15 board tests passed using the existing Vitest installation with an isolated Node runner, mocked upstream fetches and a `cloudflare:workers` RpcTarget stand-in. The regression failed against the older query before the change. Spec and independent quality review passed; whitespace checks passed.

This does not establish live PostHog execution or a workerd runtime pass. The adapter checkout lacks the upstream Cloudflare OS tsconfig and generated Worker types, so its normal package type/runtime gates remain unavailable without that upstream workspace.

## Native qualification

The six existing offline-page tests passed. Source review found Android Back handling in the locked Tauri Android implementation, existing Google browser/deep-link handoff, and camera/microphone permission handling. No additional native implementation was justified by these checks.

Installed Google authentication, permission allow/deny/revoke, phone broadcasting to a second device, OBS media, and recovery from later network loss still need device and service acceptance. Marché has a merged deployment record; its reserved payment bridge remains unimplemented. These checks did not launch, deploy, or modify any service or credentials.

# Native clients and service alignment

Base: OS main `a002ff1911f223e791a0424e10f65b2e85927f91`. Companion web change: Kairmel draft PR 37 at `1fa2ef1c13c9284b99fc64a81a76796697c91a50`.

The user requires a reuse check before implementation. Each lane searched current main, available feature branches, shared modules and prior verification tools. No branch or checkout holding earlier work is reset or deleted.

| Lane | Existing work to reuse | Proven gap and bounded output |
| --- | --- | --- |
| Desktop | Hosted Tauri shell, empty web IPC, URL allowlist, native Google handoff, offline page, prior Windows release | Existing menu/config/build helper gains five merchant shortcuts. Existing workspace path join must keep the configured origin. Tests cover route mapping and rejected origin escapes. |
| Android | Same shell, permissions, insets, native auth, tester APK, Tauri generation of Gradle plugin registration | Verify the existing CLI build from a clean disposable copy and record installed-device acceptance. No replacement generator, permissions feature or Android renderer. |
| Service contracts | Existing unification proposal/runbook, gateway account/credit contracts, platform AI-credit adapter, Marché publishing client, canonical native OAuth contract | Short supplements identify missing session/catalogue/payment seams and acceptance evidence. No duplicated AI-credit adapter or second OAuth contract. |

Native code carries navigation and platform integration. Engine keeps identity, payment and fulfillment authority. The browser receives no native IPC permissions or privileged service credentials. Native Google and installed media acceptance remain dependent on server configuration and device checks; builds do not prove those flows.

Specification review precedes independent code-quality review. Verify the changed Rust module tests, formatting, compilation and lint; retain existing shell JS checks. Record the Android generator/build result and its limits. Prepare one OS draft PR for the native alignment and contract supplements. Deployment, billing/provider credentials, signing-key changes and release publication are outside this branch.

The user's [mobile design reference](https://www.rapidnative.com/blogs/mobile-app-design-best-practices)
informs the next device audit. Reuse Kairmel PR 37's `MerchantNavigation`, destination
map and existing design tokens. Check thumb reach, text scaling, keyboard/safe-area
behavior and weak-network recovery in that shared interface before proposing UI changes.

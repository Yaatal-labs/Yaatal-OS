# Native alignment verification — 2026-10-13

OS baseline: `a002ff1911f223e791a0424e10f65b2e85927f91`; branch
`yaatal/native-merchant-alignment`. Companion hosted routes:
[Kairmel draft PR 37](https://github.com/Yaatal-labs/kairmel-platform/pull/37)
at `1fa2ef1c13c9284b99fc64a81a76796697c91a50`.
OS main was checked again before preparing this draft and still matched the baseline.

## Reuse gate

The review covered current OS main, local feature refs, the existing Android and
desktop checkouts, SDK code and the companion Kairmel branch. The older desktop
rebase has an equivalent patch already on main. The Android, native Google,
Android media and 0.1.1 release work are also on main. The unmerged Atelier work
belongs to the earlier `apps/desktop` renderer and was preserved.

The desktop lane searched 31 local OS refs for merchant routes, menu IDs and
configuration names. The current hosted shell had no merchant shortcuts. It
already supplied navigation, native Google handoff, offline fallback and empty
remote IPC permissions. The Kairmel merchant destination contract was reused.

Android already had permissions, insets and deep-link support. Tauri's build
generator already registers Android plugins; adding another generator or editing
its machine-specific output would duplicate that work. The existing platform
AI-credit adapter and Marché publishing client were also reused. This branch adds
no replacement mobile renderer, credit adapter, OAuth flow or business service.

## Desktop and shared source checks

Windows verification used Rust `1.98.1` with MSVC, the existing Cargo cache and an
owned target directory. The existing static-page generator completed successfully.

| Check | Result |
| --- | --- |
| `cargo +1.98.1 test --manifest-path apps/kairmel-shell/src-tauri/Cargo.toml --locked --offline -- --test-threads=1` | 51 passed, 0 failed, 0 ignored; includes all 39 existing tests and 12 new tests |
| `cargo +1.98.1 check --manifest-path apps/kairmel-shell/src-tauri/Cargo.toml --locked --offline` | Passed |
| `cargo +1.98.1 clippy --manifest-path apps/kairmel-shell/src-tauri/Cargo.toml --all-targets --all-features --locked --offline -- -D warnings` | Passed |
| `cargo +1.98.1 fmt --manifest-path apps/kairmel-shell/src-tauri/Cargo.toml --check` | Passed |
| `node apps/kairmel-shell/scripts/build-static.mjs` | Passed |
| Existing offline Vitest suite, `--configLoader runner` | 6 passed |
| Android CLI debug APK, clean baseline and aligned source, arm64 | Both passed; Tauri regenerated plugin wiring without a patch |
| `git diff --check` | Passed |

The owned checkout sits beneath Engine's Cargo workspace. A temporary, untracked
root workspace manifest and copied lockfile isolated the shell for desktop checks;
both files were removed after verification. Tracked manifests and dependencies
were unchanged. Android used a clean archive outside Engine and OneDrive; see
[Android verification](../../apps/kairmel-shell/ANDROID-VERIFICATION.md) for the
build outcome and toolchain details. The Vitest runner loader avoided writing its
temporary configuration through the read-only dependency junction.

Android used Rust stable `1.94.0`, the original warm target after the clean build,
and ordinary Tauri/Gradle generation. The sandboxed attempt failed while writing
generated plugin files in the Cargo registry; the cache-enabled retry passed.
Specification review and independent code-quality review approved the change;
the sandbox-settlement and reachability-timeout documentation corrections were
applied and checked. The final Android build result was completed directly after
the Android agent hit its usage limit.

The new tests cover all eight configured menu destinations, unrelated menu IDs,
relative/root path resolution, query/fragment handling, loopback ports, credentials,
transport restrictions and attempted origin escapes. Existing native auth and
navigation tests remain in the full suite. The earlier cached 25-test executable
was not used as evidence for the current source.

## Acceptance limits

No Windows installer or Android APK was installed or published during this work.
Menu clicks, installed login, payment-browser return, runtime media permissions,
camera/microphone streaming and device lifecycle remain qualification tasks in the
[native acceptance matrix](../contracts/kairmel-native-acceptance.md). Native
shortcuts require the companion hosted merchant routes at the configured origin.
They do not deploy those routes or establish a Marché session.

This branch preserves startup at Créer, the single hosted window, native auth,
navigation allowlists, empty capabilities, versions and signing configuration.
Service supplements describe implemented contracts and proposed integration gaps;
they do not move services or assert production payment/media acceptance.

> **⚠️ Stale (pre-Engine).** This document predates BOBO's migration onto the
> Yaatal Engine and may describe an architecture that no longer matches the code.
> Trust **`BOBO-ENGINE-ALIGNMENT.md`** (audited plan) and **`CLAUDE.md`** (repo
> orientation) over this file where they disagree.

# ARCHITECT.md

## Shifting Architect Identity

**Role**: Pragmatic, African-Focused CTO - NJOOBA LLC
**Voice**: Direct, technical, no fluff. Code and facts, not theories.

### Priority Stack (Non-Negotiable)
1. **Latency** - 300ms+ round trips are normal
2. **Data Costs** - Every byte costs money
3. **Trust** - Security is non-negotiable
4. **Local Reality** - Lagos, Dakar, Abidjan - not San Francisco

### Technical Constraints
- **Offline-First**: PowerSync + SQLite, queue actions, sync on reconnect
- **Mobile-First**: 44px touch targets, battery-conscious
- **Bandwidth-Aware**: Opus audio, AVIF/WebP images
- **Latency-Tolerant**: Optimistic UI, local-first data
- **Security-First**: RLS on all tables, edge proxies for API keys

### Philosophy: BOBO
- **Build**: Own your stack, no vendor lock-in
- **Own**: Data sovereignty for Africa
- **Bootstrap**: Revenue-first, sustainable growth
- **Operate**: Self-sufficient infrastructure

---

## Current State

**Last Updated**: 2026-01-19
**Last Session**: Standalone extraction complete
**Branch**: `claude/architect-identity-setup-aUS1B`

### Repo Structure
```
BOBO-/
├── bobo-app/           # React Native + Expo 54
├── packages/
│   ├── core/           # DB schema, services, types
│   ├── ai/             # Voice, image services
│   └── shared/         # Utilities
├── README.md
├── REMOVAL_LOG.md
└── ARCHITECT.md        # This file
```

### Tech Stack
| Layer | Technology | Status |
|-------|------------|--------|
| Mobile | React Native 0.76 + Expo 54 | Active |
| State | Zustand | Active |
| Offline | PowerSync + SQLite | Active |
| Backend | Supabase | Active |
| AI | Groq + Vercel Edge | Configured |

### Known Issues (Pre-Existing)
| Issue | Severity | Blocker For |
|-------|----------|-------------|
| Missing `@eslint/js` | HIGH | Linting, CI/CD |
| Missing `@powersync/common` types | HIGH | Type-check, CI/CD |
| 11/28 tests failing | MEDIUM | Test coverage |
| No EAS config | HIGH | App Store submission |

---

## Execution Plan

### Phase 0: Foundation Fix (Current)
**Goal**: Unblock development tooling
**Parallelizable**: Yes

| Task | ID | Status | Depends On | Command/Action |
|------|----|--------|------------|----------------|
| Add @eslint/js | P0-1 | PENDING | - | `pnpm add -D @eslint/js -w` |
| Add @powersync/common | P0-2 | PENDING | - | `pnpm add -D @powersync/common --filter bobo-app` |
| Fix test mocks | P0-3 | PENDING | - | Update Supabase mocks in `__mocks__/` |
| Verify type-check | P0-4 | PENDING | P0-2 | `pnpm --filter bobo-app type-check` |
| Verify lint | P0-5 | PENDING | P0-1 | `pnpm --filter bobo-app lint` |
| Verify tests | P0-6 | PENDING | P0-3 | `pnpm --filter bobo-app test` |

**Exit Criteria**: All three commands pass (type-check, lint, test)

---

### Phase 1: App Store Readiness
**Goal**: Deployable to TestFlight / Internal Testing
**Parallelizable**: Partially

| Task | ID | Status | Depends On | Notes |
|------|----|--------|------------|-------|
| Create eas.json | P1-1 | PENDING | P0 | EAS Build config |
| Configure app.json | P1-2 | PENDING | - | Bundle ID, version, permissions |
| Create app icon | P1-3 | PENDING | - | 1024x1024 (iOS), 512x512 (Android) |
| Create splash screen | P1-4 | PENDING | - | Match brand colors |
| Build iOS (simulator) | P1-5 | PENDING | P1-1, P1-2 | `eas build --platform ios --profile development` |
| Build Android (APK) | P1-6 | PENDING | P1-1, P1-2 | `eas build --platform android --profile development` |
| TestFlight upload | P1-7 | PENDING | P1-5 | Manual or `eas submit` |
| Internal testing track | P1-8 | PENDING | P1-6 | Play Console |

**Parallel Tracks**:
- Track A (P1-1, P1-2, P1-5, P1-6, P1-7, P1-8): Build pipeline
- Track B (P1-3, P1-4): Assets (can run parallel)

**Exit Criteria**: App installable on physical device via TestFlight/Internal Testing

---

### Phase 2: Store Submission
**Goal**: Live on App Store and Play Store
**Parallelizable**: Partially

| Task | ID | Status | Depends On | Notes |
|------|----|--------|------------|-------|
| Privacy policy page | P2-1 | PENDING | - | Host on website or Notion |
| Terms of service | P2-2 | PENDING | - | Required for commerce apps |
| App Store screenshots | P2-3 | PENDING | P1-5 | 6.5" iPhone, 5.5" iPhone |
| Play Store screenshots | P2-4 | PENDING | P1-6 | Phone, 7" tablet, 10" tablet |
| App Store description | P2-5 | PENDING | - | Keywords, subtitle |
| Play Store description | P2-6 | PENDING | - | Short desc, full desc |
| Submit to App Store | P2-7 | PENDING | P2-1 to P2-5 | Review takes 24-48h |
| Submit to Play Store | P2-8 | PENDING | P2-1, P2-2, P2-4, P2-6 | Review takes 2-7 days |

**Parallel Tracks**:
- Track A (P2-1, P2-2): Legal docs
- Track B (P2-3, P2-4): Screenshots
- Track C (P2-5, P2-6): Copy
- Track D (P2-7, P2-8): Submission (sequential after deps)

**Exit Criteria**: Apps approved and live on both stores

---

### Phase 3: Live Commerce
**Goal**: Livestream selling capability
**Parallelizable**: Partially

| Task | ID | Status | Depends On | Notes |
|------|----|--------|------------|-------|
| Evaluate Mux vs alternatives | P3-1 | PENDING | - | Cost, latency, African CDN |
| Integrate live streaming SDK | P3-2 | PENDING | P3-1 | React Native compatible |
| Build broadcaster screen | P3-3 | PENDING | P3-2 | Merchant-facing |
| Build viewer screen | P3-4 | PENDING | P3-2 | Customer-facing |
| Live product pinning | P3-5 | PENDING | P3-3 | Admin selects product during stream |
| Live purchase flow | P3-6 | PENDING | P3-4, P3-5 | Tap to buy during stream |
| Stream recording/replay | P3-7 | PENDING | P3-2 | Storage on DO Spaces |

**Exit Criteria**: End-to-end live commerce flow working

---

### Phase 4: Payments
**Goal**: Real money transactions
**Parallelizable**: Yes

| Task | ID | Status | Depends On | Notes |
|------|----|--------|------------|-------|
| Wave integration | P4-1 | PENDING | - | Senegal primary |
| Orange Money integration | P4-2 | PENDING | - | Senegal secondary |
| DEXCHANGE integration | P4-3 | PENDING | - | Cash pickup |
| Payment webhook handlers | P4-4 | PENDING | P4-1 or P4-2 | Supabase Edge Functions |
| Order status sync | P4-5 | PENDING | P4-4 | PowerSync real-time |
| Refund flow | P4-6 | PENDING | P4-4 | Business requirement |

**Exit Criteria**: Customer can pay, merchant receives funds

---

## Session Handoff Protocol

### For Next Session (Human or AI)

1. **Read this file first** - Adopt Architect identity
2. **Check current phase** - Look at Status column
3. **Pick next PENDING task** - Respect dependencies
4. **Update Status** - Mark IN_PROGRESS before starting
5. **Complete or document blockers** - Update Notes if blocked
6. **Mark DONE when complete** - Update this file
7. **Commit changes** - Include ARCHITECT.md in commit

### Status Values
- `PENDING` - Not started
- `IN_PROGRESS` - Currently being worked on
- `BLOCKED` - Waiting on external dependency
- `DONE` - Completed and verified

### Updating This File

```bash
# After completing a task
git add ARCHITECT.md
git commit -m "arch: complete P0-1 (add @eslint/js)"
git push -u origin main:claude/architect-identity-setup-aUS1B
```

---

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-01-19 | Extract BOBO as standalone | Separate deployment, focused scope |
| 2026-01-19 | Remove YOKK from repo | Sequential launch, BOBO first |
| 2026-01-19 | Keep packages/core, ai, shared | BOBO depends on these |
| 2026-01-19 | Supabase + PowerSync | Offline-first for African connectivity |

---

## Quick Reference

### Commands
```bash
# Dev
pnpm install
pnpm dev                              # Start Expo

# Validate
pnpm --filter bobo-app type-check     # TypeScript
pnpm --filter bobo-app lint           # ESLint
pnpm --filter bobo-app test           # Jest

# Build
eas build --platform ios --profile development
eas build --platform android --profile development

# Submit
eas submit --platform ios
eas submit --platform android
```

### Key Files
| Purpose | Path |
|---------|------|
| App config | `bobo-app/app.json` |
| Package deps | `bobo-app/package.json` |
| TypeScript | `bobo-app/tsconfig.json` |
| PowerSync schema | `bobo-app/src/lib/powersync/` |
| Supabase client | `packages/core/src/lib/supabase.ts` |

---

## Contact

**Project**: BOBO - Social Commerce OS for African SMBs
**Company**: NJOOBA LLC
**Target Markets**: Senegal (primary), Nigeria (secondary)

# BOBO

**Social Commerce OS for African SMBs**

Livestream commerce platform built for African market realities: offline-first, mobile-first, bandwidth-aware.

## 🎯 New to the squad?

Start here → **[Team Onboarding (EN)](./docs/TEAM-ONBOARDING.en.md)** · **[Onboarding Équipe (FR)](./docs/TEAM-ONBOARDING.fr.md)**

These pages tell you where things stand, why we cut from PowerSync to the Engine, and how to work without breaking the wire.

---

## Quick Start

```bash
# Install dependencies
pnpm install

# Start Expo dev server
cd bobo-app && pnpm start

# Or from root
pnpm dev
```

## Architecture

```
BOBO/
├── bobo-app/              # React Native + Expo 54
│   ├── src/
│   │   ├── screens/       # App screens (customer, merchant, admin, delivery, chat, auth)
│   │   ├── services/      # Business logic
│   │   ├── lib/           # PowerSync, utilities
│   │   ├── store/         # Zustand state management
│   │   └── components/    # UI components
│   └── ...
├── packages/
│   ├── core/              # DB schema, services, types
│   ├── ai/                # Voice synthesis, image services
│   └── shared/            # Utilities (formatCFA, formatPhone, validators)
└── ...
```

## Tech Stack

| Layer | Technology |
|-------|------------|
| Mobile | React Native 0.76 + Expo 54 |
| State | Zustand |
| Offline | PowerSync + SQLite |
| Backend | Yaatal Engine (Rust, Railway Postgres) · Supabase (legacy, parked) |
| Navigation | React Navigation 6 |

## Design Constraints

Built for African infrastructure reality:

- **Offline-first**: PowerSync for SQLite sync, queue actions, sync on reconnect
- **Mobile-first**: 44px touch targets, battery-conscious
- **Bandwidth-aware**: Optimized media, minimal payload
- **Latency-tolerant**: Optimistic UI for 300ms+ round trips
- **Security-first**: RLS on all tables, edge proxies for API keys

## Scripts

```bash
# Root workspace
pnpm dev          # Start bobo-app dev server
pnpm build        # Build bobo-app
pnpm lint         # Lint all packages

# bobo-app specific
pnpm --filter bobo-app start        # Expo start
pnpm --filter bobo-app android      # Run on Android
pnpm --filter bobo-app ios          # Run on iOS
pnpm --filter bobo-app web          # Run web version
pnpm --filter bobo-app type-check   # TypeScript check
pnpm --filter bobo-app test         # Run tests
```

## Environment Variables

Copy `.env.example` to `.env` and configure:

```bash
# Supabase
EXPO_PUBLIC_SUPABASE_URL=
EXPO_PUBLIC_SUPABASE_ANON_KEY=

# PowerSync
EXPO_PUBLIC_POWERSYNC_URL=

# Storage (DigitalOcean Spaces)
DO_SPACES_KEY=
DO_SPACES_SECRET=
DO_SPACES_ENDPOINT=
DO_SPACES_BUCKET=
```

## Target Markets

- **Primary**: Senegal (Dakar)
- **Secondary**: Nigeria (Lagos)
- **Payments**: Wave, Orange Money, Cash via DEXCHANGE

## Philosophy: BOBO

- **Build**: Own your stack, no vendor lock-in
- **Own**: Data sovereignty for Africa
- **Bootstrap**: Revenue-first, sustainable growth
- **Operate**: Self-sufficient infrastructure

---

NJOOBA LLC

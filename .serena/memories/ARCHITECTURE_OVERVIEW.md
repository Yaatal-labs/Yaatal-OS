# NJOOBA LLC - Codebase Architecture Overview

**Last Updated:** 2025-01-05 (Session 3)
**Status:** Monorepo Structure Complete, TypeScript Errors Remaining

---

## Project Structure

```
NJOOBA/
├── packages/
│   ├── core/          # Shared types, utils, services, PowerSync, DB schema
│   ├── design/        # Shared UI components, icons, theme
│   ├── ai/            # AI services (Groq + Claude router)
│   └── yokk-app/      # Next.js web app (41 TS errors - pending)
├── bobo-app/          # React Native mobile app (7 TS errors remaining)
├── yokk-app/          # (Legacy - moved to packages/)
├── src/               # Web app entry (minimal - main.tsx, App.tsx)
├── supabase/          # Database schema, migrations, RLS policies
└── n8n-workflows/     # Automation workflows
```

---

## Tech Stack

### Frontend
- **Mobile (BOBO):** React Native + Expo SDK 54, TypeScript
- **Web (YOKK):** Next.js 14 (App Router), TypeScript
- **Shared Design:** Custom component library (@njooba/design)

### Backend & Data
- **Database:** Supabase (Postgres + Auth + Realtime)
- **Offline Sync:** PowerSync v1.28 (SQLite-based)
- **State:** Zustand (mobile), React hooks
- **API:** Next.js API routes + Vercel Edge Functions

### AI Services
- **Router:** Groq (fast/cheap) → Claude (smart/expensive)
- **Vision:** GPT-4 Vision (product search from photos)
- **Voice:** OpenAI Whisper (Wolof/French transcription)
- **Gateway:** OpenRouter

### Payments
- **Primary:** Orange Money (70% Senegal market share)
- **Secondary:** Wave, SenePay

---

## Key Files & Locations

### Core Package (`packages/core/`)
```
src/
├── db/              # PowerSync schema, sync rules
├── lib/             # Shared utilities
├── services/        # Chat, Delivery, Product, User services
├── types/           # TypeScript interfaces (models.ts)
├── utils/           # Platform-specific (scanner, imagePicker)
└── index.ts         # Main export barrel
```

### Mobile App (`bobo-app/`)
```
src/
├── components/      # OmniSearch, ProductCard, etc.
├── screens/         # Home, ProductDetail, Settings, etc.
├── navigation/      # App navigation structure
├── services/        # Local app services
├── store/           # Zustand state management
├── theme/           # Colors, typography
└── utils/           # App-specific utilities
```

### Design Package (`packages/design/`)
```
src/
├── components/      # Reusable UI components
├── icons/           # Icon set
├── lib/             # Design utilities
└── types/           # Design-specific types
```

---

## Session 2 Handoff Status

### Completed ✅
- Monorepo structure created (pnpm workspace)
- Packages: core, design, ai extracted
- Import paths normalized to @njooba/*
- bobo-app: 40 → 7 TypeScript errors fixed

### Remaining Work ⏸️

**Priority 1: Fix 7 bobo-app errors**
1. Message interface mismatch (2 errors) - `packages/core/src/services/chat.service.ts:91,120`
2. DeliveryPerson missing properties (3 errors) - needs `email`, `license_plate`, `id_number`
3. html5-qrcode imports (2 errors) - `packages/core/src/utils/platform/scanner.web.ts`

**Priority 2: Fix yokk-app (41 errors)**
- Web app trying to compile React Native modules
- Solution: Exclude *.native.ts files in tsconfig

**Priority 3: Cleanup**
- Delete old bobo-app/src/types/ and bobo-app/src/utils/
- Verify all imports resolve correctly

---

## Product Context

### BOBO (Mobile Commerce)
- "TikTok Shop for African SMBs"
- Target: Market vendors in Dakar (Senegal)
- Killer feature: QR codes for livestream shopping
- Constraints: 2G/3G, 500MB/month data, offline-first

### YOKK (Dev Community)
- "Stack Overflow for African developers"
- Target: Junior devs in Lagos/Nigeria
- AI that understands African context
- Status: Not started (BOBO takes priority)

---

## Constraints (Immutable)

- ✅ Local inventory ONLY (no international shipping)
- ✅ NO dropshipping from China
- ✅ Mobile money only (Orange Money/Wave)
- ✅ Offline-first architecture (PowerSync)
- ✅ 2G/3G optimization
- ✅ Data cost controls (user preferences)

---

## Next Steps

1. Fix remaining 7 TypeScript errors in bobo-app
2. Fix yokk-app errors (exclude native files)
3. Deploy backend to Supabase/Vercel
4. Implement phone/OTP authentication
5. Add real products to catalog
6. Integrate Orange Money payments

---

## Quick Commands

```bash
# Check TypeScript errors
cd bobo-app && npx tsc --noEmit
cd packages/yokk-app && npx tsc --noEmit

# Install dependencies
pnpm install

# Run dev servers
pnpm dev  # Runs webapp (yokk-app)
cd bobo-app && npx expo start
```

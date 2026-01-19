# NJOOBA Migration Log
# PocketBase → Supabase + PowerSync Migration
# Date: 2026-01-07

## Session Overview
- **Objective**: Complete PocketBase removal, migrate to Supabase + PowerSync
- **Status**: Vercel (dev) deployed, Supabase set up, migrations pending
- **Approach**: Parallel haiku agents for velocity, sonnet for quality review

## Completed Tasks

### 1. Core Package Setup
- [x] Created `packages/core/src/lib/supabase.ts` - Supabase client with:
  - `getFileUrl()` - Storage URL helper
  - `getProductImageUrl()` - Product images
  - `getAvatarUrl()` - Profile avatars
  - Auth helpers: `signIn`, `signUp`, `signInWithPhone`, etc.
- [x] Updated `packages/core/src/index.ts` - Exports Supabase instead of PocketBase
- [x] Added `pb` alias for backward compatibility

### 2. Service Layer
- [x] PowerSync services already exist in `packages/core/src/services/`:
  - `products.service.powersync.ts`
  - `chat.service.powersync.ts`
  - `ai.service.powersync.ts`
  - `orders.service.powersync.ts`
  - `delivery.service.powersync.ts`

### 3. BOBO App Cleanup
- [x] Deleted local PocketBase services:
  - `bobo-app/src/services/products.service.ts`
  - `bobo-app/src/services/chat.service.ts`
  - `bobo-app/src/services/ai.service.ts`

## In Progress

### Screen Updates (Parallel Execution)
Files requiring PocketBase → Supabase migration:

| File | Status | Changes Required |
|------|--------|------------------|
| ProductDetailScreen.tsx | 🔄 | Remove `pb` import, use `getProductImageUrl`, `getAvatarUrl` |
| CheckoutScreen.tsx | 🔄 | Remove `pb` import, use `getProductImageUrl` |
| ProductsListScreen.tsx | 🔄 | Remove `pb` import, use `getProductImageUrl` |
| DeliveryDashboard.tsx | ✅ | Already migrated - no PocketBase |

### Pattern for Migration
```typescript
// Before (PocketBase)
import { pb } from '../../lib/pocketbase'
const imageUrl = pb.getFileUrl(product, product.image_url)

// After (Supabase via @njooba/core)
import { getProductImageUrl, getAvatarUrl } from '@njooba/core'
const imageUrl = getProductImageUrl(product.image_url) || 'https://via.placeholder.com/400'
```

## Pending Tasks
- [ ] Run TypeScript check
- [ ] Test Expo build
- [ ] Run Supabase migrations

## Agent Execution Log

### Haiku Agents (Speed)
- Agent 1: ProductDetailScreen.tsx fix
- Agent 2: CheckoutScreen.tsx fix
- Agent 3: ProductsListScreen.tsx fix

### Sonnet Agents (Quality)
- Reserved for code review and complex logic

## Notes
- DeliveryDashboard.tsx already clean - uses `@njooba/core` fully
- PowerSync schema already updated with correct index syntax
- Core package exports both Supabase and `pb` alias for backward compat

# BOBO Squad Onboarding

> **Branch:** `codex/bobo-engine-netlify-integration`  
> **For:** New engineers joining the BOBO squad  
> **Tone:** Practical, direct, no fluff. If you have questions, ask.

---

## 🗺️ System Map

### This is the wire now

```
┌─────────────┐     HTTP/JSON      ┌─────────────────────────┐
│  BOBO App   │ ◄───────────────► │  Yaatal Engine (Rust)   │
│  (Expo 54)  │   Bearer token    │  Railway Postgres         │
└─────────────┘                    └─────────────────────────┘
```

- **BOBO App** → proposes actions via HTTP
- **IntentQueue** → local cache, flush on reconnect *(coming soon)*
- **Engine** → Rust API on Railway, single source of truth
- **Postgres** → canonical data with audit gate

⚠️ **PowerSync is parked.** Files are still in the repo as a rollback parachute, but startup is stopped. Do not wire new features through it.

---

## 📌 Why we changed

**The old path:** PowerSync + Supabase gave us offline-first SQLite sync. It worked, but every device owned a copy of truth. When AI started generating product descriptions and merchant responses, we had no gate to review that content before it went live. A hallucinated price could reach customers unchecked.

**The new path:** The Engine is the single source of truth. The app proposes *intents*, and the Engine decides whether to accept, reject, or send them to audit.

What this gives us:

| Benefit | What it means |
|---------|---------------|
| **Control** | We see every write before it becomes canonical |
| **Auditability** | AI-generated content gets flagged automatically for review |
| **Sovereignty** | Our data lives in our Postgres, not a third-party sync service |

We are not against offline. We are against **offline that nobody controls**. In Senegal, signal drops and bandwidth is expensive. The app still queues actions locally and flushes when signal returns — but the Engine validates every single one before it goes live.

---

## 🏆 Five Golden Rules

1. **Talk to the Engine, not Supabase.** If you find yourself importing `@supabase/supabase-js` in new code, stop. Use `packages/core/src/services/engine.client.ts`.
2. **Do not bring PowerSync back.** It is preserved for rollback only. If you need offline buffering, build on `IntentQueue` (coming), not PowerSync.
3. **One env var rules the backend.** `EXPO_PUBLIC_ENGINE_API_URL` points to the Engine. Nothing else matters.
4. **No new Supabase tables.** If a feature needs persistence, it needs an Engine migration and an API endpoint.
5. **Protect `Standalone`.** It is the rollback-safe baseline. Never force-push. Branch from `codex/bobo-engine-netlify-integration`.

---

## ✅ Current State

### What's real right now

| Feature | Status | Evidence |
|---------|--------|----------|
| BOBO web app | ✅ Deployed | `https://bobo-6g9.pages.dev` |
| Engine API | ✅ Deployed | `https://yaatal-engine-production.up.railway.app` |
| Auth (login, register) | ✅ Working | `POST /api/auth/register`, `POST /api/auth/login` |
| Product catalog | ✅ Working | `GET /api/products` |
| Checkout (cash) | ✅ Working | Completes immediately |
| Checkout (Wave) | ⚠️ Stub only | Shows pending screen, polls status. No real XOF yet. |
| Product catalog empty | ⚠️ No seed data | Returns `200 []`. Need seed merchants + products. |
| AI, chat, delivery | ❌ Pending Engine | Legacy PocketBase implementations removed. Awaiting Engine endpoints. |
| EAS build config | ❌ Missing | No `eas.json`. TestFlight / Play Console blocked. |

---

## 🛠️ How to work with this branch

```bash
# 1. Clone and branch
git clone https://github.com/MouhamedN96/BOBO-.git
cd BOBO-
git checkout codex/bobo-engine-netlify-integration

# 2. Install
pnpm install --frozen-lockfile

# 3. Env — only this one matters
EXPO_PUBLIC_ENGINE_API_URL=https://yaatal-engine-production.up.railway.app

# 4. Type-check and build
pnpm --filter bobo-app type-check
pnpm --filter bobo-app build

# 5. Start dev server
pnpm --filter bobo-app start

# 6. Verify web bundle
pnpm build
rg -n "import\.meta" bobo-app/dist/_expo/static/js/web   # should return nothing
rg -n "yaatal-engine-production" bobo-app/dist/_expo/static/js/web # should find hits
```

> **Do not set dead env vars.** `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_POWERSYNC_URL` are inactive. Setting them won't break anything, but it will confuse the next engineer who reads `.env`.

---

## 🔧 Troubleshooting

| Problem | Likely cause | Fix |
|---------|------------|-----|
| `TypeError: Cannot read 'products'` | Engine returned unexpected shape | Check Network tab, update mapper in `products.service.engine.ts` |
| `Engine request failed with status 401` | Token expired or missing | Re-login. Token is in `authStore`, injected into `engine.client.ts` |
| Build fails with `import.meta.env` | Zustand import mapped wrong | Check `metro.config.js` — must use CommonJS entrypoints for web |
| `PowerSync is not initialized` | Old code path still active | Make sure you're on the right branch and no file imports `lib/powersync` |

---

## 👥 Who to ask

| Question | Who |
|----------|-----|
| Engine API question | Tag the Engine squad on `Yaatal-labs/Yaatal-Engine` |
| BOBO app question | Tag `@MouhamedN96` or open an issue in `MouhamedN96/BOBO-` |
| Urgent blocker | Post in team chat with the error, branch name, and last commit hash. Don't just say "it broke." |

---

## 🔗 Links

| Resource | URL |
|----------|-----|
| BOBO repo (this branch) | `https://github.com/MouhamedN96/BOBO-/tree/codex/bobo-engine-netlify-integration` |
| BOBO PR #1 (Engine cutover) | `https://github.com/MouhamedN96/BOBO-/pull/1` |
| Yaatal Engine repo | `https://github.com/Yaatal-labs/Yaatal-Engine` |
| Engine PR #28 (BOBO bridge) | `https://github.com/Yaatal-labs/Yaatal-Engine/pull/28` |
| BOBO web (deployed) | `https://bobo-6g9.pages.dev` |
| Engine API (deployed) | `https://yaatal-engine-production.up.railway.app/health` |

---

*Last updated: 2026-06-10 · Branch: `codex/bobo-engine-netlify-integration`*

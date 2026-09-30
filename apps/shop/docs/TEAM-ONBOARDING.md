# BOBO Team Onboarding · Intégration de l'équipe BOBO

> **EN** — How the BOBO app fits with the **Yaatal Engine** backend, and how to work with it without
> fighting it. Read once; keep the golden rules.
> **FR** — Comment l'app BOBO s'articule avec le backend **Yaatal Engine**, et comment travailler
> avec sans se battre contre. À lire une fois ; gardez les règles d'or.
>
> Lives in the BOBO repo (`docs/`). The Yaatal Engine is a **separate** service/repo that BOBO
> consumes over HTTP — you don't need its source to build BOBO. Status **2026-06-06**.

---
---

# 🇬🇧 ENGLISH

## 1. Where you are (the map)
BOBO is an **App**. Apps talk to the **Engine** over HTTPS/JSON + JWT. The Engine has its own internal
AI/capability layer (the "Harness") — **you never call that directly; you only ever call the Engine.**

```
  YOU → BOBO (this repo)        screens, UX, journeys
        │  @yaatal/core  (the typed Engine client lives here)
        ▼
       YAATAL ENGINE            auth · commerce · profile · the only backend contract you see
        │  (separate service — internal AI/capabilities behind it)
        ▼
       (Engine internals)       not yours to call
```

**Your contract is the Engine's HTTP API**, reached through `@yaatal/core`. Everything you need
arrives through that typed client.

## 2. The 5 golden rules
1. **Talk to the Engine through `@yaatal/core`.** Don't hand-roll raw `fetch` to backends; import the
   typed services.
2. **Don't reinvent shared logic.** If a second app (YOKK, etc.) would need it, it belongs in the
   Engine — ask backend for an endpoint, don't reimplement AI/search/trust logic in the app.
3. **One env var wires everything:** `EXPO_PUBLIC_ENGINE_API_URL`. Set it per build; the default is
   `http://localhost:5150`. Production Engine: `https://engine.njooba.com`.
4. **No new PowerSync.** The offline-sync code in the tree is **legacy/dead and slated for removal** —
   don't import it or add to it. Use the Engine HTTP client.
5. **App UX stays in the app; shared primitives get promoted to the Engine.** One app needs it → app.
   Two apps need it → Engine.

## 3. Backend map — where each flow lives *today* (important)
BOBO currently spans three backends. Know which is which so you don't wire to the wrong one.

| Flow | Backend today | How you call it | Note |
|---|---|---|---|
| **Auth, products, orders, checkout** | **Yaatal Engine** ✅ | `@yaatal/core` → `authService`, `productsService`, `ordersService` | the canonical path — use this |
| **Chat, delivery, AI-search** | **Engine** ✅ | `@yaatal/core` → `chatService`, `deliveryService`, `aiService` (`*.service.engine.ts`) | Engine-backed; marketplace delivery features (driver pool, quotes) pending Engine marketplace |
| **Payments** | **DExchange** (mostly stubbed) | `payment.service.ts` | legacy; the Engine has its own Wave rail (to reconcile later) |
| ~~Offline sync~~ | ~~PowerSync~~ 🗑️ | — | **dead — don't use; being removed** |

> **Rule of thumb:** any *new* backend need goes to the **Engine**, not DExchange.

## 4. How to wire a feature to the Engine
```ts
// 1. Import the typed service (no URL/auth plumbing needed)
import { productsService, setEngineAuthToken } from '@yaatal/core'

// 2. After login, set the token once
setEngineAuthToken(jwtFromLogin)

// 3. Call it — typed in, typed out
const { items, totalItems } = await productsService.getAll(1, 20)
```
**Adding a NEW endpoint?** It must exist on the **Engine** first (coordinate with backend), then add a
typed method to the Engine client in `@yaatal/core`. Never hard-code a raw `fetch` to a new backend.

## 5. Local dev setup
- **Point at the live Engine (simplest):** set
  `EXPO_PUBLIC_ENGINE_API_URL=https://engine.njooba.com`, then `expo start --web`.
- **Run the Engine locally (full control):** clone the *Yaatal-Engine* repo and run it (Docker Postgres
  + the Rust API), then set `EXPO_PUBLIC_ENGINE_API_URL=http://localhost:5150`.
- **Web:** `expo start --web`. **Native:** dev client / EAS build (native build config is being set up).

## 6. Gotchas (these have bitten us)
- **`EXPO_PUBLIC_*` is inlined at *build* time** by Metro. Change the env → **rebuild**. A stale value
  silently ships.
- **Native needs the env too** — bake `EXPO_PUBLIC_ENGINE_API_URL` into the EAS build profile, not just
  web, or the app falls back to `localhost` and shows no data.
- **CORS is Engine-side.** If a browser request is blocked, it's an Engine config matter, not client
  code.
- **Don't trust the `localhost` default in prod** — always set the env explicitly.

## 7. Source of truth
- This doc (golden rules + backend map).
- The Engine's HTTP API is the contract; `@yaatal/core` is its typed client.
- Deeper Engine architecture/rationale lives in the **Yaatal-Engine** repo (internal).

---
---

# 🇫🇷 FRANÇAIS

## 1. Où vous êtes (la carte)
BOBO est une **App**. Les apps parlent au **Engine** via HTTPS/JSON + JWT. Le Engine a sa propre couche
IA/capacités interne (le « Harness ») — **vous ne l'appelez jamais directement ; vous n'appelez que le
Engine.**

```
  VOUS → BOBO (ce dépôt)        écrans, UX, parcours
         │  @yaatal/core  (le client Engine typé est ici)
         ▼
        YAATAL ENGINE           auth · commerce · profil · le seul contrat backend que vous voyez
         │  (service séparé — IA/capacités internes derrière)
         ▼
        (internes du Engine)     pas à vous d'appeler
```

**Votre contrat, c'est l'API HTTP du Engine**, atteinte via `@yaatal/core`. Tout ce dont vous avez
besoin arrive par ce client typé.

## 2. Les 5 règles d'or
1. **Parlez au Engine via `@yaatal/core`.** Ne bricolez pas de `fetch` brut vers des backends ;
   importez les services typés.
2. **Ne réinventez pas la logique partagée.** Si une deuxième app (YOKK, etc.) en aurait besoin, ça
   appartient au Engine — demandez un endpoint au backend, ne réimplémentez pas la logique
   IA/recherche/confiance dans l'app.
3. **Une variable d'env câble tout :** `EXPO_PUBLIC_ENGINE_API_URL`. À définir par build ; défaut
   `http://localhost:5150`. Engine de prod : `https://engine.njooba.com`.
4. **Pas de nouveau PowerSync.** Le code de synchro offline présent est **legacy/mort et destiné à la
   suppression** — ne l'importez pas, n'y ajoutez rien. Utilisez le client HTTP du Engine.
5. **L'UX d'app reste dans l'app ; les primitives partagées sont promues au Engine.** Une app en a
   besoin → app. Deux apps → Engine.

## 3. Carte des backends — où vit chaque flux *aujourd'hui* (important)
BOBO s'étend aujourd'hui sur trois backends. Sachez lequel est lequel pour ne pas câbler au mauvais.

| Flux | Backend aujourd'hui | Comment l'appeler | Note |
|---|---|---|---|
| **Auth, produits, commandes, checkout** | **Yaatal Engine** ✅ | `@yaatal/core` → `authService`, `productsService`, `ordersService` | le chemin canonique — utilisez ça |
| **Chat, livraison, recherche IA** | **Engine** ✅ | `@yaatal/core` → `chatService`, `deliveryService`, `aiService` (`*.service.engine.ts`) | câblé au Engine ; fonctionnalités marketplace de livraison (pool de livreurs, devis) en attente du marketplace Engine |
| **Paiements** | **DExchange** (surtout stub) | `payment.service.ts` | legacy ; le Engine a son propre rail Wave (à réconcilier) |
| ~~Synchro offline~~ | ~~PowerSync~~ 🗑️ | — | **mort — ne pas utiliser ; en suppression** |

> **Règle simple :** tout *nouveau* besoin backend va au **Engine**, pas à DExchange.

## 4. Comment câbler une fonctionnalité au Engine
```ts
// 1. Importez le service typé (pas de plomberie URL/auth)
import { productsService, setEngineAuthToken } from '@yaatal/core'

// 2. Après login, posez le token une fois
setEngineAuthToken(jwtDuLogin)

// 3. Appelez — typé en entrée, typé en sortie
const { items, totalItems } = await productsService.getAll(1, 20)
```
**Ajouter un NOUVEL endpoint ?** Il doit d'abord exister sur le **Engine** (coordonnez avec le
backend), puis ajoutez une méthode typée au client Engine dans `@yaatal/core`. Ne codez jamais un
`fetch` brut en dur vers un nouveau backend.

## 5. Mise en place du dev local
- **Pointer sur le Engine en ligne (le plus simple) :** définissez
  `EXPO_PUBLIC_ENGINE_API_URL=https://engine.njooba.com`, puis `expo start --web`.
- **Lancer le Engine en local (contrôle total) :** clonez le dépôt *Yaatal-Engine* et lancez-le
  (Postgres Docker + l'API Rust), puis `EXPO_PUBLIC_ENGINE_API_URL=http://localhost:5150`.
- **Web :** `expo start --web`. **Natif :** dev client / build EAS (la config de build natif est en
  cours de mise en place).

## 6. Pièges (ils nous ont déjà mordus)
- **`EXPO_PUBLIC_*` est inliné à la *compilation*** par Metro. Changement d'env → **rebuild**. Une
  valeur périmée part silencieusement.
- **Le natif a aussi besoin de l'env** — injectez `EXPO_PUBLIC_ENGINE_API_URL` dans le profil de build
  EAS, pas seulement le web, sinon l'app retombe sur `localhost` et n'affiche rien.
- **Le CORS est côté Engine.** Si une requête navigateur est bloquée, c'est une affaire de config
  Engine, pas de code client.
- **Ne faites pas confiance au défaut `localhost` en prod** — définissez toujours l'env explicitement.

## 7. Source de vérité
- Ce document (règles d'or + carte des backends).
- L'API HTTP du Engine est le contrat ; `@yaatal/core` en est le client typé.
- L'architecture/justification approfondie du Engine vit dans le dépôt **Yaatal-Engine** (interne).

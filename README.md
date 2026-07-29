# BOBO

**Social Commerce OS for African SMBs**  
*OS de Commerce Social pour les PME Africaines*

Livestream commerce platform built for African market realities: offline-capable, mobile-first, bandwidth-aware. 

Plateforme de commerce en livestream conçue pour les réalités de l'infrastructure africaine : hors ligne maîtrisé, mobile-first, conscient de la bande passante.

---

## 🎯 New here? / Nouveau ici ?

📄 **Team Onboarding** → [`EN`](./docs/TEAM-ONBOARDING.en.md) · [`FR`](./docs/TEAM-ONBOARDING.fr.md)  
🌐 **Sharable pages** → [`EN.html`](./docs/TEAM-ONBOARDING.en.html) · [`FR.html`](./docs/TEAM-ONBOARDING.fr.html)

---

<details open>
<summary><b>🇬🇧 English</b> — Click to expand / Cliquez pour ouvrir</summary>

## Quick Start

```bash
# Install dependencies
pnpm install

# Start Expo dev server
pnpm dev
```

## Architecture

```
BOBO/
├── bobo-app/              # React Native 0.76 + Expo 54
│   ├── src/
│   │   ├── screens/       # App screens
│   │   ├── services/      # Business logic (Engine client)
│   │   ├── lib/           # Utilities, IntentQueue (coming)
│   │   ├── store/         # Zustand state management
│   │   └── components/    # UI components
│   └── ...
├── packages/
│   ├── core/              # Engine client, DTOs, types, services
│   ├── ai/                # Voice synthesis, image services
│   └── shared/            # Utilities (formatCFA, formatPhone, validators)
└── ...
```

## Tech Stack

| Layer | Technology |
|-------|------------|
| Mobile | React Native 0.76 + Expo 54 |
| State | Zustand |
| Offline | IntentQueue (coming) · PowerSync (legacy, parked) |
| Backend | Yaatal Engine (Rust, engine.njooba.com) |
| Navigation | React Navigation 6 |

## Current Status

| Feature | State |
|---------|-------|
| Auth (login, register) | ✅ Working |
| Product catalog | ✅ Working (endpoint live, needs seed data) |
| Checkout (cash) | ✅ Working |
| Checkout (Wave) | ⚠️ Stub only — pending flow, no real XOF |
|| AI, chat, delivery | ✅ Engine-backed |
| EAS build config | ❌ Missing — TestFlight / Play Console blocked |

## Environment Variables

Copy `.env.example` to `.env`:

```bash
# The only thing you really need
EXPO_PUBLIC_ENGINE_API_URL=https://yaatal-engine-production.up.railway.app

# Dead vars — do not set. Kept in .env.example for rollback reference only.
# EXPO_PUBLIC_SUPABASE_URL=
# EXPO_PUBLIC_POWERSYNC_URL=
```

## Scripts

```bash
# Root
pnpm dev          # Start bobo-app dev server
pnpm build        # Build for web deploy
pnpm lint         # Lint all packages

# bobo-app
pnpm --filter bobo-app start        # Expo start
pnpm --filter bobo-app android      # Android
pnpm --filter bobo-app ios          # iOS
pnpm --filter bobo-app web          # Web version
pnpm --filter bobo-app type-check   # TypeScript check
pnpm --filter bobo-app test         # Tests (11/28 failing, known issue)
```

## Target Markets

- **Primary:** Senegal (Dakar)
- **Secondary:** Nigeria (Lagos)
- **Payments:** Wave, Orange Money, Cash via DEXCHANGE

## Philosophy

- **Build:** Own your stack, no vendor lock-in
- **Own:** Data sovereignty for Africa
- **Bootstrap:** Revenue-first, sustainable growth
- **Operate:** Self-sufficient infrastructure

</details>

---

<details>
<summary><b>🇫🇷 Français</b> — Cliquez pour ouvrir / Click to expand</summary>

## Démarrage rapide

```bash
# Installe les dépendances
pnpm install

# Démarre le serveur de dev Expo
pnpm dev
```

## Architecture

```
BOBO/
├── bobo-app/              # React Native 0.76 + Expo 54
│   ├── src/
│   │   ├── screens/       # Écrans (client, marchand, admin, livraison, chat, auth)
│   │   ├── services/      # Logique métier (client Engine)
│   │   ├── lib/           # Utilitaires, IntentQueue (à venir)
│   │   ├── store/         # Gestion d'état Zustand
│   │   └── components/    # Composants UI
│   └── ...
├── packages/
│   ├── core/              # Client Engine, DTOs, types, services
│   ├── ai/                # Synthèse vocale, services image
│   └── shared/            # Utilitaires (formatCFA, formatPhone, validators)
└── ...
```

## Stack Technique

| Couche | Technologie |
|--------|-------------|
| Mobile | React Native 0.76 + Expo 54 |
| État | Zustand |
| Hors ligne | IntentQueue (à venir) · PowerSync (legacy, garé) |
| Backend | Yaatal Engine (Rust, engine.njooba.com) |
| Navigation | React Navigation 6 |

## État Actuel

| Fonctionnalité | Statut |
|----------------|--------|
| Auth (connexion, inscription) | ✅ Fonctionnel |
| Catalogue produits | ✅ Fonctionnel (endpoint en ligne, besoin de données seeds) |
| Paiement (espèces) | ✅ Fonctionnel |
| Paiement (Wave) | ⚠️ Bouchon seulement — flux en attente, pas de vrai XOF |
|| IA, chat, livraison | ✅ Moteur Engine |
| Config EAS build | ❌ Manquant — soumission TestFlight / Play Console bloquée |

## Variables d'Environnement

Copie `.env.example` vers `.env` :

```bash
# Seule chose vraiment nécessaire
EXPO_PUBLIC_ENGINE_API_URL=https://yaatal-engine-production.up.railway.app

# Variables mortes — ne pas configurer. Conservées dans .env.example pour référence de rollback.
# EXPO_PUBLIC_SUPABASE_URL=
# EXPO_PUBLIC_POWERSYNC_URL=
```

## Scripts

```bash
# Racine
pnpm dev          # Démarre le serveur de dev bobo-app
pnpm build        # Compile pour déploiement web
pnpm lint         # Lint tous les packages

# bobo-app
pnpm --filter bobo-app start        # Expo start
pnpm --filter bobo-app android      # Android
pnpm --filter bobo-app ios          # iOS
pnpm --filter bobo-app web          # Version web
pnpm --filter bobo-app type-check   # Vérification TypeScript
pnpm --filter bobo-app test         # Tests (11/28 échouent, problème connu)
```

## Marchés Cibles

- **Principal :** Sénégal (Dakar)
- **Secondaire :** Nigeria (Lagos)
- **Paiements :** Wave, Orange Money, Espèces via DEXCHANGE

## Philosophie

- **Build :** Posséder sa stack, pas de dépendance vendor
- **Own :** Souveraineté des données pour l'Afrique
- **Bootstrap :** Revenue-first, croissance durable
- **Operate :** Infrastructure autosuffisante

</details>

---

NJOOBA LLC

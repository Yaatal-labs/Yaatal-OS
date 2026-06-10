# BOBO

**Social Commerce OS for African SMBs**  
*OS de Commerce Social pour les PME Africaines*

Livestream commerce platform built for African market realities: offline-capable, mobile-first, bandwidth-aware.  
Plateforme de commerce en livestream conçue pour les réalités de l'infrastructure africaine : hors ligne maîtrisé, mobile-first, conscient de la bande passante.

---

## 🎯 New to the squad? / Nouveau dans l'équipe ?

**EN** → **[Team Onboarding](./docs/TEAM-ONBOARDING.en.md)** (readable on GitHub) · [`TEAM-ONBOARDING.en.html`](./docs/TEAM-ONBOARDING.en.html) (sharable/downloadable)  
**FR** → **[Onboarding Équipe](./docs/TEAM-ONBOARDING.fr.md)** (lisible sur GitHub) · [`TEAM-ONBOARDING.fr.html`](./docs/TEAM-ONBOARDING.fr.html) (partageable/téléchargeable)

These pages tell you where things stand, why we cut from PowerSync to the Engine, and how to work without breaking the wire.  
Ces pages te disent où on en est, pourquoi on a coupé PowerSync pour le Engine, et comment bosser sans casser le fil.

---

## 🇬🇧 English

### Quick Start

```bash
# Install dependencies
pnpm install

# Start Expo dev server
pnpm dev

# Or from root
pnpm --filter bobo-app start
```

### Architecture

```
BOBO/
├── bobo-app/              # React Native 0.76 + Expo 54
│   ├── src/
│   │   ├── screens/       # App screens (customer, merchant, admin, delivery, chat, auth)
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

### Tech Stack

| Layer | Technology |
|-------|------------|
| Mobile | React Native 0.76 + Expo 54 |
| State | Zustand |
| Offline | IntentQueue (coming) · PowerSync (legacy, parked) |
| Backend | Yaatal Engine (Rust, Railway Postgres) |
| Navigation | React Navigation 6 |

### What works now

- **Auth:** Login, register, JWT tokens
- **Products:** Catalog, detail views
- **Checkout:** Cash (immediate), Wave (stub, pending flow)
- **Web deploy:** Cloudflare Pages via `pnpm build`
- **Engine:** Live at `yaatal-engine-production.up.railway.app`

### What does not work yet

- Product catalog is empty (needs seed data)
- Wave payments are stub-only (no real XOF movement)
- AI, chat, delivery services still on legacy path
- No EAS config (TestFlight / Play Console blocked)

### Environment Variables

Copy `.env.example` to `.env`:

```bash
# The only thing you really need
EXPO_PUBLIC_ENGINE_API_URL=https://yaatal-engine-production.up.railway.app

# Dead vars — do not set. Kept in .env.example for rollback reference only.
# EXPO_PUBLIC_SUPABASE_URL=
# EXPO_PUBLIC_SUPABASE_ANON_KEY=
# EXPO_PUBLIC_POWERSYNC_URL=
```

### Scripts

```bash
# Root workspace
pnpm dev          # Start bobo-app dev server
pnpm build        # Build bobo-app for web deploy
pnpm lint         # Lint all packages

# bobo-app specific
pnpm --filter bobo-app start        # Expo start
pnpm --filter bobo-app android      # Run on Android
pnpm --filter bobo-app ios          # Run on iOS
pnpm --filter bobo-app web          # Run web version
pnpm --filter bobo-app type-check   # TypeScript check
pnpm --filter bobo-app test         # Run tests (11/28 currently failing)
```

### Target Markets

- **Primary:** Senegal (Dakar)
- **Secondary:** Nigeria (Lagos)
- **Payments:** Wave, Orange Money, Cash via DEXCHANGE

### Philosophy: BOBO

- **Build:** Own your stack, no vendor lock-in
- **Own:** Data sovereignty for Africa
- **Bootstrap:** Revenue-first, sustainable growth
- **Operate:** Self-sufficient infrastructure

---

---

## 🇫🇷 Français

### Démarrage rapide

```bash
# Installe les dépendances
pnpm install

# Démarre le serveur de dev Expo
pnpm dev

# Ou depuis la racine
pnpm --filter bobo-app start
```

### Architecture

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

### Stack Technique

| Couche | Technologie |
|--------|-------------|
| Mobile | React Native 0.76 + Expo 54 |
| État | Zustand |
| Hors ligne | IntentQueue (à venir) · PowerSync (legacy, garé) |
| Backend | Yaatal Engine (Rust, Railway Postgres) |
| Navigation | React Navigation 6 |

### Ce qui fonctionne maintenant

- **Auth :** Connexion, inscription, tokens JWT
- **Produits :** Catalogue, vues détaillées
- **Checkout :** Espèces (immédiat), Wave (bouchon, flux en attente)
- **Déploiement web :** Cloudflare Pages via `pnpm build`
- **Engine :** En ligne sur `yaatal-engine-production.up.railway.app`

### Ce qui ne marche pas encore

- Catalogue produits vide (besoin de données seeds)
- Paiements Wave bouchon seulement (pas de vrai mouvement XOF)
- Services IA, chat, livraison toujours sur l'ancien chemin
- Pas de config EAS (soumission TestFlight / Play Console bloquée)

### Variables d'Environnement

Copie `.env.example` vers `.env` :

```bash
# Seule chose vraiment nécessaire
EXPO_PUBLIC_ENGINE_API_URL=https://yaatal-engine-production.up.railway.app

# Variables mortes — ne pas configurer. Conservées dans .env.example pour référence de rollback uniquement.
# EXPO_PUBLIC_SUPABASE_URL=
# EXPO_PUBLIC_SUPABASE_ANON_KEY=
# EXPO_PUBLIC_POWERSYNC_URL=
```

### Scripts

```bash
# Espace de travail racine
pnpm dev          # Démarre le serveur de dev bobo-app
pnpm build        # Compile bobo-app pour déploiement web
pnpm lint         # Lint tous les packages

# Spécifique bobo-app
pnpm --filter bobo-app start        # Expo start
pnpm --filter bobo-app android      # Lance sur Android
pnpm --filter bobo-app ios          # Lance sur iOS
pnpm --filter bobo-app web          # Lance version web
pnpm --filter bobo-app type-check   # Vérification TypeScript
pnpm --filter bobo-app test         # Lance les tests (11/28 échouent actuellement)
```

### Marchés Cibles

- **Principal :** Sénégal (Dakar)
- **Secondaire :** Nigeria (Lagos)
- **Paiements :** Wave, Orange Money, Espèces via DEXCHANGE

### Philosophie : BOBO

- **Build :** Posséder sa stack, pas de dépendance vendor
- **Own :** Souveraineté des données pour l'Afrique
- **Bootstrap :** Revenue-first, croissance durable
- **Operate :** Infrastructure autosuffisante

---

NJOOBA LLC

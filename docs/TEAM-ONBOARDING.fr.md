# Onboarding Équipe BOBO

> **Branche :** `codex/bobo-engine-netlify-integration`  
> **Pour :** Nouveaux ingénieurs qui rejoignent l'équipe BOBO  
> **Ton :** Direct, pratique, sans fioritures. Si t'as des questions, demande.

---

## 🗺️ Carte Système

### Voici le fil maintenant

```
┌─────────────┐     HTTP/JSON      ┌─────────────────────────┐
│  App BOBO   │ ◄───────────────► │  Yaatal Engine (Rust)   │
│  (Expo 54)  │   Bearer token    │  Railway Postgres         │
└─────────────┘                    └─────────────────────────┘
```

- **App BOBO** → propose des actions via HTTP
- **IntentQueue** → cache local, envoi à la reconnexion *(à venir)*
- **Engine** → API Rust sur Railway, seule source de vérité
- **Postgres** → données canoniques avec porte d'audit

⚠️ **PowerSync est garé.** Les fichiers sont encore dans le repo comme parachute de secours, mais le démarrage est arrêté. Ne branche pas de nouvelles fonctionnalités dessus.

---

## 📌 Pourquoi on a changé

**L'ancien chemin :** PowerSync + Supabase nous donnait du sync SQLite hors ligne. Ça marchait, mais chaque téléphone possédait sa propre copie de la vérité. Quand l'IA a commencé à générer des descriptions de produits et des réponses marchands, on n'avait aucune porte de contrôle pour relire ce contenu avant qu'il soit en ligne. Un prix halluciné pouvait atteindre les clients sans que personne ne vérifie.

**Le nouveau chemin :** Le Engine est la seule source de vérité. L'app propose des *intentions*, et le Engine décide de les accepter, les refuser, ou les envoyer en contrôle.

Ce que ça nous donne :

| Bénéfice | Ce que ça veut dire |
|----------|---------------------|
| **Le contrôle** | On voit chaque écriture avant qu'elle devienne canonique |
| **L'auditabilité** | Le contenu généré par IA est automatiquement signalé pour relecture |
| **La souveraineté** | Nos données vivent dans notre Postgres, pas dans un service de sync tiers |

On n'est pas contre le hors ligne. On est contre le hors ligne **que personne ne contrôle**. Au Sénégal, le signal tombe et la bande passante coûte cher. L'app garde toujours une file locale d'actions et les envoie dès que le signal revient — mais le Engine valide chacune avant qu'elle ne soit publique.

---

## 🏆 Cinq règles d'or

1. **Parle au Engine, pas à Supabase.** Si tu te retrouves à importer `@supabase/supabase-js` dans du nouveau code, arrête. Utilise `packages/core/src/services/engine.client.ts`.
2. **Ne ramène pas PowerSync.** Il est conservé pour le retour en arrière uniquement. Si tu as besoin d'un tampon hors ligne, construis sur `IntentQueue` (qui arrive), pas PowerSync.
3. **Une seule variable d'env compte.** `EXPO_PUBLIC_ENGINE_API_URL` pointe vers le Engine. Rien d'autre ne compte.
4. **Pas de nouvelles tables Supabase.** Si une fonctionnalité a besoin de persistance, il lui faut une migration Engine et un endpoint API.
5. **Protège `Standalone`.** C'est la baseline de secours. Jamais de force-push. Tout nouveau travail part de `codex/bobo-engine-netlify-integration`.

---

## ✅ État Actuel

### Ce qui fonctionne aujourd'hui

| Fonctionnalité | Statut | Où le voir |
|----------------|--------|------------|
| Appli web BOBO | ✅ Déployée | `https://bobo-6g9.pages.dev` |
| API Engine | ✅ Déployée | `https://yaatal-engine-production.up.railway.app` |
| Auth (connexion, inscription) | ✅ Fonctionnel | `POST /api/auth/register`, `POST /api/auth/login` |
| Catalogue produits | ✅ Fonctionnel | `GET /api/products` |
| Paiement (espèces) | ✅ Fonctionnel | Se finalise immédiatement |
| Paiement (Wave) | ⚠️ Bouchon seulement | Affiche "en attente", interroge le statut. Pas encore de vrai XOF. |
| Catalogue vide | ⚠️ Pas de données seeds | Renvoie `200 []`. Besoin de merchants et produits seeds. |
| IA, chat, livraison | ❌ En attente Engine | Les implémentations legacy PocketBase ont été supprimées. En attente des endpoints Engine. |
| Config EAS build | ❌ Manquant | Pas de `eas.json`. Soumission TestFlight / Play Console bloquée. |

---

## 🛠️ Comment travailler sur cette branche

```bash
# 1. Clone et branche
git clone https://github.com/MouhamedN96/BOBO-.git
cd BOBO-
git checkout codex/bobo-engine-netlify-integration

# 2. Installe
pnpm install --frozen-lockfile

# 3. Env — seule celle-là compte
EXPO_PUBLIC_ENGINE_API_URL=https://yaatal-engine-production.up.railway.app

# 4. Type-check et build
pnpm --filter bobo-app type-check
pnpm --filter bobo-app build

# 5. Serveur de dev
pnpm --filter bobo-app start

# 6. Vérifie le bundle web
pnpm build
rg -n "import\.meta" bobo-app/dist/_expo/static/js/web   # ne doit rien renvoyer
rg -n "yaatal-engine-production" bobo-app/dist/_expo/static/js/web # doit trouver des hits
```

> **Ne configure pas de variables mortes.** `EXPO_PUBLIC_SUPABASE_URL` et `EXPO_PUBLIC_POWERSYNC_URL` sont inactives. Les mettre ne casse rien, mais ça embrouille l'ingénieur suivant qui lit le `.env`.

---

## 🔧 Dépannage

| Problème | Cause probable | Correction |
|----------|----------------|------------|
| `TypeError: Cannot read 'products'` | Le Engine a renvoyé une forme inattendue | Vérifie l'onglet Network, mets à jour le mapper dans `products.service.engine.ts` |
| `Engine request failed with status 401` | Token expiré ou manquant | Reconnecte-toi. Le token vit dans `authStore` et est injecté dans `engine.client.ts` |
| Build échoue avec `import.meta.env` | Import Zustand mal mappé | Vérifie `metro.config.js` — doit utiliser des points d'entrée CommonJS pour le web |
| `PowerSync is not initialized` | Ancien chemin de code encore actif | Assure-toi d'être sur la bonne branche et qu'aucun fichier n'importe `lib/powersync` |

---

## 👥 Qui contacter

| Question | Qui |
|----------|-----|
| Question sur l'API Engine | Tag l'équipe Engine sur `Yaatal-labs/Yaatal-Engine` |
| Question sur l'app BOBO | Tag `@MouhamedN96` ou ouvre une issue sur `MouhamedN96/BOBO-` |
| Blocage urgent | Poste dans le chat équipe avec l'erreur, le nom de la branche, et le hash du dernier commit. Ne dis pas juste "ça marche pas." |

---

## 🔗 Liens

| Ressource | URL |
|-----------|-----|
| BOBO repo (cette branche) | `https://github.com/MouhamedN96/BOBO-/tree/codex/bobo-engine-netlify-integration` |
| BOBO PR #1 (basculement Engine) | `https://github.com/MouhamedN96/BOBO-/pull/1` |
| Yaatal Engine repo | `https://github.com/Yaatal-labs/Yaatal-Engine` |
| Engine PR #28 (pont BOBO) | `https://github.com/Yaatal-labs/Yaatal-Engine/pull/28` |
| BOBO web (déployé) | `https://bobo-6g9.pages.dev` |
| API Engine (déployé) | `https://yaatal-engine-production.up.railway.app/health` |

---

*Dernière mise à jour : 2026-06-10 · Branche : `codex/bobo-engine-netlify-integration`*

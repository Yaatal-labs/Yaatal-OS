# Build de l'UI TypeScript unifiée

[English](./UIR-01-UNIFIED-TYPESCRIPT-UI.md)

| | |
|---|---|
| Statut | socle React revu ; intégration native en cours |
| Date | 10 septembre 2026 |
| Repo | `Yaatal-OS` |
| Branch | `yaatal/unified-ui-poc` |
| Base | `5587306f9dba9e5a047a359b431676632af1679b` |
| Lane parallèle | `yaatal/poc-demo-closure`, laissée intacte |

## Objectif

Construire un seul frontend Vite React + TypeScript avec Tailwind et shadcn/ui dans la fenêtre Tauri 2 existante. SELL et SHOP deviennent deux workspaces de la même application, avec un login, un modèle de navigation, un thème et un état produit communs.

Ce travail consolide l'UI. Engine, Harness, Studio, les services BOBO, PI-SPI et la Commerce Sheet publique restent les sources de vérité. La branch peut tourner à côté du POC actuel avec iframes jusqu'à ce que la nouvelle UI passe tout le flow d'acceptance.

## Résultat

```text
une fenêtre Tauri
  ├─ SELL : cockpit live, sélection produit, liens de partage, conversions
  └─ SHOP : catalogue, recherche, détail produit, ouverture de la Commerce Sheet
             │
             ├─ session native et gateway Studio
             ├─ sidecar Studio sur loopback
             ├─ catalogue et identité Engine
             ├─ actions gouvernées par Harness
             └─ Commerce Sheet publique et reçu PI-SPI sandbox
```

La démo critique reste :

```text
login OS
  → SELL passe live
  → le vendeur sélectionne Robe Wax Bleue à 12 500 FCFA
  → SHOP affiche le même produit
  → SELL crée un CommerceIntent
  → l'acheteur ouvre la Commerce Sheet publique sur le même téléphone
  → l'acheteur choisit la variante, la quantité et le provider
  → le paiement sandbox réussit
  → le reçu garde l'attribution livestream et source
  → SELL affiche la conversion
```

Le POC HTTP existant a déjà validé ce flow commerce. Le flow visuel natif n'a pas encore passé le test end-to-end.

## Choix de design

Utiliser React, TypeScript, Tailwind et shadcn/ui basé sur Radix dans le shell Vite/Tauri existant, selon le choix utilisateur du 10 septembre. Conserver l'export web Expo pour le renderer historique jusqu'à l'acceptance. Le [supplément d'exécution](../plans/2026-09-10-unified-ui-execution-plan.md) remplace les exemples de composants TypeScript sans React ci-dessous et précise la réutilisation, le feature flag natif et les revues.

HTMX pourra servir plus tard pour la Commerce Sheet publique rendue par le serveur. Il ne simplifie pas l'UI Tauri principale, qui a besoin de native IPC, d'un état client partagé, d'événements WebSocket, de la persistance du thème et de workspaces SELL et SHOP responsives. Alpine n'est pas nécessaire.

## Garder et remplacer

| Garder | Remplacer après l'acceptance |
|---|---|
| Une fenêtre Tauri 2 `main` | L'iframe Studio de SELL |
| Le session broker Rust et le JWT Engine en mémoire | L'iframe et l'export Expo BOBO de SHOP |
| Le sidecar Python Studio supervisé | Le routage produit par `postMessage` entre frames |
| Le catalogue et l'identité produit d'Engine | L'injection CSS et les overrides `os-skin` |
| La policy Harness et l'exécution gouvernée des tools | La navigation dupliquée dans les apps embarquées |
| Les routes du POC commerce Studio et la Commerce Sheet publique | Le pipeline de copie des assets générés dans `/public/shop` |
| Le contrat sandbox PI-SPI et les reçus | Les lifecycles de thème et d'état séparés entre SELL et SHOP |
| Les patterns produit mobile BOBO et la future app | La présentation desktop en forme de BOBO |

Ne pas supprimer les anciens chemins avant la validation de UIR-06. Ils restent la surface de rollback et de comparaison.

## La seam auth requise

Un renderer direct ne peut pas appeler en sécurité l'API Studio authentifiée avec le contrat actuel. Le renderer utilise l'origin Tauri. Studio utilise `http://127.0.0.1:8484` et émet un operator cookie HttpOnly, SameSite Strict. L'iframe actuelle fonctionne parce qu'elle effectue le bootstrap et les appels API depuis l'origin de Studio.

L'UI unifiée ajoute donc une gateway Studio native et étroite :

1. Rust garde le JWT Engine en mémoire.
2. Rust demande à Engine le nonce Studio court et à usage unique.
3. Rust échange ce nonce avec l'endpoint Studio sur loopback.
4. Rust garde le cookie Studio dans son propre client HTTP.
5. TypeScript appelle des commands allowlisted et reçoit des réponses nettoyées.
6. Le logout révoque la session Studio et vide la session Engine même si le nettoyage Studio échoue.

C'est une plumbing d'intégration. Elle ne déplace aucune business logic dans Tauri et ne crée pas de proxy HTTP arbitraire.

### Surface de la gateway native

Les noms finaux peuvent suivre les conventions Rust, mais la capability doit rester typée et allowlisted :

| Command ou événement | Fonction | Ce que reçoit le renderer |
|---|---|---|
| `os_login` | Authentifier auprès d'Engine | session nettoyée uniquement |
| `os_logout` | Révoquer les sessions Studio et Engine | session déconnectée |
| `os_session_status` | Restaurer l'état du shell | authenticated, nom du marchand, verified |
| `studio_session_bootstrap` | Échanger un grant Studio natif | booléen authenticated |
| `studio_status` | Lire la readiness du sidecar | champs de readiness bornés |
| `studio_product_queue` | Lire les produits normalisés | champs produit sûrs pour le catalogue |
| `studio_go_live` | Armer une session live locale à Studio | ID de session et statut |
| `studio_stop_stream` | Arrêter la session live | statut et durée |
| `studio_create_commerce_intent` | Créer les URLs publiques de partage | réponse intent validée |
| `studio_conversions` | Lire les reçus sandbox attribués | liste de reçus nettoyée |
| `yaatal://studio-event` | Relayer les événements Studio publics | événement versionné et nettoyé |

Aucune command ne doit accepter une URL, un header, une méthode ou un body arbitraire.

La voice authentifiée utilise ensuite un bridge WebSocket natif typé. Le `/ws` public reste limité aux événements nettoyés et ne doit jamais transporter de speech, audio ou subtitles.

## Catalogue des seams

| Seam | Contrat | Auth et propriétaire | Usage UI | Règle d'échec |
|---|---|---|---|---|
| Login desktop | `POST Engine /api/auth/login` | Rust natif possède le JWT | un login OS | le JWT n'entre jamais dans TypeScript, le storage, les URLs, les logs ou les événements |
| Bootstrap Studio | Engine `/api/auth/bootstrap/start`, puis Studio `/api/studio/operator/bootstrap` | Rust natif possède nonce et cookie | déverrouiller SELL | nonce limité à Studio, 43 caractères, usage unique, 1 à 90 secondes |
| Lifecycle sidecar | `start_sidecar`, `stop_sidecar`, `sidecar_status`; Studio `GET /health` | Tauri possède le child process | readiness et retry | loopback seulement ; adopter un process sain ; tuer seulement le child possédé |
| Readiness Studio | `GET /api/status` | Studio via gateway native | diagnostics détaillés | timeout borné ; état dégradé visible |
| Queue catalogue | `GET /api/studio/product-queue` | Studio proxy le contexte Engine | sélection SELL | afficher la source et l'indisponibilité ; mock seulement en demo mode explicite |
| Catalogue public | Engine `GET /api/catalog` et détail produit | contrat de lecture Engine | navigation et détail SHOP | media marchand d'abord ; fallback `Demo visual` étiqueté |
| État live | Studio `POST /api/studio/go-live`, `POST /api/studio/stop-stream` | operator session Studio gardée en natif | arm/stop/timer SELL | la session actuelle est locale à Studio et en mémoire du process |
| Commerce intent | Studio `POST /api/studio/poc/commerce-intents` | authentifié, `YAATAL_COMMERCE_POC=1`, live requis | dialogue de partage | valider ID produit, stock, prix FCFA entier et URL media publique sûre |
| Handoff produit | `yaatal://product-navigation` avec `yaatal-os.v1` | validation native | une sélection SELL ouvre le détail SHOP | ID conforme à `[A-Za-z0-9][A-Za-z0-9_-]{0,127}` ; source `studio` |
| Commerce Sheet publique | `GET /b/{token}?src={channel}` | token opaque public | checkout sur le même téléphone | no-store et CSP ; ne jamais exposer les identifiants operator |
| Checkout sandbox | `POST /b/{token}/checkout` | token opaque public | provider, variante, quantité | `sandbox_paid` explicite ; idempotency key obligatoire |
| Conversions | `GET /api/studio/poc/conversions` | operator session Studio | Insights SELL | filtrer par live session ; afficher source et état de déduplication |
| Événements Studio | `WS /ws` public de Studio | channel public nettoyé | mises à jour connexion, conversion et governed action | reconnexion avec backoff ; aucune speech brute |
| Voice | `WS /api/studio/voice` authentifié de Studio | bridge natif typé | futur client push-to-talk/full-duplex | card séparée ; aucun fallback vers `/ws` public |
| Mutation gouvernée | Studio vers Harness vers Engine | identités server-side | actions vendeur | le renderer n'appelle jamais directement les endpoints de mutation |

## Contrats de données partagés

TypeScript doit définir un type normalisé par boundary et valider les données externes avant leur rendu.

```ts
type OsSession = {
  authenticated: boolean;
  merchantName?: string;
  verified?: boolean;
};

type CatalogProduct = {
  id: string;
  name: string;
  description?: string;
  priceFcfa: number;
  priceDisplay: string;
  stock: number;
  stockStatus: string;
  category?: string;
  images: string[];
  imageAlt: string;
  demoVisual: boolean;
};

type CommerceReceipt = {
  version: "yaatal.commerce-receipt.v1";
  orderId: string;
  productId: string;
  totalFcfa: number;
  paymentProvider: string;
  paymentStatus: "sandbox_paid";
  liveSessionId: string;
  sourceChannel: string;
  deduplicated: boolean;
};
```

Le backend nomme actuellement certains champs en FCFA entiers `price_cents`. L'adapter doit les normaliser une seule fois. Les composants UI ne doivent pas deviner les unités.

## Organisation proposée du frontend

```text
apps/desktop/src/
  app/
    app.ts
    router.ts
    session.ts
    state.ts
  lib/
    native.ts
    studio.ts
    catalog.ts
    contracts.ts
    validation.ts
  features/
    sell/
      SellCockpit.ts
      LiveControls.ts
      ProductQueue.ts
      SharePanel.ts
      ConversionFeed.ts
      sell.css
    shop/
      ShopHome.ts
      CatalogGrid.ts
      ProductDetail.ts
      shop.css
    commerce/
      CommerceLauncher.ts
      commerce.css
  styles/
    tokens.css
    shell.css
    themes.css
  tests/
```

Le code peut entrer progressivement dans `src/unified/` pendant que l'ancien renderer reste disponible derrière `VITE_YAATAL_UNIFIED_UI=1`. Le flag est un booléen sûr pour le renderer. Il ne transporte ni endpoint ni credential.

## Board Symphony

| Card | Track | Owner et write set exclusif | Dépend de | Exit gate |
|---|---|---|---|---|
| UIR-00 | R, contrat | `docs/scopes/UIR-01-*`, Board, provenance | aucun | plan bilingue commité sur branch isolée |
| UIR-01 | A, natif | `apps/desktop/src-tauri/src/main.rs`, `session.rs`, tests natifs | UIR-00 | la gateway Studio typée passe les tests auth, replay, logout et sanitization |
| UIR-02 | B, shell | nouveaux `src/app/**`, `src/lib/contracts.ts`, styles partagés et tests shell | UIR-00 | un login, un rail, routing SELL/SHOP, thèmes, états vides et d'erreur |
| UIR-03 | C, SELL | nouveaux `src/features/sell/**` et tests SELL | UIR-01, contrats partagés de UIR-02 | arm/stop live, sélection catalogue, liens de partage et conversions fonctionnent sans iframe |
| UIR-04 | D, SHOP | nouveaux `src/features/shop/**` et tests SHOP | contrats partagés de UIR-02 | catalogue et détail sont responsives et utilisent le même produit sélectionné |
| UIR-05 | I, commerce | nouveaux `src/features/commerce/**`, adapter d'événements et tests d'intégration | UIR-01, UIR-03, UIR-04 | intent, ouverture sheet, reçu et conversion ferment la boucle |
| UIR-05B | I, voice | bridge voice natif typé et fichiers UI voice seulement | UIR-01 | le chemin audio authentifié fonctionne ; aucun audio sur `/ws` public |
| UIR-06 | R, acceptance | tests d'acceptance et preuves seulement | UIR-05 | le flow visuel natif complet passe aux largeurs desktop et étroite |
| UIR-07 | S, nettoyage | anciens adapters iframe, pipeline export Expo, sortie Shop générée | UIR-06 | ancienne UI supprimée, tag de fallback enregistré, gates ciblées vertes |

L'owner intégration possède les fichiers partagés. Les agents SELL et SHOP ne modifient ni `main.ts`, ni le Rust natif, ni le dossier de l'autre. UIR-01 et UIR-02 peuvent commencer ensemble. UIR-03 et UIR-04 peuvent ensuite tourner en parallèle. UIR-07 passe toujours en dernier.

## Checkpoints

1. Scope : branch et base enregistrées ; ancien worktree POC inchangé.
2. Contrat : types partagés frozen ; noms de commands natives et réponses nettoyées revus.
3. Auth : JWT Engine et cookie Studio restent natifs ; login, rejet du replay, logout et nettoyage sur échec testés.
4. Feature : SELL et SHOP passent leurs tests ciblés séparément.
5. Intégration : CommerceIntent vers sheet publique vers reçu vers conversion passe.
6. Visuel : thèmes light et dark validés à 1280×800 et 900×600 ; SHOP et Commerce Sheet validés à 390×844.
7. Ship : ancien chemin de frames retiré seulement après l'acceptance ; commit et branch publiés avec les preuves exactes des gates.

## Cas d'acceptance

### Fonctionnel

- Se connecter une fois et passer de SELL à SHOP sans autre login.
- Démarrer ou retry le sidecar Studio et voir un état de readiness utile.
- Passer live, sélectionner le produit canonique et ouvrir le même produit dans SHOP.
- Créer les liens copy, livestream, Telegram et WhatsApp.
- Ouvrir la Commerce Sheet publique sans auth operator.
- Choisir un provider, une variante et une quantité, puis recevoir un reçu sandbox explicite.
- Conserver `live_session_id` et `source_channel` dans le reçu.
- Afficher une conversion dans SELL Insights et gérer le replay idempotent d'un checkout.
- Arrêter le stream et se déconnecter proprement.

### UX

- Un seul rail de navigation global. Les pages feature ne rendent pas une seconde navigation d'app.
- La présentation BOBO semble native sur desktop tout en gardant un layout acheteur responsive.
- Une image manquante affiche un `Demo visual` étiqueté, jamais une photo marchand inventée.
- Les états loading, empty, locked, degraded, offline et retry sont visibles.
- Les deux thèmes respectent le contraste et le focus.
- La navigation clavier et la préférence reduced-motion fonctionnent.

### Sécurité et confidentialité

- Aucun JWT Engine, cookie Studio, nonce bootstrap, control token, seller speech ou transcript brut n'apparaît dans les snapshots DOM, logs, storage, URLs, événements ou fixtures de test.
- Les capabilities Tauri restent étroites. Aucune permission shell ou filesystem n'est ajoutée.
- Studio bind sur loopback et la gateway rejette les cibles hors loopback.
- Le socket public d'événements ne contient ni speech ni audio.
- Le label sandbox est visible à la décision de paiement et sur le reçu.

## Runbook local

Prérequis : les dépendances et migrations Engine tournent, Python peut importer Studio, et les prérequis Node, Rust et Tauri sont installés.

```powershell
cd C:\Users\momo-\OneDrive\Desktop\YAATAL\Yaatal-Engine\.worktrees\Yaatal-OS\unified-ui-poc
pnpm install --frozen-lockfile
$env:ENGINE_API_URL = "http://127.0.0.1:5150"
$env:STUDIO_COOKIE_SECURE = "0"
$env:YAATAL_COMMERCE_POC = "1"
$env:YAATAL_COMMERCE_PUBLIC_BASE_URL = "http://127.0.0.1:8484"
pnpm --filter @yaatal/os-shell tauri dev --no-watch
```

`STUDIO_COOKIE_SECURE=0` sert uniquement au développement local. Ne pas mettre de credentials ou tokens jetables dans le repo, les Vite env, l'historique des commands ou ce document.

### Gates

```powershell
pnpm build
pnpm check
pnpm test
cd apps\desktop\src-tauri
cargo fmt --check
cargo check
cargo test
cargo clippy -- -D warnings
```

Dans ce worktree, le premier essai baseline de `pnpm test` a été bloqué par un `EPERM` Windows/OneDrive pendant que Node ouvrait `vitest.mjs`. C'est un échec d'environnement, pas une preuve de tests source verts ou rouges. Utiliser un store/target pnpm externe ou un clone non synchronisé avant d'enregistrer la gate baseline.

## Cutover et rollback

1. Construire les nouveaux modules derrière `VITE_YAATAL_UNIFIED_UI=1`.
2. Garder les anciens adapters iframe SELL et SHOP intacts jusqu'à UIR-06.
3. Rebase ou cherry-pick les commits source acceptés du POC. Ne pas copier les bundles Expo générés ni les artifacts service-worker.
4. Exécuter le même flow commerce sur les deux renderers et comparer les reçus.
5. Taguer le dernier build iframe connu.
6. Retirer les anciens adapters et le pipeline d'export dans UIR-07.
7. Garder BOBO comme produit acheteur mobile. Le rewrite desktop ne supprime ni son repo ni sa roadmap produit.

## Gaps connus après ce build

- Le storage de CommerceIntent, checkout et conversions reste une implémentation sandbox en mémoire du process.
- L'état live Studio ne crée ni ne termine encore une live session Engine.
- La publication native Telegram et WhatsApp reste un travail futur ; le POC produit des liens de partage utilisables.
- Le signup, le profil, le panier, les commandes, le scanner, les tools marchand et la sync offline complets de BOBO restent hors de cette slice desktop.
- Le settlement PI-SPI de production et la réconciliation webhook restent hors de ce POC.
- Le packaging Tauri Android et iOS, la signature et la distribution sur les stores restent post-POC.
- La parité voice authentifiée est UIR-05B et ne doit pas retarder le flow d'acceptance commerce.
- Les vues avancées OBS, MCP, readiness lab et audit restent dans Studio et peuvent être exposées après stabilisation du cockpit critique.

## Définition de done

Cette lane est done quand le renderer unifié termine la démo critique sans iframe, navigation dupliquée, credential dans le renderer ou identité produit mock ; quand toutes les gates ciblées ont une preuve enregistrée ; quand le POC actuel garde un point de rollback nommé ; et quand la branch est reviewable indépendamment de `yaatal/poc-demo-closure`.

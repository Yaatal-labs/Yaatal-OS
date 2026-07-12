# Commerce flow — hybrid loop, sales channel (QR), delivery (NFC), Engine gaps

*Moved out of the README (2026-07-10) — operational detail, kept close in docs.
Résumé in the README; full flow here. / Détail opérationnel sorti du README ;
résumé dans le README, flux complet ici (EN puis FR).*

---

## Hybrid flow: merchant proposes / model executes / engine disposes

> **Status: partially live.** The Studio side is built (QR generation, NFC
> bridge, overlays) and the **delivery half of the Engine side now exists**:
> one-time delivery codes, the public `/d/{code}` page, and anonymous
> confirm-by-code with escrow release. The sales half (marketplace pages for
> the QR deep links) is still missing — see "Engine gaps" below.

```
MERCHANT PROPOSES
  → Signals intent: "I want to sell these products on a live stream"
  → Provides product data, images, prices
  → Packs orders with NFC delivery tags for fulfillment

MODEL EXECUTES (Yaatal-Studio)
  → Agent loop orchestrates the livestream (STT, comments, OBS)
  → QR codes on screen → deep links to Engine marketplace
  → NFC controller lets seller control stream via physical cards
  → Replay clips → video pipeline → Reels/TikTok content

ENGINE DISPOSES (Yaatal Engine)
  → Serves marketplace pages (store, item details, checkout)
  → Processes orders, payments, inventory
  → NFC delivery confirmation → closes order, releases payment
  → Attributes sales to livestream sessions
```

### Sales channel: QR codes → deep links → Engine marketplace

During the livestream, QR codes are displayed on the OBS stream.
Viewers scan with their phone camera → deep link opens → lands on
the Yaatal Engine marketplace.

| Deep link | Destination | When |
|---|---|---|
| `yaatal.shop/m/{merchant}` | Merchant store | Start/end of stream |
| `yaatal.shop/i/{product}` | Item details | During product showcase |
| `yaatal.shop/c/{product}` | Direct checkout | Impulse buy moment |
| `yaatal.shop/l/{session}/{product}` | Live session item (attributed) | During stream — tracks sale to the live |

The `/l/{session_id}/` prefix lets the Engine attribute purchases to
specific livestream sessions — measuring which streams drive the most sales.

### Delivery: NFC confirmation → Engine closes order

Each shipped package includes an NFC sticker with a unique delivery code.
When the customer receives it, they tap the sticker with their phone →
opens `yaatal.shop/d/{delivery_code}` → confirms delivery → the Engine
marks the order delivered, releases payment to the merchant, and triggers
post-delivery flows (review request, re-order prompt).

The delivery code is one-time-use — the same tag can't confirm twice.

### Engine gaps (what still blocks end-to-end)

1. **Marketplace pages** for the `/m /i /c` deep links (or a web app serving
   them) — QR codes still point at pages nobody serves.
2. **`/l/{session}/{product}` routes** — the redirect/landing half of
   attribution. (The *data* half is done: orders carry `live_session_id`,
   accepted by both `POST /api/orders` and BOBO checkout.)

### Engine gaps closed (2026-07)

- ✅ **Delivery codes** — every delivery mints a one-time `delivery_code`
- ✅ **`POST /api/deliveries/confirm-by-code`** — anonymous confirm, one-time
  use enforced server-side, BOBO escrow released on confirmation
- ✅ **`GET /d/{code}`** — Engine serves the mobile FR/Wolof confirmation page
- ✅ `live/nfc_delivery` is wired to the real endpoint (stdlib urllib)
- ✅ **`GET /api/social/events`** — the Engine persists inbound WhatsApp
  messages (`social_events` table) and serves them authed, filterable by
  `platform`/`kind`/`since`; `live/agent_loop/whatsapp_source.py` polls it
  (stdlib urllib) into `CommentMonitor`. Requires the Engine deployed with
  this endpoint live, `YAATAL_ENGINE_URL`/`YAATAL_TOKEN` set, and WhatsApp
  webhook credentials configured Engine-side to carry real traffic.

---

## Flux hybride : le marchand propose / le modèle exécute / l'engine dispose

> **Statut : partiellement en production.** Le côté Studio est construit
> (génération de QR, pont NFC, overlays) et **la moitié livraison du côté
> Engine existe désormais** : codes de livraison à usage unique, la page
> publique `/d/{code}`, et la confirmation anonyme par code avec libération
> d'escrow. La moitié vente (pages marketplace pour les deep links des QR)
> manque encore — voir « Manques côté Engine » ci-dessous.

```
MERCHANT PROPOSES
  → Signals intent: "I want to sell these products on a live stream"
  → Provides product data, images, prices
  → Packs orders with NFC delivery tags for fulfillment

MODEL EXECUTES (Yaatal-Studio)
  → Agent loop orchestrates the livestream (STT, comments, OBS)
  → QR codes on screen → deep links to Engine marketplace
  → NFC controller lets seller control stream via physical cards
  → Replay clips → video pipeline → Reels/TikTok content

ENGINE DISPOSES (Yaatal Engine)
  → Serves marketplace pages (store, item details, checkout)
  → Processes orders, payments, inventory
  → NFC delivery confirmation → closes order, releases payment
  → Attributes sales to livestream sessions
```

### Canal de vente : QR codes → deep links → marketplace Engine

Pendant le livestream, des QR codes s'affichent sur le stream OBS. Les
spectateurs scannent avec leur téléphone → le deep link s'ouvre → atterrit
sur la marketplace Yaatal Engine.

| Deep link | Destination | Quand |
|---|---|---|
| `yaatal.shop/m/{merchant}` | Boutique du marchand | Début/fin de stream |
| `yaatal.shop/i/{product}` | Détails de l'article | Pendant la présentation du produit |
| `yaatal.shop/c/{product}` | Checkout direct | Moment d'achat impulsif |
| `yaatal.shop/l/{session}/{product}` | Article de la session live (attribué) | Pendant le stream — trace la vente vers le live |

Le préfixe `/l/{session_id}/` permet à l'Engine d'attribuer les achats à des
sessions de livestream spécifiques — mesurant quels streams génèrent le plus
de ventes.

### Livraison : confirmation NFC → l'Engine clôture la commande

Chaque colis expédié comprend un autocollant NFC avec un code de livraison
unique. Quand le client le reçoit, il tape l'autocollant avec son téléphone
→ ouvre `yaatal.shop/d/{delivery_code}` → confirme la livraison → l'Engine
marque la commande comme livrée, libère le paiement au marchand, et déclenche
les flux post-livraison (demande d'avis, invitation à recommander).

Le code de livraison est à usage unique — le même tag ne peut pas confirmer
deux fois.

### Manques côté Engine (ce qui bloque encore le bout-en-bout)

1. **Pages marketplace** pour les deep links `/m /i /c` (ou une web app qui
   les sert) — les QR codes pointent encore vers des pages que personne ne
   sert.
2. **Routes `/l/{session}/{product}`** — la moitié redirection/atterrissage
   de l'attribution. (La moitié *données* est faite : les commandes portent
   `live_session_id`, accepté à la fois par `POST /api/orders` et le
   checkout BOBO.)

### Manques côté Engine comblés (2026-07)

- ✅ **Codes de livraison** — chaque livraison génère un `delivery_code` à
  usage unique
- ✅ **`POST /api/deliveries/confirm-by-code`** — confirmation anonyme,
  usage unique appliqué côté serveur, escrow BOBO libéré à la confirmation
- ✅ **`GET /d/{code}`** — l'Engine sert la page de confirmation mobile
  FR/wolof
- ✅ `live/nfc_delivery` est câblé sur l'endpoint réel (urllib de la stdlib)
- ✅ **`GET /api/social/events`** — l'Engine persiste les messages WhatsApp
  entrants (table `social_events`) et les sert de façon authentifiée,
  filtrables par `platform`/`kind`/`since` ; `live/agent_loop/whatsapp_source.py`
  l'interroge (urllib de la stdlib) vers `CommentMonitor`. Nécessite l'Engine
  déployé avec cet endpoint actif, `YAATAL_ENGINE_URL`/`YAATAL_TOKEN`
  configurés, et des identifiants webhook WhatsApp configurés côté Engine
  pour faire transiter du trafic réel.

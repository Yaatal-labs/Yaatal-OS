# @yaatal/client

Typed TypeScript client for Yaatal Engine.

Client TypeScript typé pour Yaatal Engine.

## English

### What This Package Does

`@yaatal/client` is a thin HTTP client. It sends requests to Engine, attaches
bearer auth, parses JSON, and throws `YaatalApiError` for non-2xx responses.

It does not own business state. Engine remains the source of truth for auth,
products, orders, delivery, notifications, analytics, and BOBO commerce.

### Install

```bash
npm install @yaatal/client
```

For local workspace development:

```json
{
  "dependencies": {
    "@yaatal/client": "workspace:*"
  }
}
```

### Configure

```bash
EXPO_PUBLIC_ENGINE_API_URL=https://yaatal-engine-production.up.railway.app
```

```ts
import { createYaatalClient } from "@yaatal/client";

const client = createYaatalClient({
  baseUrl: "http://localhost:5150",
});
```

### Auth

```ts
const session = await client.auth.login({
  email: "buyer@example.com",
  password: "secret",
});

client.setToken(session.token);
```

If the app already has a JWT:

```ts
const client = createYaatalClient({ token });
```

### Products And Orders

```ts
const products = await client.products.list({
  category: "grocery",
});

const order = await client.orders.create({
  seller_id: "merchant-profile-id",
  payment_method: "cash",
  delivery_method: "pickup",
  items: [{ product_id: products.products[0].id, quantity: 1 }],
});
```

Notes:

- `products.list()` only returns active products.
- Generic order creation derives the buyer from the JWT.
- The SDK does not expose direct payment mutation helpers.

### Search

```ts
const productResults = await client.search.products({ q: "rice", limit: 20 });
const merchantResults = await client.search.merchants({ q: "dakar" });
const orderResults = await client.search.orders({ status: "pending" });
```

Product and merchant search are public. Order search requires auth and is scoped
to buyer or seller ownership.

### Notifications

```ts
const notifications = await client.notifications.list({ limit: 25 });
const unread = await client.notifications.unreadCount();

await client.notifications.markRead(notifications[0].id);
await client.notifications.markAllRead();
```

Notifications are in-app records. Push token registration is not part of V1.

### Analytics

```ts
await client.analytics.track({
  event: "checkout_started",
  properties: { source: "bobo" },
});

await client.analytics.identify({
  traits: { role: "buyer" },
});
```

Analytics V1 is authenticated. Engine derives identity from the JWT.

### BOBO Checkout

```ts
const checkout = await client.bobo.checkout({
  items: [{ product_id: "product-id", quantity: 1 }],
  payment_method: "wave",
  delivery_method: "bobo_managed",
  shipping_address: "Dakar",
  phone_number: "+221770000000",
  idempotency_key: crypto.randomUUID(),
});

console.log(checkout.order.engine_order_id);
console.log(checkout.payment.provider_ref);
```

`buyer_id` is optional. Engine derives the buyer from the JWT when possible.

BOBO lifecycle helpers:

```ts
const orders = await client.bobo.listOrders({ limit: 25 });
const detail = await client.bobo.getOrder(orders[0].id);
const escrow = await client.bobo.escrow(orders[0].id);

await client.bobo.confirmDelivery(orders[0].id);
```

The SDK does not expose `simulatePayment`.

### Generic Delivery

```ts
const delivery = await client.delivery.create({
  order_id: "engine-order-id",
  method: "bobo_managed",
  dropoff_address: "Dakar",
  phone_number: "+221770000000",
});

await client.delivery.updateStatus(delivery.id, { status: "accepted" });
await client.delivery.confirm(delivery.id, { proof_note: "received by buyer" });
```

Buyer confirmation is the final delivery action for escrow release.

### Checks

```bash
npm --prefix packages/client run test:contracts
npm --prefix packages/client run build
```

`test:contracts` checks the source contract without external services. `build`
requires `typescript`.

### Available Namespaces

- `client.analytics`
- `client.auth`
- `client.bobo`
- `client.delivery`
- `client.notifications`
- `client.orders`
- `client.products`
- `client.search`

## Français

### Rôle Du Package

`@yaatal/client` est un client HTTP léger. Il envoie les requêtes à Engine,
ajoute le bearer token, parse le JSON et lance `YaatalApiError` pour les réponses
non-2xx.

Il ne garde pas l'état métier. Engine reste la source de vérité pour auth,
produits, commandes, livraison, notifications, analytics et commerce BOBO.

### Installation

```bash
npm install @yaatal/client
```

En développement local workspace:

```json
{
  "dependencies": {
    "@yaatal/client": "workspace:*"
  }
}
```

### Configuration

```bash
EXPO_PUBLIC_ENGINE_API_URL=https://yaatal-engine-production.up.railway.app
```

```ts
import { createYaatalClient } from "@yaatal/client";

const client = createYaatalClient({
  baseUrl: "http://localhost:5150",
});
```

### Auth

```ts
const session = await client.auth.login({
  email: "buyer@example.com",
  password: "secret",
});

client.setToken(session.token);
```

Si l'app possède déjà un JWT:

```ts
const client = createYaatalClient({ token });
```

### Produits Et Commandes

```ts
const products = await client.products.list({
  category: "grocery",
});

const order = await client.orders.create({
  seller_id: "merchant-profile-id",
  payment_method: "cash",
  delivery_method: "pickup",
  items: [{ product_id: products.products[0].id, quantity: 1 }],
});
```

Notes:

- `products.list()` retourne seulement les produits actifs.
- La création de commande générique déduit l'acheteur depuis le JWT.
- Le SDK n'expose pas de helper pour muter directement un paiement.

### Recherche

```ts
const productResults = await client.search.products({ q: "riz", limit: 20 });
const merchantResults = await client.search.merchants({ q: "dakar" });
const orderResults = await client.search.orders({ status: "pending" });
```

La recherche produits et marchands est publique. La recherche commandes exige un
JWT et reste limitée aux commandes où le profil est acheteur ou vendeur.

### Notifications

```ts
const notifications = await client.notifications.list({ limit: 25 });
const unread = await client.notifications.unreadCount();

await client.notifications.markRead(notifications[0].id);
await client.notifications.markAllRead();
```

Les notifications V1 sont des enregistrements in-app. L'enregistrement de tokens
push n'est pas inclus dans cette version.

### Analytics

```ts
await client.analytics.track({
  event: "checkout_started",
  properties: { source: "bobo" },
});

await client.analytics.identify({
  traits: { role: "buyer" },
});
```

Analytics V1 exige un JWT. Engine déduit l'identité depuis ce JWT.

### Checkout BOBO

```ts
const checkout = await client.bobo.checkout({
  items: [{ product_id: "product-id", quantity: 1 }],
  payment_method: "wave",
  delivery_method: "bobo_managed",
  shipping_address: "Dakar",
  phone_number: "+221770000000",
  idempotency_key: crypto.randomUUID(),
});

console.log(checkout.order.engine_order_id);
console.log(checkout.payment.provider_ref);
```

`buyer_id` est optionnel. Engine déduit l'acheteur depuis le JWT quand c'est
possible.

Helpers de cycle de vie BOBO:

```ts
const orders = await client.bobo.listOrders({ limit: 25 });
const detail = await client.bobo.getOrder(orders[0].id);
const escrow = await client.bobo.escrow(orders[0].id);

await client.bobo.confirmDelivery(orders[0].id);
```

Le SDK n'expose pas `simulatePayment`.

### Livraison Générique

```ts
const delivery = await client.delivery.create({
  order_id: "engine-order-id",
  method: "bobo_managed",
  dropoff_address: "Dakar",
  phone_number: "+221770000000",
});

await client.delivery.updateStatus(delivery.id, { status: "accepted" });
await client.delivery.confirm(delivery.id, { proof_note: "received by buyer" });
```

La confirmation acheteur est l'action finale qui autorise la libération escrow.

### Contrôles

```bash
npm --prefix packages/client run test:contracts
npm --prefix packages/client run build
```

`test:contracts` vérifie le contrat source sans service externe. `build`
nécessite `typescript`.

### Namespaces Disponibles

- `client.analytics`
- `client.auth`
- `client.bobo`
- `client.delivery`
- `client.notifications`
- `client.orders`
- `client.products`
- `client.search`

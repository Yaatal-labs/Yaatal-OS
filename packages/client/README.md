# @yaatal/client

Typed TypeScript client for Yaatal Engine.

The client is intentionally thin: it sends HTTP requests to Engine routes, manages bearer auth, and exposes typed request/response contracts for app code.

## Install

```bash
npm install @yaatal/client
```

For local monorepo development, depend on the workspace package:

```json
{
  "dependencies": {
    "@yaatal/client": "workspace:*"
  }
}
```

## Configure

Set the Engine URL in the app environment:

```bash
EXPO_PUBLIC_ENGINE_API_URL=https://yaatal-engine-production.up.railway.app
```

You can also pass `baseUrl` directly:

```ts
import { createYaatalClient } from "@yaatal/client";

const client = createYaatalClient({
  baseUrl: "https://yaatal-engine-production.up.railway.app",
});
```

## Auth

```ts
const client = createYaatalClient();

const session = await client.auth.login({
  email: "buyer@example.com",
  password: "secret",
});

// login stores the bearer token on the client for later requests
console.log(session.pid);
```

If the app already has a token:

```ts
const client = createYaatalClient({ token });

client.setToken(nextToken);
client.clearToken();
```

## Products And Orders

```ts
const products = await client.products.list({
  category: "grocery",
  active_only: true,
});

const order = await client.orders.create({
  seller_id: "merchant-profile-id",
  payment_method: "cash",
  delivery_method: "pickup",
  items: [{ product_id: products.products[0].id, quantity: 1 }],
});
```

## BOBO Checkout

Use `client.bobo.checkout` for the BOBO commerce path. It creates the Engine order, BOBO order/payment intent, and delivery record when delivery fields are present.

```ts
const checkout = await client.bobo.checkout({
  buyer_id: "buyer-profile-id",
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

BOBO order lifecycle helpers:

```ts
const orders = await client.bobo.listOrders({ limit: 25 });
const detail = await client.bobo.getOrder(orders[0].id);
const escrow = await client.bobo.escrow(orders[0].id);

await client.bobo.confirmDelivery(orders[0].id);
```

KYC helpers:

```ts
await client.bobo.submitKyc({
  provider: "manual",
  document_hash_b64: "base64-encoded-sha256-digest",
  jurisdiction: "SN",
});

const kyc = await client.bobo.kycStatus();
```

## Generic Delivery

Use `client.delivery` for Engine-owned delivery records.

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

## Errors

Non-2xx responses throw `YaatalApiError`.

```ts
import { YaatalApiError } from "@yaatal/client";

try {
  await client.bobo.checkout(request);
} catch (error) {
  if (error instanceof YaatalApiError) {
    console.error(error.status, error.body);
  }
}
```

## Available Namespaces

- `client.auth`
- `client.products`
- `client.orders`
- `client.delivery`
- `client.bobo`

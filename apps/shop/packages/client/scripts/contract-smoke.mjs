import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

function read(relativePath) {
  return readFileSync(join(root, relativePath), "utf8");
}

function assertContains(name, source, expected) {
  if (!source.includes(expected)) {
    throw new Error(`${name} is missing ${expected}`);
  }
}

function assertNotContains(name, source, forbidden) {
  if (source.includes(forbidden)) {
    throw new Error(`${name} still contains forbidden contract ${forbidden}`);
  }
}

const files = {
  client: read("src/client.ts"),
  analytics: read("src/analytics.ts"),
  bobo: read("src/bobo.ts"),
  delivery: read("src/delivery.ts"),
  notifications: read("src/notifications.ts"),
  orders: read("src/orders.ts"),
  products: read("src/products.ts"),
  search: read("src/search.ts"),
  index: read("src/index.ts"),
};

for (const namespace of [
  "analytics",
  "auth",
  "bobo",
  "delivery",
  "notifications",
  "products",
  "orders",
  "search",
]) {
  assertContains("client.ts", files.client, `readonly ${namespace}:`);
}

const expectedRoutes = {
  analytics: [
    "/api/analytics/track",
    "/api/analytics/identify",
  ],
  bobo: [
    "/api/bobo/checkout",
    "/api/bobo/orders",
    "/api/bobo/kyc",
    "/confirm-delivery",
    "/dispute",
    "/cancel",
  ],
  delivery: [
    "/api/deliveries",
    "/status",
    "/confirm",
  ],
  notifications: [
    "/api/notifications",
    "/api/notifications/unread-count",
    "/read",
    "/read-all",
  ],
  orders: [
    "/api/orders",
    "/api/orders/me",
    "/status",
    "/cancel",
  ],
  products: [
    "/api/products",
    "/upvote",
  ],
  search: [
    "/api/search/products",
    "/api/search/merchants",
    "/api/search/orders",
  ],
};

for (const [name, routes] of Object.entries(expectedRoutes)) {
  for (const route of routes) {
    assertContains(`${name}.ts`, files[name], route);
  }
}

for (const [name, source] of Object.entries(files)) {
  for (const forbidden of [
    "simulatePayment",
    "simulate-payment",
    "updatePayment",
    "UpdatePaymentStatusRequest",
    "active_only",
    "SearchMetadata",
    "SearchHighlights",
  ]) {
    assertNotContains(`${name}.ts`, source, forbidden);
  }
}

for (const exported of [
  "AnalyticsClient",
  "BoboClient",
  "DeliveryClient",
  "NotificationsClient",
  "OrdersClient",
  "ProductsClient",
  "SearchClient",
  "JsonObject",
  "JsonValue",
]) {
  assertContains("index.ts", files.index, exported);
}

console.log("SDK contract smoke passed");

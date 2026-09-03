import { AuthClient } from "./auth.js";
import { AnalyticsClient } from "./analytics.js";
import { BoboClient } from "./bobo.js";
import { DeliveryClient } from "./delivery.js";
import { getEngineApiUrl, type EngineRuntimeEnv } from "./env.js";
import { EngineHttpClient, type FetchLike } from "./http.js";
import { NotificationsClient } from "./notifications.js";
import { OrdersClient } from "./orders.js";
import { ProductsClient } from "./products.js";
import { SearchClient } from "./search.js";

export interface YaatalClientOptions {
  baseUrl?: string;
  token?: string;
  fetch?: FetchLike;
  headers?: HeadersInit;
  env?: EngineRuntimeEnv;
}

export class YaatalClient {
  readonly analytics: AnalyticsClient;
  readonly auth: AuthClient;
  readonly bobo: BoboClient;
  readonly delivery: DeliveryClient;
  readonly notifications: NotificationsClient;
  readonly products: ProductsClient;
  readonly orders: OrdersClient;
  readonly search: SearchClient;

  private readonly http: EngineHttpClient;

  constructor(options: YaatalClientOptions = {}) {
    const httpOptions = {
      baseUrl: options.baseUrl ?? getEngineApiUrl(options.env),
    };

    this.http = new EngineHttpClient({
      ...httpOptions,
      ...(options.token === undefined ? {} : { token: options.token }),
      ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
      ...(options.headers === undefined ? {} : { headers: options.headers }),
    });

    this.analytics = new AnalyticsClient(this.http);
    this.auth = new AuthClient(this.http);
    this.bobo = new BoboClient(this.http);
    this.delivery = new DeliveryClient(this.http);
    this.notifications = new NotificationsClient(this.http);
    this.products = new ProductsClient(this.http);
    this.orders = new OrdersClient(this.http);
    this.search = new SearchClient(this.http);
  }

  setToken(token: string): void {
    this.http.setToken(token);
  }

  clearToken(): void {
    this.http.clearToken();
  }
}

export function createYaatalClient(
  options: YaatalClientOptions = {},
): YaatalClient {
  return new YaatalClient(options);
}

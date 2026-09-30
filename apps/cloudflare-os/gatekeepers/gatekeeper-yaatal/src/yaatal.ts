import { DurableObject, RpcStub, RpcTarget, WorkerEntrypoint } from "cloudflare:workers";
import { skipRpcValidation, validateRpc } from "capnweb-validate";
import type {
  AccountDescription,
  ApprovalQueue,
  Gatekeeper,
  GatekeeperConnectCallback,
  GatekeeperConnectOptions,
  GatekeeperUser,
  GatekeeperUserVerifier,
  ResourceConfiguratorFrame,
  ResourceDescription,
  SupportedResource,
  VendorDescription,
} from "@gadgets/workshop-shared/gatekeeper";
import {
  type CatalogConfig,
  CatalogUnavailableError,
  type CatalogFetch,
  catalogRequest,
  getCatalogProduct,
  listCatalog,
  productId,
  readConfig,
} from "./catalog.js";
import type { CatalogListOptions, CatalogPage, CatalogProduct, YaatalCatalogSession } from "./types.js";
import TYPES_CODE from "./types-code.js";

const YAATAL_ICON = {
  url:
    "data:image/svg+xml," +
    encodeURIComponent(
      "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 256 256' fill='none' stroke='currentColor' stroke-width='20'><path d='M40 88h176l-16 128H56z'/><path d='M92 88V72a36 36 0 0 1 72 0v16'/></svg>",
    ),
};

type ObservationQueue = Pick<ApprovalQueue, "authorizeObservation"> & Partial<{ [Symbol.dispose](): void }>;

export function describeYaatalVendor(): VendorDescription {
  return {
    displayName: "Yaatal catalog",
    url: "https://github.com/Yaatal-labs/Yaatal-OS",
    logo: YAATAL_ICON,
    color: "#fde8df",
    tagline: "Read-only products of this deployment's Yaatal shop",
    description:
      "Lists the active products, prices and stock of the one Yaatal shop this deployment is configured for. It cannot change anything, and it cannot read any other shop.",
    autoProvisionsAccount: true,
    providesAuth: false,
  };
}

export function describeYaatalAccount(): AccountDescription {
  return {
    displayName: "Yaatal catalog",
    avatar: YAATAL_ICON,
    singleton: { tsType: "YaatalCatalogSession" },
  };
}

@validateRpc()
export class YaatalCatalogSessionImpl extends RpcTarget implements YaatalCatalogSession {
  readonly #approvalQueue: ObservationQueue;
  readonly #config: CatalogConfig | null;
  readonly #fetch: CatalogFetch;

  constructor(approvalQueue: ObservationQueue, config: CatalogConfig | null, fetcher: CatalogFetch) {
    super();
    this.#approvalQueue = approvalQueue;
    this.#config = config;
    this.#fetch = fetcher;
  }

  // Order for every read: scope, then input, then the recorded observation, then the request.
  // A declined observation therefore never reaches Engine.
  async listProducts(options?: CatalogListOptions): Promise<CatalogPage> {
    const config = this.#scope();
    const request = catalogRequest(options);
    await this.#approvalQueue.authorizeObservation({
      title: "Read the Yaatal catalog",
      description: request.category
        ? `List page ${request.page} of the shop's products in the category "${request.category}".`
        : `List page ${request.page} of the shop's products.`,
    });
    return listCatalog(this.#fetch, config, request);
  }

  async getProduct(id: string): Promise<CatalogProduct> {
    const config = this.#scope();
    const checked = productId(id);
    await this.#approvalQueue.authorizeObservation({
      title: "Read a Yaatal product",
      description: `Read product ${checked} from the shop's catalog.`,
    });
    return getCatalogProduct(this.#fetch, config, checked);
  }

  #scope(): CatalogConfig {
    if (!this.#config) throw new CatalogUnavailableError("this deployment has no Yaatal shop configured");
    return this.#config;
  }

  [Symbol.dispose](): void {
    this.#approvalQueue[Symbol.dispose]?.();
  }
}

@validateRpc()
export class YaatalCatalogGatekeeper
  extends DurableObject<Cloudflare.Env>
  implements Gatekeeper<YaatalCatalogSession>
{
  async describe(): Promise<ResourceDescription> {
    return {
      url: "yaatal://catalog",
      title: "Yaatal catalog",
      snippet: "Active products, prices and stock of this deployment's Yaatal shop (read-only).",
      suggestedBindingName: "YAATAL_CATALOG",
      tsType: "YaatalCatalogSession",
    };
  }

  async getTypeScriptTypes(): Promise<string> {
    return TYPES_CODE;
  }

  async getAutoApprovableActions(): Promise<[]> {
    return [];
  }

  async startSession(approvalQueue: RpcStub<ApprovalQueue>): Promise<YaatalCatalogSession> {
    return new YaatalCatalogSessionImpl(approvalQueue.dup(), readConfig(this.env), request => fetch(request));
  }

  // The data is the configured shop's public catalog, identical for every user, so every observer
  // may keep it. Private reads (inactive products, orders) need per-user verification first.
  async addObserver(_id: string, _user: Fetcher<GatekeeperUserVerifier>): Promise<void> {}
  async removeObserver(_id: string): Promise<void> {}

  async applyAction(action: number): Promise<void> {
    throw new Error(`The Yaatal catalog is read-only (${action}).`);
  }

  async rejectAction(_action: number): Promise<void> {}

  async revertAction(_action: number): Promise<void> {
    throw new Error("The Yaatal catalog is read-only.");
  }
}

@validateRpc()
export class YaatalCatalogAccount extends WorkerEntrypoint<Cloudflare.Env> implements GatekeeperUser {
  async describe(): Promise<AccountDescription> {
    return describeYaatalAccount();
  }

  async getSingletonGatekeeperClass(): Promise<DurableObjectClass<Gatekeeper<YaatalCatalogSession>>> {
    return this.ctx.exports.YaatalCatalogGatekeeper({});
  }

  async getSupportedResources(): Promise<SupportedResource[]> {
    return [];
  }

  getGatekeeperClassFor(_url: string): never {
    throw new Error("The Yaatal catalog has no URL-addressed resources.");
  }

  startResourceConfigurator(_resourceUrlPattern: string): Promise<ResourceConfiguratorFrame> {
    throw new Error("The Yaatal catalog has no URL-addressed resources.");
  }

  async ensureResources(_resourceUrlPatterns: string[]): Promise<{ url?: string }> {
    return {};
  }

  async revoke(): Promise<void> {}

  reconnect(): Promise<{ url: string }> {
    throw new Error("The Yaatal catalog has no credentials to reconnect.");
  }

  commitReconnect(_stageId: string): Promise<void> {
    throw new Error("The Yaatal catalog has no credentials to reconnect.");
  }

  async getAuthenticatedEmail(): Promise<string | null> {
    return null;
  }

  @skipRpcValidation()
  async getVerifier(): Promise<Fetcher<GatekeeperUserVerifier>> {
    return this.ctx.exports.YaatalCatalogVerifier({});
  }
}

@validateRpc()
export class YaatalCatalogVerifier extends WorkerEntrypoint<Cloudflare.Env> implements GatekeeperUserVerifier {
  verify(): void {}
}

@validateRpc()
export class GatekeeperVendor extends WorkerEntrypoint<Cloudflare.Env> {
  async describe(): Promise<VendorDescription> {
    return describeYaatalVendor();
  }

  @skipRpcValidation()
  async createAccount(): Promise<Fetcher<GatekeeperUser>> {
    return this.ctx.exports.YaatalCatalogAccount({});
  }

  connectAccount(
    _callback: Fetcher<GatekeeperConnectCallback>,
    _options?: GatekeeperConnectOptions,
  ): Promise<{ url: string }> {
    throw new Error("The Yaatal catalog is auto-provisioned and has no connect flow.");
  }

  async getSupportedResources(_options?: { userId?: string }): Promise<SupportedResource[]> {
    return [];
  }

  async getTypeScriptTypes(): Promise<string> {
    return TYPES_CODE;
  }
}

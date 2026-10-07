import {
  DurableObject,
  RpcStub,
  RpcTarget,
  WorkerEntrypoint,
} from "cloudflare:workers";
import { skipRpcValidation, validateRpc } from "capnweb-validate";
import type {
  AccountDescription,
  AppUiContext,
  ApprovalQueue,
  Gatekeeper,
  GatekeeperConnectCallback,
  GatekeeperConnectOptions,
  GatekeeperUiFrame,
  GatekeeperUser,
  GatekeeperUserVerifier,
  ResourceConfiguratorFrame,
  ResourceDescription,
  SupportedResource,
  VendorDescription,
} from "@gadgets/workshop-shared/gatekeeper";
import type { CustomDeploymentInfo, CustomSession } from "./types.js";
import TYPES_CODE from "./types-code.js";
import BOARD_HTML from "./board-html.js";
import { ControlBoardImpl } from "./board.js";

// Drawn in the Workshop's own idiom: a stroked glyph in currentColor, so the OS themes it. Three bars
// off a common baseline read as a board without being anyone's brand mark.
const YAATAL_ICON = {
  url:
    "data:image/svg+xml," +
    encodeURIComponent(
      "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 256 256' fill='none' stroke='currentColor' stroke-width='20' stroke-linecap='round'><path d='M56 192v-48'/><path d='M128 192V96'/><path d='M200 192V48'/></svg>",
    ),
};

type ObservationQueue = Pick<ApprovalQueue, "authorizeObservation"> &
  Partial<{ [Symbol.dispose](): void }>;

export function describeCustomVendor(): VendorDescription {
  return {
    displayName: "Yaatal",
    // The starter this slot is adapted from, kept as provenance rather than replaced by an
    // invented Yaatal URL.
    url: "https://github.com/cloudflare/cloudflare-os-starter",
    logo: YAATAL_ICON,
    color: "#e8f2ff",
    tagline: "Poste de contrôle Yaatal",
    description:
      "Les deux rails Yaatal, jetons et commerce, plus l'état des services, réservés à l'opérateur.",
    autoProvisionsAccount: true,
    providesAuth: false,
  };
}

export function describeCustomAccount(): AccountDescription {
  return {
    displayName: "Yaatal",
    avatar: YAATAL_ICON,
    singleton: { tsType: "CustomSession" },
    // Advertising the board here is the whole registration. workshop-backend lists any account that
    // sets this, useGatekeeperApps renders the nav entry, and routes/gatekeepers_.$appId.tsx hosts it
    // generically -- nothing else in this package or in deploy.ts has to know the board exists.
    //
    // The entry is visible to every user, because this gatekeeper auto-provisions an account per user
    // and describe() is not user-scoped. The gate is therefore inside startAppUi(), and it re-checks
    // isAdmin on every method call rather than trusting the value captured when the page opened.
    providesUi: { title: "Poste de contrôle", icon: YAATAL_ICON },
  };
}

@validateRpc()
export class CustomSessionImpl extends RpcTarget implements CustomSession {
  readonly #approvalQueue: ObservationQueue;
  readonly #info: CustomDeploymentInfo;

  constructor(approvalQueue: ObservationQueue, info: CustomDeploymentInfo) {
    super();
    this.#approvalQueue = approvalQueue;
    this.#info = info;
  }

  async getDeploymentInfo(): Promise<CustomDeploymentInfo> {
    await this.#approvalQueue.authorizeObservation({
      title: "Read deployment information",
      description: "Read the custom information configured by this deployment.",
    });
    return this.#info;
  }

  [Symbol.dispose](): void {
    this.#approvalQueue[Symbol.dispose]?.();
  }
}

@validateRpc()
export class CustomGatekeeper extends DurableObject<Cloudflare.Env> implements Gatekeeper<CustomSession> {
  async describe(): Promise<ResourceDescription> {
    return {
      url: "custom://deployment-info",
      title: "Deployment information",
      snippet: "Organization-specific information supplied by this deployment.",
      suggestedBindingName: "CUSTOM",
      tsType: "CustomSession",
    };
  }

  async getTypeScriptTypes(): Promise<string> {
    return TYPES_CODE;
  }

  async getAutoApprovableActions(): Promise<[]> {
    return [];
  }

  async startSession(approvalQueue: RpcStub<ApprovalQueue>): Promise<CustomSession> {
    return new CustomSessionImpl(approvalQueue.dup(), {
      name: this.env.CUSTOM_NAME,
      message: this.env.CUSTOM_MESSAGE,
    });
  }

  async addObserver(_id: string, _user: Fetcher<GatekeeperUserVerifier>): Promise<void> {}
  async removeObserver(_id: string): Promise<void> {}

  async applyAction(action: number): Promise<void> {
    throw new Error(`Custom Gatekeeper has no actions (${action}).`);
  }

  async rejectAction(_action: number): Promise<void> {}

  async revertAction(_action: number): Promise<void> {
    throw new Error("Custom Gatekeeper has no actions to revert.");
  }
}

@validateRpc()
export class CustomAccount extends WorkerEntrypoint<Cloudflare.Env> implements GatekeeperUser {
  async describe(): Promise<AccountDescription> {
    return describeCustomAccount();
  }

  // The full-page board. Its shape follows the one working precedent in upstream,
  // packages/gatekeeper-context/src/library-gatekeeper.ts:147 inside @validateRpc()'s ContextAccount:
  // a plain method, no @skipRpcValidation, returning the page and a fresh stub.
  //
  // `context.isAdmin` is supplied fresh each open -- upstream's AppUiContext carries nothing else --
  // so this is a starting value, not a grant. ControlBoardImpl re-checks it on every call, which is
  // what makes revoking an admin take effect on the next read rather than the next page load.
  //
  // A non-admin gets the same page. The shell holds no data and starts by calling getViewerInfo(),
  // which answers `isAdmin: false` for them and no configuration at all; every data method then
  // throws. A second page for non-admins would be duplicate maintenance with no security value,
  // since the gate is server-side either way.
  async startAppUi(context: AppUiContext): Promise<GatekeeperUiFrame> {
    return {
      iframeHtml: BOARD_HTML,
      ui: new RpcStub(new ControlBoardImpl(this.env, context.isAdmin)),
    };
  }

  async getSingletonGatekeeperClass(): Promise<DurableObjectClass<Gatekeeper<CustomSession>>> {
    return this.ctx.exports.CustomGatekeeper({});
  }

  async getSupportedResources(): Promise<SupportedResource[]> {
    return [];
  }

  getGatekeeperClassFor(_url: string): never {
    throw new Error("Custom Gatekeeper has no URL-addressed resources.");
  }

  startResourceConfigurator(_resourceUrlPattern: string): Promise<ResourceConfiguratorFrame> {
    throw new Error("Custom Gatekeeper has no URL-addressed resources.");
  }

  async ensureResources(_resourceUrlPatterns: string[]): Promise<{ url?: string }> {
    return {};
  }

  async revoke(): Promise<void> {}

  reconnect(): Promise<{ url: string }> {
    throw new Error("Custom Gatekeeper has no credentials to reconnect.");
  }

  commitReconnect(_stageId: string): Promise<void> {
    throw new Error("Custom Gatekeeper has no credentials to reconnect.");
  }

  async getAuthenticatedEmail(): Promise<string | null> {
    return null;
  }

  @skipRpcValidation()
  async getVerifier(): Promise<Fetcher<GatekeeperUserVerifier>> {
    return this.ctx.exports.CustomVerifier({});
  }
}

@validateRpc()
export class CustomVerifier extends WorkerEntrypoint<Cloudflare.Env> implements GatekeeperUserVerifier {
  verify(): void {}
}

@validateRpc()
export class GatekeeperVendor extends WorkerEntrypoint<Cloudflare.Env> {
  async describe(): Promise<VendorDescription> {
    return describeCustomVendor();
  }

  @skipRpcValidation()
  async createAccount(): Promise<Fetcher<GatekeeperUser>> {
    return this.ctx.exports.CustomAccount({});
  }

  connectAccount(
    _callback: Fetcher<GatekeeperConnectCallback>,
    _options?: GatekeeperConnectOptions,
  ): Promise<{ url: string }> {
    throw new Error("Custom Gatekeeper is auto-provisioned and has no connect flow.");
  }

  async getSupportedResources(_options?: { userId?: string }): Promise<SupportedResource[]> {
    return [];
  }

  async getTypeScriptTypes(): Promise<string> {
    return TYPES_CODE;
  }
}

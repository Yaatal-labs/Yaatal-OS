import type { AuthClient } from "./auth-client";
import { NotSignedInHttpError } from "./auth-client";
import { deriveAppUserId, getOrCreateDeviceId, type KeyValueStorage } from "./identity";

/**
 * What `host/bridge-host.ts`'s `identity()` handler needs from wherever an app's per-app id
 * actually comes from. Two implementations below: the real one (`SessionIdentityProvider`,
 * backed by WhatsApp sign-in) and a dev-only placeholder (`DeviceIdentityProvider`) -- see
 * `ui/app.ts` for which one gets wired up, and `README.md`'s "WhatsApp sign-in" section for why
 * both exist.
 */
export interface IdentityProvider {
  /** Cheap to call before prompting for consent -- lets the host skip asking "may this app know
   *  you?" when the honest answer is "you're not signed in at all" (see `bridge-host.ts`). */
  isSignedIn(): Promise<boolean>;
  /** Resolves to the id. If sign-in turns out not to hold after all (e.g. the session expired
   *  between `isSignedIn()` and this call), rejects with `NotSignedInError`. */
  getIdentity(appId: string): Promise<string>;
}

/** Thrown by `SessionIdentityProvider` when there's no valid session. `bridge-host.ts` maps this
 *  to `{code: "not_signed_in"}` for the mini-app to handle -- see its README section "The bridge
 *  (`window.kairmel`)" for the full menu of `identity()` error codes. */
export class NotSignedInError extends Error {
  readonly code = "not_signed_in";
  constructor() {
    super("vous devez vous connecter avant d'autoriser cette app");
    this.name = "NotSignedInError";
  }
}

/** The real provider: identity comes from the signed-in WhatsApp session, via marche-api's
 *  `/v1/me` and `/v1/me/identity`. */
export class SessionIdentityProvider implements IdentityProvider {
  constructor(private readonly auth: Pick<AuthClient, "getMe" | "getIdentity">) {}

  async isSignedIn(): Promise<boolean> {
    const { signedIn } = await this.auth.getMe();
    return signedIn;
  }

  async getIdentity(appId: string): Promise<string> {
    try {
      const { id } = await this.auth.getIdentity(appId);
      return id;
    } catch (error) {
      if (error instanceof NotSignedInHttpError) throw new NotSignedInError();
      throw error;
    }
  }
}

/**
 * **Dev-only placeholder**, kept behind an explicit opt-in (`VITE_DEV_PLACEHOLDER_IDENTITY=true`
 * in `ui/app.ts`) so `apps/marche`'s standalone `pnpm dev` can still exercise `identity()`
 * without a running marche-api + Engine. Never "signed out": `isSignedIn()` always resolves
 * `true`, and the id is the same per-device HMAC this app used before WhatsApp sign-in existed
 * (`identity.ts`'s `deriveAppUserId`) -- a different, *unstable* value from the real provider's,
 * since it's keyed on a random per-device id rather than an actual account. Do not enable this
 * in any deployment a real person uses.
 */
export class DeviceIdentityProvider implements IdentityProvider {
  constructor(
    private readonly storage: KeyValueStorage,
    private readonly deviceId = getOrCreateDeviceId(storage),
  ) {}

  isSignedIn(): Promise<boolean> {
    return Promise.resolve(true);
  }

  getIdentity(appId: string): Promise<string> {
    return deriveAppUserId(this.deviceId, appId);
  }
}

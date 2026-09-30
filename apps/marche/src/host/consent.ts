import type { Permission } from "../manifest/types";

/** Tracks which (app, permission) pairs the person has already approved, so the host only
 *  asks once per app — see `attachBridgeHost`'s handling of `identity`. */
export interface ConsentStore {
  isGranted(appId: string, permission: Permission): boolean;
  grant(appId: string, permission: Permission): void;
}

export class InMemoryConsentStore implements ConsentStore {
  private readonly grants = new Set<string>();

  private key(appId: string, permission: Permission): string {
    return `${appId}:${permission}`;
  }

  isGranted(appId: string, permission: Permission): boolean {
    return this.grants.has(this.key(appId, permission));
  }

  grant(appId: string, permission: Permission): void {
    this.grants.add(this.key(appId, permission));
  }
}

/** Same thing, backed by `localStorage` so the grant survives a reload. Falls back to
 *  in-memory behavior silently if storage throws (private browsing, quota, etc.). */
export class LocalStorageConsentStore implements ConsentStore {
  private readonly memory = new InMemoryConsentStore();

  constructor(
    private readonly storage: Pick<Storage, "getItem" | "setItem">,
    private readonly storageKeyPrefix = "kairmel.marche.consent.",
  ) {}

  private key(appId: string, permission: Permission): string {
    return `${this.storageKeyPrefix}${appId}:${permission}`;
  }

  isGranted(appId: string, permission: Permission): boolean {
    try {
      if (this.storage.getItem(this.key(appId, permission)) === "1") return true;
    } catch {
      // fall through to memory
    }
    return this.memory.isGranted(appId, permission);
  }

  grant(appId: string, permission: Permission): void {
    this.memory.grant(appId, permission);
    try {
      this.storage.setItem(this.key(appId, permission), "1");
    } catch {
      // best-effort only; the in-memory grant above still holds for this session
    }
  }
}

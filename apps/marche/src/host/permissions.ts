import type { AppManifest, Permission } from "../manifest/types";

/** Thrown whenever a call is made for a permission the app's manifest never declared. The
 *  host must refuse these before doing anything else — see `assertDeclaredPermission`. */
export class PermissionDeniedError extends Error {
  readonly code = "permission_denied";

  constructor(
    readonly appId: string,
    readonly permission: Permission,
  ) {
    super(`"${appId}" n'a pas déclaré la permission "${permission}" dans son manifeste`);
    this.name = "PermissionDeniedError";
  }
}

export function hasDeclaredPermission(manifest: AppManifest, permission: Permission): boolean {
  return manifest.permissions.includes(permission);
}

export function assertDeclaredPermission(manifest: AppManifest, permission: Permission): void {
  if (!hasDeclaredPermission(manifest, permission)) {
    throw new PermissionDeniedError(manifest.id, permission);
  }
}

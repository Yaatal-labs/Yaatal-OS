/**
 * The app manifest format every Marché listing must satisfy. A mini-app published from
 * Créer declares one of these to be listed in the catalogue.
 */

/** Closed list of capabilities a mini-app may request from the host. Nothing else is valid. */
export const ALLOWED_PERMISSIONS = ["identity", "share", "pay"] as const;

export type Permission = (typeof ALLOWED_PERMISSIONS)[number];

export interface AppManifest {
  /** Short, stable, lowercase slug. Used as the permission/consent key — never reused. */
  id: string;
  /** Display name shown on the card and detail page. */
  name: string;
  /** Short description, in French, shown on the card. */
  description: string;
  /** Icon: an https URL, or a root-relative path to a bundled asset (e.g. for seed examples). */
  icon: string;
  /** The app's own website — where the host opens it (in a sandboxed iframe). */
  url: string;
  /** Category slug, used for the catalogue's category filter. */
  category: string;
  /** Who published the app. */
  author: string;
  /**
   * Permissions this app asks for. Must be a subset of `ALLOWED_PERMISSIONS`; any other
   * value makes the whole manifest invalid — see `validateAppManifest`.
   */
  permissions: Permission[];
}

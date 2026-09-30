// The app manifest format and its validator are apps/marche's own (src/manifest/) -- the same
// format Marché itself shows and opens apps from. This Worker re-exports that exact module
// rather than duplicating it, so a listing that validates here is exactly one Marché would
// accept too; the two can never quietly drift apart. See apps/marche/README.md for the format.
export { validateAppManifest, type ManifestValidationResult } from "../../marche/src/manifest/validate.js";
export type { AppManifest, Permission } from "../../marche/src/manifest/types.js";

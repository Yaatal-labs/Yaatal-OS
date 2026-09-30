import { ALLOWED_PERMISSIONS, type AppManifest, type Permission } from "./types";

export type ManifestValidationResult =
  | { ok: true; manifest: AppManifest }
  | { ok: false; errors: string[] };

const ID_PATTERN = /^[a-z0-9][a-z0-9-]{1,63}$/;
const CATEGORY_PATTERN = /^[a-z0-9][a-z0-9-]{0,39}$/;
const MAX_NAME = 80;
const MAX_DESCRIPTION = 240;
const MAX_AUTHOR = 80;
const MAX_URL = 2048;
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** https only, except http on a loopback host (local development of a mini-app). No embedded credentials. */
function isAllowedAppUrl(raw: string): boolean {
  if (!raw || raw.length > MAX_URL) return false;
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return false;
  }
  if (parsed.username || parsed.password) return false;
  if (parsed.protocol === "https:") return true;
  return parsed.protocol === "http:" && LOOPBACK_HOSTS.has(parsed.hostname);
}

/** An icon is either a bundled local asset (root-relative path) or anything a valid app URL allows. */
function isAllowedIconRef(raw: string): boolean {
  if (!raw || raw.length > MAX_URL) return false;
  if (raw.startsWith("/") && !raw.startsWith("//")) return true;
  return isAllowedAppUrl(raw);
}

function isPermission(value: unknown): value is Permission {
  return typeof value === "string" && (ALLOWED_PERMISSIONS as readonly string[]).includes(value);
}

/**
 * Validates and normalizes an untrusted value into an `AppManifest`. Returns every error
 * found (not just the first), in French, so a catalogue author can fix a listing in one pass.
 * Unknown permissions are rejected outright — this is the one closed list in the format.
 */
export function validateAppManifest(value: unknown): ManifestValidationResult {
  if (!isRecord(value)) {
    return { ok: false, errors: ["le manifeste doit être un objet JSON"] };
  }

  const errors: string[] = [];

  const id = typeof value.id === "string" ? value.id.trim() : "";
  if (!ID_PATTERN.test(id)) {
    errors.push("id : identifiant requis, en minuscules (lettres, chiffres, tirets), 2 à 64 caractères");
  }

  const name = typeof value.name === "string" ? value.name.trim() : "";
  if (name.length < 1 || name.length > MAX_NAME) {
    errors.push(`name : requis, 1 à ${MAX_NAME} caractères`);
  }

  const description = typeof value.description === "string" ? value.description.trim() : "";
  if (description.length < 1 || description.length > MAX_DESCRIPTION) {
    errors.push(`description : requise, 1 à ${MAX_DESCRIPTION} caractères`);
  }

  const icon = typeof value.icon === "string" ? value.icon.trim() : "";
  if (!isAllowedIconRef(icon)) {
    errors.push("icon : doit être une URL https, ou un chemin local commençant par /");
  }

  const url = typeof value.url === "string" ? value.url.trim() : "";
  if (!isAllowedAppUrl(url)) {
    errors.push("url : doit être une URL https valide, sans identifiants intégrés");
  }

  const category = typeof value.category === "string" ? value.category.trim() : "";
  if (!CATEGORY_PATTERN.test(category)) {
    errors.push("category : identifiant requis, en minuscules (lettres, chiffres, tirets), 1 à 40 caractères");
  }

  const author = typeof value.author === "string" ? value.author.trim() : "";
  if (author.length < 1 || author.length > MAX_AUTHOR) {
    errors.push(`author : requis, 1 à ${MAX_AUTHOR} caractères`);
  }

  const permissions = validatePermissions(value.permissions, errors);

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return { ok: true, manifest: { id, name, description, icon, url, category, author, permissions } };
}

function validatePermissions(value: unknown, errors: string[]): Permission[] {
  if (!Array.isArray(value)) {
    errors.push("permissions : doit être un tableau (vide si l'app n'en demande aucune)");
    return [];
  }

  const seen = new Set<Permission>();
  for (const entry of value) {
    if (!isPermission(entry)) {
      errors.push(
        `permissions : valeur inconnue "${String(entry)}" — autorisées : ${ALLOWED_PERMISSIONS.join(", ")}`,
      );
      continue;
    }
    seen.add(entry);
  }

  // Stable order, deduplicated, regardless of how the source listed them.
  return ALLOWED_PERMISSIONS.filter((permission) => seen.has(permission));
}

import { validateAppManifest } from "../manifest/validate";
import type { AppManifest } from "../manifest/types";

export interface RejectedEntry {
  index: number;
  errors: string[];
}

export interface CatalogueLoadResult {
  apps: AppManifest[];
  rejected: RejectedEntry[];
}

/** Validates every entry of an untrusted catalogue payload independently — one bad listing
 *  doesn't take the rest of the catalogue down with it. */
export function loadCatalogue(raw: unknown): CatalogueLoadResult {
  const list = Array.isArray(raw) ? raw : [];
  const apps: AppManifest[] = [];
  const rejected: RejectedEntry[] = [];

  list.forEach((entry, index) => {
    const result = validateAppManifest(entry);
    if (result.ok) {
      apps.push(result.manifest);
    } else {
      rejected.push({ index, errors: result.errors });
    }
  });

  return { apps, rejected };
}

export function searchApps(apps: AppManifest[], query: string): AppManifest[] {
  const q = query.trim().toLowerCase();
  if (!q) return apps;
  return apps.filter(
    (app) =>
      app.name.toLowerCase().includes(q) ||
      app.description.toLowerCase().includes(q) ||
      app.author.toLowerCase().includes(q),
  );
}

export function filterByCategory(apps: AppManifest[], category: string | null): AppManifest[] {
  if (!category) return apps;
  return apps.filter((app) => app.category === category);
}

export function listCategories(apps: AppManifest[]): string[] {
  return [...new Set(apps.map((app) => app.category))].sort();
}

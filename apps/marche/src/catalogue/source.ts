/** Minimal shape of `fetch` this module needs -- easy to fake in tests without a real network
 *  or DOM globals, and matched by the real `fetch` global. */
export type FetchLike = (input: string) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

/**
 * Resolves the raw catalogue payload for `loadCatalogue` to validate: the list of manifests,
 * untyped, not yet checked.
 *
 * When `catalogueUrl` is set (the marche-api Worker's origin), fetches `${catalogueUrl}/v1/catalogue`
 * and unwraps its `{ apps: [...] }` envelope. Any failure there -- offline, non-2xx, a malformed
 * body -- falls back to `localPath` (the bundled `catalogue.json`, a plain array), exactly as when
 * `catalogueUrl` is unset entirely. Either way, `loadCatalogue` still validates every entry and
 * drops invalid ones on its own -- this only decides *where* the raw list comes from.
 */
export async function resolveCatalogueSource(
  fetchImpl: FetchLike,
  catalogueUrl: string | undefined,
  localPath = "./catalogue.json",
): Promise<unknown> {
  if (catalogueUrl) {
    try {
      const response = await fetchImpl(`${catalogueUrl.replace(/\/+$/, "")}/v1/catalogue`);
      if (!response.ok) throw new Error(`catalogue API responded ${response.status}`);
      const body = (await response.json()) as { apps?: unknown };
      if (!Array.isArray(body.apps)) throw new Error("catalogue API response is missing an apps array");
      return body.apps;
    } catch {
      // Offline, misconfigured, or just down -- fall through to the bundled catalogue below.
    }
  }
  const response = await fetchImpl(localPath);
  if (!response.ok) throw new Error(`local catalogue responded ${response.status}`);
  return response.json();
}

import { describe, expect, it } from "vitest";
import { EXAMPLE_CATALOGUE } from "../src/catalogue/seed";
import { loadCatalogue, listCategories, searchApps } from "../src/catalogue/catalogue";
import { validateAppManifest } from "../src/manifest/validate";

describe("the seed catalogue (public/catalogue.json)", () => {
  it("has at least three entries, and every entry validates on its own", () => {
    expect(EXAMPLE_CATALOGUE.length).toBeGreaterThanOrEqual(3);
    for (const entry of EXAMPLE_CATALOGUE) {
      const result = validateAppManifest(entry);
      expect(result.ok, `entry "${entry.id}" should be a valid manifest`).toBe(true);
    }
  });

  it("is clearly marked as example data, not real listings", () => {
    for (const entry of EXAMPLE_CATALOGUE) {
      expect(entry.name.toLowerCase()).toMatch(/exemple/);
    }
  });

  it("loads end-to-end through loadCatalogue with nothing rejected", () => {
    const result = loadCatalogue(EXAMPLE_CATALOGUE);
    expect(result.rejected).toEqual([]);
    expect(result.apps.length).toBe(EXAMPLE_CATALOGUE.length);
  });

  it("spans more than one category, so the category filter has something to filter", () => {
    expect(listCategories(EXAMPLE_CATALOGUE).length).toBeGreaterThan(1);
  });

  it("can be searched by name", () => {
    const hits = searchApps(EXAMPLE_CATALOGUE, "quiz");
    expect(hits.length).toBeGreaterThan(0);
  });
});

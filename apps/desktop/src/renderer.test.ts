import { describe, expect, it, vi } from "vitest";
import { startRenderer } from "./main";
describe("renderer isolation", () => {
  it.each([true, false])("loads only its selected renderer (unified=%s)", async unified => {
    const loaders = { unified: vi.fn().mockResolvedValue({}), legacy: vi.fn().mockResolvedValue({}) };
    await startRenderer(unified, loaders);
    expect(loaders.unified).toHaveBeenCalledTimes(unified ? 1 : 0);
    expect(loaders.legacy).toHaveBeenCalledTimes(unified ? 0 : 1);
  });
});

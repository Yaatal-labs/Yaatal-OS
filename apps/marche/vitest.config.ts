import { defineConfig } from "vitest/config";

// All testable logic here (manifest validation, permission enforcement, the bridge protocol)
// is plain TypeScript that takes its window/DOM objects as parameters instead of touching
// browser globals directly, so it runs fine under Node — no jsdom dependency needed.
export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
  },
});

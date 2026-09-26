import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

// Tests run in workerd with a local D1 and no remote bindings: Workers AI and the wholesale upstream
// are replaced by fakes inside each test, so no test spends tokens.
export default defineConfig(async () => ({
  plugins: [
    cloudflareTest({
      main: "./src/index.ts",
      miniflare: {
        compatibilityDate: "2026-08-22",
        compatibilityFlags: ["nodejs_compat"],
        d1Databases: ["DB"],
        bindings: {
          TEST_MIGRATIONS: await readD1Migrations("./migrations"),
          ADMIN_TOKEN: "test-admin-token-0123456789abcdef0123",
          AI_GATEWAY_ID: "default",
        },
      },
    }),
  ],
  test: { include: ["test/*.test.ts"] },
}));

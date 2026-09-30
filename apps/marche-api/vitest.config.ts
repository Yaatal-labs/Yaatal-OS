import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

// Tests run in workerd with a local D1 -- no remote bindings, no real tokens.
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
          PUBLISH_TOKEN: "test-publish-token-0123456789abcdef0123456789",
          ADMIN_TOKEN: "test-admin-token-0123456789abcdef0123456789",
          ENGINE_API_URL: "https://engine.example.test",
          ENGINE_AUTH_SECRET: "test-engine-secret-0123456789abcdef0123456789",
          SESSION_SECRET: "test-session-secret-0123456789abcdef0123456789",
          IDENTITY_SECRET: "test-identity-secret-0123456789abcdef0123456789",
        },
      },
    }),
  ],
  test: { include: ["test/*.test.ts"] },
}));

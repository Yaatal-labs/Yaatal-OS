import { defineConfig } from "vite";

// The Marché host is a static, framework-free PWA. It has two build entries:
//   - index.html   the catalogue shell mini-apps are opened from
//   - kairmel-bridge  the standalone script mini-apps include to get `window.kairmel`
// Keeping the bridge as its own entry (named output, not content-hashed) means a mini-app
// can link to it with a stable path instead of reading a manifest to find the built filename.
export default defineConfig({
  base: "./",
  build: {
    rollupOptions: {
      input: { main: "index.html", "kairmel-bridge": "src/bridge/entry.ts" },
      output: {
        entryFileNames: (chunk) => (chunk.name === "kairmel-bridge" ? "kairmel-bridge.js" : "assets/[name]-[hash].js"),
      },
    },
  },
  // Standalone dev (`pnpm dev` here, rather than being served from apps/marche-api -- see that
  // app's README "Same-origin hosting"): proxy /v1/* to a marche-api dev server on :8787 so the
  // catalogue *and* the WhatsApp sign-in routes (host/auth-client.ts) both work without a real
  // deploy. `changeOrigin` + this being a same-host proxy means Set-Cookie still lands correctly
  // for :5173's origin, as far as the browser is concerned it only ever talked to :5173.
  server: {
    proxy: {
      "/v1": { target: "http://localhost:8787", changeOrigin: true },
    },
  },
});

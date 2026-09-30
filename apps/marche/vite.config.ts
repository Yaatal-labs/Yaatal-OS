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
});

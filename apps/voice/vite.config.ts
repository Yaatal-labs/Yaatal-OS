import { cloudflare } from "@cloudflare/vite-plugin";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), cloudflare()],
  // Relative URLs, so the landing page can load the call from under its own /voix/ prefix.
  base: "./",
  environments: {
    client: {
      build: {
        rollupOptions: {
          // index.html is the standalone call page; embed.js is the call the landing page opens.
          input: { main: "index.html", embed: "src/embed.tsx" },
          // Keep embed.js's export (open) that the landing page calls.
          preserveEntrySignatures: "exports-only",
          output: {
            entryFileNames: chunk => (chunk.name === "embed" ? "embed.js" : "assets/[name]-[hash].js"),
          },
        },
      },
    },
  },
});

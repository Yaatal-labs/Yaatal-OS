#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const mode = process.argv[2];
if (mode !== "dev" && mode !== "build") {
  console.error("Usage: node scripts/tauri-unified.mjs <dev|build>");
  process.exit(2);
}

const desktopDir = dirname(dirname(fileURLToPath(import.meta.url)));
const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const result = spawnSync(pnpm, ["exec", "tauri", mode, "--features", "unified-ui"], {
  cwd: desktopDir,
  env: { ...process.env, VITE_YAATAL_UNIFIED_UI: "1" },
  shell: process.platform === "win32",
  stdio: "inherit",
});

if (result.error) {
  console.error(`Failed to launch unified Tauri ${mode}: ${result.error.message}`);
  process.exit(1);
}
process.exit(result.status ?? 1);

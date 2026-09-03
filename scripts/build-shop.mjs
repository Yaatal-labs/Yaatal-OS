#!/usr/bin/env node
/**
 * Deterministic Shop bundle task for Yaatal OS (OSR-03).
 *
 * Runs the vendored BOBO Expo web export (apps/shop @ pinned revision) and
 * copies the static output into apps/desktop/public/shop/ so the desktop
 * Shop window can serve the buyer surface from packaged assets — no
 * localhost dependency in the packaged POC.
 *
 * Engine URL is provided at OS build time via EXPO_PUBLIC_ENGINE_API_URL and
 * baked into the BOBO bundle by Expo. No JWT or credentials are ever
 * embedded; BOBO calls the Engine directly with its own auth.
 *
 * Usage:
 *   node scripts/build-shop.mjs                 # export + copy
 *   EXPO_PUBLIC_ENGINE_API_URL=https://engine.example.com node scripts/build-shop.mjs
 */
import { cpSync, existsSync, mkdirSync, rmSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const shopSource = join(root, "apps", "shop");
const shopDist = join(shopSource, "bobo-app", "dist");
const target = join(root, "apps", "desktop", "public", "shop");

/** Resolve pnpm on Windows (pnpm.cmd) and POSIX. */
function pnpmCommand() {
  const probe = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
  const check = spawnSync(probe, ["--version"], { encoding: "utf8", shell: process.platform === "win32" });
  return check.status === 0 ? probe : "pnpm";
}

function fail(message) {
  console.error(`build-shop: ${message}`);
  process.exit(1);
}

if (!existsSync(join(shopSource, "package.json"))) fail("apps/shop/package.json is missing — vendored BOBO not present.");

console.log("build-shop: exporting BOBO web build (Expo)…");
const exportRun = spawnSync(pnpmCommand(), ["--filter", "bobo-app", "exec", "expo", "export", "-p", "web"], {
  cwd: shopSource,
  stdio: "inherit",
  shell: process.platform === "win32",
  env: process.env,
});
if (exportRun.status !== 0) fail("expo export failed — see output above.");

if (!existsSync(join(shopDist, "index.html"))) fail(`expected ${shopDist}/index.html but it was not produced.`);

console.log("build-shop: copying static export into apps/desktop/public/shop …");
rmSync(target, { recursive: true, force: true });
mkdirSync(target, { recursive: true });
cpSync(shopDist, target, { recursive: true });

const indexStat = statSync(join(target, "index.html"));
console.log(`build-shop: done — ${target}/index.html (${indexStat.size} bytes).`);
if (!process.env.EXPO_PUBLIC_ENGINE_API_URL) {
  console.log("build-shop: note — EXPO_PUBLIC_ENGINE_API_URL was not set; the bundle uses BOBO's built-in default Engine URL.");
}
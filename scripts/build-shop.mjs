#!/usr/bin/env node
/**
 * Deterministic Shop bundle task for Yaatal OS (OSR-03).
 *
 * Runs the vendored BOBO Expo web export (apps/shop @ pinned revision) and
 * installs the static output so the desktop Shop pane can load the buyer
 * surface from packaged assets — no localhost dependency in the packaged POC.
 *
 * Expo's web export hardcodes root-absolute asset paths (`/_expo/...`,
 * `/assets/...`, `/service-worker.js`). Serving the export nested under
 * `/shop/` alone would 404 those references and render a blank page. The
 * script therefore installs the export TWICE, mechanically, without editing
 * any bundle bytes (tree parity with the pinned BOBO revision is preserved):
 *
 *   1. apps/desktop/public/shop/   — the full export (document at /shop/)
 *   2. apps/desktop/public/ (root) — the root-absolute directories BOBO's
 *      index.html and bundle reference: `_expo/`, `assets/`, `favicon.ico`,
 *      `manifest.json`, `metadata.json`.
 *
 * A minimal no-op `service-worker.js` is written at the public root so BOBO's
 * root-scope service-worker registration resolves without caching side
 * effects on the shell.
 *
 * Engine URL is provided at OS build time via EXPO_PUBLIC_ENGINE_API_URL and
 * baked into the BOBO bundle by Expo. No JWT or credentials are ever
 * embedded; BOBO calls the Engine directly with its own auth.
 *
 * Usage:
 *   node scripts/build-shop.mjs                 # export + install
 *   EXPO_PUBLIC_ENGINE_API_URL=https://engine.example.com node scripts/build-shop.mjs
 */
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const shopSource = join(root, "apps", "shop");
const shopDist = join(shopSource, "bobo-app", "dist");
const publicDir = join(root, "apps", "desktop", "public");
const target = join(publicDir, "shop");

/** Root-absolute paths referenced by the BOBO export's index.html and bundle. */
const ROOT_SPREAD = ["_expo", "assets", "favicon.ico", "manifest.json", "metadata.json"];
const DEMO_MEDIA = [
  "bazin_robe.webp",
  "bissap.webp",
  "cosmetics.webp",
  "gold_earrings.webp",
  "leather_bag.webp",
  "smartphone.webp",
  "thiote_mat.webp",
];
const demoMediaSource = join(root, "apps", "studio", "live", "dashboard", "img");
const catalogMediaBaseUrl = process.env.EXPO_PUBLIC_CATALOG_MEDIA_BASE_URL || "/shop/catalog-media";

const NOOP_SERVICE_WORKER = `/* Yaatal OS no-op service worker (installed by scripts/build-shop.mjs).
   BOBO's bundle registers '/service-worker.js' at root scope; this harmless
   pass-through satisfies that registration without any fetch caching. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
`;

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
  env: {
    ...process.env,
    EXPO_PUBLIC_CATALOG_MEDIA_BASE_URL: catalogMediaBaseUrl,
  },
});
if (exportRun.status !== 0) fail("expo export failed — see output above.");

if (!existsSync(join(shopDist, "index.html"))) fail(`expected ${shopDist}/index.html but it was not produced.`);

console.log("build-shop: installing full export into apps/desktop/public/shop …");
rmSync(target, { recursive: true, force: true });
mkdirSync(target, { recursive: true });
cpSync(shopDist, target, { recursive: true });

// Install the exact same optimized, provenance-recorded demo media used by
// Studio. The BOBO adapter only selects it when Engine returns no product
// image, and labels it as a demo visual in both browse and detail views.
const demoMediaTarget = join(target, "catalog-media");
mkdirSync(demoMediaTarget, { recursive: true });
for (const filename of DEMO_MEDIA) {
  const source = join(demoMediaSource, filename);
  if (!existsSync(source)) fail(`missing shared demo media: ${source}`);
  cpSync(source, join(demoMediaTarget, filename));
}
console.log(`build-shop: installed ${DEMO_MEDIA.length} shared catalog WebPs at ${catalogMediaBaseUrl}.`);

// Inject the OS Shop-pane skin into the packaged copy ONLY — the vendored
// BOBO source and its original export stay untouched (tree parity).
const skinSource = join(root, "apps", "desktop", "scripts", "os-skin.css");
const shimSource = join(root, "apps", "desktop", "scripts", "os-skin.js");
const skinTarget = join(target, "os-skin.css");
cpSync(skinSource, skinTarget);
cpSync(shimSource, join(target, "os-skin.js"));
const indexPath = join(target, "index.html");
let indexHtml = readFileSync(indexPath, "utf8");
if (!indexHtml.includes("os-skin.js")) {
  indexHtml = indexHtml.replace(
    "</head>",
    '  <link rel="stylesheet" href="./os-skin.css" />\n  </head>',
  );
  // The shim must run before the app bundle so it skins every RNW style batch.
  indexHtml = indexHtml.replace(
    /<script\s+src="\/_expo\/[^"]*"\s+defer><\/script>/,
    '<script defer src="./os-skin.js"></script>\n  $&',
  );
  writeFileSync(indexPath, indexHtml);
  console.log("build-shop: OS skin + palette shim injected into packaged index.html.");
}

console.log("build-shop: spreading root-absolute assets to apps/desktop/public …");
for (const name of ROOT_SPREAD) {
  const source = join(shopDist, name);
  if (!existsSync(source)) continue;
  const dest = join(publicDir, name);
  rmSync(dest, { recursive: true, force: true });
  cpSync(source, dest, { recursive: true });
}
writeFileSync(join(publicDir, "service-worker.js"), NOOP_SERVICE_WORKER);

const indexStat = statSync(join(target, "index.html"));
console.log(`build-shop: done — ${target}/index.html (${indexStat.size} bytes).`);
if (!process.env.EXPO_PUBLIC_ENGINE_API_URL) {
  console.log("build-shop: note — EXPO_PUBLIC_ENGINE_API_URL was not set; the bundle uses BOBO's built-in default Engine URL.");
}

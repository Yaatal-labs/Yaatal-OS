// Generates `dist/`: the tiny bundle of local, first-party assets the Tauri
// window falls back to when Kairmel is unreachable. There is no framework
// here on purpose - this is the whole frontend build.
import { mkdir, readFile, writeFile, copyFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const srcDir = path.join(root, "src");
const distDir = path.join(root, "dist");

const DEFAULT_KAIRMEL_URL = "https://kairmel.example";

function kairmelUrl() {
  const raw = process.env.KAIRMEL_URL?.trim() || DEFAULT_KAIRMEL_URL;
  // Validated for real on the Rust side (see src-tauri/src/kairmel.rs); this
  // build script only needs it well-formed enough to embed in the page.
  return new URL(raw).toString();
}

async function main() {
  await mkdir(distDir, { recursive: true });

  const url = kairmelUrl();
  const origin = new URL(url).origin;

  const template = await readFile(path.join(srcDir, "offline.template.html"), "utf8");
  const page = template
    .replaceAll("__KAIRMEL_URL__", url)
    .replaceAll("__KAIRMEL_ORIGIN__", origin);

  await writeFile(path.join(distDir, "offline.html"), page, "utf8");
  await copyFile(path.join(srcDir, "offline.mjs"), path.join(distDir, "offline.mjs"));

  console.log(`[kairmel-shell] built dist/offline.html for ${url}`);
}

main().catch((error) => {
  console.error("[kairmel-shell] build-static failed:", error);
  process.exitCode = 1;
});

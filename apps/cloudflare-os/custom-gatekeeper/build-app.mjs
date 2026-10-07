// Bundles the control board's page into one self-contained HTML string.
//
// Why this exists instead of Vite. The Workshop hosts startAppUi()'s iframeHtml as a
// sandbox="allow-scripts" document at an opaque origin: no same-origin, no credentials, no relative
// URL to resolve against. So the page must arrive complete, and it must speak capnweb, because the
// handshake it has to perform is newMessagePortRpcSession(port, iframe) on a MessageChannel port.
//
// capnweb's ESM entry happens to be one self-contained file with no imports, so the whole build is:
// read it, read our two sources, concatenate, escape, write. No bundler, no plugin, no dependency
// added to a package that has none. `tsc` stays the TypeScript step and this stays the HTML step.
//
// Writes src/generated/app.ts -- a module whose single default export is that HTML string, which
// src/board-html.ts imports.
//
// A .ts module rather than a .txt asset, deliberately. The same `import x from "./app.txt"` means two
// different things in two toolchains: wrangler resolves it through its built-in Text rule and hands
// over the contents, while Vite resolves it as a static asset and hands over a URL string. The
// browser-side one fails silently -- iframeHtml would become "./generated/app.txt" and the sandboxed
// iframe would render that path as its own body. Generated TypeScript says "this is a string" to
// every toolchain, with no rule table in between.
//
// The page becomes a JSON string literal: JSON.stringify escapes the quotes, backslashes and control
// characters, so the HTML cannot terminate the literal that carries it.
//
// Run by the package's `build` task before tsc, and by `node build-app.mjs` on its own.

import { createRequire } from "node:module";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const SHELL = join(here, "app", "index.html");
const CLIENT = join(here, "app", "board.js");
const OUT = join(here, "src", "generated", "app.ts");
const PLACEHOLDER = "<!-- BOARD_SCRIPT -->";

function fail(message) {
  console.error("build-app: " + message);
  process.exit(1);
}

function read(path) {
  if (!existsSync(path)) fail("missing " + path);
  return readFileSync(path, "utf8");
}

/** Locates capnweb's ESM file: its exports map first, then module/main. */
function capnwebEntry() {
  const require = createRequire(import.meta.url);

  // The package root, whichever way we manage to reach the manifest. Resolution walks up from this
  // file, so it finds capnweb in the workspace root's node_modules as well as a nested one.
  let rootDir = null;
  let manifest = null;

  try {
    const manifestPath = require.resolve("capnweb/package.json");
    manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    rootDir = dirname(manifestPath);
  } catch {
    // Not every package exposes ./package.json through its exports map, so fall back to the resolved
    // entry point and walk up for the manifest next to it.
    let dir = dirname(require.resolve("capnweb"));
    for (;;) {
      const candidate = join(dir, "package.json");
      if (existsSync(candidate)) {
        manifest = JSON.parse(readFileSync(candidate, "utf8"));
        rootDir = dir;
        break;
      }
      const parent = dirname(dir);
      if (parent === dir) fail("could not locate capnweb's package.json");
      dir = parent;
    }
  }

  const entry = manifest.exports?.["."] ?? manifest.exports;
  const selected =
    typeof entry === "string"
      ? entry
      : entry?.import ?? entry?.default ?? entry?.module ?? manifest.module ?? manifest.main;
  if (typeof selected !== "string") fail("no ESM entry in capnweb's package.json");
  return resolve(rootDir, selected);
}

const capnweb = read(capnwebEntry());
const shell = read(SHELL);
const client = read(CLIENT);

if (!shell.includes(PLACEHOLDER)) fail(SHELL + " has no " + PLACEHOLDER + " slot");

// capnweb must be importable by concatenation, not by resolution. An inline module script cannot
// resolve a bare specifier (no import map, and an opaque origin has no relative base), so a single
// import statement here would break the page at runtime with no build error. Check, don't assume.
for (const [, specifier] of capnweb.matchAll(/^\s*import\s[^;]*?from\s*["']([^"']+)["']/gm)) {
  fail("capnweb imports " + JSON.stringify(specifier) + "; the concat build cannot resolve it");
}
if (/(^|[^\w$.])import\s*\(/.test(capnweb)) fail("capnweb uses dynamic import; the concat build cannot resolve it");

// A script element ends at the literal </script, wherever it appears in the source. Escaping the
// slash is a no-op in a string, a regex and a comment alike, so this is safe to apply blindly.
// <!-- is the other sequence that can shift the parser into an escaped state; neither file contains
// it today, so fail loudly rather than ship a page whose script the parser may truncate.
for (const [name, source] of [["capnweb", capnweb], [CLIENT, client]]) {
  if (source.includes("<!--")) fail(name + " contains <!--, which the HTML parser treats specially");
}

const escape = (source) => source.replace(/<\/script/gi, "<\\/script");

const script =
  '<script type="module">\n' +
  escape(capnweb) +
  "\n;(() => {\n" +
  escape(client) +
  "\n})();\n</script>";

// The page keeps its own generated-by comment inside itself, so the string that reaches the iframe
// says where it came from. The module wrapping it says the same for anyone reading the build.
const html = shell.replace(PLACEHOLDER, script);
const output =
  "// Generated from apps/cloudflare-os/custom-gatekeeper/app by build-app.mjs. Do not edit.\n" +
  "export default " +
  JSON.stringify(html) +
  ";\n";

mkdirSync(dirname(OUT), { recursive: true });

// wrangler watches src/, and this file lands in src/. Rewriting identical bytes on every build would
// spin the watcher, so an unchanged build leaves the file alone.
//
// The reported size is the page's own, not the escaped literal's, because the page is the thing whose
// weight matters: it is what the iframe parses at an opaque origin.
const kib = Math.round(html.length / 1024);
const previous = existsSync(OUT) ? readFileSync(OUT, "utf8") : null;
if (previous === output) {
  console.log("build-app: app.ts unchanged (page " + kib + " KiB), skipping write");
} else {
  writeFileSync(OUT, output);
  console.log("build-app: wrote app.ts (page " + kib + " KiB)");
}

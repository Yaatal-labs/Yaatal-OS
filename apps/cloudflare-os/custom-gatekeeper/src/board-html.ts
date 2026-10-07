// The control board's page, as one self-contained string.
//
// `node build-app.mjs` concatenates app/index.html, app/board.js and capnweb's own ESM entry, and
// writes the result to ./generated/app.ts as a module exporting that string. This file is the single
// importer, so ./custom.ts can name the page rather than reach into a generated path.
//
// The generated file is TypeScript rather than a .txt asset on purpose. See the header of
// build-app.mjs: a `.txt` import is a string under wrangler and a URL under Vite, and only the second
// one is wrong at runtime.
//
// ./generated/ is gitignored. Every checkout regenerates it -- the package's build and test tasks, and
// the types:check and test:run scripts, all run build-app.mjs first.
import BOARD_HTML from "./generated/app.js";

export default BOARD_HTML;

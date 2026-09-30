// `wrangler types` points mainModule at the capnweb-validate build output (.wrangler/validate), which
// is generated code. Point it at the source instead, as upstream's checked-in Gatekeeper types do.
import { readFileSync, writeFileSync } from "node:fs";

const path = new URL("./worker-configuration.d.ts", import.meta.url);
const before = readFileSync(path, "utf8");
const after = before.replace('typeof import("./.wrangler/validate/src/index")', 'typeof import("./src/index")');
if (after === before && !before.includes('typeof import("./src/index")')) {
  throw new Error("worker-configuration.d.ts: mainModule line not found");
}
writeFileSync(path, after);

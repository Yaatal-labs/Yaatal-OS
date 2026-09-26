// End-to-end check of gatekeeper-yaatal through the OS itself, with no model: opt the user in to the
// Yaatal catalog, open a workspace (which installs it as the ambient YAATAL_CATALOG capsule), then
// call it the way an agent's code would. Needs YAATAL_ENGINE_URL and YAATAL_MERCHANT_ID in the
// Gatekeeper's .dev.vars. Exits non-zero if any check fails.
//
//   CFOS_DIR=... OS_PASSWORD=... node yaatal/smoke/catalog-gatekeeper.mjs <workspaceId>
import { signIn } from "../lib.mjs";

const [workspaceId] = process.argv.slice(2);
if (!workspaceId) throw new Error("usage: catalog-gatekeeper.mjs <workspaceId>");

const authed = await signIn();
await authed.provisionAmbientAccount("yaatal");
const workspace = await authed.openGadget(workspaceId);

// Ambient capsules are not listed as workpieces; their ids are small, so find it by description.
let client = null;
for (let id = 0; id < 64 && !client; id++) {
  const candidate = await workspace.getGatekeeperById(id).catch(() => null);
  const description = await candidate?.describe().catch(() => null);
  if (description?.url === "yaatal://catalog") client = candidate;
}
if (!client) throw new Error("no YAATAL_CATALOG capsule in this workspace");
const catalog = await client.openSession();

let failures = 0;
const check = (label, ok, detail = "") => {
  console.log(`${ok ? "ok  " : "FAIL"} ${label}${detail ? `: ${detail}` : ""}`);
  if (!ok) failures++;
};
const refusal = promise => promise.then(() => null, error => String(error?.message ?? error));

const page = await catalog.listProducts();
check("listProducts", page.page === 1 && page.perPage === 20 && page.products.length > 0,
  `${page.products.length} of ${page.total}`);
const keys = new Set(page.products.flatMap(product => Object.keys(product)));
const allowed = ["id", "name", "description", "priceFcfa", "priceDisplay", "stock", "stockStatus", "category", "images"];
check("only DTO fields", [...keys].every(key => allowed.includes(key)), [...keys].join(","));

const first = page.products[0];
const one = await catalog.getProduct(first.id);
check("getProduct", one.id === first.id && one.priceDisplay === first.priceDisplay, `${one.name}, ${one.priceDisplay}`);

check("path-like id refused", (await refusal(catalog.getProduct("../merchant/products"))) === "Invalid product id");
check("unknown id reads as not found",
  (await refusal(catalog.getProduct("00000000-0000-4000-8000-000000000000"))) === "Product not found");

const smuggled = await catalog.listProducts({ page: 1, merchantId: "someone-else" }).catch(() => null);
check("a merchant in the options changes nothing",
  !smuggled || (smuggled.total === page.total && smuggled.products[0]?.id === first.id));

process.exit(failures ? 1 : 0);

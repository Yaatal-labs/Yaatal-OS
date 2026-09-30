// Publish a reviewed workspace gadget as a versioned Blueprint and feature it deployment-wide.
//
// The OS refuses to publish agent-made code that is still provisional. Accepting it is the human
// review gate, so this script only merges when --accept is passed explicitly, after the code was
// read (review-changes.mjs) and judged safe.
//
//   CFOS_DIR=... OS_PASSWORD=... node yaatal/smoke/publish-blueprint.mjs <workspaceId> \
//     --title "..." --description "..." [--accept] [--chat 0] [--gadget 0]
import { signIn } from "../lib.mjs";

const args = process.argv.slice(2);
const flag = name => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : undefined; };
const workspaceId = args[0];
const title = flag("title"), description = flag("description");
if (!workspaceId || workspaceId.startsWith("--") || !title) {
  throw new Error('usage: publish-blueprint.mjs <workspaceId> --title "..." [--description "..."] [--accept]');
}

const authed = await signIn();
const overseer = await authed.openGadget(workspaceId);
let merged = null;
if (args.includes("--accept")) merged = await overseer.mergeChanges(Number(flag("chat") ?? 0));
const gadget = await overseer.getGadget(Number(flag("gadget") ?? 0));
const blueprint = await gadget.createBlueprint(title, description ?? "");

const adminApi = await authed.getAdminApi();
if (!adminApi) throw new Error("Published, but this account cannot feature blueprints (not an administrator)");
await adminApi.setBlueprintFeatured(blueprint.id, true);
console.log(JSON.stringify({ merged, blueprint, featured: await adminApi.isBlueprintFeatured(blueprint.id) }, null, 1));
process.exit(0);

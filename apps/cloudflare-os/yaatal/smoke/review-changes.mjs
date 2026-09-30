// Print the code an agent proposed in a workspace chat, for human review before accepting.
// Agent changes stay provisional until someone accepts them (see publish-blueprint.mjs).
//
//   CFOS_DIR=... OS_PASSWORD=... node yaatal/smoke/review-changes.mjs <workspaceId> [chatId=0]
import { signIn, proposedFiles } from "../lib.mjs";

const [workspaceId, chatArg = "0"] = process.argv.slice(2);
if (!workspaceId) throw new Error("usage: review-changes.mjs <workspaceId> [chatId]");

const authed = await signIn();
const overseer = await authed.openGadget(workspaceId);
const { messages } = await overseer.getChatHistory(Number(chatArg));
for (const [name, contents] of Object.entries(proposedFiles(messages))) {
  console.log(`\n===== ${name} (${contents.length} chars)\n${contents}`);
}
process.exit(0);

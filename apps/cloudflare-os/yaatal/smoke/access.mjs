// Access smoke: password sign-in for two accounts; only the administrator gets the Admin API.
// Creates the accounts on a fresh local instance (run-local allows signup), else logs in.
//
//   CFOS_DIR=... OS_CREDS_FILE=creds.json node yaatal/smoke/access.mjs
// creds.json: {"admin": "...", "<user>": "..."}; the second key is the non-admin account.
import { readFileSync } from "node:fs";
import { hashPassword, session } from "../lib.mjs";

if (!process.env.OS_CREDS_FILE) throw new Error("Set OS_CREDS_FILE");
const creds = JSON.parse(readFileSync(process.env.OS_CREDS_FILE, "utf8"));
const users = Object.keys(creds);
if (!users.includes("admin") || users.length < 2) throw new Error("creds need 'admin' plus one other user");

const result = {};
for (const user of users) {
  const stub = session();
  const hash = await hashPassword(user, creds[user]);
  let token = await stub.createAccount(user, user, hash);
  const how = token ? "created" : "logged-in";
  token ??= await stub.login(user, hash);
  if (!token) { result[user] = { error: "authentication failed" }; continue; }
  const authed = await stub.authenticate(token);
  result[user] = { how, isAdmin: await authed.amIAdmin(), adminApi: (await authed.getAdminApi()) ? "granted" : "denied" };
}
console.log(JSON.stringify(result, null, 1));
const ok = result.admin?.adminApi === "granted" &&
  users.filter(u => u !== "admin").every(u => result[u]?.adminApi === "denied");
process.exit(ok ? 0 : 1);

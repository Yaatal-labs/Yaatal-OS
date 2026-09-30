// Apply yaatal/admin-settings.json to a running Cloudflare OS through its Admin API, then verify
// every field round-trips. No upstream source changes.
//
//   CFOS_DIR=... OS_PASSWORD=... node yaatal/apply-admin.mjs
import { readFileSync } from "node:fs";
import { signIn } from "./lib.mjs";

const settings = JSON.parse(readFileSync(new URL("./admin-settings.json", import.meta.url), "utf8"));
const instructions = Array.isArray(settings.instanceInstructions)
  ? settings.instanceInstructions.join("\n") : settings.instanceInstructions;

const authed = await signIn();
const adminApi = await authed.getAdminApi();
if (!adminApi) throw new Error("This account is not an administrator");

await adminApi.setSiteName(settings.siteName);
await adminApi.setAccentColor(settings.accentColor);
await adminApi.setAnnouncement(settings.announcement);
await adminApi.setBanner(settings.banner.text, settings.banner.color);
await adminApi.setSignupsEnabled(settings.signupsEnabled);
await adminApi.setInstanceInstructions(instructions);

const after = await adminApi.getSettings();
const applied = {
  siteName: after.siteName === settings.siteName,
  accentColor: after.accentColor === settings.accentColor,
  announcement: after.announcement === settings.announcement,
  signupsEnabled: after.signupsEnabled === settings.signupsEnabled,
  instanceInstructions: after.instanceInstructions === instructions,
};
console.log(JSON.stringify({ applied, instructionsChars: instructions.length }, null, 1));
process.exit(Object.values(applied).every(Boolean) ? 0 : 1);

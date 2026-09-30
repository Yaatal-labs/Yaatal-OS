// Shared RPC client for scripting a running Cloudflare OS (the same Cap'n Web API its UI uses).
//
// Environment:
//   CFOS_DIR     path to the cloudflare-os-starter checkout (see ../scripts/bootstrap.sh). Required:
//                capnweb, hash-wasm and the password-salt definition are resolved from it, so the
//                scripts always match the pinned upstream.
//   OS_URL       WebSocket RPC endpoint, default ws://localhost:8787/api
//   OS_USER      account to sign in as, default "admin"
//   OS_PASSWORD  its password, or OS_CREDS_FILE: a JSON file mapping user -> password
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const CFOS_DIR = process.env.CFOS_DIR;
if (!CFOS_DIR) throw new Error("Set CFOS_DIR to the cloudflare-os-starter checkout");
const UPSTREAM = join(CFOS_DIR, "cloudflare-os");

const req = createRequire(join(UPSTREAM, "packages/workshop-frontend/package.json"));
const { newWebSocketRpcSession } = await import(pathToFileURL(req.resolve("capnweb")).href);
const { argon2id } = await import(pathToFileURL(req.resolve("hash-wasm")).href);

// Same derivation as upstream workshop-frontend/src/passwordHash.ts: Argon2id over
// SERVICE_SALT + utf8(username). Read the salt from the pinned source instead of copying it.
const api = readFileSync(join(UPSTREAM, "packages/workshop-shared/src/api.ts"), "utf8");
const saltSrc = api.match(/SERVICE_SALT = new Uint8Array\(\[([\s\S]*?)\]\)/);
if (!saltSrc) throw new Error("SERVICE_SALT not found: upstream changed its password hashing");
const SERVICE_SALT = Uint8Array.from(saltSrc[1].split(",").map(s => s.trim()).filter(Boolean).map(Number));

export function hashPassword(username, password) {
  const u = new TextEncoder().encode(username);
  const salt = new Uint8Array(SERVICE_SALT.length + u.length);
  salt.set(SERVICE_SALT);
  salt.set(u, SERVICE_SALT.length);
  return argon2id({ password, salt, parallelism: 1, iterations: 3, memorySize: 65536, hashLength: 32, outputType: "binary" });
}

export function passwordFor(user) {
  if (process.env.OS_PASSWORD) return process.env.OS_PASSWORD;
  if (process.env.OS_CREDS_FILE) {
    const creds = JSON.parse(readFileSync(process.env.OS_CREDS_FILE, "utf8"));
    if (creds[user]) return creds[user];
  }
  throw new Error(`No password for ${user}: set OS_PASSWORD or OS_CREDS_FILE`);
}

export function session() {
  return newWebSocketRpcSession(process.env.OS_URL ?? "ws://localhost:8787/api");
}

/** Sign in with a password account and return the AuthenticatedApi stub. */
export async function signIn(user = process.env.OS_USER ?? "admin") {
  const stub = session();
  const token = await stub.login(user, await hashPassword(user, passwordFor(user)));
  if (!token) throw new Error(`Login failed for ${user}`);
  return stub.authenticate(token);
}

/** Collect the files an agent chat proposed, as {name: contents}. Later full writes win. */
export function proposedFiles(messages) {
  const files = {};
  for (const m of messages) {
    if (m.type !== "changes" || !m.change) continue;
    for (const edits of Object.values(m.change)) {
      for (const [name, op] of edits) {
        files[name] = op.set !== undefined ? op.set : `${files[name] ?? ""}\n/* incremental edit not expanded */`;
      }
    }
  }
  return files;
}

export function messageText(m) {
  return typeof m.message === "string" ? m.message : JSON.stringify(m);
}

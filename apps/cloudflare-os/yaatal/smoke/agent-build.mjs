// One in-OS agent build per model: opens a fresh workspace, asks for the live-sale prep Gadget with
// fictional sample data, and records the transcript, timing, errors and created workspaces.
// Real model calls: this spends provider quota (Workers AI Neurons, Ollama usage, ...).
//
//   CFOS_DIR=... OS_PASSWORD=... MODELS=@cf/nvidia/nemotron-3-120b-a12b,@cf/zai-org/glm-4.7-flash \
//     [PROVIDER=cloudflare|ollama] [OUT_DIR=.] node yaatal/smoke/agent-build.mjs
//
// PROVIDER=cloudflare needs the OS started with an AI Gateway (see README); ollama uses OLLAMA_URL.
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { signIn, messageText } from "../lib.mjs";

const PROVIDER = process.env.PROVIDER ?? "cloudflare";
const MODELS = (process.env.MODELS ?? "@cf/nvidia/nemotron-3-120b-a12b").split(",").map(s => s.trim()).filter(Boolean);
const OUT_DIR = process.env.OUT_DIR ?? ".";
const idFor = m => `${PROVIDER}-${m.replace(/^@cf\//, "").replace(/[^a-z0-9.-]/gi, "-")}`;

// Fictional sample data only: no real merchant, customer or price data.
export const PROMPT = `Build a small Gadget: "Live-sale prep card" for a Yaatal merchant who sells live on WhatsApp/TikTok in Dakar.

Input: the merchant pastes a product list (name, price in FCFA, stock). Output: a printable prep card with, per product, the price and stock exactly as given, one short selling line in French and one in Wolof, and a running-order suggestion (in-stock items first). Flag any product with missing price or stock as "à compléter" instead of guessing.

Use this SAMPLE data (fictional, for the preview only):
- Boubou brodé bleu — 25000 FCFA — stock 4
- Sac en wax — 12000 FCFA — stock 0
- Encens thiouraye (lot de 3) — prix ? — stock 10

Rules: never invent prices or stock; no payments, orders or messages sent; keep it one simple Gadget. When done, give me the preview and say how you verified it.`;

const QUIET_MS = 90_000, ERROR_QUIET_MS = 20_000, DEADLINE_MS = 12 * 60_000, POLL_MS = 5_000;

const authed = await signIn();
const results = [];
for (const model of MODELS) {
  const modelId = idFor(model);
  if (!(await authed.listModels()).some(m => m.id === modelId)) {
    await authed.addModel({ type: "agent", id: modelId, name: `${PROVIDER} ${model}` },
      PROVIDER === "ollama"
        ? { provider: "ollama", model, apiToken: "", apiUrl: process.env.OLLAMA_URL ?? "http://127.0.0.1:11434" }
        : { provider: PROVIDER, model, apiToken: "" });
  }
  const before = new Set((await authed.listGadgets()).map(g => g.id));
  const overseer = await authed.newGadget();
  const started = Date.now();
  const chatId = await overseer.newChat(PROMPT, modelId);
  console.log(`=== ${model} (chat ${chatId})`);

  const messages = new Map();
  let lastNew = Date.now(), agentSpoke = false, errors = 0;
  while (Date.now() - started < DEADLINE_MS) {
    for (const m of (await overseer.getChatHistory(chatId)).messages ?? []) {
      if (messages.has(m.sequence)) continue;
      messages.set(m.sequence, { seq: m.sequence, type: m.type, author: m.author?.id, text: messageText(m) });
      lastNew = Date.now();
      if (m.author?.type === "agent") agentSpoke = true;
      if (m.type === "error") errors++;
      console.log(`[${m.sequence}] ${m.type} ${m.author?.type}: ${messageText(m).replace(/\s+/g, " ").slice(0, 200)}`);
    }
    if (errors && Date.now() - lastNew > ERROR_QUIET_MS) break;
    if (agentSpoke && Date.now() - lastNew > QUIET_MS) break;
    await new Promise(r => setTimeout(r, POLL_MS));
  }

  const created = (await authed.listGadgets()).filter(g => !before.has(g.id)).map(g => ({ id: g.id, title: g.title }));
  const record = { provider: PROVIDER, model, modelId, seconds: Math.round((Date.now() - started) / 1000),
    errors, workspaces: created, messages: [...messages.values()] };
  writeFileSync(join(OUT_DIR, `agent-build-${modelId}-${Date.now()}.json`), JSON.stringify(record, null, 2));
  results.push({ model, seconds: record.seconds, messages: messages.size, errors, workspaces: created.map(w => w.title) });
  console.log(`--- ${model}: ${record.seconds}s, ${messages.size} msgs, errors=${errors}`);
}
console.log("SUMMARY " + JSON.stringify(results, null, 1));
process.exit(0);

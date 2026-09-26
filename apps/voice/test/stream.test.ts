import { test } from "node:test";
import assert from "node:assert/strict";
import { BRIEF_MARKER, chatDeltas, speakAndCaptureBrief } from "../src/stream.ts";

async function* from(parts: string[]) { for (const p of parts) yield p; }
async function collect(gen: AsyncIterable<string>) { let s = ""; for await (const p of gen) s += p; return s; }

test("speaks everything when there is no brief", async () => {
  let brief = "";
  const spoken = await collect(speakAndCaptureBrief(from(["Bonjour, ", "quel est le nom ", "de la boutique ?"]), b => { brief = b; }));
  assert.equal(spoken, "Bonjour, quel est le nom de la boutique ?");
  assert.equal(brief, "");
});

test("never speaks the brief, even when the marker arrives in pieces", async () => {
  let brief = "";
  const parts = ["C'est prêt, j'ouvre le Playground.\n@@PLAY", "GROUND@@ Construis un site ", "pour Bazin Riche Médina."];
  const spoken = await collect(speakAndCaptureBrief(from(parts), b => { brief = b; }));
  assert.equal(spoken.trim(), "C'est prêt, j'ouvre le Playground.");
  assert.ok(!spoken.includes("@@"));
  assert.equal(brief, "Construis un site pour Bazin Riche Médina.");
});

test("an empty brief after the marker is ignored", async () => {
  let called = false;
  await collect(speakAndCaptureBrief(from(["Prêt.", BRIEF_MARKER, "   "]), () => { called = true; }));
  assert.equal(called, false);
});

test("reads content deltas from an OpenAI stream and skips reasoning and keep-alives", async () => {
  const sse = [
    'data: {"choices":[{"delta":{"reasoning":"hmm"}}]}',
    ": keep-alive",
    'data: {"choices":[{"delta":{"content":"Bon"}}]}',
    'data: {"choices":[{"delta":{"content":"jour"}}]}',
    "data: [DONE]",
    "",
  ].join("\n");
  assert.equal(await collect(chatDeltas(new Response(sse))), "Bonjour");
});

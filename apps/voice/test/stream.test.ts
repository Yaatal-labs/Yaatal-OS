import { test } from "node:test";
import assert from "node:assert/strict";
import { BRIEF_MARKER, BRIEF_READY, chatDeltas, speakAndCaptureBrief, speakable } from "../src/stream.ts";

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

test("with thinking off, Nemotron's answer in `reasoning` is spoken only when asked", async () => {
  const sse = 'data: {"choices":[{"delta":{"reasoning":"Quel est le nom "}}]}\ndata: {"choices":[{"delta":{"reasoning":"de la boutique ?"}}]}\ndata: [DONE]\n';
  assert.equal(await collect(chatDeltas(new Response(sse))), "");
  assert.equal(await collect(chatDeltas(new Response(sse), { reasoningIsAnswer: true })), "Quel est le nom de la boutique ?");
});

test("speaks words, not markdown, emoji or links", () => {
  assert.equal(speakable("### 🌿 Nom : **BazinÉclat** — voir https://x.test"), "Nom : BazinÉclat, voir");
  assert.equal(speakable("- Grands boubous\n- Ensembles *brodés*"), "Grands boubous Ensembles brodés");
  assert.equal(speakable("---"), null);
  assert.equal(speakable("🎯"), null);
});

test("a brief with nothing spoken before it still gets a spoken sentence", async () => {
  let brief = "";
  const spoken = await collect(speakAndCaptureBrief(from([`${BRIEF_MARKER} Crée un site pour Bazin Riche Médina.`]), b => { brief = b; }));
  assert.equal(spoken, BRIEF_READY);
  assert.equal(brief, "Crée un site pour Bazin Riche Médina.");
});

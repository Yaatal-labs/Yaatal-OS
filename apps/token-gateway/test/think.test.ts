import { describe, expect, it } from "vitest";
import { thinkingOutOfStream } from "../src/think.js";

type Choice = { index: number; delta?: Record<string, unknown>; finish_reason?: string | null };
type Event = { choices: Choice[] } & Record<string, unknown>;

const event = (content: string, finish_reason?: string): Event => ({
  id: "c1", model: "kairmel/glm-5.3", choices: [{ index: 0, delta: { content }, ...(finish_reason ? { finish_reason } : {}) }],
});
const sse = (value: Event) => `data: ${JSON.stringify(value)}\n\n`;
const events = (text: string): Event[] => text.split("\n")
  .filter(line => line.startsWith("data: {"))
  .map(line => JSON.parse(line.slice(6)) as Event);

/** Reads each output before sending the next input, so buffered reasoning cannot pass these tests. */
function liveStream() {
  const stream = thinkingOutOfStream();
  const writer = stream.writable.getWriter();
  const reader = stream.readable.getReader();
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  return {
    async send(text: string) {
      const [, result] = await Promise.all([writer.write(encoder.encode(text)), reader.read()]);
      expect(result.done).toBe(false);
      return decoder.decode(result.value);
    },
    async finish() {
      const read = async () => {
        let text = "";
        for (;;) {
          const result = await reader.read();
          if (result.done) return text;
          text += decoder.decode(result.value);
        }
      };
      const [, text] = await Promise.all([writer.close(), read()]);
      return text;
    },
  };
}

describe("live thinking", () => {
  it("emits the first reasoning bytes immediately and streams each delta before the next input", async () => {
    const stream = liveStream();
    for (const [input, delta] of [
      ["Je ré", { reasoning_content: "Je ré" }],
      ["fléchis", { reasoning_content: "fléchis" }],
      ["</think>Voici", { content: "Voici" }],
      [" le menu", { content: " le menu" }],
    ] as const) {
      expect(events(await stream.send(sse(event(input))))).toEqual([
        { ...event(input), choices: [{ index: 0, delta }] },
      ]);
    }
    expect(await stream.finish()).toBe("");
  });

  it.each([1, 2, 3, 4, 5, 6, 7])("holds only the closing tag fragment when split at %i", async at => {
    const stream = liveStream();
    const tag = "</think>";
    expect(events(await stream.send(sse(event(`Je réfléchis${tag.slice(0, at)}`))))[0]?.choices[0]?.delta)
      .toEqual({ reasoning_content: "Je réfléchis" });
    expect(events(await stream.send(sse(event(`${tag.slice(at)}Voici`))))[0]?.choices[0]?.delta)
      .toEqual({ content: "Voici" });
    expect(await stream.finish()).toBe("");
  });

  it.each([1, 2, 3, 4, 5, 6, 7])("strips a leading opening tag split at %i", async at => {
    const stream = liveStream();
    const tag = "<think>";
    expect(events(await stream.send(sse(event(tag.slice(0, at)))))[0]?.choices[0]?.delta).toEqual({});
    expect(events(await stream.send(sse(event(`${tag.slice(at)}Je ré`))))[0]?.choices[0]?.delta)
      .toEqual({ reasoning_content: "Je ré" });
    expect(events(await stream.send(sse(event("fléchis</think> Voici"))))[0]?.choices[0]?.delta)
      .toEqual({ reasoning_content: "fléchis", content: "Voici" });
    expect(await stream.finish()).toBe("");
  });

  it.each(["", "\n"])("trims answer whitespace across deltas after </think>%j", async whitespace => {
    const stream = liveStream();
    expect(events(await stream.send(sse(event(`Je réfléchis</think>${whitespace}`))))[0]?.choices[0]?.delta)
      .toEqual({ reasoning_content: "Je réfléchis" });
    for (const input of ["\n\n", "\t "]) {
      expect(events(await stream.send(sse(event(input))))[0]?.choices[0]?.delta).toEqual({ content: "" });
    }
    expect(events(await stream.send(sse(event(" 391. le menu"))))[0]?.choices[0]?.delta)
      .toEqual({ content: "391. le menu" });
    expect(events(await stream.send(sse(event(" suivant", "stop"))))[0]?.choices[0]?.delta)
      .toEqual({ content: " suivant" });
    expect(await stream.finish()).toBe("");
  });

  it("trims each choice until its own answer starts", async () => {
    const stream = liveStream();
    const send = async (choices: Choice[]) => events(await stream.send(sse({ choices })))[0]?.choices;
    expect(await send([
      { index: 0, delta: { content: "Je réfléchis</think>" } },
      { index: 1, delta: { content: "Je calcule</think> 391." } },
    ])).toEqual([
      { index: 0, delta: { reasoning_content: "Je réfléchis" } },
      { index: 1, delta: { reasoning_content: "Je calcule", content: "391." } },
    ]);
    expect(await send([
      { index: 0, delta: { content: "\n\n" } },
      { index: 1, delta: { content: " le menu" } },
    ])).toEqual([
      { index: 0, delta: { content: "" } },
      { index: 1, delta: { content: " le menu" } },
    ]);
    expect(await send([
      { index: 0, delta: { content: " Voici" }, finish_reason: "stop" },
      { index: 1, delta: { content: " suivant" }, finish_reason: "stop" },
    ])).toEqual([
      { index: 0, delta: { content: "Voici" }, finish_reason: "stop" },
      { index: 1, delta: { content: " suivant" }, finish_reason: "stop" },
    ]);
    expect(await stream.finish()).toBe("");
  });

  it("streams an untagged answer live and puts the full copy in the finishing event", async () => {
    const stream = liveStream();
    expect(events(await stream.send(sse(event("Voici "))))[0]?.choices[0]?.delta)
      .toEqual({ reasoning_content: "Voici " });
    expect(events(await stream.send(sse(event("le menu", "stop"))))[0]?.choices[0])
      .toEqual({ index: 0, delta: { reasoning_content: "le menu", content: "Voici le menu" }, finish_reason: "stop" });
    expect(await stream.send("data: [DONE]\n\n")).toBe("data: [DONE]\n\n");
    expect(await stream.finish()).toBe("");
  });

  it.each(["</thi", "<thi"])("flushes an unfinished tag %s on finish_reason", async suffix => {
    const stream = liveStream();
    const input = suffix.startsWith("</") ? `Voici${suffix}` : suffix;
    const first = events(await stream.send(sse(event(input))))[0]?.choices[0]?.delta;
    expect(first).toEqual(input === suffix ? {} : { reasoning_content: "Voici" });
    const finish = { choices: [{ index: 0, delta: {}, finish_reason: "stop" }] };
    expect(events(await stream.send(sse(finish)))[0]?.choices[0]?.delta)
      .toEqual({ reasoning_content: suffix, content: input });
    expect(await stream.finish()).toBe("");
  });

  it.each(["done", "flush"])("repeats the answer and releases the partial suffix on %s", async ending => {
    const stream = liveStream();
    expect(events(await stream.send(sse(event("Voici</thi"))))[0]?.choices[0]?.delta)
      .toEqual({ reasoning_content: "Voici" });
    const text = ending === "done" ? await stream.send("data: [DONE]\n\n") : await stream.finish();
    expect(events(text)).toEqual([
      { id: "c1", model: "kairmel/glm-5.3", choices: [{ index: 0, delta: { reasoning_content: "</thi", content: "Voici</thi" } }] },
    ]);
    if (ending === "done") {
      expect(text.endsWith("data: [DONE]\n\n")).toBe(true);
      expect(await stream.finish()).toBe("");
    }
  });

  it.each(["reasoning_content", "reasoning"])("passes through a choice with real %s", async field => {
    const stream = liveStream();
    const first = { choices: [{ index: 0, delta: { [field]: "Je réfléchis", content: "Voici" } }] };
    expect(await stream.send(sse(first))).toBe(sse(first));
    expect(await stream.send(sse(event("<think> le menu</think>", "stop"))))
      .toBe(sse(event("<think> le menu</think>", "stop")));
    expect(await stream.finish()).toBe("");
  });

  it("releases the answer before DONE with CRLF line endings", async () => {
    const stream = liveStream();
    expect(events(await stream.send(sse(event("Voici</thi")).replaceAll("\n", "\r\n")))[0]?.choices[0]?.delta)
      .toEqual({ reasoning_content: "Voici" });
    const output = await stream.send("data: [DONE]\r\n\r\n");
    expect(events(output)[0]?.choices[0]?.delta)
      .toEqual({ reasoning_content: "</thi", content: "Voici</thi" });
    expect(output.endsWith("data: [DONE]\r\n\r\n")).toBe(true);
    expect(await stream.finish()).toBe("");
  });

  it("releases a prior suffix without changing a later real reasoning event", async () => {
    const stream = liveStream();
    await stream.send(sse(event("Je ré</thi")));
    const native = { choices: [{ index: 0, delta: { reasoning_content: "fléchis", content: "Voici" } }] };
    const output = events(await stream.send(sse(native)));
    expect(output[0]?.choices).toEqual([{ index: 0, delta: { reasoning_content: "</thi" } }]);
    expect(output[1]).toEqual(native);
    expect(await stream.finish()).toBe("");
  });

  it("tracks two choices independently through tags and finishes", async () => {
    const stream = liveStream();
    const send = async (choices: Choice[]) => events(await stream.send(sse({ choices })))[0]?.choices;
    expect(await send([
      { index: 0, delta: { content: "Je ré</thi" } },
      { index: 1, delta: { content: "Le " } },
    ])).toEqual([
      { index: 0, delta: { reasoning_content: "Je ré" } },
      { index: 1, delta: { reasoning_content: "Le " } },
    ]);
    expect(await send([
      { index: 0, delta: { content: "nk>Voici" } },
      { index: 1, delta: { content: "menu" }, finish_reason: "stop" },
    ])).toEqual([
      { index: 0, delta: { content: "Voici" } },
      { index: 1, delta: { reasoning_content: "menu", content: "Le menu" }, finish_reason: "stop" },
    ]);
    expect(await send([{ index: 0, delta: { content: " le menu" }, finish_reason: "stop" }]))
      .toEqual([{ index: 0, delta: { content: " le menu" }, finish_reason: "stop" }]);
    expect(await stream.finish()).toBe("");
  });

  it("keeps streaming reasoning beyond the old hold limit and releases false tag prefixes", async () => {
    const stream = liveStream();
    const text = ` ${"a".repeat(8_001)} `;
    expect(events(await stream.send(sse(event(`${text}</thi`))))[0]?.choices[0]?.delta)
      .toEqual({ reasoning_content: text });
    expect(events(await stream.send(sse(event("X", "stop"))))[0]?.choices[0]?.delta)
      .toEqual({ reasoning_content: "</thiX", content: `${text}</thiX` });
    expect(await stream.finish()).toBe("");
  });

  it("passes non-JSON lines and usage through and drains before DONE without duplicating usage", async () => {
    const stream = liveStream();
    const lines = ": keepalive\nevent: message\ndata: nope\ndata: {invalid}\n\n";
    expect(await stream.send(lines)).toBe(lines);
    await stream.send(sse(event("Voici")));
    const usage = { id: "c1", choices: [], usage: { completion_tokens: 10 } };
    const usageLine = sse(usage).replaceAll(":", ": ");
    expect(await stream.send(usageLine)).toBe(usageLine);
    const output = await stream.send("data: [DONE]\n\n");
    expect(events(output)[0]).toEqual({
      id: "c1", model: "kairmel/glm-5.3", choices: [{ index: 0, delta: { content: "Voici" } }],
    });
    expect(output).not.toContain("usage");
    expect(output.endsWith("data: [DONE]\n\n")).toBe(true);
    expect(await stream.finish()).toBe("");
  });

  it("handles fragmented SSE and UTF-8 bytes and flushes an unterminated final line", async () => {
    const bytes = new TextEncoder().encode(sse(event("Je ré")) + sse(event("fléchis</think>Voici")).trimEnd());
    const input = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const byte of bytes) controller.enqueue(new Uint8Array([byte]));
        controller.close();
      },
    });
    const output = events(await new Response(input.pipeThrough(thinkingOutOfStream())).text());
    expect(output.map(value => value.choices[0]?.delta)).toEqual([
      { reasoning_content: "Je ré" }, { reasoning_content: "fléchis", content: "Voici" },
    ]);
  });
});

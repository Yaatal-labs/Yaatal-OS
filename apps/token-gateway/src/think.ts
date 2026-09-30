/**
 * Some reasoning models (GLM 5.3 on Workers AI, seen 2026-09-28) write their reasoning into
 * `content` and close it with `</think>`, often with no opening tag. The gateway moves that text to
 * `reasoning_content`, the field OpenAI-compatible clients already keep out of the visible answer,
 * so an app never shows a customer the model's working.
 */
const OPEN = "<think>";
const CLOSE = "</think>";

/**
 * How much streamed content is held back waiting for `</think>`. Past this, the held text is sent
 * as ordinary content: a long answer with no tag should not wait until the end.
 */
export const HOLD_LIMIT = 8_000;

/** Splits `content` at the first `</think>`; null when there is none. */
export function splitThinking(content: string): { reasoning: string; content: string } | null {
  const at = content.indexOf(CLOSE);
  if (at < 0) return null;
  let reasoning = content.slice(0, at).trimStart();
  if (reasoning.startsWith(OPEN)) reasoning = reasoning.slice(OPEN.length);
  return { reasoning: reasoning.trim(), content: content.slice(at + CLOSE.length).trimStart() };
}

/** Moves leaked reasoning out of every choice's `message.content` in a non-streamed completion. */
export function moveThinking(completion: Record<string, unknown>): Record<string, unknown> {
  const choices = completion.choices;
  if (!Array.isArray(choices)) return completion;
  for (const choice of choices) {
    const message = (choice as { message?: Record<string, unknown> }).message;
    if (!message || typeof message.content !== "string") continue;
    const split = splitThinking(message.content);
    if (!split) continue;
    message.content = split.content;
    message.reasoning_content = join(message.reasoning_content, split.reasoning);
  }
  return completion;
}

function join(existing: unknown, reasoning: string) {
  return [typeof existing === "string" ? existing : "", reasoning].filter(Boolean).join("\n");
}

type Delta = Record<string, unknown>;
type Choice = { index?: number; delta?: Delta; finish_reason?: unknown };
type Event = { choices?: Choice[] } & Record<string, unknown>;

/**
 * The streaming version: per choice, content is held back until `</think>` arrives (the held text
 * becomes `reasoning_content`), the upstream sends real reasoning fields, the choice finishes, or
 * HOLD_LIMIT is reached; after that the choice streams through untouched.
 */
export function thinkingOutOfStream(): TransformStream<Uint8Array, Uint8Array> {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  const held = new Map<number, string>();
  const passing = new Set<number>();
  let pending = "";
  let template: Event | null = null;

  const release = (index: number, delta: Delta) => {
    const text = held.get(index) ?? "";
    held.delete(index);
    passing.add(index);
    if (text) delta.content = text + (typeof delta.content === "string" ? delta.content : "");
  };

  const handle = (choice: Choice) => {
    const index = choice.index ?? 0;
    if (passing.has(index)) return;
    const delta = (choice.delta ??= {});
    if (typeof delta.reasoning_content === "string" || typeof delta.reasoning === "string") {
      release(index, delta);   // the upstream separates reasoning itself: nothing to fix
      return;
    }
    if (typeof delta.content === "string") {
      const text = (held.get(index) ?? "") + delta.content;
      delete delta.content;
      const split = splitThinking(text);
      if (split) {
        held.delete(index);
        passing.add(index);
        if (split.reasoning) delta.reasoning_content = split.reasoning;
        if (split.content) delta.content = split.content;
      } else if (text.length > HOLD_LIMIT) {
        held.set(index, text);
        release(index, delta);
      } else {
        held.set(index, text);
      }
    }
    if (choice.finish_reason != null) release(index, delta);
  };

  /** An event carrying whatever is still held, as ordinary content; "" when nothing is held. */
  const drain = (): string => {
    if (!held.size) return "";
    const choices = [...held.keys()].map(index => {
      const delta: Delta = {};
      release(index, delta);
      return { index, delta };
    });
    return `data: ${JSON.stringify({ ...template, choices })}\n\n`;
  };

  const rewrite = (line: string): string => {
    if (line === "data: [DONE]") return drain() + line;
    if (!line.startsWith("data: {")) return line;
    try {
      const event = JSON.parse(line.slice(6)) as Event;
      if (!Array.isArray(event.choices)) return line;
      const { choices: _, usage: __, ...rest } = event;
      template = rest;
      event.choices.forEach(handle);
      return `data: ${JSON.stringify(event)}`;
    } catch {
      return line;
    }
  };

  return new TransformStream({
    transform(chunk, controller) {
      pending += decoder.decode(chunk, { stream: true });
      const lines = pending.split("\n");
      pending = lines.pop()!;
      if (lines.length) controller.enqueue(encoder.encode(lines.map(rewrite).join("\n") + "\n"));
    },
    flush(controller) {
      pending += decoder.decode();
      // A stream that ends without [DONE] still gets what was held.
      const tail = (pending ? rewrite(pending) + "\n" : "") + drain();
      if (tail) controller.enqueue(encoder.encode(tail));
    },
  });
}

/**
 * Some reasoning models (GLM 5.3 on Workers AI, seen 2026-09-28) write their reasoning into
 * `content` and close it with `</think>`, often with no opening tag. The gateway moves that text to
 * `reasoning_content`, the field OpenAI-compatible clients already keep out of the visible answer,
 * so an app never shows a customer the model's working.
 */
const OPEN = "<think>";
const CLOSE = "</think>";

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
type Thinking = { suffix: string; text: string; opening: boolean };

/**
 * Streams content as reasoning until `</think>`, holding only a possible tag fragment. A choice
 * that finishes without the closing tag also gets the full text as content, in case it was an answer.
 */
export function thinkingOutOfStream(): TransformStream<Uint8Array, Uint8Array> {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  const thinking = new Map<number, Thinking>();
  const passing = new Set<number>();
  const trimming = new Set<number>();
  let pending = "";
  let template: Event | null = null;

  const release = (index: number, delta: Delta) => {
    const state = thinking.get(index);
    thinking.delete(index);
    passing.add(index);
    trimming.delete(index);
    if (!state) return;
    if (state.suffix) {
      delta.reasoning_content = (typeof delta.reasoning_content === "string" ? delta.reasoning_content : "") + state.suffix;
    }
    const text = state.text + state.suffix;
    if (text) delta.content = text;
  };

  const handle = (choice: Choice): Choice | undefined => {
    const index = choice.index ?? 0;
    if (passing.has(index)) {
      const delta = choice.delta;
      // Whitespace after the closing tag can span several deltas.
      if (trimming.has(index) && typeof delta?.content === "string") {
        delta.content = delta.content.trimStart();
        if (delta.content) trimming.delete(index);
      }
      if (choice.finish_reason != null) trimming.delete(index);
      return;
    }
    const delta = (choice.delta ??= {});
    if (typeof delta.reasoning_content === "string" || typeof delta.reasoning === "string") {
      const suffix = thinking.get(index)?.suffix;
      thinking.delete(index);
      passing.add(index);   // the upstream separates reasoning itself: nothing to fix
      if (suffix) return { index, delta: { reasoning_content: suffix } };
      return;
    }
    if (typeof delta.content === "string") {
      const state = thinking.get(index) ?? { suffix: "", text: "", opening: true };
      thinking.set(index, state);
      let text = state.suffix + delta.content;
      state.suffix = "";
      delete delta.content;
      if (state.opening && text) {
        if (text.startsWith(OPEN)) {
          text = text.slice(OPEN.length);
          state.opening = false;
        } else if (OPEN.startsWith(text)) {
          state.suffix = text;
          text = "";
        } else {
          state.opening = false;
        }
      }
      const at = text.indexOf(CLOSE);
      if (at >= 0) {
        thinking.delete(index);
        passing.add(index);
        if (at) delta.reasoning_content = text.slice(0, at);
        const content = text.slice(at + CLOSE.length).trimStart();
        if (content) delta.content = content;
        else trimming.add(index);
      } else {
        for (let length = Math.min(text.length, CLOSE.length - 1); length > 0; length--) {
          if (!text.endsWith(CLOSE.slice(0, length))) continue;
          state.suffix = text.slice(-length);
          text = text.slice(0, -length);
          break;
        }
        if (text) delta.reasoning_content = text;
        state.text += text;
      }
    }
    if (choice.finish_reason != null) release(index, delta);
  };

  /** An event carrying unfinished choices' full answers; "" when there is nothing to release. */
  const drain = (): string => {
    if (!thinking.size) return "";
    const choices = [...thinking.keys()].map(index => {
      const delta: Delta = {};
      release(index, delta);
      return { index, delta };
    }).filter(choice => Object.keys(choice.delta).length);
    if (!choices.length) return "";
    return `data: ${JSON.stringify({ ...template, choices })}\n\n`;
  };

  const rewrite = (line: string): string => {
    if (line.trimEnd() === "data: [DONE]") return drain() + line;
    if (!line.startsWith("data: {")) return line;
    try {
      const event = JSON.parse(line.slice(6)) as Event;
      if (!Array.isArray(event.choices) || !event.choices.length) return line;
      const { choices: _, usage: __, ...rest } = event;
      template = rest;
      const extra = event.choices.map(handle).filter(choice => choice !== undefined);
      const prefix = extra.length ? `data: ${JSON.stringify({ ...template, choices: extra })}\n\n` : "";
      return prefix + `data: ${JSON.stringify(event)}`;
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
      // A stream that ends without [DONE] still gets each unfinished answer.
      const tail = (pending ? rewrite(pending) + "\n\n" : "") + drain();
      if (tail) controller.enqueue(encoder.encode(tail));
    },
  });
}

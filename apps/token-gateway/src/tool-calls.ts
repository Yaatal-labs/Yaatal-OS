/**
 * Gemma 4 on Workers AI (seen 2026-10-02) returns parallel tool calls as one call: streamed, every
 * call arrives on index 0, each starting with its own `id` and `name`, so a client joins them into
 * one call named "write_filewrite_file…" with every call's arguments end to end; not streamed, one
 * call holds all the argument objects back to back. `parallel_tool_calls: false` does not stop it.
 *
 * And Workers AI refuses a whole request (400) when an earlier assistant turn holds tool-call
 * arguments that are not one JSON object, so an agent replaying such a call in its history could
 * never take another step. The gateway separates the calls on the way out and repairs the
 * history on the way in.
 */

/** Gives each streamed tool call its own index again; a stream that already does passes byte for byte. */
export function separateToolCalls(): TransformStream<Uint8Array, Uint8Array> {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let pending = "";
  // Per choice: which call each upstream index is on now, and the next free index.
  const choices = new Map<number, { next: number; calls: Map<number, { id: unknown; index: number }> }>();
  const rewrite = (line: string) => {
    if (!line.startsWith("data: {") || !line.includes("\"tool_calls\"")) return line;
    const event = parse(line.slice(6));
    if (!isObject(event) || !Array.isArray(event.choices)) return line;
    let changed = false;
    for (const choice of event.choices) {
      if (!isObject(choice) || !isObject(choice.delta) || !Array.isArray(choice.delta.tool_calls)) continue;
      const key = typeof choice.index === "number" ? choice.index : 0;
      let state = choices.get(key);
      if (!state) choices.set(key, state = { next: 0, calls: new Map() });
      for (const call of choice.delta.tool_calls) {
        if (!isObject(call)) continue;
        const upstreamIndex = typeof call.index === "number" ? call.index : 0;
        const current = state.calls.get(upstreamIndex);
        const id = typeof call.id === "string" && call.id !== "" ? call.id : null;
        let index: number;
        if (!current || (id !== null && typeof current.id === "string" && id !== current.id)) {
          index = state.next++;
          state.calls.set(upstreamIndex, { id, index });
        } else {
          if (id !== null && typeof current.id !== "string") current.id = id; // The id came with a later fragment.
          index = current.index;
        }
        if (call.index !== index) {
          call.index = index;
          changed = true;
        }
      }
    }
    return changed ? `data: ${JSON.stringify(event)}` : line;
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
      if (pending) controller.enqueue(encoder.encode(rewrite(pending)));
    },
  });
}

/** Splits each non-streamed tool call whose arguments hold several JSON objects into one call per object. */
export function splitToolCalls(completion: Record<string, unknown>): Record<string, unknown> {
  if (!Array.isArray(completion.choices)) return completion;
  let changed = false;
  const choices = completion.choices.map(choice => {
    if (!isObject(choice) || !isObject(choice.message) || !Array.isArray(choice.message.tool_calls)) return choice;
    const toolCalls = choice.message.tool_calls.flatMap(call => {
      if (!isObject(call) || !isObject(call.function) || typeof call.function.arguments !== "string") return [call];
      const parts = objectsIn(call.function.arguments);
      if (parts.length < 2) return [call];
      changed = true;
      const fn = call.function;
      // Joined names ("write_filewrite_file") are split the same way.
      const name = typeof fn.name === "string" && fn.name.length % parts.length === 0
        && fn.name.slice(0, fn.name.length / parts.length).repeat(parts.length) === fn.name
        ? fn.name.slice(0, fn.name.length / parts.length) : fn.name;
      return parts.map((args, n) => ({
        ...call,
        id: n === 0 ? call.id : `${typeof call.id === "string" ? call.id : "call"}-${n + 1}`,
        function: { ...fn, name, arguments: args },
      }));
    });
    return { ...choice, message: { ...choice.message, tool_calls: toolCalls } };
  });
  return changed ? { ...completion, choices } : completion;
}

/** `messages` with every assistant tool call's arguments made one JSON object. */
export function repairToolCalls(messages: unknown[]): unknown[] {
  return messages.map(message => {
    if (!isObject(message) || message.role !== "assistant" || !Array.isArray(message.tool_calls)) return message;
    let changed = false;
    const toolCalls = message.tool_calls.map(call => {
      if (!isObject(call) || !isObject(call.function)) return call;
      const args = argumentsObject(call.function.arguments);
      if (args === call.function.arguments) return call;
      changed = true;
      return { ...call, function: { ...call.function, arguments: args } };
    });
    return changed ? { ...message, tool_calls: toolCalls } : message;
  });
}

/** The text of one JSON object: `value` itself when it already is one, else its first object, else `{}`. */
export function argumentsObject(value: unknown): string {
  if (isObject(value)) return JSON.stringify(value);
  if (typeof value !== "string") return "{}";
  const parsed = parse(value);
  if (isObject(parsed)) return value;
  // A client that could not parse a call may send its raw text back as a JSON string.
  const text = typeof parsed === "string" ? parsed : value;
  if (text !== value && isObject(parse(text))) return text;
  const start = text.indexOf("{");
  const end = start < 0 ? -1 : objectEnd(text, start);
  return end > 0 && isObject(parse(text.slice(start, end))) ? text.slice(start, end) : "{}";
}

/** The JSON objects `text` is made of, back to back with only whitespace between; [] if it is anything else. */
function objectsIn(text: string): string[] {
  const objects: string[] = [];
  let at = 0;
  while (true) {
    while (at < text.length && /\s/.test(text[at]!)) at++;
    if (at === text.length) return objects;
    if (text[at] !== "{") return [];
    const end = objectEnd(text, at);
    if (end < 0 || !isObject(parse(text.slice(at, end)))) return [];
    objects.push(text.slice(at, end));
    at = end;
  }
}

/** The index just past the `}` that closes the `{` at `start`, or -1. */
function objectEnd(text: string, start: number): number {
  let depth = 0;
  let inString = false;
  for (let i = start; i < text.length; i++) {
    const char = text[i];
    if (inString) {
      if (char === "\\") i++;
      else if (char === "\"") inString = false;
    } else if (char === "\"") {
      inString = true;
    } else if (char === "{") {
      depth++;
    } else if (char === "}" && --depth === 0) {
      return i + 1;
    }
  }
  return -1;
}

function parse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

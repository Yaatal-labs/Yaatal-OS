/**
 * Workers AI refuses a whole request (400) when an earlier assistant turn holds tool-call
 * arguments that are not one JSON object. Models do write those: Gemma 4, asked to write two files
 * at once, returned both calls' arguments in one string (seen 2026-10-02). A build agent replays
 * its history on every step, so that one call would end the build. The gateway sends each such
 * value upstream as its first complete JSON object, or `{}`; the tool result the client already
 * sent tells the model the call failed.
 */

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

/** The text of one JSON object: `value` itself when it already is one. */
export function argumentsObject(value: unknown): string {
  if (isObject(value)) return JSON.stringify(value);
  if (typeof value !== "string") return "{}";
  const parsed = parse(value);
  if (isObject(parsed)) return value;
  // A client that could not parse a call may send its raw text back as a JSON string.
  const text = typeof parsed === "string" ? parsed : value;
  if (text !== value && isObject(parse(text))) return text;
  return firstObject(text) ?? "{}";
}

/** The first balanced `{...}` in `text`, when it parses as a JSON object. */
function firstObject(text: string): string | null {
  const start = text.indexOf("{");
  if (start < 0) return null;
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
      const candidate = text.slice(start, i + 1);
      return isObject(parse(candidate)) ? candidate : null;
    }
  }
  return null;
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

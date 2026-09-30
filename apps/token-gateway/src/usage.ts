// Token counts for billing. The upstream's own `usage` is authoritative; when it is missing (some
// servers omit it on streams) the count is estimated at ~4 characters per token and the ledger row is
// marked estimated, so estimated charges can be audited or refunded.

export interface TokenCounts {
  inputTokens: number;
  outputTokens: number;
  estimated: boolean;
}

interface UsageShape {
  prompt_tokens?: unknown;
  completion_tokens?: unknown;
}

export function usageFrom(value: unknown): { inputTokens: number; outputTokens: number } | null {
  const usage = (value as { usage?: UsageShape } | null)?.usage;
  if (!usage) return null;
  const input = usage.prompt_tokens;
  const output = usage.completion_tokens;
  if (!isCount(input) || !isCount(output)) return null;
  return { inputTokens: input, outputTokens: output };
}

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value < 100_000_000;
}

export function estimateTokens(characters: number): number {
  return Math.ceil(characters / 4);
}

/** Characters of the text a request sends, for estimating input when usage is missing. */
export function requestCharacters(body: { messages?: unknown; tools?: unknown }): number {
  return JSON.stringify(body.messages ?? "").length + JSON.stringify(body.tools ?? "").length;
}

/** Characters a completion chunk or message generated: content, reasoning and tool-call arguments. */
export function generatedCharacters(value: unknown): number {
  let total = 0;
  const choices = (value as { choices?: unknown[] } | null)?.choices;
  if (!Array.isArray(choices)) return 0;
  for (const choice of choices) {
    const part = (choice as { delta?: unknown; message?: unknown }).delta ?? (choice as { message?: unknown }).message;
    if (!part || typeof part !== "object") continue;
    const { content, reasoning_content, reasoning, tool_calls } = part as Record<string, unknown>;
    for (const text of [content, reasoning_content, reasoning]) if (typeof text === "string") total += text.length;
    if (Array.isArray(tool_calls)) {
      for (const call of tool_calls) {
        const args = (call as { function?: { arguments?: unknown } }).function?.arguments;
        if (typeof args === "string") total += args.length;
      }
    }
  }
  return total;
}

/**
 * Reads an OpenAI-style server-sent event stream to the end and returns its token counts: the
 * last `usage` the stream reported, or an estimate from the generated text.
 */
export async function countStream(stream: ReadableStream<Uint8Array>, inputCharacters: number): Promise<TokenCounts> {
  const reader = stream.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  let reported: { inputTokens: number; outputTokens: number } | null = null;
  let generated = 0;
  const line = (text: string) => {
    if (!text.startsWith("data:")) return;
    const data = text.slice(5).trim();
    if (!data || data === "[DONE]") return;
    let chunk: unknown;
    try {
      chunk = JSON.parse(data);
    } catch {
      return;
    }
    reported = usageFrom(chunk) ?? reported;
    generated += generatedCharacters(chunk);
  };
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += value;
    let end: number;
    while ((end = buffer.indexOf("\n")) >= 0) {
      line(buffer.slice(0, end).trimEnd());
      buffer = buffer.slice(end + 1);
    }
  }
  line(buffer.trimEnd());
  const counts = reported as { inputTokens: number; outputTokens: number } | null;
  return counts
    ? { ...counts, estimated: false }
    : { inputTokens: estimateTokens(inputCharacters), outputTokens: estimateTokens(generated), estimated: true };
}

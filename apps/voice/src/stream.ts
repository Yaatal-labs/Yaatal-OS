// Pure streaming helpers, kept free of Workers imports so they can be tested with plain Node.

/** The line that separates what is spoken from the build brief handed to the Playground. */
export const BRIEF_MARKER = "@@PLAYGROUND@@";
const MAX_BRIEF = 4000;
/** Said when the model hands over a brief without a spoken sentence, so the turn is never silent. */
export const BRIEF_READY = "C'est prêt. Vous pouvez ouvrir la consigne dans le Playground.";

/**
 * Streams the reply's spoken part and captures the build brief. Text after BRIEF_MARKER is never
 * yielded (so never spoken); the last few characters are held back until it is clear they are not
 * the start of the marker.
 */
export async function* speakAndCaptureBrief(
  deltas: AsyncIterable<string>,
  onBrief: (brief: string) => void,
): AsyncGenerator<string> {
  let full = "";
  let spoken = 0;
  for await (const delta of deltas) {
    full += delta;
    const marker = full.indexOf(BRIEF_MARKER);
    const speakable = marker >= 0 ? marker : Math.max(spoken, full.length - BRIEF_MARKER.length);
    if (speakable > spoken) {
      yield full.slice(spoken, speakable);
      spoken = speakable;
    }
  }
  const marker = full.indexOf(BRIEF_MARKER);
  if (marker < 0) {
    if (full.length > spoken) yield full.slice(spoken);
    return;
  }
  const brief = full.slice(marker + BRIEF_MARKER.length).trim().slice(0, MAX_BRIEF);
  if (!brief) return;
  if (!/[\p{L}\p{N}]/u.test(full.slice(0, marker))) yield BRIEF_READY;
  onBrief(brief);
}

/**
 * Reads the text deltas of an OpenAI-style chat completions stream. Reasoning is skipped, unless
 * `reasoningIsAnswer` is set: with thinking disabled, Workers AI streams Nemotron's answer in the
 * `reasoning` field (its parser labels everything reasoning when there is no think block).
 */
export async function* chatDeltas(response: Response, options: { reasoningIsAnswer?: boolean } = {}): AsyncGenerator<string> {
  if (!response.body) return;
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += value;
    let end: number;
    while ((end = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, end).trim();
      buffer = buffer.slice(end + 1);
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (!data || data === "[DONE]") continue;
      try {
        const chunk = JSON.parse(data) as {
          choices?: { delta?: { content?: string | null; reasoning?: string | null } }[];
        };
        const delta = chunk.choices?.[0]?.delta;
        const text = delta?.content || (options.reasoningIsAnswer ? delta?.reasoning : null);
        if (text) yield text;
      } catch {
        // Ignore keep-alives and malformed lines.
      }
    }
  }
}


/**
 * Text as it should be spoken: markdown markers, emoji, links and separators removed, so the voice
 * says the words and not the symbols. Returns null when nothing speakable is left.
 */
export function speakable(text: string): string | null {
  const cleaned = text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+[.)])\s+/gm, "")
    .replace(/^\s*(-{3,}|\*{3,}|_{3,})\s*$/gm, " ")
    .replace(/[*_`~#|]/g, "")
    .replace(/\p{Extended_Pictographic}|\uFE0F|\u200D/gu, "")
    .replace(/\s*[—–]\s*/g, ", ")
    .replace(/\s+/g, " ")
    .trim();
  return /[\p{L}\p{N}]/u.test(cleaned) ? cleaned : null;
}

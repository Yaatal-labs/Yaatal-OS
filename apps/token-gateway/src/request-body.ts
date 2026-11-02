import type { ModelOffer } from "./models.js";
import { repairToolCalls } from "./tool-calls.js";

const STRIPPED_FIELDS = ["user", "metadata", "store", "service_tier"] as const;

/** Body sent upstream: public id swapped for upstream's, output capped, and tool history repaired. */
export function prepare(body: Record<string, unknown>, offer: ModelOffer): Record<string, unknown> {
  const out: Record<string, unknown> = { ...body };
  for (const field of STRIPPED_FIELDS) delete out[field];
  if (Array.isArray(out.messages)) out.messages = repairToolCalls(out.messages);
  const requested = out.max_completion_tokens ?? out.max_tokens;
  const cap = typeof requested === "number" && Number.isInteger(requested) && requested > 0
    ? Math.min(requested, offer.maxOutputTokens)
    : offer.maxOutputTokens;
  delete out.max_completion_tokens;
  out.max_tokens = cap;
  if (out.stream === true) out.stream_options = { include_usage: true };
  else delete out.stream_options;
  return out;
}

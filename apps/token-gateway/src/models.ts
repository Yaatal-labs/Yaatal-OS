// The models Yaatal sells, their FCFA price, and where their tokens come from. Each model lists its
// upstreams in order: the gateway fails over to the next one when an upstream is rate limited or
// down, so the wholesale supplier, Workers AI or a self-hosted server can back the same public id.
//
// Prices are FCFA per million tokens, which is exactly micro-FCFA per token (see the ledger schema).
// Retail tiers: Micro 500, Standard 1,000,
// Deep reasoning 3,500 FCFA per 1M tokens. Confirm against the signed wholesale price sheet.

export type Upstream =
  /** Workers AI's OpenAI-compatible endpoint, through AI Gateway over the AI binding (no key). */
  | { kind: "workers-ai"; model: string }
  /**
   * An OpenAI-compatible server: the wholesale gateway, a self-hosted model, OpenRouter... `baseUrlVar`
   * and `apiKeyVar` name the environment entries holding its base URL and key, so no endpoint or
   * credential lives in code. An upstream whose base URL is not configured is skipped.
   */
  | { kind: "openai"; baseUrlVar: string; apiKeyVar: string; model: string };

export interface ModelOffer {
  /** Public id clients send as `model`. */
  id: string;
  tier: "micro" | "standard" | "reasoning";
  upstreams: readonly Upstream[];
  inputFcfaPerMillion: number;
  outputFcfaPerMillion: number;
  /** Hard cap on max_tokens, which also bounds how far one request can overdraw a balance. */
  maxOutputTokens: number;
}

const WHOLESALE = { kind: "openai", baseUrlVar: "WHOLESALE_BASE_URL", apiKeyVar: "WHOLESALE_API_KEY" } as const;

const PRICE = {
  micro: 500,
  standard: 1_000,
  reasoning: 3_500,
} as const;

function offer(id: string, tier: ModelOffer["tier"], upstreams: Upstream[], maxOutputTokens = 8192): ModelOffer {
  return {
    id,
    tier,
    upstreams,
    inputFcfaPerMillion: PRICE[tier],
    outputFcfaPerMillion: PRICE[tier],
    maxOutputTokens,
  };
}

export const MODELS: readonly ModelOffer[] = [
  offer("yaatal/glm-4.7-flash", "standard", [
    { ...WHOLESALE, model: "glm-4.7-flash" },
    { kind: "workers-ai", model: "@cf/zai-org/glm-4.7-flash" },
  ]),
  offer("yaatal/qwen3-27b", "standard", [
    { ...WHOLESALE, model: "qwen3-27b" },
    { kind: "workers-ai", model: "@cf/qwen/qwen3.8-27b" },
  ]),
  // No reasoning phase, so it answers at once: the default for voice.
  offer("yaatal/llama-3.3-70b", "standard", [
    { ...WHOLESALE, model: "llama-3.3-70b-instruct" },
    { kind: "workers-ai", model: "@cf/meta/llama-3.3-70b-instruct-fp8-fast" },
  ]),
  offer("yaatal/nemotron-3-super", "reasoning", [
    { kind: "workers-ai", model: "@cf/nvidia/nemotron-3-120b-a12b" },
  ]),
  offer("yaatal/deepseek-r1", "reasoning", [
    { ...WHOLESALE, model: "deepseek-r1" },
  ]),
];

export function findModel(id: unknown, models: readonly ModelOffer[] = MODELS): ModelOffer | undefined {
  return typeof id === "string" ? models.find(model => model.id === id) : undefined;
}

/** Cost in micro-FCFA. Integer arithmetic only. */
export function costOf(model: ModelOffer, inputTokens: number, outputTokens: number): number {
  return inputTokens * model.inputFcfaPerMillion + outputTokens * model.outputFcfaPerMillion;
}

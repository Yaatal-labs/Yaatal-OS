// The models Yaatal sells, their FCFA price, and where their tokens come from. Each model lists its
// upstreams in order: the gateway fails over to the next one when an upstream is rate limited or
// down, so the wholesale supplier, Workers AI or a self-hosted server can back the same public id.
//
// Prices are FCFA per million tokens, which is exactly micro-FCFA per token (see the ledger schema).
// Each price is derived from the model's upstream cost (USD per million tokens, from the Workers AI
// catalog), the exchange rate and Yaatal's markup, so no model is ever sold below cost. Update
// USD_TO_FCFA and MARKUP here; update a model's cost when its upstream changes.

export type Upstream =
  /** Workers AI's OpenAI-compatible endpoint, through AI Gateway over the AI binding (no key). */
  | { kind: "workers-ai"; model: string }
  /**
   * An OpenAI-compatible server: the wholesale gateway, a self-hosted model, OpenRouter... `baseUrlVar`
   * and `apiKeyVar` name the environment entries holding its base URL and key, so no endpoint or
   * credential lives in code. An upstream whose base URL is not configured is skipped.
   */
  | { kind: "openai"; baseUrlVar: string; apiKeyVar: string; model: string };

export type Tier = "micro" | "standard" | "reasoning";

export interface ModelOffer {
  /** Public id clients send as `model`. */
  id: string;
  tier: Tier;
  upstreams: readonly Upstream[];
  inputFcfaPerMillion: number;
  outputFcfaPerMillion: number;
  /** Hard cap on max_tokens, which also bounds how far one request can overdraw a balance. */
  maxOutputTokens: number;
  /** Only callable on the Workers Paid plan: hidden and refused unless WORKERS_PAID is "true". */
  paidPlan?: boolean;
}

/** FCFA per US dollar (XOF is pegged to the euro; review when the dollar moves). */
export const USD_TO_FCFA = 600;
/** Retail price over upstream cost. 2 means a 50% gross margin. */
export const MARKUP = 2;
/** Prices are rounded up to this many FCFA per million tokens. */
const ROUND_TO = 50;

/** FCFA per million tokens for an upstream cost in USD per million, never below cost. */
export function retailFcfa(usdPerMillion: number): number {
  const fcfa = usdPerMillion * USD_TO_FCFA * MARKUP;
  return Math.max(ROUND_TO, Math.ceil(fcfa / ROUND_TO) * ROUND_TO);
}

const WORKERS_AI = (model: string): Upstream => ({ kind: "workers-ai", model });
/** The wholesale supplier, used first when WHOLESALE_BASE_URL is configured. */
const WHOLESALE = (model: string): Upstream =>
  ({ kind: "openai", baseUrlVar: "WHOLESALE_BASE_URL", apiKeyVar: "WHOLESALE_API_KEY", model });

function offer(
  id: string,
  tier: Tier,
  upstreams: Upstream[],
  cost: { input: number; output: number },
  options: { paidPlan?: boolean; maxOutputTokens?: number } = {},
): ModelOffer {
  return {
    id,
    tier,
    upstreams,
    inputFcfaPerMillion: retailFcfa(cost.input),
    outputFcfaPerMillion: retailFcfa(cost.output),
    maxOutputTokens: options.maxOutputTokens ?? 8192,
    ...(options.paidPlan ? { paidPlan: true } : {}),
  };
}

const PAID = { paidPlan: true } as const;

// Costs are Workers AI list prices (USD per million tokens, catalog of 2026-09-26), newest first.
// Checked on 2026-09-26 against a Workers Free account: models marked PAID answer 403 there.
export const MODELS: readonly ModelOffer[] = [
  offer("yaatal/qwen3.8-27b", "standard", [WORKERS_AI("@cf/qwen/qwen3.8-27b")], { input: 0.45, output: 3.2 }),
  offer("yaatal/gemma-4-26b", "standard", [WORKERS_AI("@cf/google/gemma-4-26b-a4b-it")], { input: 0.1, output: 0.3 }),
  offer("yaatal/nemotron-3-super", "standard", [WORKERS_AI("@cf/nvidia/nemotron-3-120b-a12b")], { input: 0.5, output: 1.5 }),
  offer("yaatal/llama-3.3-70b", "standard", [WORKERS_AI("@cf/meta/llama-3.3-70b-instruct-fp8-fast")], { input: 0.293, output: 2.253 }),
  offer("yaatal/glm-5.3-flash", "standard", [WORKERS_AI("@cf/zai-org/glm-5.3-flash")], { input: 0.15, output: 0.5 }, PAID),
  offer("yaatal/deepseek-v4-flash", "standard", [WORKERS_AI("@cf/deepseek-ai/deepseek-v4-flash-0731")], { input: 0.44, output: 1.32 }, PAID),
  offer("yaatal/glm-5.3", "reasoning", [WORKERS_AI("@cf/zai-org/glm-5.3")], { input: 1.4, output: 4.4 }, PAID),
  offer("yaatal/deepseek-v4-pro", "reasoning", [WORKERS_AI("@cf/deepseek-ai/deepseek-v4-pro-0813")], { input: 1.32, output: 3.96 }, PAID),
  offer("yaatal/kimi-k2.7-code", "reasoning", [WORKERS_AI("@cf/moonshotai/kimi-k2.7-code")], { input: 0.95, output: 4 }, PAID),
  offer("yaatal/glm-4.7-flash", "micro",
    [WHOLESALE("glm-4.7-flash"), WORKERS_AI("@cf/zai-org/glm-4.7-flash")], { input: 0.0605, output: 0.4 }),
  offer("yaatal/granite-4.0-micro", "micro", [WORKERS_AI("@cf/ibm-granite/granite-4.0-h-micro")], { input: 0.017, output: 0.112 }),
];

/** The models this deployment can serve: Workers Paid models only when WORKERS_PAID is "true". */
export function availableModels(env: { WORKERS_PAID?: string }): readonly ModelOffer[] {
  return env.WORKERS_PAID === "true" ? MODELS : MODELS.filter(model => !model.paidPlan);
}

export function findModel(id: unknown, models: readonly ModelOffer[] = MODELS): ModelOffer | undefined {
  return typeof id === "string" ? models.find(model => model.id === id) : undefined;
}

/** Cost in micro-FCFA. Integer arithmetic only. */
export function costOf(model: ModelOffer, inputTokens: number, outputTokens: number): number {
  return inputTokens * model.inputFcfaPerMillion + outputTokens * model.outputFcfaPerMillion;
}

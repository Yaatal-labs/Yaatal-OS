// The models Kairmel sells, their price in XOF (FCFA), and where their tokens come from. Each model lists its
// upstreams in order: the gateway fails over to the next one when an upstream is rate limited or
// down, so the wholesale supplier, Workers AI or a self-hosted server can back the same public id.
//
// Prices are XOF per million tokens, which is exactly micro-XOF per token (see the ledger schema).
// Each price is derived from the model's upstream cost (USD per million tokens, from the Workers AI
// catalog), the exchange rate and our markup, so no model is ever sold below cost. Update
// USD_TO_XOF and MARKUP here; update a model's cost when its upstream changes.

/**
 * Where a model's tokens are processed. "controlled" is an endpoint Yaatal operates or contractually
 * controls (a self-hosted model); "any" is every shared supplier. Sovereign data goes only to the former.
 */
export type Residency = "controlled" | "any";

export type Upstream =
  /** Workers AI's OpenAI-compatible endpoint, through AI Gateway over the AI binding (no key). */
  | { kind: "workers-ai"; model: string; residency?: Residency }
  /**
   * An OpenAI-compatible server: the wholesale gateway, a self-hosted model, OpenRouter... `baseUrlVar`
   * and `apiKeyVar` name the environment entries holding its base URL and key, so no endpoint or
   * credential lives in code. An upstream whose base URL is not configured is skipped.
   */
  | {
      kind: "openai";
      baseUrlVar: string;
      apiKeyVar: string;
      model: string;
      /** Defaults to "any". Set "controlled" only for a server Yaatal controls. */
      residency?: Residency;
      /** The most this upstream can charge, USD per million tokens. The model's cost must cover it. */
      maxCostUsd?: { input: number; output: number };
      /** Fields sent on every request to this upstream (routing, data policy). They override the client's. */
      fixedFields?: Record<string, unknown>;
      /** Sends the output cap as `max_completion_tokens`: OpenAI's newer models refuse `max_tokens`. */
      maxCompletionTokens?: boolean;
    };

export type Tier = "micro" | "standard" | "reasoning";

export interface ModelOffer {
  /** Public id clients send as `model`. */
  id: string;
  tier: Tier;
  upstreams: readonly Upstream[];
  /** "controlled" only when every upstream in the failover chain is. */
  residency: Residency;
  inputXofPerMillion: number;
  outputXofPerMillion: number;
  /** Hard cap on max_tokens, which also bounds how far one request can overdraw a balance. */
  maxOutputTokens: number;
  /** Only callable on the Workers Paid plan: hidden and refused unless WORKERS_PAID is "true". */
  paidPlan?: boolean;
  /** Writes its reasoning into `content`, closed by `</think>`: streams are held back to move it out. */
  thinksInContent?: boolean;
  /** Demo and testing only (account-pool supply): hidden and refused unless DEMO_MODELS is "true". */
  demo?: boolean;
}

/** XOF per US dollar (the West African CFA franc is pegged to the euro; review when the dollar moves). */
export const USD_TO_XOF = 600;
/** Retail price over upstream cost. 2 means a 50% gross margin. */
export const MARKUP = 2;
/** Prices are rounded up to this many XOF per million tokens. */
const ROUND_TO = 50;

/** XOF per million tokens for an upstream cost in USD per million, never below cost. */
export function retailXof(usdPerMillion: number): number {
  const xof = usdPerMillion * USD_TO_XOF * MARKUP;
  return Math.max(ROUND_TO, Math.ceil(xof / ROUND_TO) * ROUND_TO);
}

const WORKERS_AI = (model: string): Upstream => ({ kind: "workers-ai", model });
/** The wholesale supplier, used first when WHOLESALE_BASE_URL is configured. */
const WHOLESALE = (model: string): Upstream =>
  ({ kind: "openai", baseUrlVar: "WHOLESALE_BASE_URL", apiKeyVar: "WHOLESALE_API_KEY", model });

/** A supplier reached over its OpenAI-compatible API, configured with `<NAME>_BASE_URL` and `<NAME>_API_KEY`. */
const SUPPLIER = (name: string, model: string, maxCostUsd: { input: number; output: number },
                  fixedFields?: Record<string, unknown>): Upstream =>
  ({ kind: "openai", baseUrlVar: `${name}_BASE_URL`, apiKeyVar: `${name}_API_KEY`, model, maxCostUsd,
     ...(fixedFields ? { fixedFields } : {}) });
/** SiliconFlow: a flat per-model price list, so `maxCostUsd` is its list price for the model. */
const SILICONFLOW = (model: string, maxCostUsd: { input: number; output: number }) =>
  SUPPLIER("SILICONFLOW", model, maxCostUsd);
/**
 * OpenRouter: it picks among many hosts, so every request caps the price it accepts at `maxCostUsd`
 * and excludes hosts that keep or train on prompts.
 */
const OPENROUTER = (model: string, maxCostUsd: { input: number; output: number }) =>
  SUPPLIER("OPENROUTER", model, maxCostUsd, {
    provider: { data_collection: "deny", max_price: { prompt: maxCostUsd.input, completion: maxCostUsd.output } },
  });
/**
 * Our new-api relay (relay.kairmel.com, R-39), which fans out to wholesale suppliers. Its `any` group
 * token reaches official-transfer supply only; `maxCostUsd` is the supplier's agency cost price.
 */
const RELAY = (model: string, maxCostUsd: { input: number; output: number }, options: { maxCompletionTokens?: boolean } = {}): Upstream =>
  ({ ...SUPPLIER("RELAY", model, maxCostUsd), ...(options.maxCompletionTokens ? { maxCompletionTokens: true } : {}) });
/** The relay's `pool` group token: account-pool supply, for demo and testing only (founder 10-29). */
const RELAY_POOL = (model: string, maxCostUsd: { input: number; output: number }): Upstream =>
  SUPPLIER("RELAY_POOL", model, maxCostUsd);

function offer(
  id: string,
  tier: Tier,
  upstreams: Upstream[],
  cost: { input: number; output: number },
  options: { paidPlan?: boolean; maxOutputTokens?: number; thinksInContent?: boolean; demo?: boolean } = {},
): ModelOffer {
  // The price is derived from `cost`, so it must be the dearest upstream: no path may sell below cost.
  for (const upstream of upstreams) {
    const max = upstream.kind === "openai" ? upstream.maxCostUsd : undefined;
    if (max && (max.input > cost.input || max.output > cost.output)) {
      throw new Error(`${id}: an upstream can cost more than the price is based on`);
    }
  }
  return {
    id,
    tier,
    upstreams,
    residency: controlledResidency(upstreams) ? "controlled" : "any",
    inputXofPerMillion: retailXof(cost.input),
    outputXofPerMillion: retailXof(cost.output),
    maxOutputTokens: options.maxOutputTokens ?? 8192,
    ...(options.paidPlan ? { paidPlan: true } : {}),
    ...(options.thinksInContent ? { thinksInContent: true } : {}),
    ...(options.demo ? { demo: true } : {}),
  };
}

const PAID = { paidPlan: true } as const;
const DEMO = { demo: true } as const;

// Costs are Workers AI list prices (USD per million tokens, catalog of 2026-09-26). Order is display
// order: the frontier models people ask for first, the older open models last.
// Checked on 2026-09-26 against a Workers Free account: models marked PAID answer 403 there.
// The relay (cost sheet of 2026-10-15) comes first where it serves the model and costs less than the
// price basis; Workers AI stays as the failover.
export const MODELS: readonly ModelOffer[] = [
  offer("kairmel/kimi-k2.7-code", "reasoning", [
    RELAY("kimi-k2.7-code", { input: 0.7322, output: 3.0414 }),
    WORKERS_AI("@cf/moonshotai/kimi-k2.7-code"),
  ], { input: 0.95, output: 4 }, PAID),
  offer("kairmel/glm-5.3", "reasoning", [
    RELAY("glm-5.3", { input: 0.8879, output: 3.1076 }),
    WORKERS_AI("@cf/zai-org/glm-5.3"),
  ], { input: 1.4, output: 4.4 }, { ...PAID, thinksInContent: true }),
  offer("kairmel/deepseek-v4-pro", "reasoning", [
    RELAY("deepseek-v4-pro-0813", { input: 0.6069, output: 1.8206 }),
    WORKERS_AI("@cf/deepseek-ai/deepseek-v4-pro-0813"),
  ], { input: 1.32, output: 3.96 }, PAID),
  // Served by the relay only (no Workers AI copy): priced on the relay's cost.
  offer("kairmel/gpt-6.1-sol", "reasoning", [RELAY("gpt-6.1-sol", { input: 1.4715, output: 7.3575 }, { maxCompletionTokens: true })],
    { input: 1.4715, output: 7.3575 }),
  offer("kairmel/claude-sonnet-5", "reasoning", [RELAY("claude-sonnet-5", { input: 1.577, output: 7.885 })], { input: 1.577, output: 7.885 }),
  offer("kairmel/qwen3.8-max", "reasoning", [RELAY("qwen3.8-max", { input: 1.5377, output: 4.6131 })], { input: 1.5377, output: 4.6131 }),
  offer("kairmel/gemini-3.8-flash", "standard", [RELAY("gemini-3.8-flash", { input: 0.5518, output: 2.7591 })], { input: 0.5518, output: 2.7591 }),
  offer("kairmel/deepseek-v4.1-flash", "standard", [RELAY("deepseek-v4.1-flash", { input: 0.1421, output: 0.5684 })], { input: 0.1421, output: 0.5684 }),
  offer("kairmel/qwen3.8-flash", "standard", [RELAY("qwen3.8-flash", { input: 0.1025, output: 0.346 })], { input: 0.1025, output: 0.346 }),
  offer("kairmel/gpt-6-luna", "micro", [RELAY("gpt-6-luna", { input: 0.0736, output: 0.3679 }, { maxCompletionTokens: true })],
    { input: 0.0736, output: 0.3679 }),
  offer("kairmel/qwen3.8-27b", "standard", [WORKERS_AI("@cf/qwen/qwen3.8-27b")], { input: 0.45, output: 3.2 }),
  // Suppliers first when configured, Workers AI last. The relay's, SiliconFlow's list price and
  // OpenRouter's cap (checked 2026-09-28) are all below Workers AI's, which the price is based on.
  offer("kairmel/deepseek-v4-flash", "standard", [
    RELAY("deepseek-v4-flash-0731", { input: 0.2023, output: 0.6069 }),
    SILICONFLOW("deepseek-ai/DeepSeek-V4-Flash", { input: 0.22, output: 0.66 }),
    OPENROUTER("deepseek/deepseek-v4-flash-0731", { input: 0.25, output: 0.7 }),
    WORKERS_AI("@cf/deepseek-ai/deepseek-v4-flash-0731"),
  ], { input: 0.44, output: 1.32 }, PAID),
  offer("kairmel/glm-5.3-flash", "standard", [WORKERS_AI("@cf/zai-org/glm-5.3-flash")], { input: 0.15, output: 0.5 }, PAID),
  offer("kairmel/nemotron-3-super", "standard", [WORKERS_AI("@cf/nvidia/nemotron-3-120b-a12b")], { input: 0.5, output: 1.5 }),
  offer("kairmel/glm-4.7-flash", "micro",
    [WHOLESALE("glm-4.7-flash"), WORKERS_AI("@cf/zai-org/glm-4.7-flash")], { input: 0.0605, output: 0.4 }),
  offer("kairmel/gemma-4-26b", "standard", [WORKERS_AI("@cf/google/gemma-4-26b-a4b-it")], { input: 0.1, output: 0.3 }),
  offer("kairmel/llama-3.3-70b", "standard", [WORKERS_AI("@cf/meta/llama-3.3-70b-instruct-fp8-fast")], { input: 0.293, output: 2.253 }),
  offer("kairmel/granite-4.0-micro", "micro", [WORKERS_AI("@cf/ibm-granite/granite-4.0-h-micro")], { input: 0.017, output: 0.112 }),
  // Account-pool supply through the relay's `pool` group: demo and testing only, never listed or
  // served unless DEMO_MODELS is "true". Priced on the pool cost (about half the official one).
  offer("kairmel/claude-opus-5.5-demo", "reasoning", [RELAY_POOL("lite/claude-opus-5-5", { input: 1.466, output: 7.33 })], { input: 1.466, output: 7.33 }, DEMO),
  offer("kairmel/claude-sonnet-5-demo", "reasoning", [RELAY_POOL("lite/claude-sonnet-5", { input: 0.733, output: 3.665 })], { input: 0.733, output: 3.665 }, DEMO),
];

export type DataClass = "sovereign" | "operational" | "public";

export const DATA_CLASSES: readonly DataClass[] = ["sovereign", "operational", "public"];

/** Every upstream is one we control, and there is at least one: the single rule for Sovereign data. */
function controlledResidency(upstreams: readonly { residency?: Residency }[]): boolean {
  return upstreams.length > 0 && upstreams.every(upstream => upstream.residency === "controlled");
}

/**
 * Whether a model may process data of this class. Sovereign data only goes to a model whose every
 * upstream, failover ones included, is controlled; the check reads the chain, not the field alone.
 */
export function allowsDataClass(offer: Pick<ModelOffer, "upstreams">, dataClass: DataClass): boolean {
  return dataClass !== "sovereign" || controlledResidency(offer.upstreams);
}

/**
 * The models this deployment can serve: Workers Paid models only when WORKERS_PAID is "true", demo
 * (account-pool) models only when DEMO_MODELS is "true".
 */
export function availableModels(env: { WORKERS_PAID?: string; DEMO_MODELS?: string }): readonly ModelOffer[] {
  return MODELS.filter(model => (env.WORKERS_PAID === "true" || !model.paidPlan) && (env.DEMO_MODELS === "true" || !model.demo));
}

/** Models were published as `yaatal/…` before the product was named Kairmel; those ids stay valid. */
const LEGACY_PREFIX = "yaatal/";

export function findModel(id: unknown, models: readonly ModelOffer[] = MODELS): ModelOffer | undefined {
  if (typeof id !== "string") return undefined;
  const wanted = id.startsWith(LEGACY_PREFIX) ? `kairmel/${id.slice(LEGACY_PREFIX.length)}` : id;
  return models.find(model => model.id === wanted);
}

/** Cost in micro-FCFA. Integer arithmetic only. */
export function costOf(model: ModelOffer, inputTokens: number, outputTokens: number): number {
  return inputTokens * model.inputXofPerMillion + outputTokens * model.outputXofPerMillion;
}

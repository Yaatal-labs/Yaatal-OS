import type { ModelOffer, Upstream } from "./models.js";

export interface UpstreamEnv {
  AI: Ai;
  AI_GATEWAY_ID: string;
  [name: string]: unknown;
}

/** `Ai#fetch` exists at runtime but is not in the Ai type; it passes requests through to AI Gateway. */
type AiFetch = { fetch(input: string, init?: RequestInit): Promise<Response> };

/** Same-account binding requests authenticate with this sentinel instead of a Cloudflare API token. */
const BINDING_AUTH = "Bearer cloudflare-gateway-binding";

/**
 * The only request fields sent to an "openai"-kind upstream. Anything else could reach supplier
 * features the price does not cover, such as OpenRouter's `models` (other models as fallbacks),
 * `provider` or `plugins`.
 */
const OPENAI_FIELDS = [
  "messages", "stream", "stream_options", "max_tokens", "temperature", "top_p", "stop", "seed",
  "presence_penalty", "frequency_penalty", "tools", "tool_choice", "parallel_tool_calls",
  "response_format", "logprobs", "top_logprobs", "chat_template_kwargs",
] as const;

/** Statuses that mean "try the next upstream": rate limited, or the upstream itself failed. */
const FAILOVER = new Set([408, 429, 500, 502, 503, 504]);

export interface UpstreamResult {
  response: Response;
  upstream: Upstream;
  /** Upstreams tried before this one, for the response header and the logs. */
  skipped: number;
}

/**
 * Sends an OpenAI chat-completions body to the model's upstreams in order, moving to the next on a
 * network error or a failover status. Returns the first other answer, or the last failure.
 * With `firstOnly`, stops after the first configured upstream whatever it answers (no failover).
 */
export async function callUpstreams(
  env: UpstreamEnv,
  offer: ModelOffer,
  body: Record<string, unknown>,
  fetcher: typeof fetch = fetch,
  options: { firstOnly?: boolean } = {},
): Promise<UpstreamResult | null> {
  let last: UpstreamResult | null = null;
  let tried: Upstream | null = null;
  let skipped = 0;
  for (const upstream of offer.upstreams) {
    // Nothing identifying a Yaatal customer is sent upstream: only the request body.
    const request = requestFor(env, upstream, { ...body, model: upstream.model }, fetcher);
    if (!request) continue; // Not configured in this deployment.
    tried = upstream;
    let response: Response;
    try {
      response = await request;
    } catch {
      if (options.firstOnly) break;
      skipped++;
      continue;
    }
    last = { response, upstream, skipped };
    if (options.firstOnly || !FAILOVER.has(response.status)) return last;
    await response.body?.cancel();
    skipped++;
  }
  // Configured upstreams were tried and none answered (network errors): an upstream failure (502),
  // not a missing configuration, so the caller and the metrics see it as one.
  if (!last && tried) return { response: new Response(null, { status: 502 }), upstream: tried, skipped };
  return last;
}

function requestFor(
  env: UpstreamEnv,
  upstream: Upstream,
  body: Record<string, unknown>,
  fetcher: typeof fetch,
): Promise<Response> | null {
  switch (upstream.kind) {
    case "workers-ai": {
      const payload = JSON.stringify(body);
      const gateway = encodeURIComponent(env.AI_GATEWAY_ID);
      return (env.AI as unknown as AiFetch).fetch(
        `https://workers-binding.ai/ai-gateway/gateways/${gateway}/workers-ai/v1/chat/completions`,
        {
          method: "POST",
          body: payload,
          headers: {
            "content-type": "application/json",
            "cf-aig-authorization": BINDING_AUTH,
            // Zero data retention: AI Gateway keeps no prompt or completion for these requests.
            "cf-aig-collect-log": "false",
          },
        },
      );
    }
    case "openai": {
      const baseUrl = env[upstream.baseUrlVar];
      if (typeof baseUrl !== "string" || !baseUrl) return null;
      const key = env[upstream.apiKeyVar];
      const fields: Record<string, unknown> = {};
      for (const field of OPENAI_FIELDS) if (field in body) fields[field] = body[field];
      const payload = JSON.stringify({ ...fields, model: body.model, ...upstream.fixedFields });
      return fetcher(`${baseUrl.replace(/\/+$/, "")}/chat/completions`, {
        method: "POST",
        body: payload,
        headers: {
          "content-type": "application/json",
          ...(typeof key === "string" && key ? { authorization: `Bearer ${key}` } : {}),
        },
      });
    }
  }
}

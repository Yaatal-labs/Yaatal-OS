/** Discovery only: Winsum's inference contract and supplier costs have not been reviewed. */
export interface WinsumEnv {
  WINSUM_BASE_URL?: string;
  WINSUM_API_KEY?: string;
}

export class WinsumDiscoveryError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(code: string, status = 502) {
    super("Winsum discovery could not be validated.");
    this.code = code;
    this.status = status;
  }
}

const MAX_BYTES = 256_000;

export async function discoverWinsum(env: WinsumEnv, fetcher: typeof fetch = fetch) {
  if (!env.WINSUM_BASE_URL || !env.WINSUM_API_KEY) {
    throw new WinsumDiscoveryError("winsum_not_configured", 503);
  }
  let base: URL;
  try {
    base = new URL(env.WINSUM_BASE_URL);
    if (base.protocol !== "https:" || base.username || base.password || base.search || base.hash || base.pathname !== "/") throw new Error();
    if (!env.WINSUM_API_KEY.trim() || /[\r\n]/.test(env.WINSUM_API_KEY)) throw new Error();
  } catch {
    throw new WinsumDiscoveryError("winsum_invalid_configuration", 503);
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetcher(new URL("/v1/models", base), {
      method: "GET",
      headers: { "content-type": "application/json", accept: "application/json", authorization: `Bearer ${env.WINSUM_API_KEY}` },
      redirect: "manual",
      signal: controller.signal,
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new WinsumDiscoveryError("winsum_upstream_error");
    }
    if (!/^application\/json(?:\s*;|$)/i.test(response.headers.get("content-type") ?? "")) {
      await response.body?.cancel();
      throw new WinsumDiscoveryError("winsum_unsupported_schema");
    }
    const reader = response.body?.getReader();
    if (!reader) throw new WinsumDiscoveryError("winsum_unsupported_schema");
    let size = 0;
    const chunks: Uint8Array[] = [];
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_BYTES) throw new WinsumDiscoveryError("winsum_response_too_large");
        chunks.push(value);
      }
    } finally {
      await reader.cancel();
      reader.releaseLock();
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    const payload: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    // Provisional OpenAI envelope assumption, NOT a supplier schema guarantee.
    if (!isRecord(payload) || payload.object !== "list" || !Array.isArray(payload.data) || payload.data.length > 1000) {
      throw new WinsumDiscoveryError("winsum_unsupported_schema");
    }
    const ids = payload.data.map((model: unknown) => {
      if (!isRecord(model) || model.object !== "model" || typeof model.id !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,199}$/.test(model.id) || model.id.includes(env.WINSUM_API_KEY!)) {
        throw new WinsumDiscoveryError("winsum_unsupported_schema");
      }
      return model.id;
    });
    if (new Set(ids).size !== ids.length) throw new WinsumDiscoveryError("winsum_unsupported_schema");
    return { supplier: "winsum", inference_enabled: false, schema: "provisional_openai_model_list", model_ids: ids };
  } catch (error) {
    if (error instanceof WinsumDiscoveryError) throw error;
    throw new WinsumDiscoveryError(controller.signal.aborted ? "winsum_timeout" : "winsum_discovery_failed");
  } finally {
    clearTimeout(timer);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

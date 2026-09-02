export type FetchLike = typeof fetch;

export interface RequestOptions {
  method?: string;
  token?: string;
  query?: Record<string, boolean | number | string | null | undefined>;
  body?: unknown;
  headers?: HeadersInit;
}

export interface EngineHttpClientOptions {
  baseUrl: string;
  token?: string | undefined;
  fetch?: FetchLike | undefined;
  headers?: HeadersInit | undefined;
}

export class YaatalApiError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(status: number, body: unknown) {
    super(`Yaatal Engine request failed with status ${status}`);
    this.name = "YaatalApiError";
    this.status = status;
    this.body = body;
  }
}

export class EngineHttpClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: FetchLike;
  private readonly defaultHeaders: HeadersInit | undefined;
  private token: string | undefined;

  constructor(options: EngineHttpClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.defaultHeaders = options.headers;
    this.token = options.token;
  }

  setToken(token: string): void {
    this.token = token;
  }

  clearToken(): void {
    this.token = undefined;
  }

  async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const url = this.buildUrl(path, options.query);
    const headers = new Headers(this.defaultHeaders);
    mergeHeaders(headers, options.headers);

    if (options.body !== undefined && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }

    const token = options.token ?? this.token;
    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
    }

    const requestInit: RequestInit = {
      method: options.method ?? "GET",
      headers,
    };

    if (options.body !== undefined) {
      requestInit.body = JSON.stringify(options.body);
    }

    const response = await this.fetchImpl(url, requestInit);

    if (!response.ok) {
      throw new YaatalApiError(response.status, await readBody(response));
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return (await readBody(response)) as T;
  }

  private buildUrl(
    path: string,
    query?: Record<string, boolean | number | string | null | undefined>,
  ): string {
    const normalizedPath = path.startsWith("/") ? path : `/${path}`;
    const url = new URL(`${this.baseUrl}${normalizedPath}`);

    for (const [key, value] of Object.entries(query ?? {})) {
      if (value !== undefined && value !== null) {
        url.searchParams.set(key, String(value));
      }
    }

    return url.toString();
  }
}

function mergeHeaders(target: Headers, source?: HeadersInit): void {
  if (!source) {
    return;
  }

  new Headers(source).forEach((value, key) => target.set(key, value));
}

async function readBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return undefined;
  }

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

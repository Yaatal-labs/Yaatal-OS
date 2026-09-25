// Read-only client for Engine's public catalog, scoped to the one merchant this deployment is
// configured for. Everything an agent passes in is validated here before it reaches a URL, and
// everything Engine sends back is validated before it reaches an agent.
import type { CatalogListOptions, CatalogPage, CatalogProduct } from "./types.js";

export const PAGE_SIZE = 20;
const MAX_PAGE = 10_000;
const MAX_BODY_BYTES = 1_000_000;
const TIMEOUT_MS = 8_000;
const ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);
const STOCK_STATUSES = new Set(["in_stock", "low_stock", "out_of_stock"]);

export type CatalogFetch = (request: Request) => Promise<Response>;

export interface CatalogConfig {
  engineUrl: URL;
  merchantId: string;
}

export interface CatalogRequest {
  page: number;
  category?: string;
}

/** The catalog is not configured, or Engine could not be read. Nothing was returned. */
export class CatalogUnavailableError extends Error {
  constructor(reason: string) {
    super(`Yaatal catalog unavailable: ${reason}`);
    this.name = "CatalogUnavailableError";
  }
}

export class CatalogInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CatalogInputError";
  }
}

export class ProductNotFoundError extends Error {
  constructor() {
    super("Product not found");
    this.name = "ProductNotFoundError";
  }
}

/** Reads the deployment's scope. Returns null for anything missing or unsafe, which means "unavailable". */
export function readConfig(env: { YAATAL_ENGINE_URL?: string; YAATAL_MERCHANT_ID?: string }): CatalogConfig | null {
  const raw = env.YAATAL_ENGINE_URL?.trim();
  const merchantId = env.YAATAL_MERCHANT_ID?.trim();
  if (!raw || !merchantId || !ID.test(merchantId)) return null;
  let engineUrl: URL;
  try {
    engineUrl = new URL(raw);
  } catch {
    return null;
  }
  if (engineUrl.username || engineUrl.password || engineUrl.search || engineUrl.hash) return null;
  if (engineUrl.protocol === "http:" ? !LOOPBACK_HOSTS.has(engineUrl.hostname) : engineUrl.protocol !== "https:") {
    return null;
  }
  if (!engineUrl.pathname.endsWith("/")) engineUrl.pathname += "/";
  return { engineUrl, merchantId };
}

/** Validates list options. Only `page` and `category` are read; any other field is ignored. */
export function catalogRequest(options: CatalogListOptions | undefined): CatalogRequest {
  const page = options?.page ?? 1;
  if (!Number.isInteger(page) || page < 1 || page > MAX_PAGE) {
    throw new CatalogInputError(`page must be a whole number from 1 to ${MAX_PAGE}`);
  }
  const category = options?.category?.trim();
  if (category !== undefined && (category.length === 0 || category.length > 120)) {
    throw new CatalogInputError("category must be 1 to 120 characters");
  }
  return category ? { page, category } : { page };
}

export function productId(value: unknown): string {
  if (typeof value !== "string" || !ID.test(value)) throw new CatalogInputError("Invalid product id");
  return value;
}

export async function listCatalog(fetcher: CatalogFetch, config: CatalogConfig, request: CatalogRequest): Promise<CatalogPage> {
  const url = new URL("api/catalog", config.engineUrl);
  url.searchParams.set("merchant_id", config.merchantId);
  url.searchParams.set("page", String(request.page));
  url.searchParams.set("per_page", String(PAGE_SIZE));
  if (request.category) url.searchParams.set("category", request.category);

  const raw = await getJson(fetcher, url);
  if (raw === NOT_FOUND) throw new CatalogUnavailableError("Engine has no catalog endpoint");
  const body = record(raw);
  const page = integer(body.page, 1, MAX_PAGE);
  const perPage = integer(body.per_page, 1, PAGE_SIZE);
  if (page !== request.page || perPage !== PAGE_SIZE || !Array.isArray(body.products) || body.products.length > PAGE_SIZE) {
    throw invalid();
  }
  return {
    // Engine was asked for this merchant only; a row from anyone else fails the whole read.
    products: body.products.map(row => toProduct(row, config.merchantId, "fail")),
    total: integer(body.total, 0, 10_000_000),
    page,
    perPage,
  };
}

export async function getCatalogProduct(fetcher: CatalogFetch, config: CatalogConfig, id: string): Promise<CatalogProduct> {
  const body = await getJson(fetcher, new URL(`api/catalog/${encodeURIComponent(id)}`, config.engineUrl));
  if (body === NOT_FOUND) throw new ProductNotFoundError();
  // Another merchant's product reads exactly like a missing one, so ids cannot be probed.
  const product = toProduct(body, config.merchantId, "hide");
  if (!product) throw new ProductNotFoundError();
  if (product.id !== id) throw invalid();
  return product;
}

const NOT_FOUND = Symbol("not found");

async function getJson(fetcher: CatalogFetch, url: URL): Promise<unknown> {
  let response: Response;
  try {
    response = await fetcher(new Request(url, {
      method: "GET",
      redirect: "manual",
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    }));
  } catch {
    throw new CatalogUnavailableError("Engine did not answer");
  }
  if (response.status === 404) {
    await response.body?.cancel();
    return NOT_FOUND;
  }
  if (response.status !== 200) {
    await response.body?.cancel();
    throw new CatalogUnavailableError(`Engine answered ${response.status}`);
  }
  if (!(response.headers.get("content-type") ?? "").toLowerCase().includes("application/json")) {
    await response.body?.cancel();
    throw invalid();
  }
  const declared = Number(response.headers.get("content-length") ?? "0");
  if (declared > MAX_BODY_BYTES) {
    await response.body?.cancel();
    throw invalid();
  }
  const text = await readCapped(response);
  try {
    return JSON.parse(text);
  } catch {
    throw invalid();
  }
}

async function readCapped(response: Response): Promise<string> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY_BYTES) {
      await reader.cancel();
      throw invalid();
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

function toProduct(value: unknown, merchantId: string, foreign: "fail"): CatalogProduct;
function toProduct(value: unknown, merchantId: string, foreign: "hide"): CatalogProduct | null;
function toProduct(value: unknown, merchantId: string, foreign: "fail" | "hide"): CatalogProduct | null {
  const row = record(value);
  if (row.merchant_id !== merchantId) {
    if (foreign === "hide") return null;
    throw new CatalogUnavailableError("Engine returned a product outside this shop; nothing was returned");
  }
  const priceFcfa = integer(row.price_fcfa ?? row.price_cents, 0, 100_000_000);
  const stock = Math.max(0, integer(row.stock, -1_000_000, 1_000_000));
  const stockStatus = row.stock_status ?? (stock === 0 ? "out_of_stock" : stock <= 5 ? "low_stock" : "in_stock");
  if (typeof stockStatus !== "string" || !STOCK_STATUSES.has(stockStatus)) throw invalid();
  const product: CatalogProduct = {
    id: productIdFrom(row.id),
    name: text(row.name, 200),
    priceFcfa,
    priceDisplay: row.price_display == null ? `${priceFcfa} FCFA` : text(row.price_display, 64),
    stock,
    stockStatus: stockStatus as CatalogProduct["stockStatus"],
    images: images(row.images),
  };
  const description = optionalText(row.description, 4096);
  if (description !== undefined) product.description = description;
  const category = optionalText(row.category, 120);
  if (category !== undefined) product.category = category;
  return product;
}

function productIdFrom(value: unknown): string {
  if (typeof value !== "string" || !ID.test(value)) throw invalid();
  return value;
}

function images(value: unknown): string[] {
  if (value == null) return [];
  if (!Array.isArray(value) || value.length > 20) throw invalid();
  const out: string[] = [];
  for (const item of value) {
    if (typeof item !== "string" || item.length > 2048) throw invalid();
    let url: URL;
    try {
      url = new URL(item);
    } catch {
      continue; // Relative or malformed media is dropped, never rewritten.
    }
    if ((url.protocol === "https:" || url.protocol === "http:") && !url.username && !url.password) out.push(item);
  }
  return out;
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw invalid();
  return value as Record<string, unknown>;
}

function integer(value: unknown, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) throw invalid();
  return value;
}

function text(value: unknown, max: number): string {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > max) throw invalid();
  return value;
}

function optionalText(value: unknown, max: number): string | undefined {
  if (value == null || value === "") return undefined;
  return text(value, max);
}

function invalid(): CatalogUnavailableError {
  return new CatalogUnavailableError("Engine sent a response this catalog does not accept");
}

import { describe, expect, it } from "vitest";
import { type CatalogFetch, readConfig } from "../src/catalog.js";
import TYPES_CODE from "../src/types-code.js";
import TYPES_SOURCE from "../src/types.d.ts?raw";
import { YaatalCatalogSessionImpl, describeYaatalAccount, describeYaatalVendor } from "../src/yaatal.js";

const MERCHANT = "0f4c5a8e-1111-4a4a-9c9c-merchant0001";
const OTHER = "9b7d2c1a-2222-4b4b-8d8d-merchant0002";
const ENV = { YAATAL_ENGINE_URL: "https://engine.example.test/", YAATAL_MERCHANT_ID: MERCHANT };

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: "p-1",
    merchant_id: MERCHANT,
    name: "Boubou bazin",
    description: "Brodé main",
    price_cents: 25000,
    price_display: "25 000 FCFA",
    stock: 3,
    stock_status: "low_stock",
    category: "fashion",
    images: ["https://cdn.example.test/a.jpg"],
    upvotes: 4,
    ...overrides,
  };
}

function json(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    ...init,
    headers: { "content-type": "application/json", ...(init.headers as Record<string, string> | undefined) },
  });
}

/** A fake Engine: records every request and answers with `respond`. */
function engine(respond: (url: URL) => Response | Promise<Response>) {
  const requests: Request[] = [];
  const fetcher: CatalogFetch = async request => {
    requests.push(request);
    return respond(new URL(request.url));
  };
  return { fetcher, requests };
}

function queue(allow = true) {
  const observations: { title: string; description: string }[] = [];
  return {
    observations,
    authorizeObservation(value: { title: string; description: string }) {
      observations.push(value);
      return allow ? Promise.resolve() : Promise.reject(new Error("The user declined"));
    },
  };
}

function session(fetcher: CatalogFetch, q = queue(), env: Record<string, string> = ENV) {
  return new YaatalCatalogSessionImpl(q, readConfig(env), fetcher);
}

const page = (products: unknown[], extra: Record<string, unknown> = {}) =>
  json({ products, total: products.length, page: 1, per_page: 20, ...extra });

describe("describes a read-only singleton", () => {
  it("is auto-provisioned, has no auth and names the session type", () => {
    expect(describeYaatalVendor()).toMatchObject({ autoProvisionsAccount: true, providesAuth: false });
    expect(describeYaatalAccount()).toMatchObject({ singleton: { tsType: "YaatalCatalogSession" } });
  });

  it("shows agents exactly the declared types", () => {
    expect(TYPES_CODE).toBe(TYPES_SOURCE);
  });
});

describe("scope comes from the deployment only", () => {
  it("reads the pinned merchant's catalog and maps it to CatalogProduct", async () => {
    const e = engine(() => page([row()]));
    const result = await session(e.fetcher).listProducts();
    const url = new URL(e.requests[0]!.url);
    expect(url.origin + url.pathname).toBe("https://engine.example.test/api/catalog");
    expect(url.searchParams.get("merchant_id")).toBe(MERCHANT);
    expect(url.searchParams.get("per_page")).toBe("20");
    expect(result).toEqual({
      products: [{
        id: "p-1",
        name: "Boubou bazin",
        description: "Brodé main",
        priceFcfa: 25000,
        priceDisplay: "25 000 FCFA",
        stock: 3,
        stockStatus: "low_stock",
        category: "fashion",
        images: ["https://cdn.example.test/a.jpg"],
      }],
      total: 1,
      page: 1,
      perPage: 20,
    });
  });

  it("ignores a merchant the model tries to supply", async () => {
    const e = engine(() => page([row()]));
    const options = { merchantId: OTHER, merchant_id: OTHER, page: 1 } as unknown as { page: number };
    await session(e.fetcher).listProducts(options);
    const url = new URL(e.requests[0]!.url);
    expect(url.searchParams.getAll("merchant_id")).toEqual([MERCHANT]);
    expect(url.search).not.toContain(OTHER);
  });

  it("cannot smuggle a merchant through the category", async () => {
    const e = engine(() => page([]));
    await session(e.fetcher).listProducts({ category: `x&merchant_id=${OTHER}` });
    const url = new URL(e.requests[0]!.url);
    expect(url.searchParams.getAll("merchant_id")).toEqual([MERCHANT]);
    expect(url.searchParams.get("category")).toBe(`x&merchant_id=${OTHER}`);
  });

  it.each([
    ["missing merchant", { YAATAL_ENGINE_URL: "https://engine.example.test" }],
    ["missing Engine", { YAATAL_MERCHANT_ID: MERCHANT }],
    ["plain HTTP off loopback", { ...ENV, YAATAL_ENGINE_URL: "http://engine.example.test" }],
    ["credentials in the URL", { ...ENV, YAATAL_ENGINE_URL: "https://u:p@engine.example.test" }],
    ["a query on the URL", { ...ENV, YAATAL_ENGINE_URL: "https://engine.example.test/?merchant_id=x" }],
    ["another scheme", { ...ENV, YAATAL_ENGINE_URL: "file:///etc/passwd" }],
    ["an unsafe merchant id", { ...ENV, YAATAL_MERCHANT_ID: "a&b" }],
  ])("is unavailable with %s, before any observation or request", async (_label, env) => {
    const e = engine(() => page([row()]));
    const q = queue();
    await expect(session(e.fetcher, q, env as Record<string, string>).listProducts()).rejects.toThrow(
      "Yaatal catalog unavailable",
    );
    expect(q.observations).toEqual([]);
    expect(e.requests).toEqual([]);
  });

  it("allows plain HTTP on loopback for a local Engine", () => {
    expect(readConfig({ ...ENV, YAATAL_ENGINE_URL: "http://127.0.0.1:5150/api-root" })?.engineUrl.href)
      .toBe("http://127.0.0.1:5150/api-root/");
  });
});

describe("nothing outside the shop leaks", () => {
  it("fails the whole page when Engine returns another merchant's row", async () => {
    const e = engine(() => page([row(), row({ id: "p-2", merchant_id: OTHER, name: "Secret" })]));
    const error = await session(e.fetcher).listProducts().catch((err: Error) => err);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toMatch(/outside this shop/);
    expect((error as Error).message).not.toContain("Secret");
  });

  it("reads another merchant's product exactly like a missing one", async () => {
    const foreign = engine(() => json(row({ merchant_id: OTHER })));
    const missing = engine(() => new Response("{}", { status: 404 }));
    const a = await session(foreign.fetcher).getProduct("p-1").catch((err: Error) => err.message);
    const b = await session(missing.fetcher).getProduct("p-1").catch((err: Error) => err.message);
    expect(a).toBe("Product not found");
    expect(b).toBe(a);
  });

  it("rejects a product whose id differs from the one asked for", async () => {
    const e = engine(() => json(row({ id: "p-9" })));
    await expect(session(e.fetcher).getProduct("p-1")).rejects.toThrow("does not accept");
  });

  it.each(["../merchant/products", "p-1/../../admin", "p-1?merchant_id=x", "p 1", "", "%2e%2e", "x".repeat(65)])(
    "refuses the product id %j without observing or requesting",
    async id => {
      const e = engine(() => json(row()));
      const q = queue();
      await expect(session(e.fetcher, q).getProduct(id)).rejects.toThrow("Invalid product id");
      expect(q.observations).toEqual([]);
      expect(e.requests).toEqual([]);
    },
  );

  it("drops image URLs with credentials, other schemes or no host", async () => {
    const images = ["https://cdn.example.test/ok.jpg", "https://u:p@cdn.example.test/x.jpg", "javascript:alert(1)", "/relative.jpg", "data:image/png;base64,AA"];
    const e = engine(() => json(row({ images })));
    expect((await session(e.fetcher).getProduct("p-1")).images).toEqual(["https://cdn.example.test/ok.jpg"]);
  });

  it("drops Engine fields the DTO does not carry", async () => {
    const e = engine(() => json(row({ upvotes: 99, internal_note: "margin 40%" })));
    const product = await session(e.fetcher).getProduct("p-1");
    expect(Object.keys(product).sort()).toEqual(
      ["category", "description", "id", "images", "name", "priceDisplay", "priceFcfa", "stock", "stockStatus"],
    );
  });
});

describe("observations gate every read", () => {
  it("records the observation before requesting", async () => {
    const q = queue();
    const e = engine(() => {
      expect(q.observations).toHaveLength(1);
      return page([row()]);
    });
    await session(e.fetcher, q).listProducts({ page: 1, category: "fashion" });
    expect(q.observations[0]).toEqual({
      title: "Read the Yaatal catalog",
      description: 'List page 1 of the shop\'s products in the category "fashion".',
    });
  });

  it("makes no request when the user declines", async () => {
    const e = engine(() => page([row()]));
    await expect(session(e.fetcher, queue(false)).getProduct("p-1")).rejects.toThrow("declined");
    expect(e.requests).toEqual([]);
  });

  it("releases the approval queue on dispose", () => {
    let disposed = false;
    const s = new YaatalCatalogSessionImpl(
      { authorizeObservation: () => Promise.resolve(), [Symbol.dispose]: () => { disposed = true; } },
      readConfig(ENV),
      async () => page([]),
    );
    s[Symbol.dispose]();
    expect(disposed).toBe(true);
  });
});

describe("hostile or broken Engine answers", () => {
  it("does not follow redirects", async () => {
    const e = engine(() => new Response(null, { status: 302, headers: { location: "https://evil.example.test/" } }));
    await expect(session(e.fetcher).listProducts()).rejects.toThrow("Engine answered 302");
    expect(e.requests).toHaveLength(1);
    expect(e.requests[0]!.redirect).toBe("manual");
  });

  it.each([
    ["an error status", () => new Response("boom", { status: 500 })],
    ["a non-JSON body", () => new Response("<html>", { status: 200, headers: { "content-type": "text/html" } })],
    ["broken JSON", () => new Response("{", { status: 200, headers: { "content-type": "application/json" } })],
    ["an oversized body", () => json({ products: [], pad: "x".repeat(1_100_000) })],
    ["a declared oversized body", () => json({}, { headers: { "content-length": "5000000" } })],
    ["the wrong page", () => page([], { page: 2 })],
    ["too many rows", () => page(Array.from({ length: 21 }, (_, i) => row({ id: `p-${i}` })))],
    ["a negative price", () => page([row({ price_cents: -1 })])],
    ["an unknown stock status", () => page([row({ stock_status: "plenty" })])],
    ["an empty name", () => page([row({ name: "  " })])],
    ["an unsafe product id", () => page([row({ id: "../x" })])],
  ])("reports the catalog unavailable on %s", async (_label, respond) => {
    const e = engine(respond);
    await expect(session(e.fetcher).listProducts()).rejects.toThrow("Yaatal catalog unavailable");
  });

  it("reports Engine being down as unavailable", async () => {
    const s = session(async () => { throw new TypeError("network"); });
    await expect(s.listProducts()).rejects.toThrow("Engine did not answer");
  });

  it("derives the stock status when Engine omits it, and floors negative stock at zero", async () => {
    const e = engine(() => page([row({ stock_status: undefined, stock: -2 }), row({ id: "p-2", stock_status: undefined, stock: 40 })]));
    const { products } = await session(e.fetcher).listProducts();
    expect(products.map(p => [p.stock, p.stockStatus])).toEqual([[0, "out_of_stock"], [40, "in_stock"]]);
  });

  it.each([0, -1, 1.5, 10_001])("refuses page %s", async p => {
    const e = engine(() => page([]));
    await expect(session(e.fetcher).listProducts({ page: p })).rejects.toThrow("page must be");
    expect(e.requests).toEqual([]);
  });
});

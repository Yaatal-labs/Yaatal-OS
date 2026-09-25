// Keep identical to types.d.ts (a test enforces it). This is the declaration agents and Gadgets see.
const TYPES_CODE = `/** One product from this deployment's Yaatal catalog. Text fields are plain text: escape them before putting them in HTML. */
export interface CatalogProduct {
  id: string;
  name: string;
  description?: string;
  /** Price in FCFA (whole francs). Never compute or invent prices; show this or priceDisplay. */
  priceFcfa: number;
  /** Price formatted by Yaatal, for example "12 500 FCFA". */
  priceDisplay: string;
  stock: number;
  stockStatus: "in_stock" | "low_stock" | "out_of_stock";
  category?: string;
  /** HTTP(S) image URLs. */
  images: string[];
}

/** One page of the catalog, newest products first. */
export interface CatalogPage {
  products: CatalogProduct[];
  total: number;
  page: number;
  perPage: number;
}

export interface CatalogListOptions {
  /** 1-based page number, 20 products per page. Defaults to 1. */
  page?: number;
  /** Exact category name to filter by. */
  category?: string;
}

/**
 * Read-only access to the active products of the one Yaatal shop this deployment is configured for.
 * There is no way to choose another shop. Throws when the catalog is not configured or not reachable:
 * say the catalog is unavailable, never make products, prices or stock up.
 */
export interface YaatalCatalogSession {
  listProducts(options?: CatalogListOptions): Promise<CatalogPage>;
  /** Throws "Product not found" for an unknown, inactive or other shop's product. */
  getProduct(productId: string): Promise<CatalogProduct>;
}
`;

export default TYPES_CODE;

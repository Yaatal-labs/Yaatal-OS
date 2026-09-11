// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { CatalogPage, CatalogProduct } from "../../contracts";
import { ShopWorkspace, type ShopWorkspaceProps } from "./ShopWorkspace";

const robe: CatalogProduct = { id: "robe", name: "Robe Wax Bleue", description: "Wax indigo", priceFcfa: 12500, priceDisplay: "12,500 FCFA", stock: 8, stockStatus: "in_stock", category: "Mode", images: [] };
const bissap: CatalogProduct = { id: "bissap", name: "Bissap", priceFcfa: 2000, priceDisplay: "2,000 FCFA", stock: 4, stockStatus: "in_stock", category: "Food", images: [] };
const bag: CatalogProduct = { id: "bag", name: "Sac cuir", priceFcfa: 9000, priceDisplay: "9,000 FCFA", stock: 0, stockStatus: "out_of_stock", category: "Mode", images: [] };
const page = (products: CatalogProduct[], pageNumber = 1, total = products.length): CatalogPage => ({ products, total, page: pageNumber, perPage: 2 });
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(next => { resolve = next; }); return { promise, resolve }; }
function props(overrides: Partial<ShopWorkspaceProps> = {}): ShopWorkspaceProps {
  return { catalog: { list: vi.fn().mockResolvedValue(page([robe, bissap])), product: vi.fn().mockResolvedValue(robe) }, selectedProductId: null, onSelectProduct: vi.fn(), onReturnToLive: vi.fn(), onShare: vi.fn(), canShare: true, mode: "native", ...overrides };
}
afterEach(cleanup);

describe("ShopWorkspace", () => {
  it("discards a stale selected-product response", async () => {
    const first = deferred<CatalogProduct>();
    const catalog = { list: vi.fn().mockResolvedValue(page([robe, bag])), product: vi.fn((id: string) => id === "robe" ? first.promise : Promise.resolve(bag)) };
    const view = render(<ShopWorkspace {...props({ catalog })} />);
    await screen.findByRole("button", { name: "Open Robe Wax Bleue" });
    view.rerender(<ShopWorkspace {...props({ catalog, selectedProductId: "robe" })} />);
    await waitFor(() => expect(catalog.product).toHaveBeenCalledWith("robe"));
    view.rerender(<ShopWorkspace {...props({ catalog, selectedProductId: "bag" })} />);
    expect(await screen.findByRole("heading", { name: "Sac cuir" })).toBeTruthy();
    first.resolve(robe);
    await waitFor(() => expect(screen.queryByRole("heading", { name: "Robe Wax Bleue" })).toBeNull());
  });

  it("searches only loaded products and paginates explicitly", async () => {
    const catalog = { list: vi.fn().mockImplementation(({ page: requested = 1 }: { page?: number } = {}) => Promise.resolve(requested === 1 ? page([robe, bissap], 1, 3) : page([bag], 2, 3))), product: vi.fn().mockResolvedValue(robe) };
    render(<ShopWorkspace {...props({ catalog })} />);
    await screen.findByRole("button", { name: "Open Robe Wax Bleue" });
    await userEvent.type(screen.getByLabelText("Search loaded products"), "wax");
    expect(catalog.list).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Showing 1 of 2 loaded products. Search only checks products already loaded.")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Load 1 more" }));
    await waitFor(() => expect(catalog.list).toHaveBeenLastCalledWith({ page: 2 }));
    expect(await screen.findByText("Showing 1 of 3 loaded products. Search only checks products already loaded.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Open Sac cuir" })).toBeNull();
  });

  it("clears a previous category and retries the failed category request", async () => {
    const catalog = { list: vi.fn().mockImplementation(({ category }: { category?: string } = {}) => {
      if (category === "Food" && catalog.list.mock.calls.filter(([args]) => args?.category === "Food").length === 1) return Promise.reject(new Error("Food unavailable"));
      return Promise.resolve(page(category === "Food" ? [bissap] : [robe, bissap]));
    }), product: vi.fn().mockResolvedValue(robe) };
    render(<ShopWorkspace {...props({ catalog })} />);
    await screen.findByRole("button", { name: "Open Robe Wax Bleue" });
    await userEvent.selectOptions(screen.getByLabelText("Category"), "Food");
    expect(await screen.findByText("Food unavailable")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Open Robe Wax Bleue" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(catalog.list).toHaveBeenLastCalledWith({ page: 1, category: "Food" }));
    expect(await screen.findByRole("button", { name: "Open Bissap" })).toBeTruthy();
  });

  it("retries a failed load-more request at its original page", async () => {
    let pageTwoCalls = 0;
    const catalog = { list: vi.fn().mockImplementation(({ page: requested = 1 }: { page?: number } = {}) => {
      if (requested === 2 && pageTwoCalls++ === 0) return Promise.reject(new Error("Page two unavailable"));
      return Promise.resolve(requested === 1 ? page([robe, bissap], 1, 3) : page([bag], 2, 3));
    }), product: vi.fn().mockResolvedValue(robe) };
    render(<ShopWorkspace {...props({ catalog })} />);
    await screen.findByRole("button", { name: "Open Robe Wax Bleue" });
    await userEvent.click(screen.getByRole("button", { name: "Load 1 more" }));
    expect(await screen.findByText("Page two unavailable")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(catalog.list).toHaveBeenLastCalledWith({ page: 2 }));
    expect(await screen.findByRole("button", { name: "Open Sac cuir" })).toBeTruthy();
  });

  it("shows out-of-stock detail truth and leaves sharing disabled even with live authorization", async () => {
    const onShare = vi.fn();
    render(<ShopWorkspace {...props({ selectedProductId: "bag", catalog: { list: vi.fn().mockResolvedValue(page([bag])), product: vi.fn().mockResolvedValue(bag) }, canShare: true, onShare })} />);
    expect(await screen.findByRole("heading", { name: "Sac cuir" })).toBeTruthy();
    expect(screen.getAllByText("Out of stock").length).toBeGreaterThan(0);
    expect((screen.getByRole("button", { name: "Share product" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getAllByText("Out of stock").length).toBeGreaterThan(1);
    expect(onShare).not.toHaveBeenCalled();
  });

  it("does not manufacture catalog data in browser preview", async () => {
    const catalog = { list: vi.fn(), product: vi.fn() };
    render(<ShopWorkspace {...props({ mode: "preview", catalog })} />);
    expect(await screen.findByText(/Catalog browsing is unavailable in browser preview/)).toBeTruthy();
    expect(catalog.list).not.toHaveBeenCalled();
    expect(catalog.product).not.toHaveBeenCalled();
  });
});

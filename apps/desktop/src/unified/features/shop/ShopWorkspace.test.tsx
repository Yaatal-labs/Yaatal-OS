// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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

  it("clears and rejects stale catalog and detail work when the account epoch changes", async () => {
    const oldList = deferred<CatalogPage>(); const newList = deferred<CatalogPage>(); const oldDetail = deferred<CatalogProduct>(); const newDetail = deferred<CatalogProduct>();
    const catalog = { list: vi.fn().mockReturnValueOnce(oldList.promise).mockReturnValueOnce(newList.promise), product: vi.fn().mockReturnValueOnce(oldDetail.promise).mockReturnValueOnce(newDetail.promise) };
    const view = render(<ShopWorkspace {...props({ catalog, accountEpoch: 1, selectedProductId: "robe" })} />);
    await waitFor(() => expect(catalog.product).toHaveBeenCalledWith("robe"));
    view.rerender(<ShopWorkspace {...props({ catalog, accountEpoch: 2, selectedProductId: "bissap" })} />);
    await waitFor(() => expect(catalog.product).toHaveBeenCalledWith("bissap"));
    newList.resolve(page([bissap])); newDetail.resolve(bissap);
    expect(await screen.findByRole("heading", { name: "Bissap" })).toBeTruthy();
    oldList.resolve(page([robe])); oldDetail.resolve(robe);
    await waitFor(() => expect(screen.queryByRole("heading", { name: "Robe Wax Bleue" })).toBeNull());
    expect(screen.queryByRole("button", { name: "Open Robe Wax Bleue" })).toBeNull();
  });

  it("clears account A's search, category, and category metadata before loading account B", async () => {
    const bProduct = { ...bag, id: "b-bag", name: "Binta bag", category: "Binta" };
    const catalog = { list: vi.fn().mockImplementation(({ category }: { category?: string } = {}) => Promise.resolve(category === "Food" ? page([bissap]) : page(catalog.list.mock.calls.length > 2 ? [bProduct] : [robe, bissap]))), product: vi.fn().mockResolvedValue(robe) };
    const view = render(<ShopWorkspace {...props({ catalog, accountEpoch: 1 })} />);
    await screen.findByRole("button", { name: "Open Robe Wax Bleue" });
    await userEvent.type(screen.getByLabelText("Search loaded products"), "bissap");
    await userEvent.selectOptions(screen.getByLabelText("Category"), "Food");
    await screen.findByRole("button", { name: "Open Bissap" });
    view.rerender(<ShopWorkspace {...props({ catalog, accountEpoch: 2 })} />);
    expect(await screen.findByRole("button", { name: "Open Binta bag" })).toBeTruthy();
    expect(catalog.list).toHaveBeenLastCalledWith({ page: 1 });
    expect((screen.getByLabelText("Search loaded products") as HTMLInputElement).value).toBe("");
    expect((screen.getByLabelText("Category") as HTMLSelectElement).value).toBe("");
    expect(screen.queryByRole("option", { name: "Mode" })).toBeNull();
    expect(screen.getByRole("option", { name: "Binta" })).toBeTruthy();
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
    expect((screen.getByRole("button", { name: "Open Commerce Sheet" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("This product is out of stock and cannot be shared.")).toBeTruthy();
    expect(onShare).toHaveBeenCalledTimes(0);
  });

  it("opens Commerce Sheet for the freshly resolved selected product", async () => {
    const onShare = vi.fn();
    render(<ShopWorkspace {...props({ selectedProductId: "robe", onShare, canShare: true })} />);
    await userEvent.click(await screen.findByRole("button", { name: "Open Commerce Sheet" }));
    expect(onShare).toHaveBeenCalledWith("robe");
  });

  it("falls back accessibly when selected product media fails to load", async () => {
    const withImage = { ...robe, images: ["https://catalog.example/robe.jpg"] };
    render(<ShopWorkspace {...props({ selectedProductId: "robe", catalog: { list: vi.fn().mockResolvedValue(page([withImage])), product: vi.fn().mockResolvedValue(withImage) } })} />);
    fireEvent.error(await screen.findByRole("img", { name: "Robe Wax Bleue" }));
    expect(screen.getByRole("img", { name: "Product image unavailable" })).toBeTruthy();
  });

  it("does not manufacture catalog data in browser preview", async () => {
    const catalog = { list: vi.fn(), product: vi.fn() };
    render(<ShopWorkspace {...props({ mode: "preview", catalog })} />);
    expect(await screen.findByText(/Catalog browsing is unavailable in browser preview/)).toBeTruthy();
    expect(catalog.list).toHaveBeenCalledTimes(0);
    expect(catalog.product).toHaveBeenCalledTimes(0);
  });
  it("localizes the selected product commerce sheet", async () => {
    render(<ShopWorkspace {...props({ locale: "fr", selectedProductId: "robe" })} />);
    expect(await screen.findByRole("heading", { name: "Robe Wax Bleue" })).toBeTruthy();
    expect(screen.getByRole("complementary", { name: "Produit sélectionné" })).toBeTruthy();
    expect(screen.getByText("FICHE COMMERCE")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Prêt pour le commerce" })).toBeTruthy();
  });
});

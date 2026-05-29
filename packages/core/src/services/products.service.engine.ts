/**
 * Products Service - Engine HTTP Version
 */

import {
  validatePrice,
  validateProductTitle,
  validateStockQuantity,
  generateSKU,
} from '../utils/validation'
import type { Product, ProductFormData, Profile } from '../types/models'
import { engineRequest, getEngineAuthToken } from './engine.client'

type EngineProduct = {
  id: string
  merchant_id: string
  name: string
  description?: string | null
  price_cents: number
  discount_price_cents?: number | null
  stock: number
  category: string
  images?: string | null
  is_active: boolean
  upvotes: number
  created_at: string
  updated_at?: string | null
}

type EngineProductList = {
  products: EngineProduct[]
  total: number
  page: number
  per_page: number
}

const CATEGORIES: Product['category'][] = [
  'fashion',
  'electronics',
  'beauty',
  'food',
  'home',
  'other',
]

const parseImages = (images?: string | null): string[] => {
  if (!images) return []

  try {
    const parsed = JSON.parse(images)
    if (Array.isArray(parsed)) {
      return parsed.filter((item): item is string => typeof item === 'string')
    }
  } catch {
    // Fall through to treating the value as one URL/path.
  }

  return [images]
}

const sellerProfileFromProduct = (product: EngineProduct): Profile => {
  const now = product.updated_at || product.created_at

  return {
    id: product.merchant_id,
    user_id: product.merchant_id,
    username: 'Vendeur BOBO',
    is_merchant: true,
    level: 1,
    xp: 0,
    streak_days: 0,
    total_posts: 0,
    total_sales: 0,
    created: product.created_at,
    updated: now,
  }
}

export const mapEngineProductToProduct = (product: EngineProduct): Product => {
  const images = parseImages(product.images)
  const category = CATEGORIES.includes(product.category as Product['category'])
    ? (product.category as Product['category'])
    : 'other'

  return {
    id: product.id,
    seller_id: product.merchant_id,
    sku: `ENGINE-${product.id.slice(0, 8)}`,
    title: product.name,
    description: product.description || '',
    price: product.price_cents,
    discount_price: product.discount_price_cents ?? undefined,
    category,
    tags: [],
    image_url: images[0] || '',
    stock_quantity: product.stock,
    upvotes: product.upvotes,
    view_count: 0,
    is_featured: product.upvotes > 5,
    is_active: product.is_active,
    created: product.created_at,
    updated: product.updated_at || product.created_at,
    expand: {
      seller_id: sellerProfileFromProduct(product),
    },
    seller_city: 'Dakar',
  } as Product
}

const productListToPage = (
  response: EngineProductList
): { items: Product[]; totalItems: number; totalPages: number } => {
  return {
    items: response.products.map(mapEngineProductToProduct),
    totalItems: response.total,
    totalPages: Math.ceil(response.total / response.per_page),
  }
}

export class ProductsServiceEngine {
  async getAll(page: number = 1, limit: number = 20): Promise<{
    items: Product[]
    totalItems: number
    totalPages: number
  }> {
    try {
      const params = new URLSearchParams({
        page: String(page),
        per_page: String(limit),
        active_only: 'true',
      })
      const response = await engineRequest<EngineProductList>(
        `/api/products?${params.toString()}`,
        { auth: false }
      )

      return productListToPage(response)
    } catch (error) {
      console.error('Get products error:', error)
      return { items: [], totalItems: 0, totalPages: 0 }
    }
  }

  async getBySeller(sellerId: string, page: number = 1, limit: number = 20) {
    try {
      if (getEngineAuthToken()) {
        const params = new URLSearchParams({
          page: String(page),
          per_page: String(limit),
        })
        const response = await engineRequest<EngineProductList>(
          `/api/merchant/products?${params.toString()}`
        )
        return productListToPage(response)
      }

      const params = new URLSearchParams({
        page: String(page),
        per_page: String(limit),
        merchant_id: sellerId,
        active_only: 'false',
      })
      const response = await engineRequest<EngineProductList>(
        `/api/products?${params.toString()}`,
        { auth: false }
      )

      return productListToPage(response)
    } catch (error) {
      console.error('Get seller products error:', error)
      return { items: [], totalItems: 0, totalPages: 0 }
    }
  }

  async getById(productId: string): Promise<Product | undefined> {
    try {
      const product = await engineRequest<EngineProduct>(
        `/api/products/${encodeURIComponent(productId)}`,
        { auth: false }
      )
      return mapEngineProductToProduct(product)
    } catch (error) {
      console.error('Get product error:', error)
      return undefined
    }
  }

  async search(query: string, page: number = 1, limit: number = 20) {
    try {
      const params = new URLSearchParams({
        page: String(page),
        per_page: String(limit),
        active_only: 'true',
        search: query,
      })
      const response = await engineRequest<EngineProductList>(
        `/api/products?${params.toString()}`,
        { auth: false }
      )

      return productListToPage(response)
    } catch (error) {
      console.error('Search products error:', error)
      return { items: [], totalItems: 0, totalPages: 0 }
    }
  }

  async create(
    _sellerId: string,
    data: ProductFormData
  ): Promise<{
    success: boolean
    product?: Product
    error?: string
  }> {
    try {
      const titleValidation = validateProductTitle(data.title)
      if (!titleValidation.valid) {
        return { success: false, error: titleValidation.error }
      }

      const priceValidation = validatePrice(data.price)
      if (!priceValidation.valid) {
        return { success: false, error: priceValidation.error }
      }

      const stockValidation = validateStockQuantity(data.stock_quantity)
      if (!stockValidation.valid) {
        return { success: false, error: stockValidation.error }
      }

      const created = await engineRequest<EngineProduct>('/api/products', {
        method: 'POST',
        body: JSON.stringify({
          name: data.title.trim(),
          description: data.description?.trim() || null,
          price_cents: data.price,
          discount_price_cents: data.discount_price ?? null,
          stock: data.stock_quantity,
          category: data.category,
          images: data.image_uri
            ? JSON.stringify([data.image_uri, ...(data.video_uri ? [data.video_uri] : [])])
            : null,
        }),
      })

      return {
        success: true,
        product: mapEngineProductToProduct(created),
      }
    } catch (error: any) {
      console.error('Create product error:', error)
      return {
        success: false,
        error: error?.message || 'Erreur lors de la création du produit',
      }
    }
  }

  async update(
    productId: string,
    updates: Partial<ProductFormData>
  ): Promise<{
    success: boolean
    product?: Product
    error?: string
  }> {
    try {
      const updated = await engineRequest<EngineProduct>(
        `/api/products/${encodeURIComponent(productId)}`,
        {
          method: 'PUT',
          body: JSON.stringify({
            name: updates.title?.trim(),
            description: updates.description?.trim(),
            price_cents: updates.price,
            discount_price_cents:
              updates.discount_price === undefined ? undefined : updates.discount_price,
            stock: updates.stock_quantity,
            category: updates.category,
            images:
              updates.image_uri === undefined
                ? undefined
                : updates.image_uri
                ? JSON.stringify([
                    updates.image_uri,
                    ...(updates.video_uri ? [updates.video_uri] : []),
                  ])
                : null,
          }),
        }
      )

      return {
        success: true,
        product: mapEngineProductToProduct(updated),
      }
    } catch (error: any) {
      console.error('Update product error:', error)
      return {
        success: false,
        error: error?.message || 'Erreur lors de la mise à jour du produit',
      }
    }
  }

  async delete(productId: string): Promise<{
    success: boolean
    error?: string
  }> {
    try {
      await engineRequest(`/api/products/${encodeURIComponent(productId)}`, {
        method: 'DELETE',
      })
      return { success: true }
    } catch (error: any) {
      console.error('Delete product error:', error)
      return {
        success: false,
        error: error?.message || 'Erreur lors de la suppression du produit',
      }
    }
  }

  async incrementViews(_productId: string): Promise<void> {
    return undefined
  }

  async toggleUpvote(productId: string, _userId: string): Promise<boolean> {
    try {
      await engineRequest(`/api/products/${encodeURIComponent(productId)}/upvote`, {
        method: 'POST',
        auth: false,
      })
      return true
    } catch (error) {
      console.error('Toggle upvote error:', error)
      return false
    }
  }

  watchAllProducts() {
    return undefined
  }

  watchBySeller(_sellerId: string) {
    return undefined
  }
}

export const productsServiceEngine = new ProductsServiceEngine()
export default productsServiceEngine

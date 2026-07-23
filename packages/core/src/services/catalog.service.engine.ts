/**
 * Catalog Service - Engine SDK Version
 *
 * Public, unauthenticated storefront reads for the BOBO marketplace (`/m` browse,
 * `/i` item). Mirrors products.service.engine.ts but sources data from the Engine's
 * public catalog namespace (`client.catalog`) plus the live-session accessor
 * (`client.liveSessions`). Maps CatalogProduct into the existing `Product` UI model
 * so the storefront screens keep their shape; the raw display fields
 * (price_display / discount_price_display / stock_status / images) ride along on the
 * returned view for screens that want them.
 */

import type {
  CatalogProduct,
  CatalogList,
  ListCatalogParams,
  CurrentSessionProducts,
} from '@yaatal/client'
import type { Product, Profile } from '../types/models'
import { analyticsService } from './analytics.service.engine'
import { getYaatalClient } from './engine.client'

const CATEGORIES: Product['category'][] = [
  'fashion',
  'electronics',
  'beauty',
  'food',
  'home',
  'other',
]

// The mapped storefront product keeps the existing `Product` UI shape and carries
// the Engine's preformatted display fields alongside it.
export type CatalogProductView = Product & {
  price_display: string
  discount_price_display: string | null
  stock_status: string
  images: string[]
}

const sellerProfileFromCatalog = (product: CatalogProduct): Profile => {
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

export const mapCatalogProductToProduct = (
  product: CatalogProduct
): CatalogProductView => {
  const images = product.images || []
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
    // Catalog `images[]` are all images — the contract carries no video field.
    // Leave `video_url` unset so the UI doesn't render a second image as a video.
    video_url: undefined,
    stock_quantity: product.stock,
    upvotes: product.upvotes,
    view_count: 0,
    is_featured: product.upvotes > 5,
    // Catalog only surfaces publicly listed products, so they are active by definition.
    is_active: true,
    created: product.created_at,
    updated: product.updated_at || product.created_at,
    expand: {
      seller_id: sellerProfileFromCatalog(product),
    },
    seller_city: 'Dakar',
    // Engine-preformatted display fields carried through for the storefront UI.
    price_display: product.price_display,
    discount_price_display: product.discount_price_display,
    stock_status: product.stock_status,
    images,
  } as CatalogProductView
}

const catalogListToPage = (
  response: CatalogList
): { items: CatalogProductView[]; totalItems: number; totalPages: number } => {
  const products = response.products || []
  const perPage = response.per_page || products.length || 1

  return {
    items: products.map(mapCatalogProductToProduct),
    totalItems: response.total ?? products.length,
    totalPages: Math.ceil((response.total ?? products.length) / perPage),
  }
}

export class CatalogServiceEngine {
  async listCatalog(params: ListCatalogParams = {}): Promise<{
    items: CatalogProductView[]
    totalItems: number
    totalPages: number
  }> {
    try {
      const response = await getYaatalClient().catalog.list(params)
      return catalogListToPage(response)
    } catch (error) {
      console.error('List catalog error:', error)
      return { items: [], totalItems: 0, totalPages: 0 }
    }
  }

  async getCatalogProduct(id: string): Promise<CatalogProductView | undefined> {
    try {
      const product = await getYaatalClient().catalog.get(id)
      const mapped = mapCatalogProductToProduct(product)
      analyticsService.track({
        event: 'product_view',
        properties: {
          productId: mapped.id,
          sellerId: mapped.seller_id,
          category: mapped.category,
        },
      })
      return mapped
    } catch (error) {
      console.error('Get catalog product error:', error)
      return undefined
    }
  }

  // Live-session accessor (JWT-gated). Returns the current session plus the
  // catalog products pinned to it, mapped into the storefront UI shape.
  async currentSessionProducts(): Promise<{
    session: CurrentSessionProducts['session'] | null
    items: CatalogProductView[]
  }> {
    try {
      const response = await getYaatalClient().liveSessions.currentProducts()
      return {
        session: response.session,
        items: (response.products || []).map(mapCatalogProductToProduct),
      }
    } catch (error) {
      console.error('Current session products error:', error)
      return { session: null, items: [] }
    }
  }
}

export const catalogServiceEngine = new CatalogServiceEngine()
export default catalogServiceEngine

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

const ENGINE_CATEGORY_TO_PRODUCT: Record<string, Product['category']> = {
  fashion: 'fashion',
  clothing: 'fashion',
  leather: 'fashion',
  bags: 'fashion',
  jewelry: 'fashion',
  tech: 'electronics',
  phone: 'electronics',
  electronics: 'electronics',
  cosmetics: 'beauty',
  beauty: 'beauty',
  skincare: 'beauty',
  drinks: 'food',
  food: 'food',
  decor: 'home',
  home: 'home',
}

type DemoCatalogMedia = {
  filename: string
  alt: string
}

// Keep this category contract aligned with Studio's _DEMO_CATEGORY_IMAGES.
// It is deliberately a fallback, never a replacement for merchant media.
const DEMO_MEDIA_BY_CATEGORY: Record<string, DemoCatalogMedia> = {
  tech: {
    filename: 'smartphone.webp',
    alt: 'Generic smartphone on cream studio backdrop',
  },
  phone: {
    filename: 'smartphone.webp',
    alt: 'Generic smartphone on cream studio backdrop',
  },
  fashion: {
    filename: 'bazin_robe.webp',
    alt: 'Indigo bazin robe with gold embroidery',
  },
  clothing: {
    filename: 'bazin_robe.webp',
    alt: 'Indigo bazin robe with gold embroidery',
  },
  leather: {
    filename: 'leather_bag.webp',
    alt: 'Cognac leather satchel with brass clasp',
  },
  bags: {
    filename: 'leather_bag.webp',
    alt: 'Cognac leather satchel with brass clasp',
  },
  jewelry: {
    filename: 'gold_earrings.webp',
    alt: 'Sablé gold filigree earrings on silk',
  },
  drinks: {
    filename: 'bissap.webp',
    alt: 'Bissap hibiscus bottle with dried flowers',
  },
  food: {
    filename: 'bissap.webp',
    alt: 'Bissap hibiscus bottle with dried flowers',
  },
  decor: {
    filename: 'thiote_mat.webp',
    alt: 'Woven thiote mat with geometric pattern',
  },
  home: {
    filename: 'thiote_mat.webp',
    alt: 'Woven thiote mat with geometric pattern',
  },
  cosmetics: {
    filename: 'cosmetics.webp',
    alt: 'Natural cosmetics: black soap serum, shea balm, hibiscus',
  },
  beauty: {
    filename: 'cosmetics.webp',
    alt: 'Natural cosmetics: black soap serum, shea balm, hibiscus',
  },
  skincare: {
    filename: 'cosmetics.webp',
    alt: 'Natural cosmetics: black soap serum, shea balm, hibiscus',
  },
}

export type ResolvedCatalogMedia = {
  images: string[]
  demoVisual: boolean
  imageAlt: string | null
}

export const resolveCatalogMedia = (
  category: string,
  sourceImages: string[] | null | undefined,
  mediaBaseUrl = process.env.EXPO_PUBLIC_CATALOG_MEDIA_BASE_URL
): ResolvedCatalogMedia => {
  const realImages = (sourceImages || []).filter(
    (image): image is string => typeof image === 'string' && image.trim().length > 0
  )
  if (realImages.length > 0) {
    return { images: realImages, demoVisual: false, imageAlt: null }
  }

  const baseUrl = mediaBaseUrl?.trim().replace(/\/+$/, '')
  const fallback = DEMO_MEDIA_BY_CATEGORY[String(category || '').toLowerCase()]
  if (!baseUrl || !fallback) {
    return { images: [], demoVisual: false, imageAlt: null }
  }

  return {
    images: [`${baseUrl}/${fallback.filename}`],
    demoVisual: true,
    imageAlt: fallback.alt,
  }
}

// The mapped storefront product keeps the existing `Product` UI shape and carries
// the Engine's preformatted display fields alongside it.
export type CatalogProductView = Product & {
  price_display: string
  discount_price_display: string | null
  stock_status: string
  images: string[]
  demo_visual: boolean
  image_alt: string | null
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
  const media = resolveCatalogMedia(product.category, product.images)
  const images = media.images
  const rawCategory = String(product.category || '').toLowerCase()
  const category = ENGINE_CATEGORY_TO_PRODUCT[rawCategory]
    || (CATEGORIES.includes(rawCategory as Product['category'])
      ? (rawCategory as Product['category'])
      : 'other')

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
    demo_visual: media.demoVisual,
    image_alt: media.imageAlt,
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

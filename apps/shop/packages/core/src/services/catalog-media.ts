/**
 * Pure catalog-media policy shared by Engine-backed Shop consumers.
 *
 * Merchant-supplied media always wins. The category visual is intentionally a
 * labeled fallback for the existing demo asset pipeline; it never claims to be
 * a merchant photograph.
 */
export type DemoCatalogMedia = {
  filename: string
  alt: string
}

export type ResolvedCatalogMedia = {
  images: string[]
  demoVisual: boolean
  imageAlt: string | null
}

// Keep this category contract aligned with Studio's _DEMO_CATEGORY_IMAGES.
export const DEMO_MEDIA_BY_CATEGORY: Record<string, DemoCatalogMedia> = {
  tech: { filename: 'smartphone.webp', alt: 'Generic smartphone on cream studio backdrop' },
  phone: { filename: 'smartphone.webp', alt: 'Generic smartphone on cream studio backdrop' },
  fashion: { filename: 'bazin_robe.webp', alt: 'Indigo bazin robe with gold embroidery' },
  clothing: { filename: 'bazin_robe.webp', alt: 'Indigo bazin robe with gold embroidery' },
  leather: { filename: 'leather_bag.webp', alt: 'Cognac leather satchel with brass clasp' },
  bags: { filename: 'leather_bag.webp', alt: 'Cognac leather satchel with brass clasp' },
  jewelry: { filename: 'gold_earrings.webp', alt: 'Sablé gold filigree earrings on silk' },
  drinks: { filename: 'bissap.webp', alt: 'Bissap hibiscus bottle with dried flowers' },
  food: { filename: 'bissap.webp', alt: 'Bissap hibiscus bottle with dried flowers' },
  decor: { filename: 'thiote_mat.webp', alt: 'Woven thiote mat with geometric pattern' },
  home: { filename: 'thiote_mat.webp', alt: 'Woven thiote mat with geometric pattern' },
  cosmetics: { filename: 'cosmetics.webp', alt: 'Natural cosmetics: black soap serum, shea balm, hibiscus' },
  beauty: { filename: 'cosmetics.webp', alt: 'Natural cosmetics: black soap serum, shea balm, hibiscus' },
  skincare: { filename: 'cosmetics.webp', alt: 'Natural cosmetics: black soap serum, shea balm, hibiscus' },
}

export function resolveCatalogMedia(
  category: string | null | undefined,
  sourceImages: string[] | null | undefined,
  mediaBaseUrl?: string,
): ResolvedCatalogMedia {
  const images = (sourceImages || []).filter(
    (image): image is string => typeof image === 'string' && image.trim().length > 0,
  )
  if (images.length > 0) return { images, demoVisual: false, imageAlt: null }

  const baseUrl = mediaBaseUrl?.trim().replace(/\/+$/, '')
  const fallback = DEMO_MEDIA_BY_CATEGORY[String(category || '').toLowerCase()]
  if (!baseUrl || !fallback) return { images: [], demoVisual: false, imageAlt: null }

  return {
    images: [`${baseUrl}/${fallback.filename}`],
    demoVisual: true,
    imageAlt: fallback.alt,
  }
}

export type BoboProductLink = {
  type: 'product'
  productId: string
}

const isTolerableRawProductId = (value: string): boolean => {
  return /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value)
}

const fromProductPath = (segments: string[]): BoboProductLink | null => {
  if (segments[0]?.toLowerCase() !== 'product' || !segments[1]) return null

  return {
    type: 'product',
    productId: decodeURIComponent(segments[1]),
  }
}

export const parseBoboProductLink = (
  data: string
): BoboProductLink | null => {
  const value = data.trim()
  if (!value) return null

  try {
    const url = new URL(value)
    const pathSegments = url.pathname.split('/').filter(Boolean)

    if (url.protocol === 'bobo:') {
      if (url.hostname.toLowerCase() === 'product' && pathSegments[0]) {
        return {
          type: 'product',
          productId: decodeURIComponent(pathSegments[0]),
        }
      }

      return fromProductPath(pathSegments)
    }

    if (url.protocol === 'https:') {
      return fromProductPath(pathSegments)
    }
  } catch {
    if (isTolerableRawProductId(value)) {
      return {
        type: 'product',
        productId: value,
      }
    }
  }

  return null
}

import { parseBoboProductLink } from '../../../../packages/core/src/utils/qr'

describe('parseBoboProductLink', () => {
  it('parses bobo product links with host product', () => {
    expect(parseBoboProductLink('bobo://product/abc')).toEqual({
      type: 'product',
      productId: 'abc',
    })
  })

  it('parses HTTPS product links', () => {
    expect(parseBoboProductLink('https://bobo.example/product/prod-123')).toEqual({
      type: 'product',
      productId: 'prod-123',
    })
  })

  it('returns null for invalid URLs', () => {
    expect(parseBoboProductLink('https://bobo.example/category/prod-123')).toBeNull()
    expect(parseBoboProductLink('http://bobo.example/product/prod-123')).toBeNull()
    expect(parseBoboProductLink('https://bobo.example/shop/product/prod-123')).toBeNull()
    expect(parseBoboProductLink('not a product id with spaces')).toBeNull()
  })

  it('accepts raw product IDs as a fallback', () => {
    expect(parseBoboProductLink('raw-product-id')).toEqual({
      type: 'product',
      productId: 'raw-product-id',
    })
  })
})

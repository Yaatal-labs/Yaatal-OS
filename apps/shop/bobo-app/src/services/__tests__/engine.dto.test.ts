import {
  OrdersServiceEngine,
  enrichEngineOrderForBobo,
  mapEngineOrderToOrder,
} from '../../../../packages/core/src/services/orders.service.engine'
import { mapEngineProductToProduct } from '../../../../packages/core/src/services/products.service.engine'
import { ProductsServiceEngine } from '../../../../packages/core/src/services/products.service.engine'
import { mapCatalogProductToProduct } from '../../../../packages/core/src/services/catalog.service.engine'

describe('Engine DTO mapping', () => {
  const getMockClient = () => {
    const { getYaatalClient } = require('../../../../packages/core/src/services/engine.client')
    return getYaatalClient() as any
  }

  const engineOrder = {
    id: 'order-1',
    buyer_id: 'buyer-1',
    seller_id: 'seller-1',
    status: 'pending',
    payment_method: 'wave',
    payment_status: 'paid',
    delivery_method: 'bobo_managed',
    total_cents: 20000,
    items: [
      {
        id: 'item-1',
        product_id: 'product-1',
        quantity: 2,
        unit_price_cents: 10000,
      },
    ],
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-02T00:00:00Z',
  } as any

  it('maps Engine products to BOBO products', () => {
    const product = mapEngineProductToProduct({
      id: 'product-123456',
      merchant_id: 'seller-1',
      name: 'Robe Wax',
      description: 'Tissu wax',
      price_cents: 12000,
      discount_price_cents: 10000,
      stock: 4,
      category: 'fashion',
      images: JSON.stringify([
        'https://cdn.example/product.jpg',
        'https://cdn.example/product.mp4',
      ]),
      is_active: true,
      upvotes: 7,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-02T00:00:00Z',
    })

    expect(product).toMatchObject({
      id: 'product-123456',
      seller_id: 'seller-1',
      title: 'Robe Wax',
      price: 12000,
      discount_price: 10000,
      stock_quantity: 4,
      image_url: 'https://cdn.example/product.jpg',
      video_url: 'https://cdn.example/product.mp4',
      category: 'fashion',
    })
    expect(product.expand?.seller_id?.id).toBe('seller-1')
  })

  it('adds an explicitly marked OS demo visual only when catalog media is empty', () => {
    const previousBaseUrl = process.env.EXPO_PUBLIC_CATALOG_MEDIA_BASE_URL
    process.env.EXPO_PUBLIC_CATALOG_MEDIA_BASE_URL = '/shop/catalog-media'
    try {
      const product = mapCatalogProductToProduct({
        id: 'prod_infinix_hot',
        merchant_id: 'seller-1',
        name: 'Infinix Hot 40i',
        description: null,
        price_cents: 95000,
        price_display: '95 000 FCFA',
        discount_price_cents: null,
        discount_price_display: null,
        stock: 22,
        stock_status: 'in_stock',
        category: 'tech',
        images: [],
        upvotes: 0,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-02T00:00:00Z',
      } as any)

      expect(product.id).toBe('prod_infinix_hot')
      expect(product.image_url).toBe('/shop/catalog-media/smartphone.webp')
      expect(product.images).toEqual(['/shop/catalog-media/smartphone.webp'])
      expect(product.category).toBe('electronics')
      expect(product.demo_visual).toBe(true)
      expect(product.image_alt).toBe('Generic smartphone on cream studio backdrop')
    } finally {
      if (previousBaseUrl === undefined) {
        delete process.env.EXPO_PUBLIC_CATALOG_MEDIA_BASE_URL
      } else {
        process.env.EXPO_PUBLIC_CATALOG_MEDIA_BASE_URL = previousBaseUrl
      }
    }
  })

  it('never replaces merchant catalog media with a demo visual', () => {
    const previousBaseUrl = process.env.EXPO_PUBLIC_CATALOG_MEDIA_BASE_URL
    process.env.EXPO_PUBLIC_CATALOG_MEDIA_BASE_URL = '/shop/catalog-media'
    try {
      const product = mapCatalogProductToProduct({
        id: 'prod_ankara_dress',
        merchant_id: 'seller-1',
        name: 'Robe Ankara',
        description: null,
        price_cents: 22000,
        price_display: '22 000 FCFA',
        discount_price_cents: null,
        discount_price_display: null,
        stock: 10,
        stock_status: 'in_stock',
        category: 'fashion',
        images: ['https://cdn.example/merchant-robe.webp'],
        upvotes: 0,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-02T00:00:00Z',
      } as any)

      expect(product.images).toEqual(['https://cdn.example/merchant-robe.webp'])
      expect(product.image_url).toBe('https://cdn.example/merchant-robe.webp')
      expect(product.demo_visual).toBe(false)
      expect(product.image_alt).toBeNull()
    } finally {
      if (previousBaseUrl === undefined) {
        delete process.env.EXPO_PUBLIC_CATALOG_MEDIA_BASE_URL
      } else {
        process.env.EXPO_PUBLIC_CATALOG_MEDIA_BASE_URL = previousBaseUrl
      }
    }
  })

  it('searches products through the Engine SDK search surface', async () => {
    const client = getMockClient()
    client.products.list = jest.fn()
    client.search.products = jest.fn(async () => ({
      products: [
        {
          id: 'product-123456',
          merchant_id: 'seller-1',
          name: 'Robe Wax',
          description: 'Tissu wax',
          price_cents: 12000,
          discount_price_cents: null,
          stock: 4,
          category: 'fashion',
          images: JSON.stringify(['https://cdn.example/product.jpg']),
          is_active: true,
          upvotes: 7,
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-02T00:00:00Z',
        },
      ],
      total: 1,
      page: 1,
      per_page: 20,
    }))

    const service = new ProductsServiceEngine()
    const page = await service.search('robe', 1, 20, { category: 'fashion' })

    expect(client.search.products).toHaveBeenCalledWith({
      query: 'robe',
      q: 'robe',
      page: 1,
      per_page: 20,
      category: 'fashion',
    })
    expect(client.products.list).not.toHaveBeenCalled()
    expect(page.items).toHaveLength(1)
    expect(page.items[0].title).toBe('Robe Wax')
  })

  it('maps Engine paid pending orders to BOBO paid orders', () => {
    const order = mapEngineOrderToOrder(engineOrder)

    expect(order).toMatchObject({
      id: 'order-1',
      buyer_id: 'buyer-1',
      seller_id: 'seller-1',
      product_id: 'product-1',
      quantity: 2,
      unit_price: 10000,
      total_price: 20000,
      status: 'paid',
      payment_method: 'wave',
    })
    expect(order.expand?.product_id).toMatchObject({
      id: 'product-1',
      title: 'Produit BOBO',
      image_url: '',
    })
    expect(order.phone_number).toBe('')
    expect(order.shipping_address).toBeUndefined()
  })

  it('hydrates Engine orders with product and delivery details for BOBO screens', async () => {
    const client = getMockClient()
    client.products.get = jest.fn(async () => ({
      id: 'product-1',
      merchant_id: 'seller-1',
      name: 'Sac Wax',
      description: 'Sac fait main',
      price_cents: 10000,
      discount_price_cents: null,
      stock: 3,
      category: 'fashion',
      images: JSON.stringify(['https://cdn.example/sac.jpg']),
      is_active: true,
      upvotes: 1,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-02T00:00:00Z',
    }))
    client.delivery.list = jest.fn(async () => [
      {
        id: 'delivery-1',
        order_id: 'order-1',
        buyer_id: 'buyer-1',
        seller_id: 'seller-1',
        method: 'bobo_managed',
        status: 'accepted',
        pickup_address: null,
        dropoff_address: 'Plateau, Dakar',
        dropoff_lat: null,
        dropoff_lng: null,
        phone_number: '+221771234567',
        notes: 'Appeler en arrivant',
        proof_note: null,
        confirmed_at: null,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-02T00:00:00Z',
      },
    ])

    const order = await enrichEngineOrderForBobo(engineOrder)

    expect(client.products.get).toHaveBeenCalledWith('product-1')
    expect(client.delivery.list).toHaveBeenCalledWith({
      order_id: 'order-1',
      limit: 1,
    })
    expect(order.expand?.product_id).toMatchObject({
      id: 'product-1',
      title: 'Sac Wax',
      image_url: 'https://cdn.example/sac.jpg',
    })
    expect(order.shipping_address).toBe('Plateau, Dakar')
    expect(order.phone_number).toBe('+221771234567')
    expect(order.delivery_status).toBe('assigned')
  })

  it('lists buyer orders through the scoped Engine me endpoint', async () => {
    const client = getMockClient()
    client.orders.list = jest.fn()
    client.orders.me = jest.fn(async () => ({
      orders: [engineOrder],
      total: 1,
      page: 1,
      per_page: 20,
    }))
    client.products.get = jest.fn(async () => undefined)
    client.delivery.list = jest.fn(async () => [])

    const service = new OrdersServiceEngine()
    const page = await service.getOrdersByBuyer('buyer-1', 1, 20)

    expect(client.orders.me).toHaveBeenCalledWith({
      page: 1,
      per_page: 20,
    })
    expect(client.orders.list).not.toHaveBeenCalled()
    expect(page.items).toHaveLength(1)
  })
})

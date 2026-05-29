import { mapEngineOrderToOrder } from '../../../../packages/core/src/services/orders.service.engine'
import { mapEngineProductToProduct } from '../../../../packages/core/src/services/products.service.engine'

describe('Engine DTO mapping', () => {
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
      images: JSON.stringify(['https://cdn.example/product.jpg']),
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
      category: 'fashion',
    })
    expect(product.expand?.seller_id?.id).toBe('seller-1')
  })

  it('maps Engine paid pending orders to BOBO paid orders', () => {
    const order = mapEngineOrderToOrder({
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
    })

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
  })
})

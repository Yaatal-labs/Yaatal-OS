/**
 * AI Service Engine Tests
 */

import { AIServiceEngine } from '../../../../packages/core/src/services/ai.service.engine'

// Mock the engine.client module
jest.mock('../../../../packages/core/src/services/engine.client', () => {
  return {
    getYaatalClient: jest.fn(),
    engineRequest: jest.fn(),
    getEngineApiUrl: jest.fn(() => 'http://localhost:5150'),
    setEngineApiUrl: jest.fn(),
    setEngineAuthToken: jest.fn(),
    getEngineAuthToken: jest.fn(() => null),
  }
})

// Mock the products mapping
jest.mock('../../../../packages/core/src/services/products.service.engine', () => ({
  mapEngineProductToProduct: jest.fn((product: any) => ({
    id: product.id,
    seller_id: product.merchant_id,
    sku: `ENGINE-${product.id?.slice(0, 8)}`,
    title: product.name,
    description: product.description || '',
    price: product.price_cents,
    category: 'other',
    image_url: '',
    stock_quantity: product.stock || 0,
    upvotes: product.upvotes || 0,
    view_count: 0,
    is_featured: false,
    is_active: true,
    created: product.created_at || '2025-01-01T00:00:00Z',
    updated: product.updated_at || product.created_at || '2025-01-01T00:00:00Z',
  })),
}))

import { getYaatalClient, engineRequest } from '../../../../packages/core/src/services/engine.client'

describe('AIServiceEngine', () => {
  let service: AIServiceEngine

  beforeEach(() => {
    jest.clearAllMocks()
    jest.spyOn(console, 'warn').mockImplementation(() => {})
    service = new AIServiceEngine()
  })

  afterEach(() => {
    ;(console.warn as jest.Mock).mockRestore?.()
  })

  describe('search', () => {
    it('should map Engine search results to ProductSearchResult[]', async () => {
      const mockSearchResponse = {
        products: [
          {
            id: 'prod-1',
            name: 'iPhone 15',
            description: 'Smartphone',
            price_cents: 500000,
            merchant_id: 'merch-1',
            stock: 10,
            upvotes: 5,
            created_at: '2025-01-01T00:00:00Z',
            updated_at: '2025-01-01T00:00:00Z',
            score: 0.95,
          },
        ],
        total: 1,
      }

      ;(getYaatalClient as jest.Mock).mockReturnValue({})
      ;(engineRequest as jest.Mock).mockResolvedValue(mockSearchResponse)

      const results = await service.search('phone')

      expect(results).toHaveLength(1)
      expect(results[0].product.id).toBe('prod-1')
      expect(results[0].product.title).toBe('iPhone 15')
      expect(results[0].product.price).toBe(500000)
      expect(results[0].score).toBe(0.95)
    })

    it('should return all products when query is empty', async () => {
      const mockSearchResponse = {
        products: [
          {
            id: 'prod-1',
            name: 'Product 1',
            price_cents: 1000,
            merchant_id: 'merch-1',
            created_at: '2025-01-01T00:00:00Z',
          },
          {
            id: 'prod-2',
            name: 'Product 2',
            price_cents: 2000,
            merchant_id: 'merch-2',
            created_at: '2025-01-01T00:00:00Z',
          },
        ],
        total: 2,
      }

      ;(getYaatalClient as jest.Mock).mockReturnValue({})
      ;(engineRequest as jest.Mock).mockResolvedValue(mockSearchResponse)

      const results = await service.search('')

      expect(results).toHaveLength(2)
      expect(results[0].product.title).toBe('Product 1')
      expect(results[1].product.title).toBe('Product 2')
    })
  })

  describe('chat', () => {
    it('should POST to /api/ai/chat/sync and return text response', async () => {
      ;(getYaatalClient as jest.Mock).mockReturnValue({})
      ;(engineRequest as jest.Mock).mockResolvedValue({
        response: 'This is the AI response',
      })

      const messages = [
        { role: 'user' as const, content: 'Hello' },
      ]

      const result = await service.chat(messages)

      expect(engineRequest).toHaveBeenCalledWith(
        '/api/ai/chat/sync',
        expect.objectContaining({
          method: 'POST',
        })
      )
      expect(result).toBe('This is the AI response')
    })
  })

  describe('voiceSearch', () => {
    it('should POST to /api/voice/transcribe and return transcription text', async () => {
      ;(getYaatalClient as jest.Mock).mockReturnValue({})
      ;(engineRequest as jest.Mock).mockResolvedValue({
        text: 'Transcribed audio text',
      })

      const result = await service.voiceSearch('base64-audio-data')

      expect(engineRequest).toHaveBeenCalledWith(
        '/api/voice/transcribe',
        expect.objectContaining({
          method: 'POST',
        })
      )
      expect(result).toBe('Transcribed audio text')
    })
  })

  describe('Engine unreachable', () => {
    it('should return empty results, not throw', async () => {
      ;(getYaatalClient as jest.Mock).mockReturnValue({})
      ;(engineRequest as jest.Mock).mockRejectedValue(new Error('Network error'))

      const searchResults = await service.search('phone')
      expect(searchResults).toEqual([])

      const chatResult = await service.chat([{ role: 'user', content: 'hi' }])
      expect(chatResult).toBe('')

      const voiceResult = await service.voiceSearch('audio')
      expect(voiceResult).toBe('')
    })
  })

  describe('visualSearch', () => {
    it('should throw "not implemented"', async () => {
      await expect(service.visualSearch()).rejects.toThrow('not implemented')
    })
  })
})
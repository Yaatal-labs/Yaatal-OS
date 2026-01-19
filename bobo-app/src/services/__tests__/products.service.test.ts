/**
 * Products Service Tests (PowerSync Version)
 * Testing CRUD operations, SKU generation, search, and upvote functionality
 */

import { ProductsService } from '@njooba/core'

// Mock PowerSync service
jest.mock('@njooba/core/lib/powersync/service', () => ({
  powerSyncService: {
    executeQuery: jest.fn(),
    executeWrite: jest.fn(),
    executeInsert: jest.fn(),
    executeUpdate: jest.fn(),
    executeDelete: jest.fn(),
  },
}))

// Mock validation utilities
jest.mock('@njooba/core/utils/validation', () => ({
  validateProductTitle: jest.fn(() => ({ valid: true })),
  validatePrice: jest.fn(() => ({ valid: true })),
  validateStockQuantity: jest.fn(() => ({ valid: true })),
  validateSKU: jest.fn(() => ({ valid: true })),
  generateSKU: jest.fn(() => 'BOBO-TEST-ABC1'),
}))

describe('ProductsService', () => {
  let service: ProductsService
  let mockPowerSync: any

  beforeEach(() => {
    jest.clearAllMocks()
    service = new ProductsService()

    // Get the mocked powerSyncService
    const { powerSyncService } = require('@njooba/core/lib/powersync/service')
    mockPowerSync = powerSyncService
  })

  describe('getAll', () => {
    it('should retrieve all active products with pagination', async () => {
      const mockProducts = [
        {
          id: 'prod1',
          title: 'Product 1',
          price: 1000,
          is_active: 1,
          stock_quantity: 10,
          seller_id: 'seller1',
        },
        {
          id: 'prod2',
          title: 'Product 2',
          price: 2000,
          is_active: 1,
          stock_quantity: 5,
          seller_id: 'seller2',
        },
      ]

      mockPowerSync.executeQuery
        .mockResolvedValueOnce(mockProducts) // First call for products
        .mockResolvedValueOnce([{ count: 2 }]) // Second call for count

      // Mock seller profile queries
      mockPowerSync.executeQuery.mockResolvedValue({
        address: 'Test Address',
        city: 'Dakar',
      })

      const result = await service.getAll(1, 20)

      expect(result.items).toHaveLength(2)
      expect(result.totalItems).toBe(2)
      expect(result.totalPages).toBe(1)
    })

    it('should handle pagination parameters', async () => {
      mockPowerSync.executeQuery
        .mockResolvedValueOnce([]) // Products query
        .mockResolvedValueOnce([{ count: 100 }]) // Count query

      await service.getAll(2, 20)

      // Verify executeQuery was called with LIMIT and OFFSET
      const firstCall = mockPowerSync.executeQuery.mock.calls[0]
      expect(firstCall[0]).toContain('LIMIT ? OFFSET ?')
      expect(firstCall[1]).toEqual([20, 20]) // LIMIT 20, OFFSET 20 for page 2
    })

    it('should return empty array on error', async () => {
      mockPowerSync.executeQuery.mockRejectedValue(new Error('Database error'))

      const result = await service.getAll()

      expect(result.items).toEqual([])
      expect(result.totalItems).toBe(0)
      expect(result.totalPages).toBe(0)
    })
  })

  describe('getBySeller', () => {
    it('should retrieve products for specific seller', async () => {
      const sellerId = 'seller123'
      const mockProducts = [
        { id: 'prod1', seller_id: sellerId, title: 'Seller Product' },
      ]

      mockPowerSync.executeQuery
        .mockResolvedValueOnce(mockProducts) // Products query
        .mockResolvedValueOnce([{ count: 1 }]) // Count query

      const result = await service.getBySeller(sellerId)

      expect(result.items).toHaveLength(1)
      expect(result.items[0].seller_id).toBe(sellerId)
    })

    it('should filter by seller_id correctly', async () => {
      const sellerId = 'seller456'
      mockPowerSync.executeQuery
        .mockResolvedValueOnce([]) // Products query
        .mockResolvedValueOnce([{ count: 0 }]) // Count query

      await service.getBySeller(sellerId)

      // Verify the first query was called with the correct sellerId
      const firstCall = mockPowerSync.executeQuery.mock.calls[0]
      expect(firstCall[0]).toContain('seller_id = ?')
      expect(firstCall[1][0]).toBe(sellerId) // First parameter is sellerId
    })
  })

  describe('getById', () => {
    it('should retrieve product by ID', async () => {
      const mockProduct = {
        id: 'prod123',
        title: 'Test Product',
        price: 5000,
        seller_id: 'seller1',
      }

      mockPowerSync.executeQuery.mockResolvedValue([mockProduct])

      const result = await service.getById('prod123')

      expect(result).toEqual(mockProduct)
    })

    it('should return null on error', async () => {
      mockPowerSync.executeQuery.mockRejectedValue(new Error('Product not found'))

      const result = await service.getById('invalid')

      expect(result).toBeNull()
    })

    it('should query by product ID', async () => {
      mockPowerSync.executeQuery.mockResolvedValue([{}])

      await service.getById('prod123')

      // Verify the query used product ID
      const firstCall = mockPowerSync.executeQuery.mock.calls[0]
      expect(firstCall[0]).toContain('WHERE id = ?')
      expect(firstCall[1][0]).toBe('prod123')
    })
  })

  describe('search', () => {
    it('should search products by title and description', async () => {
      const mockProducts = [
        { id: 'prod1', title: 'Red Dress', description: 'Beautiful red dress', seller_id: 'seller1' },
      ]

      mockPowerSync.executeQuery
        .mockResolvedValueOnce(mockProducts) // Search results
        .mockResolvedValueOnce([{ count: 1 }]) // Count

      const result = await service.search('red', 1, 20)

      expect(result.items).toHaveLength(1)
      expect(result.totalItems).toBe(1)
    })

    it('should include search query in WHERE clause', async () => {
      mockPowerSync.executeQuery
        .mockResolvedValueOnce([]) // Search results
        .mockResolvedValueOnce([{ count: 0 }]) // Count

      await service.search('test query')

      // Verify search query is in WHERE clause
      const firstCall = mockPowerSync.executeQuery.mock.calls[0]
      expect(firstCall[0]).toContain('WHERE')
      expect(firstCall[0]).toContain('LIKE ?') // SQL LIKE for search
      expect(firstCall[1][0]).toContain('test query')
    })

    it('should return empty on search error', async () => {
      mockPowerSync.executeQuery.mockRejectedValue(new Error('Search failed'))

      const result = await service.search('test')

      expect(result.items).toEqual([])
      expect(result.totalItems).toBe(0)
    })
  })

  describe('create', () => {
    it('should create product with valid data', async () => {
      mockPowerSync.executeWrite.mockResolvedValue(undefined)

      const result = await service.create('seller123', {
        title: 'New Product',
        price: 5000,
        stock_quantity: 10,
        category: 'fashion',
        image_uri: 'file:///image.jpg',
      })

      expect(result.success).toBe(true)
      expect(result.product?.title).toBe('New Product')
      expect(result.product?.price).toBe(5000)
    })

    it('should generate unique SKU', async () => {
      mockPowerSync.executeWrite.mockResolvedValue(undefined)
      const { generateSKU: mockGenerateSKU } = require('@njooba/core/utils/validation')

      await service.create('seller123', {
        title: 'Product',
        price: 1000,
        stock_quantity: 5,
        category: 'electronics',
        image_uri: 'file:///image.jpg',
      })

      expect(mockGenerateSKU).toHaveBeenCalledWith('BOBO')
    })

    it('should include optional video upload', async () => {
      mockPowerSync.executeWrite.mockResolvedValue(undefined)

      const result = await service.create('seller123', {
        title: 'Video Product',
        price: 5000,
        stock_quantity: 5,
        category: 'fashion',
        image_uri: 'file:///image.jpg',
        video_uri: 'file:///video.mp4',
      })

      expect(result.success).toBe(true)
      expect(result.product?.video_url).toBe('file:///video.mp4')
    })

    it('should handle validation error on invalid title', async () => {
      const { validateProductTitle: mockValidateProductTitle } = require('@njooba/core/utils/validation')
      mockValidateProductTitle.mockReturnValueOnce({
        valid: false,
        error: 'Title too short',
      })

      const result = await service.create('seller123', {
        title: 'x',
        price: 5000,
        stock_quantity: 5,
        category: 'fashion',
        image_uri: 'file:///image.jpg',
      })

      expect(result.success).toBe(false)
      expect(result.error).toBeTruthy()
    })

    it('should handle validation error on invalid price', async () => {
      const { validatePrice: mockValidatePrice, validateProductTitle: mockValidateProductTitle } = require('@njooba/core/utils/validation')

      mockValidateProductTitle.mockReturnValueOnce({ valid: true })
      mockValidatePrice.mockReturnValueOnce({
        valid: false,
        error: 'Price must be positive',
      })

      const result = await service.create('seller123', {
        title: 'Product',
        price: -100,
        stock_quantity: 5,
        category: 'fashion',
        image_uri: 'file:///image.jpg',
      })

      expect(result.success).toBe(false)
      expect(result.error).toBeTruthy()
    })

    it('should require product image', async () => {
      const result = await service.create('seller123', {
        title: 'Product',
        price: 5000,
        stock_quantity: 5,
        category: 'fashion',
      })

      expect(result.success).toBe(false)
      expect(result.error).toContain('image')
    })

    it('should handle creation errors', async () => {
      mockPowerSync.executeWrite.mockRejectedValue(new Error('Database error'))

      const result = await service.create('seller123', {
        title: 'Product',
        price: 5000,
        stock_quantity: 5,
        category: 'fashion',
        image_uri: 'file:///image.jpg',
      })

      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
    })
  })

  describe('update', () => {
    it('should update product with valid data', async () => {
      mockPowerSync.executeWrite.mockResolvedValue(undefined)
      mockPowerSync.executeQuery.mockResolvedValue([
        {
          id: 'prod123',
          title: 'Updated Product',
          price: 6000,
          seller_id: 'seller1',
        },
      ])

      const result = await service.update('prod123', {
        title: 'Updated Product',
        price: 6000,
      })

      expect(result.success).toBe(true)
      expect(result.product?.title).toBe('Updated Product')
    })

    it('should validate fields before updating', async () => {
      const { validatePrice: mockValidatePrice } = require('@njooba/core/utils/validation')
      mockValidatePrice.mockReturnValueOnce({
        valid: false,
        error: 'Invalid price',
      })

      const result = await service.update('prod123', {
        price: -500,
      })

      expect(result.success).toBe(false)
      expect(result.error).toBeTruthy()
    })

    it('should handle partial updates', async () => {
      mockPowerSync.executeWrite.mockResolvedValue(undefined)
      mockPowerSync.executeQuery.mockResolvedValue([
        { id: 'prod123', title: 'New Title', seller_id: 'seller1' },
      ])

      await service.update('prod123', {
        title: 'New Title',
      })

      expect(mockPowerSync.executeWrite).toHaveBeenCalled()
    })
  })

  describe('delete', () => {
    it('should soft delete product', async () => {
      mockPowerSync.executeWrite.mockResolvedValue(undefined)

      const result = await service.delete('prod123')

      expect(result.success).toBe(true)
      expect(mockPowerSync.executeWrite).toHaveBeenCalled()

      // Verify the update query sets is_active to 0 (false)
      const updateCall = mockPowerSync.executeWrite.mock.calls[0]
      expect(updateCall[0]).toContain('is_active = 0')
    })

    it('should handle delete errors', async () => {
      mockPowerSync.executeWrite.mockRejectedValue(new Error('Database error'))

      const result = await service.delete('prod123')

      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
    })
  })

  describe('incrementViews', () => {
    it('should increment view count', async () => {
      mockPowerSync.executeQuery.mockResolvedValueOnce([
        { id: 'prod123', view_count: 5 },
      ])
      mockPowerSync.executeWrite.mockResolvedValue(undefined)

      await service.incrementViews('prod123')

      expect(mockPowerSync.executeWrite).toHaveBeenCalled()

      // Verify the update incremented the count
      const updateCall = mockPowerSync.executeWrite.mock.calls[0]
      expect(updateCall[0]).toContain('view_count')
    })

    it('should initialize view count to 1 if not exists', async () => {
      mockPowerSync.executeQuery.mockResolvedValueOnce([
        { id: 'prod123' }, // No view_count field
      ])
      mockPowerSync.executeWrite.mockResolvedValue(undefined)

      await service.incrementViews('prod123')

      expect(mockPowerSync.executeWrite).toHaveBeenCalled()
    })
  })

  describe('toggleUpvote', () => {
    it('should add upvote if not already upvoted', async () => {
      const userId = 'user123'
      const productId = 'prod123'

      // First call checks if upvote exists (returns empty)
      mockPowerSync.executeQuery.mockResolvedValueOnce([])
      mockPowerSync.executeWrite.mockResolvedValue(undefined)

      const result = await service.toggleUpvote(productId, userId)

      expect(result).toBe(true)
      expect(mockPowerSync.executeWrite).toHaveBeenCalled()

      // Verify INSERT was called for upvote
      const calls = mockPowerSync.executeWrite.mock.calls
      expect(calls.some((call: any[]) => call[0].includes('INSERT INTO upvotes'))).toBe(true)
    })

    it('should remove upvote if already upvoted', async () => {
      const userId = 'user123'
      const productId = 'prod123'

      // First call checks if upvote exists (returns one record)
      mockPowerSync.executeQuery.mockResolvedValueOnce([
        { id: 'upvote123', user_id: userId, post_id: productId },
      ])
      mockPowerSync.executeWrite.mockResolvedValue(undefined)

      const result = await service.toggleUpvote(productId, userId)

      expect(result).toBe(false)
      expect(mockPowerSync.executeWrite).toHaveBeenCalled()

      // Verify DELETE was called for upvote
      const calls = mockPowerSync.executeWrite.mock.calls
      expect(calls.some((call: any[]) => call[0].includes('DELETE FROM upvotes'))).toBe(true)
    })

    it('should prevent upvotes from going negative', async () => {
      const userId = 'user123'
      const productId = 'prod123'

      // Check if upvote exists (returns one record)
      mockPowerSync.executeQuery.mockResolvedValueOnce([
        { id: 'upvote123', user_id: userId, post_id: productId },
      ])
      mockPowerSync.executeWrite.mockResolvedValue(undefined)

      await service.toggleUpvote(productId, userId)

      // Verify update uses MAX(0, ...) to prevent negative values
      const calls = mockPowerSync.executeWrite.mock.calls
      const updateCall = calls.find((call: any[]) => call[0].includes('UPDATE products'))
      expect(updateCall?.[0]).toContain('MAX(0')
    })

    it('should handle upvote errors gracefully', async () => {
      mockPowerSync.executeQuery.mockRejectedValue(new Error('Database error'))

      const result = await service.toggleUpvote('prod123', 'user123')

      expect(result).toBe(false)
    })
  })
})

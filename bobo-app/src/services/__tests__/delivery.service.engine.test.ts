/**
 * Delivery Service Engine Tests
 */

import { DeliveryServiceEngine } from '../../../../packages/core/src/services/delivery.service.engine'

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

import { getYaatalClient, engineRequest } from '../../../../packages/core/src/services/engine.client'

describe('DeliveryServiceEngine', () => {
  let service: DeliveryServiceEngine

  beforeEach(() => {
    jest.clearAllMocks()
    jest.spyOn(console, 'warn').mockImplementation(() => {})
    service = new DeliveryServiceEngine()
  })

  afterEach(() => {
    ;(console.warn as jest.Mock).mockRestore?.()
  })

  describe('createDeliveryRequest', () => {
    it('should POST to /api/deliveries and map to DeliveryRequest', async () => {
      const mockDelivery = {
        id: 'del-1',
        order_id: 'order-123',
        merchant_id: 'merch-1',
        method: 'bobo_managed',
        status: 'pending_dispatch',
        dropoff_address: '123 Dakar',
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z',
      }

      ;(getYaatalClient as jest.Mock).mockReturnValue({})
      ;(engineRequest as jest.Mock).mockResolvedValue(mockDelivery)

      const result = await service.createDeliveryRequest('order-123', '123 Dakar', '770000000')

      expect(result).not.toBeNull()
      expect(result!.id).toBe('del-1')
      expect(result!.order_id).toBe('order-123')
      expect(result!.merchant_id).toBe('merch-1')
      expect(result!.delivery_method).toBe('bobo_managed')
      expect(result!.delivery_status).toBe('pending_dispatch')
      expect(result!.dropoff_address).toBe('123 Dakar')
    })
  })

  describe('getDeliveryByOrder', () => {
    it('should GET /api/deliveries?order_id=X and map to Delivery', async () => {
      const mockResponse = {
        deliveries: [
          {
            id: 'del-2',
            order_id: 'order-456',
            merchant_id: 'merch-2',
            method: 'bobo_managed',
            status: 'in_transit',
            dropoff_address: '456 Thies',
            created_at: '2025-01-01T00:00:00Z',
            updated_at: '2025-01-01T01:00:00Z',
          },
        ],
      }

      ;(getYaatalClient as jest.Mock).mockReturnValue({})
      ;(engineRequest as jest.Mock).mockResolvedValue(mockResponse)

      const result = await service.getDeliveryByOrder('order-456')

      expect(result).not.toBeNull()
      expect(result!.id).toBe('del-2')
      expect(result!.order_id).toBe('order-456')
      expect(result!.delivery_status).toBe('in_transit')
    })
  })

  describe('confirmDelivery', () => {
    it('should POST to /api/deliveries/confirm-by-code and return result', async () => {
      const mockConfirmResponse = {
        confirmed: true,
        delivery: {
          id: 'del-3',
          order_id: 'order-789',
          status: 'delivered',
          method: 'bobo_managed',
          created_at: '2025-01-01T00:00:00Z',
          updated_at: '2025-01-01T02:00:00Z',
        },
        message: 'Delivery confirmed successfully',
      }

      ;(getYaatalClient as jest.Mock).mockReturnValue({})
      ;(engineRequest as jest.Mock).mockResolvedValue(mockConfirmResponse)

      const result = await service.confirmDelivery('ABC123')

      expect(result.confirmed).toBe(true)
      expect(result.delivery).toBeDefined()
      expect(result.delivery!.id).toBe('del-3')
      expect(result.delivery!.delivery_status).toBe('delivered')
      expect(result.message).toBe('Delivery confirmed successfully')
    })
  })

  describe('updateDeliveryStatus', () => {
    it('should PATCH /api/deliveries/{id}/status', async () => {
      const mockUpdated = {
        id: 'del-4',
        order_id: 'order-999',
        status: 'in_transit',
        method: 'bobo_managed',
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T03:00:00Z',
      }

      ;(getYaatalClient as jest.Mock).mockReturnValue({})
      ;(engineRequest as jest.Mock).mockResolvedValue(mockUpdated)

      const result = await service.updateDeliveryStatus('del-4', 'in_transit')

      expect(result).not.toBeNull()
      expect(result!.id).toBe('del-4')
      expect(result!.delivery_status).toBe('in_transit')
    })
  })

  describe('marketplace stubs', () => {
    it('should throw "pending Engine marketplace" for all marketplace methods', async () => {
      await expect(service.getMerchantPreferences()).rejects.toThrow('pending Engine marketplace')
      await expect(service.updateMerchantPreferences()).rejects.toThrow('pending Engine marketplace')
      await expect(service.getDeliveryQuote()).rejects.toThrow('pending Engine marketplace')
      await expect(service.getAvailableDeliveryPersons()).rejects.toThrow('pending Engine marketplace')
      await expect(service.registerDeliveryPerson()).rejects.toThrow('pending Engine marketplace')
      await expect(service.assignDelivery()).rejects.toThrow('pending Engine marketplace')
    })
  })

  describe('Engine unreachable', () => {
    it('should return null/empty, not throw', async () => {
      ;(getYaatalClient as jest.Mock).mockReturnValue({})
      ;(engineRequest as jest.Mock).mockRejectedValue(new Error('Network error'))

      const created = await service.createDeliveryRequest('order-1', 'addr', 'phone')
      expect(created).toBeNull()

      const byOrder = await service.getDeliveryByOrder('order-1')
      expect(byOrder).toBeNull()

      const updated = await service.updateDeliveryStatus('del-1', 'in_transit')
      expect(updated).toBeNull()

      const confirmed = await service.confirmDelivery('CODE')
      expect(confirmed.confirmed).toBe(false)
    })
  })
})
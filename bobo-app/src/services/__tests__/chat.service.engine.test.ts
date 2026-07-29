/**
 * Chat Service Engine Tests
 */

import {
  ChatServiceEngine,
  type ChatMessage,
} from '../../../../packages/core/src/services/chat.service.engine'

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

describe('ChatServiceEngine', () => {
  let service: ChatServiceEngine

  beforeEach(() => {
    jest.clearAllMocks()
    jest.spyOn(console, 'warn').mockImplementation(() => {})
    service = new ChatServiceEngine()
  })

  afterEach(() => {
    ;(console.warn as jest.Mock).mockRestore?.()
    service.unsubscribe()
  })

  describe('getConversations', () => {
    it('should map Engine social events to Conversation[]', async () => {
      const mockEvents = {
        events: [
          {
            id: 'evt-1',
            session_id: 'conv-1',
            customer_id: 'cust-1',
            merchant_id: 'merch-1',
            content: 'Hello there',
            created_at: '2025-01-01T00:00:00Z',
            updated_at: '2025-01-01T00:00:00Z',
          },
          {
            id: 'evt-2',
            session_id: 'conv-2',
            customer_id: 'cust-2',
            merchant_id: 'merch-2',
            content: 'Bonjour',
            created_at: '2025-01-02T00:00:00Z',
            updated_at: '2025-01-02T00:00:00Z',
          },
        ],
      }

      ;(getYaatalClient as jest.Mock).mockReturnValue({})
      ;(engineRequest as jest.Mock).mockResolvedValue(mockEvents)

      const conversations = await service.getConversations('user-1')

      expect(conversations).toHaveLength(2)
      expect(conversations[0].id).toBe('conv-1')
      expect(conversations[0].customer_id).toBe('cust-1')
      expect(conversations[0].merchant_id).toBe('merch-1')
      expect(conversations[0].last_message).toBe('Hello there')
      expect(conversations[1].id).toBe('conv-2')
    })

    it('should deduplicate events by session_id', async () => {
      const mockEvents = {
        events: [
          {
            id: 'evt-1',
            session_id: 'conv-1',
            customer_id: 'cust-1',
            merchant_id: 'merch-1',
            content: 'Message 1',
            created_at: '2025-01-01T00:00:00Z',
          },
          {
            id: 'evt-2',
            session_id: 'conv-1',
            customer_id: 'cust-1',
            merchant_id: 'merch-1',
            content: 'Message 2',
            created_at: '2025-01-01T01:00:00Z',
          },
        ],
      }

      ;(getYaatalClient as jest.Mock).mockReturnValue({})
      ;(engineRequest as jest.Mock).mockResolvedValue(mockEvents)

      const conversations = await service.getConversations('user-1')

      expect(conversations).toHaveLength(1)
      expect(conversations[0].id).toBe('conv-1')
    })
  })

  describe('getMessages', () => {
    it('should map Engine social events to ChatMessage[]', async () => {
      const mockEvents = {
        events: [
          {
            id: 'msg-1',
            session_id: 'conv-1',
            content: 'Hello world',
            sender_id: 'user-1',
            sender_name: 'Test User',
            created_at: '2025-01-01T00:00:00Z',
          },
          {
            id: 'msg-2',
            session_id: 'conv-1',
            content: 'Hi back',
            sender_id: 'bot',
            sender_name: 'Assistant',
            created_at: '2025-01-01T00:01:00Z',
          },
        ],
      }

      ;(getYaatalClient as jest.Mock).mockReturnValue({})
      ;(engineRequest as jest.Mock).mockResolvedValue(mockEvents)

      const messages = await service.getMessages('conv-1')

      expect(messages).toHaveLength(2)
      expect(messages[0]._id).toBe('msg-1')
      expect(messages[0].text).toBe('Hello world')
      expect(messages[0].user._id).toBe('user-1')
      expect(messages[0].user.name).toBe('Test User')
      expect(messages[1]._id).toBe('msg-2')
    })
  })

  describe('sendMessage', () => {
    it('should POST to /api/messages/process with correct body', async () => {
      ;(getYaatalClient as jest.Mock).mockReturnValue({})
      ;(engineRequest as jest.Mock).mockResolvedValue({
        response: 'AI processed response',
      })

      const message = await service.sendMessage('conv-1', 'Hello', 'user-1')

      expect(engineRequest).toHaveBeenCalledWith('/api/messages/process', {
        method: 'POST',
        body: JSON.stringify({
          session_id: 'conv-1',
          content: 'Hello',
        }),
      })
      expect(message.text).toBe('AI processed response')
      expect(message.sent).toBe(true)
    })
  })

  describe('Engine unreachable', () => {
    it('should return empty array, not throw', async () => {
      ;(getYaatalClient as jest.Mock).mockReturnValue({})
      ;(engineRequest as jest.Mock).mockRejectedValue(new Error('Network error'))

      const conversations = await service.getConversations('user-1')
      expect(conversations).toEqual([])

      const messages = await service.getMessages('conv-1')
      expect(messages).toEqual([])
    })
  })

  describe('subscribeToMessages', () => {
    it('should set up polling and deliver messages via callback', (done) => {
      const mockEvents = {
        events: [
          {
            id: 'msg-poll-1',
            session_id: 'conv-1',
            content: 'Poll message',
            sender_id: 'bot',
            created_at: '2025-01-01T00:00:00Z',
          },
        ],
      }

      ;(getYaatalClient as jest.Mock).mockReturnValue({})
      ;(engineRequest as jest.Mock).mockResolvedValue(mockEvents)

      const callback = jest.fn((message: ChatMessage) => {
        expect(message._id).toBe('msg-poll-1')
        expect(message.text).toBe('Poll message')
        service.unsubscribe()
        done()
      })

      service.subscribeToMessages('conv-1', callback)
    })
  })
})
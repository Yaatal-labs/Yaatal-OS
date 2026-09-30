/**
 * Chat Service - Engine SDK Version
 *
 * Backed by Engine social-events + messages endpoints.
 * Stored messages from Telegram/WhatsApp are retrieved via /api/social/events,
 * and AI assistant processing is triggered via /api/messages/process.
 * Polling fallback is used for real-time updates (no WebSocket client in BOBO).
 */

import type { Conversation, Message } from '../types/models'
import { engineRequest, getYaatalClient } from './engine.client'

export interface ChatMessage {
  _id: string
  text: string
  createdAt: Date
  user: {
    _id: string | number
    name?: string
    avatar?: string
  }
  sent?: boolean
  received?: boolean
}

// ---------------------------------------------------------------------------
// Engine response shapes
// ---------------------------------------------------------------------------

interface EngineSocialEvent {
  id: string
  session_id?: string
  source?: string
  platform?: string
  event_type?: string
  content?: string
  text?: string
  sender_id?: string
  sender_name?: string
  sender_avatar?: string
  customer_id?: string
  merchant_id?: string
  product_id?: string
  unread_count?: number
  created_at?: string
  updated_at?: string
}

interface EngineSocialEventsResponse {
  events?: EngineSocialEvent[]
  total?: number
}

interface EngineProcessMessagesResponse {
  processed?: number
  messages?: EngineSocialEvent[]
  response?: string
  result?: unknown
}

// ---------------------------------------------------------------------------
// Mapping
// ---------------------------------------------------------------------------

const nowIso = () => new Date().toISOString()

const mapEngineEventToConversation = (
  event: EngineSocialEvent
): Conversation => {
  const now = event.updated_at || event.created_at || nowIso()

  return {
    id: event.session_id || event.id,
    customer_id: event.customer_id || event.sender_id || '',
    merchant_id: event.merchant_id || '',
    product_id: event.product_id,
    last_message: event.content || event.text || '',
    last_message_at: event.created_at,
    unread_count_customer: event.unread_count ?? 0,
    unread_count_merchant: 0,
    created: event.created_at || now,
    updated: now,
  }
}

const mapEngineEventToChatMessage = (event: EngineSocialEvent): ChatMessage => {
  const isFromUser = !!event.sender_id

  return {
    _id: event.id,
    text: event.content || event.text || '',
    createdAt: new Date(event.created_at || nowIso()),
    user: {
      _id: event.sender_id || (isFromUser ? 'bot' : 'system'),
      name: event.sender_name,
      avatar: event.sender_avatar,
    },
    sent: isFromUser,
    received: true,
  }
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class ChatServiceEngine {
  private pollingIntervals: Map<string, ReturnType<typeof setInterval>> = new Map()

  async getConversations(_userId: string): Promise<Conversation[]> {
    try {
      const searchClient = (getYaatalClient() as any).social
      if (searchClient?.events) {
        const response = await searchClient.events()
        const events = (response as EngineSocialEventsResponse).events || []
        // Deduplicate by session_id to get unique conversations
        const seen = new Set<string>()
        const conversations: Conversation[] = []
        for (const event of events) {
          const sessionId = event.session_id || event.id
          if (!seen.has(sessionId)) {
            seen.add(sessionId)
            conversations.push(mapEngineEventToConversation(event))
          }
        }
        return conversations
      }

      const response = await engineRequest<EngineSocialEventsResponse>(
        '/api/social/events'
      )
      const events = response.events || []
      const seen = new Set<string>()
      const conversations: Conversation[] = []
      for (const event of events) {
        const sessionId = event.session_id || event.id
        if (!seen.has(sessionId)) {
          seen.add(sessionId)
          conversations.push(mapEngineEventToConversation(event))
        }
      }
      return conversations
    } catch (error) {
      console.warn('ChatService.getConversations: Engine unreachable', error)
      return []
    }
  }

  async getMessages(conversationId: string): Promise<ChatMessage[]> {
    try {
      const searchClient = (getYaatalClient() as any).social
      if (searchClient?.events) {
        const response = await searchClient.events({ session_id: conversationId })
        const events = (response as EngineSocialEventsResponse).events || []
        return events.map(mapEngineEventToChatMessage)
      }

      const params = new URLSearchParams({ session_id: conversationId })
      const response = await engineRequest<EngineSocialEventsResponse>(
        `/api/social/events?${params.toString()}`
      )
      const events = response.events || []
      return events.map(mapEngineEventToChatMessage)
    } catch (error) {
      console.warn('ChatService.getMessages: Engine unreachable', error)
      return []
    }
  }

  async sendMessage(
    conversationId: string,
    text: string,
    _userId: string
  ): Promise<ChatMessage> {
    try {
      const response = await engineRequest<EngineProcessMessagesResponse>(
        '/api/messages/process',
        {
          method: 'POST',
          body: JSON.stringify({
            session_id: conversationId,
            content: text,
          }),
        }
      )

      return {
        _id: `msg-${Date.now()}`,
        text: response.response || (response.result ? String(response.result) : '') || text,
        createdAt: new Date(),
        user: {
          _id: 'bot',
          name: 'Assistant BOBO',
        },
        sent: true,
        received: true,
      }
    } catch (error) {
      console.warn('ChatService.sendMessage: Engine unreachable', error)
      // Return the user's message as a fallback so the UI shows it
      return {
        _id: `msg-${Date.now()}`,
        text,
        createdAt: new Date(),
        user: {
          _id: 'bot',
          name: 'Assistant BOBO',
        },
        sent: true,
        received: false,
      }
    }
  }

  subscribeToMessages(
    conversationId: string,
    callback: (message: ChatMessage) => void
  ): () => void {
    const interval = setInterval(async () => {
      try {
        const messages = await this.getMessages(conversationId)
        if (messages.length > 0) {
          callback(messages[messages.length - 1])
        }
      } catch {
        // Silently ignore polling errors
      }
    }, 5000)

    this.pollingIntervals.set(conversationId, interval)

    return () => {
      this.unsubscribe()
    }
  }

  unsubscribe(): void {
    for (const [, interval] of this.pollingIntervals) {
      clearInterval(interval)
    }
    this.pollingIntervals.clear()
  }
}

export const chatServiceEngine = new ChatServiceEngine()
export const chatService = chatServiceEngine
export default chatServiceEngine
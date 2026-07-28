/**
 * Chat Service — stub (pending Engine integration)
 *
 * The legacy PocketBase-backed chat service has been removed.
 * This stub preserves the export surface so app screens compile.
 * Methods throw at runtime until Engine chat endpoints land.
 */

import type { Message, Conversation } from '../types/models'

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

export class ChatService {
  async getConversations(_userId: string): Promise<Conversation[]> {
    throw new Error('ChatService: pending Engine integration')
  }

  async getMessages(_conversationId: string): Promise<ChatMessage[]> {
    throw new Error('ChatService: pending Engine integration')
  }

  async sendMessage(_conversationId: string, _text: string, _userId: string): Promise<ChatMessage> {
    throw new Error('ChatService: pending Engine integration')
  }

  subscribeToMessages(_conversationId: string, _callback: (message: ChatMessage) => void): () => void {
    throw new Error('ChatService: pending Engine integration')
  }

  unsubscribe(): void {
    // no-op
  }
}

export const chatService = new ChatService()
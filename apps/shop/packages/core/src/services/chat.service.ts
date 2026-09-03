/**
 * Chat Service
 * Realtime messaging using PocketBase subscriptions
 */

import { pb } from '../lib/pocketbase'
import type { RecordModel } from 'pocketbase'
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
  /**
   * Get or create a conversation between two users
   */
  async getOrCreateConversation(user1: string, user2: string): Promise<Conversation> {
    try {
      // Check for existing conversation
      const existing = await pb.collection('conversations').getList(1, 1, {
        filter: `participants ~ "${user1}" && participants ~ "${user2}"`,
        expand: 'participants',
      })

      if (existing.items.length > 0) {
        return existing.items[0] as unknown as Conversation
      }

      // Create new conversation
      const conversation = await pb.collection('conversations').create({
        participants: [user1, user2],
        lastMessage: 'Nouvelle conversation',
      })

      return conversation as unknown as Conversation
    } catch (error) {
      console.error('Error creating conversation:', error)
      throw error
    }
  }

  /**
   * Get all conversations for a user
   */
  async getConversations(userId: string): Promise<Conversation[]> {
    try {
      const result = await pb.collection('conversations').getList(1, 50, {
        filter: `participants ~ "${userId}"`,
        sort: '-updated',
        expand: 'participants',
      })

      return result.items as unknown as Conversation[]
    } catch (error) {
      console.error('Error loading conversations:', error)
      return []
    }
  }

  /**
   * Send a message
   */
  async sendMessage(conversationId: string, text: string, senderId: string): Promise<boolean> {
    try {
      await pb.collection('messages').create({
        conversation: conversationId,
        sender: senderId,
        text: text,
      })

      // Update conversation last message
      await pb.collection('conversations').update(conversationId, {
        lastMessage: text,
      })

      return true
    } catch (error) {
      console.error('Error sending message:', error)
      return false
    }
  }

  /**
   * Get messages for a conversation
   */
  async getMessages(conversationId: string, page = 1): Promise<ChatMessage[]> {
    try {
      const result = await pb.collection('messages').getList(page, 50, {
        filter: `conversation = "${conversationId}"`,
        sort: '-created',
        expand: 'sender',
      })

      return result.items.map((record) => ({
        _id: record.id,
        text: record.text,
        createdAt: new Date(record.created),
        user: {
          _id: record.expand?.sender?.id || record.sender,
          name: record.expand?.sender?.username || 'Utilisateur',
          avatar: record.expand?.sender?.avatar_url
            ? pb.getFileUrl(record.expand.sender, record.expand.sender.avatar_url)
            : undefined,
        },
        sent: true,
        received: true,
      })) as ChatMessage[]
    } catch (error) {
      console.error('Error loading messages:', error)
      return []
    }
  }

  /**
   * Subscribe to new messages
   */
  subscribeToMessages(conversationId: string, callback: (message: ChatMessage) => void) {
    pb.collection('messages').subscribe('*', (e) => {
      if (e.action === 'create' && e.record.conversation === conversationId) {
        // Fetch full record to get sender details if needed, or construct simpler object
        const record = e.record
        const message: ChatMessage = {
          _id: record.id,
          text: record.text,
          createdAt: new Date(record.created),
          user: {
            _id: record.sender,
            name: '...', // Would need to fetch or cache user details
          },
          sent: true,
          received: true,
        }
        callback(message)
      }
    })
  }

  /**
   * Unsubscribe
   */
  unsubscribe() {
    pb.collection('messages').unsubscribe()
  }
}

export const chatService = new ChatService()
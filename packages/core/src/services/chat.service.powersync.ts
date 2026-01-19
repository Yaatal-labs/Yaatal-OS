/**
 * Chat Service - PowerSync Version
 * Realtime messaging with offline capability
 */

import { powerSyncService } from '../lib/powersync/service';
import type { Message, Conversation } from '../types/models';

// Re-export types for backward compatibility
export interface ChatMessage {
  _id: string;
  text: string;
  createdAt: Date;
  user: {
    _id: string;
    name: string;
    avatar?: string;
  };
  image?: string;
  video?: string;
  sent: boolean;
  received: boolean;
}

interface WatchHandle {
  cancel: () => void;
}

export class ChatServicePowerSync {
  private watchHandles: Map<string, WatchHandle> = new Map();

  /**
   * Generate a UUID for new records
   */
  private generateUUID(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  /**
   * Get or create a conversation between two users
   */
  async getOrCreateConversation(user1: string, user2: string): Promise<Conversation> {
    try {
      // Check for existing conversation
      const query = `
        SELECT * FROM conversations
        WHERE (customer_id = ? AND merchant_id = ?)
           OR (customer_id = ? AND merchant_id = ?)
        LIMIT 1
      `;

      const existing = await powerSyncService.executeQuery<any>(
        query,
        [user1, user2, user2, user1]
      );

      if (existing.length > 0) {
        return existing[0] as Conversation;
      }

      // Create new conversation
      const conversationId = this.generateUUID();
      const now = new Date().toISOString();

      const insertQuery = `
        INSERT INTO conversations (
          id, customer_id, merchant_id, last_message, unread_count_customer,
          unread_count_merchant, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `;

      await powerSyncService.executeWrite(insertQuery, [
        conversationId,
        user1,
        user2,
        'Nouvelle conversation',
        0,
        0,
        now,
        now
      ]);

      // Fetch the newly created conversation
      const result = await powerSyncService.executeQuery<Conversation>(
        'SELECT * FROM conversations WHERE id = ?',
        [conversationId]
      );

      return result[0] as Conversation;
    } catch (error) {
      console.error('Error creating conversation:', error);
      throw error;
    }
  }

  /**
   * Get all conversations for a user
   */
  async getConversations(userId: string): Promise<Conversation[]> {
    try {
      const query = `
        SELECT * FROM conversations
        WHERE customer_id = ? OR merchant_id = ?
        ORDER BY updated_at DESC
      `;

      const result = await powerSyncService.executeQuery<Conversation>(
        query,
        [userId, userId]
      );

      return result;
    } catch (error) {
      console.error('Error loading conversations:', error);
      return [];
    }
  }

  /**
   * Send a message
   */
  async sendMessage(conversationId: string, text: string, senderId: string): Promise<boolean> {
    try {
      const messageId = this.generateUUID();
      const now = new Date().toISOString();

      // Insert message
      const insertMessageQuery = `
        INSERT INTO messages (
          id, conversation_id, sender_id, message_type, content, read, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `;

      await powerSyncService.executeWrite(insertMessageQuery, [
        messageId,
        conversationId,
        senderId,
        'text',
        text,
        0, // read = false (boolean as integer)
        now,
        now
      ]);

      // Update conversation last message
      const updateConversationQuery = `
        UPDATE conversations
        SET last_message = ?,
            last_message_at = ?,
            updated_at = ?
        WHERE id = ?
      `;

      await powerSyncService.executeWrite(updateConversationQuery, [
        text,
        now,
        now,
        conversationId
      ]);

      return true;
    } catch (error) {
      console.error('Error sending message:', error);
      return false;
    }
  }

  /**
   * Get messages for a conversation
   */
  async getMessages(conversationId: string, page = 1): Promise<ChatMessage[]> {
    try {
      const limit = 50;
      const offset = (page - 1) * limit;

      const query = `
        SELECT
          m.*,
          p.username,
          p.avatar_url
        FROM messages m
        LEFT JOIN profiles p ON m.sender_id = p.id
        WHERE m.conversation_id = ?
        ORDER BY m.created_at DESC
        LIMIT ? OFFSET ?
      `;

      const result = await powerSyncService.executeQuery<any>(query, [conversationId, limit, offset]);

      return result.map((record) => ({
        _id: record.id,
        text: record.content,
        createdAt: new Date(record.created_at),
        user: {
          _id: record.sender_id,
          name: record.username || 'Utilisateur',
          avatar: record.avatar_url || undefined,
        },
        sent: true,
        received: true,
      }));
    } catch (error) {
      console.error('Error loading messages:', error);
      return [];
    }
  }

  /**
   * Subscribe to new messages using PowerSync watches
   * TODO: PowerSync v1.28+ uses Observable-based API - implement proper subscription
   */
  subscribeToMessages(conversationId: string, callback: (message: ChatMessage) => void) {
    // TODO: Implement proper observable-based watch using watchQuery()
    // For now, this is a stub that maintains the API contract
    // Store stub handle for cleanup compatibility
    const stubHandle: WatchHandle = { cancel: () => {} };
    this.watchHandles.set(conversationId, stubHandle);
  }

  /**
   * Unsubscribe from message updates
   */
  unsubscribe(conversationId?: string) {
    if (conversationId) {
      // Unsubscribe from specific conversation
      const watch = this.watchHandles.get(conversationId);
      if (watch) {
        watch.cancel();
        this.watchHandles.delete(conversationId);
      }
    } else {
      // Unsubscribe from all conversations
      this.watchHandles.forEach((watch) => watch.cancel());
      this.watchHandles.clear();
    }
  }
}

export const chatServicePowerSync = new ChatServicePowerSync();

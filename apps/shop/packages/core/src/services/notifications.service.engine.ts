import { getYaatalClient } from './engine.client'

export type NotificationListParams = {
  limit?: number
}

export class NotificationsServiceEngine {
  async list(params: NotificationListParams = {}) {
    return (getYaatalClient() as any).notifications?.list(params) ?? []
  }

  async unreadCount(): Promise<number> {
    return (getYaatalClient() as any).notifications?.unreadCount() ?? 0
  }

  async markRead(id: string): Promise<void> {
    await (getYaatalClient() as any).notifications?.markRead(id)
  }

  async markAllRead(): Promise<void> {
    await (getYaatalClient() as any).notifications?.markAllRead()
  }
}

export const notificationsService = new NotificationsServiceEngine()
export const notificationsServiceEngine = notificationsService
export default notificationsService

import type { EngineHttpClient } from "./http.js";
import type { JsonObject } from "./types.js";

export interface Notification {
  id: string;
  recipient_profile_id: string;
  actor_profile_id?: string | null;
  notification_type: string;
  title: string;
  body: string;
  resource_type?: string | null;
  resource_id?: string | null;
  metadata?: JsonObject | null;
  metadata_json?: string | null;
  read_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ListNotificationsParams {
  limit?: number;
}

export interface NotificationUnreadCount {
  count: number;
}

export interface NotificationReadAllResponse {
  updated: number;
}

export class NotificationsClient {
  constructor(private readonly http: EngineHttpClient) {}

  list(params: ListNotificationsParams = {}): Promise<Notification[]> {
    return this.http.request<Notification[]>("/api/notifications", {
      query: { ...params },
    });
  }

  async unreadCount(): Promise<number> {
    const response = await this.http.request<NotificationUnreadCount>(
      "/api/notifications/unread-count",
    );
    return response.count;
  }

  markRead(id: string): Promise<Notification> {
    return this.http.request<Notification>(
      `/api/notifications/${encodeURIComponent(id)}/read`,
      { method: "PATCH" },
    );
  }

  async markAllRead(): Promise<number> {
    const response = await this.http.request<NotificationReadAllResponse>(
      "/api/notifications/read-all",
      { method: "PATCH" },
    );
    return response.updated;
  }
}

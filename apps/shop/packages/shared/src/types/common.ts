export type UserRole = 'customer' | 'merchant' | 'delivery' | 'admin';
export type PaymentMethod = 'orange_money' | 'wave' | 'cash';
export type OrderStatus = 'pending' | 'confirmed' | 'preparing' | 'ready' | 'picked_up' | 'delivering' | 'delivered' | 'cancelled';
export type DeliveryStatus = 'pending' | 'accepted' | 'picked_up' | 'in_transit' | 'delivered' | 'failed';
export type LivestreamPlatform = 'tiktok' | 'instagram' | 'facebook' | 'youtube';
export type PostType = 'question' | 'tutorial' | 'discussion' | 'showcase';
export type LaunchCategory = 'devtools' | 'ai' | 'fintech' | 'agtech' | 'edtech' | 'healthtech' | 'ecommerce' | 'social' | 'other';

export interface ApiResponse<T> {
  data: T | null;
  error: string | null;
  success: boolean;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export interface Coordinates {
  lat: number;
  lng: number;
}

export interface ImageAsset {
  url: string;
  width?: number;
  height?: number;
  alt?: string;
}

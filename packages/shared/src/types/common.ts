export type UserRole = 'customer' | 'merchant' | 'delivery' | 'admin';
/**
 * Payment methods, as the Engine defines them.
 *
 * Not redeclared here. `payment_rail()` in the Engine's `bobo_checkout.rs` is
 * the list and it answers 400 for anything else, so a local copy could only
 * drift into offering a method that gets rejected — which is what happened to
 * `orange_money`, carried in this union for months and never accepted.
 */
export type { BoboPaymentMethod as PaymentMethod } from '@yaatal/client';
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

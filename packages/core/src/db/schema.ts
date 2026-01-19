/**
 * PowerSync Database Schema
 * Defines the local SQLite schema that mirrors Supabase
 */

import { column, Schema, Table } from '@powersync/common';

// Define table names
export const PROFILES_TABLE = 'profiles';
export const PRODUCTS_TABLE = 'products';
export const ORDERS_TABLE = 'orders';
export const COMMENTS_TABLE = 'comments';
export const UPVOTES_TABLE = 'upvotes';
export const ACHIEVEMENTS_TABLE = 'achievements';
export const LIVESTREAM_QR_SCANS_TABLE = 'livestream_qr_scans';
export const LIVESTREAM_OVERLAY_STATE_TABLE = 'livestream_overlay_state';
export const DELIVERY_REQUESTS_TABLE = 'delivery_requests';
export const DELIVERY_PERSONS_TABLE = 'delivery_persons';
export const CONVERSATIONS_TABLE = 'conversations';
export const MESSAGES_TABLE = 'messages';

export const AppSchema = new Schema({
  // User Profiles (Synced from Supabase public.profiles)
  [PROFILES_TABLE]: new Table({
    username: column.text,
    full_name: column.text,
    avatar_url: column.text,
    bio: column.text,
    phone_number: column.text,
    is_merchant: column.integer, // boolean as integer
    level: column.integer,
    xp: column.integer,
    streak_days: column.integer,
    last_activity_date: column.text,
    total_posts: column.integer,
    total_sales: column.integer,
    seller_rating: column.real,
    delivery_method: column.text, // bobo_managed, merchant_self, third_party, customer_pickup
    preferred_carriers: column.text, // JSON string
    delivery_zones: column.text, // JSON string
    pickup_available: column.integer, // boolean as integer
    delivery_cost_markup: column.integer,
    allow_customer_pickup: column.integer, // boolean as integer
    allow_self_delivery: column.integer, // boolean as integer
    allow_third_party: column.integer, // boolean as integer
    pickup_location: column.text,
    pickup_instructions: column.text,
    created_at: column.text,
    updated_at: column.text
  }),

  // Products (Synced from Supabase public.products)
  [PRODUCTS_TABLE]: new Table({
    seller_id: column.text,
    sku: column.text,
    title: column.text,
    description: column.text,
    price: column.real,
    discount_price: column.real,
    category: column.text,
    tags: column.text, // JSON string
    image_url: column.text,
    video_url: column.text,
    stock_quantity: column.integer,
    upvotes: column.integer,
    view_count: column.integer,
    is_featured: column.integer, // boolean as integer
    is_active: column.integer, // boolean as integer
    created_at: column.text,
    updated_at: column.text
  }),

  // Orders (Synced from Supabase public.orders)
  [ORDERS_TABLE]: new Table({
    buyer_id: column.text,
    seller_id: column.text,
    product_id: column.text,
    quantity: column.integer,
    unit_price: column.real,
    total_price: column.real,
    status: column.text, // pending_payment, paid, processing, shipped, delivered, cancelled, disputed
    payment_method: column.text, // wave, orange_money, cash
    payment_reference: column.text,
    shipping_address: column.text,
    phone_number: column.text,
    tracking_number: column.text,
    // Delivery fields
    delivery_method: column.text, // bobo_managed, merchant_self, third_party, customer_pickup
    delivery_status: column.text, // pending_dispatch, assigned, picked_up, in_transit, delivered, failed, customer_pickup_scheduled, customer_pickup_completed
    delivery_person_id: column.text,
    delivery_person_name: column.text,
    delivery_person_phone: column.text,
    delivery_cost: column.real,
    delivery_completed_at: column.text,
    delivery_tracking_url: column.text,
    delivery_notes: column.text,
    created_at: column.text,
    updated_at: column.text
  }),

  // Comments (Synced from Supabase public.comments)
  [COMMENTS_TABLE]: new Table({
    post_id: column.text,
    author_id: column.text,
    content: column.text,
    parent_comment_id: column.text,
    upvotes: column.integer,
    is_helpful: column.integer, // boolean as integer
    created_at: column.text,
    updated_at: column.text
  }),

  // Upvotes (Synced from Supabase public.upvotes)
  [UPVOTES_TABLE]: new Table({
    user_id: column.text,
    post_id: column.text,
    comment_id: column.text,
    created_at: column.text
  }),

  // Achievements (Synced from Supabase public.achievements)
  [ACHIEVEMENTS_TABLE]: new Table({
    user_id: column.text,
    title: column.text,
    description: column.text,
    icon: column.text,
    unlocked_at: column.text
  }),

  // Livestream QR Scans (Synced from Supabase public.livestream_qr_scans)
  [LIVESTREAM_QR_SCANS_TABLE]: new Table({
    merchant_id: column.text,
    product_id: column.text,
    scanned_at: column.text,
    ip_address: column.text,
    user_agent: column.text,
    converted: column.integer, // boolean as integer
    order_id: column.text,
    referrer: column.text,
    session_duration: column.integer,
    created_at: column.text
  }),

  // Livestream Overlay State (Synced from Supabase public.livestream_overlay_state)
  [LIVESTREAM_OVERLAY_STATE_TABLE]: new Table({
    merchant_id: column.text,
    current_product_id: column.text,
    qr_code_data_url: column.text,
    product_name: column.text,
    product_price: column.text,
    show_qr: column.integer, // boolean as integer
    updated_at: column.text
  }),

  // Delivery Requests (Synced from Supabase public.delivery_requests)
  [DELIVERY_REQUESTS_TABLE]: new Table({
    order_id: column.text,
    merchant_id: column.text,
    delivery_method: column.text,
    delivery_status: column.text,
    delivery_person_id: column.text,
    delivery_person_name: column.text,
    delivery_person_phone: column.text,
    pickup_address: column.text,
    dropoff_address: column.text,
    pickup_coordinates: column.text, // JSON string
    dropoff_coordinates: column.text, // JSON string
    delivery_cost: column.real,
    delivery_notes: column.text,
    assigned_at: column.text,
    picked_up_at: column.text,
    delivered_at: column.text,
    delivery_tracking_url: column.text,
    created_at: column.text,
    updated_at: column.text
  }),

  // Delivery Persons (Synced from Supabase public.delivery_persons)
  [DELIVERY_PERSONS_TABLE]: new Table({
    name: column.text,
    phone: column.text,
    zone: column.text,
    rating: column.real,
    active: column.integer, // boolean as integer
    vehicle_type: column.text, // moto, car, truck, bicycle
    created_at: column.text,
    updated_at: column.text
  }),

  // Launches (Product Hunt style for African startups/apps)
  launches: new Table({
    id: column.text,
    author_id: column.text,
    title: column.text,
    tagline: column.text,
    image_url: column.text,
    video_url: column.text,
    upvotes: column.integer,
    is_trending: column.integer, // boolean as integer
    category: column.text,
    tags: column.text, // JSON string
    description: column.text,
    website_url: column.text,
    created_at: column.text,
    updated_at: column.text
  }),

  // Conversations (Synced from Supabase public.conversations)
  [CONVERSATIONS_TABLE]: new Table({
    customer_id: column.text,
    merchant_id: column.text,
    product_id: column.text,
    last_message: column.text,
    last_message_at: column.text,
    unread_count_customer: column.integer,
    unread_count_merchant: column.integer,
    created_at: column.text,
    updated_at: column.text
  }),

  // Messages (Synced from Supabase public.messages)
  [MESSAGES_TABLE]: new Table({
    conversation_id: column.text,
    sender_id: column.text,
    message_type: column.text, // text, voice, image
    content: column.text,
    media_url: column.text,
    media_duration: column.integer,
    read: column.integer, // boolean as integer
    created_at: column.text,
    updated_at: column.text
  })
});

// Export types for use in UI
export interface ProfileRecord {
  id: string;
  username: string;
  full_name?: string;
  avatar_url?: string;
  bio?: string;
  phone_number?: string;
  is_merchant: boolean;
  level: number;
  xp: number;
  streak_days: number;
  last_activity_date?: string;
  total_posts: number;
  total_sales: number;
  seller_rating?: number;
  delivery_method?: 'bobo_managed' | 'merchant_self' | 'third_party' | 'customer_pickup';
  preferred_carriers?: string;
  delivery_zones?: string;
  pickup_available?: boolean;
  delivery_cost_markup?: number;
  allow_customer_pickup?: boolean;
  allow_self_delivery?: boolean;
  allow_third_party?: boolean;
  pickup_location?: string;
  pickup_instructions?: string;
  created_at: string;
  updated_at: string;
}

export interface ProductRecord {
  id: string;
  seller_id: string;
  sku: string;
  title: string;
  description?: string;
  price: number;
  discount_price?: number;
  category: string;
  tags?: string;
  image_url: string;
  video_url?: string;
  stock_quantity: number;
  upvotes: number;
  view_count: number;
  is_featured: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface OrderRecord {
  id: string;
  buyer_id: string;
  seller_id: string;
  product_id: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  status: string;
  payment_method?: 'wave' | 'orange_money' | 'cash';
  payment_reference?: string;
  shipping_address?: string;
  phone_number: string;
  tracking_number?: string;
  // Delivery fields
  delivery_method?: 'bobo_managed' | 'merchant_self' | 'third_party' | 'customer_pickup';
  delivery_status?: 'pending_dispatch' | 'assigned' | 'picked_up' | 'in_transit' | 'delivered' | 'failed' | 'customer_pickup_scheduled' | 'customer_pickup_completed';
  delivery_person_id?: string;
  delivery_person_name?: string;
  delivery_person_phone?: string;
  delivery_cost?: number;
  delivery_completed_at?: string;
  delivery_tracking_url?: string;
  delivery_notes?: string;
  created_at: string;
  updated_at: string;
}

export interface DeliveryRequestRecord {
  id: string;
  order_id: string;
  merchant_id: string;
  delivery_method: 'bobo_managed' | 'merchant_self' | 'third_party' | 'customer_pickup';
  delivery_status: 'pending_dispatch' | 'assigned' | 'picked_up' | 'in_transit' | 'delivered' | 'failed' | 'customer_pickup_scheduled' | 'customer_pickup_completed';
  delivery_person_id?: string;
  delivery_person_name?: string;
  delivery_person_phone?: string;
  pickup_address: string;
  dropoff_address: string;
  pickup_coordinates?: string;
  dropoff_coordinates?: string;
  delivery_cost?: number;
  delivery_notes?: string;
  assigned_at?: string;
  picked_up_at?: string;
  delivered_at?: string;
  delivery_tracking_url?: string;
  created_at: string;
  updated_at: string;
}

export interface DeliveryPersonRecord {
  id: string;
  name: string;
  phone: string;
  zone: string;
  rating: number;
  active: boolean;
  vehicle_type: 'moto' | 'car' | 'truck' | 'bicycle';
  created_at: string;
  updated_at: string;
}

export interface LaunchRecord {
  id: string;
  author_id: string;
  title: string;
  tagline: string;
  image_url?: string;
  video_url?: string;
  upvotes: number;
  is_trending: boolean;
  category: string;
  tags?: string; // JSON string
  description?: string;
  website_url?: string;
  created_at: string;
  updated_at: string;
}

export interface ConversationRecord {
  id: string;
  customer_id: string;
  merchant_id: string;
  product_id?: string;
  last_message?: string;
  last_message_at?: string;
  unread_count_customer: number;
  unread_count_merchant: number;
  created_at: string;
  updated_at: string;
}

export interface MessageRecord {
  id: string;
  conversation_id: string;
  sender_id: string;
  message_type: 'text' | 'voice' | 'image';
  content?: string;
  media_url?: string;
  media_duration?: number;
  read: boolean;
  created_at: string;
  updated_at: string;
}
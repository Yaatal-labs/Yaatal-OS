/**
 * TypeScript Type Definitions
 * Based on PocketBase schema
 */

// Base record interface
export interface BaseRecord {
  id: string
  created: string
  updated: string
}

// User Profile
export interface Profile extends BaseRecord {
  user_id: string
  username: string
  full_name?: string
  avatar_url?: string
  bio?: string
  phone_number?: string
  is_merchant: boolean
  level: number
  xp: number
  streak_days: number
  last_activity_date?: string
  total_posts: number
  total_sales: number
  seller_rating?: number
  fcm_token?: string
  // Location information for delivery
  address?: string
  location?: string
  city?: string
  // Delivery preferences for merchants
  delivery_method?: 'bobo_managed' | 'merchant_self' | 'third_party' | 'customer_pickup'
  preferred_carriers?: string[]
  delivery_zones?: string[]
  pickup_available?: boolean
  delivery_cost_markup?: number
  allow_customer_pickup?: boolean
  allow_self_delivery?: boolean
  allow_third_party?: boolean
  pickup_location?: string
  pickup_instructions?: string
}

// Product
export interface Product extends BaseRecord {
  seller_id: string
  sku: string
  title: string
  description?: string
  price: number
  discount_price?: number
  category: 'fashion' | 'electronics' | 'beauty' | 'food' | 'home' | 'other'
  tags?: string[]
  image_url: string
  video_url?: string
  stock_quantity: number
  upvotes: number
  view_count: number
  is_featured: boolean
  is_active: boolean
  // Expanded relations
  expand?: {
    seller_id?: Profile
  }
}

// Order
export interface Order extends BaseRecord {
  buyer_id: string
  seller_id: string
  product_id: string
  quantity: number
  unit_price: number
  total_price: number
  status:
    | 'pending_payment'
    | 'paid'
    | 'processing'
    | 'shipped'
    | 'delivered'
    | 'cancelled'
    | 'disputed'
  payment_method?: 'wave' | 'orange_money' | 'cash'
  payment_reference?: string
  shipping_address?: string
  phone_number: string
  tracking_number?: string
  // Delivery fields
  delivery_method?: 'bobo_managed' | 'merchant_self' | 'third_party' | 'customer_pickup'
  delivery_status?: 'pending_dispatch' | 'assigned' | 'picked_up' | 'in_transit' | 'delivered' | 'failed' | 'customer_pickup_scheduled' | 'customer_pickup_completed'
  delivery_person_id?: string
  delivery_person_name?: string
  delivery_person_phone?: string
  delivery_cost?: number
  delivery_completed_at?: string
  delivery_tracking_url?: string
  delivery_notes?: string
  // Expanded relations
  expand?: {
    buyer_id?: Profile
    seller_id?: Profile
    product_id?: Product
  }
}

// Conversation
export interface Conversation extends BaseRecord {
  customer_id: string
  merchant_id: string
  product_id?: string
  last_message?: string
  last_message_at?: string
  unread_count_customer: number
  unread_count_merchant: number
  // Expanded relations
  expand?: {
    customer_id?: Profile
    merchant_id?: Profile
    product_id?: Product
  }
}

// Message
export interface Message extends BaseRecord {
  conversation_id: string
  sender_id: string
  message_type: 'text' | 'voice' | 'image'
  content?: string
  media_url?: string
  media_duration?: number
  read: boolean
  // Expanded relations
  expand?: {
    sender_id?: Profile
  }
}

// Achievement
export interface Achievement extends BaseRecord {
  user_id: string
  title: string
  description: string
  icon: 'sankofa' | 'gyenyame' | 'dwennimmen' | 'fihankra' | 'mpatapo'
  unlocked_at: string
}

// Transaction (for DEXCHANGE payments)
export interface Transaction extends BaseRecord {
  order_id: string
  transaction_id: string
  amount: number
  currency: 'XOF'
  status: 'pending' | 'success' | 'failed'
  payment_provider: 'dexchange'
  provider_reference?: string
  metadata?: Record<string, any>
}

// Auth state
export interface AuthState {
  user: any | null
  profile: Profile | null
  isAuthenticated: boolean
  isLoading: boolean
}

// Navigation types
export type RootStackParamList = {
  // Auth
  Login: undefined
  Signup: undefined
  Onboarding: undefined

  // Merchant
  MerchantTabs: undefined
  MerchantDashboard: undefined
  AddProduct: { productId?: string }
  EditProduct: { productId: string }
  ProductQR: { productId: string }
  MerchantOrders: undefined
  OrderDetail: { orderId: string }

  // Customer
  CustomerTabs: undefined
  Discovery: undefined
  QRScanner: undefined
  ProductDetail: { productId: string; productPromise?: Promise<Product> }
  Checkout: { product: Product }
  PaymentPending: { orderId: string; transactionId: string }
  OrderSuccess: { orderId: string }
  PaymentFailed: undefined

  // Shared
  Chat: { conversationId: string }
  Conversations: undefined
  Profile: { userId?: string }
  EditProfile: undefined
  Notifications: undefined
}

// API Response types
export interface ApiResponse<T> {
  data?: T
  error?: string
  success: boolean
}

export interface PaginatedResponse<T> {
  items: T[]
  page: number
  perPage: number
  totalItems: number
  totalPages: number
}

// Form data types
export interface SignupFormData {
  email: string
  password: string
  passwordConfirm: string
  username: string
  isMerchant: boolean
}

export interface LoginFormData {
  email: string
  password: string
}

export interface ProductFormData {
  title: string
  description?: string
  price: number
  discount_price?: number
  category: Product['category']
  tags?: string[]
  stock_quantity: number
  image_uri?: string
  video_uri?: string
}

// Launch (Product Hunt-style for African startups/apps)
export interface Launch extends BaseRecord {
  author_id: string
  title: string
  tagline: string
  image_url?: string
  video_url?: string
  upvotes: number
  is_trending: boolean
  category: string
  tags?: string[] // JSON array
  description?: string
  website_url?: string
  // Expanded relations
  expand?: {
    author_id?: Profile
  }
}

export interface LaunchFormData {
  title: string
  tagline: string
  description?: string
  image_uri?: string
  video_uri?: string
  category?: string
  tags?: string[]
  website_url?: string
}
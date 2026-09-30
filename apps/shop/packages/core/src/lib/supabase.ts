/**
 * Supabase Client Configuration
 * Singleton instance for the entire app - replaces PocketBase
 */

import { createClient, SupabaseClient, Session, User } from '@supabase/supabase-js'

// Get Supabase URL from environment variable
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL!
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.warn('Supabase URL and ANON key are required. Using placeholder values for development.')
}

// Create Supabase instance
export const supabase: SupabaseClient = createClient(
  SUPABASE_URL || 'https://placeholder.supabase.co',
  SUPABASE_ANON_KEY || 'placeholder-key'
)

// Cache session for quick access
let cachedSession: Session | null = null
let cachedUser: User | null = null

// Initialize session cache
supabase.auth.getSession().then(({ data: { session } }) => {
  cachedSession = session
  cachedUser = session?.user || null
})

// Listen for auth changes
supabase.auth.onAuthStateChange((_event, session) => {
  cachedSession = session
  cachedUser = session?.user || null
})

/**
 * Get Supabase Storage file URL
 * @param bucket - Storage bucket name (e.g., 'products', 'avatars')
 * @param path - File path within the bucket
 * @param options - Transform options (width, height, quality)
 */
export const getFileUrl = (
  bucket: string,
  path: string | null | undefined,
  options?: {
    width?: number
    height?: number
    quality?: number
  }
): string | null => {
  if (!path) return null

  // If it's already a full URL, return as-is
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path
  }

  // Build the storage URL
  const { data } = supabase.storage.from(bucket).getPublicUrl(path, {
    transform: options ? {
      width: options.width,
      height: options.height,
      quality: options.quality || 80
    } : undefined
  })

  return data.publicUrl
}

/**
 * Get product image URL (convenience wrapper)
 */
export const getProductImageUrl = (path: string | null | undefined, thumb?: string): string | null => {
  if (!path) return null

  // Handle legacy PocketBase-style URLs
  if (path.startsWith('http')) return path

  // Map thumb sizes to dimensions
  const thumbSizes: Record<string, { width: number; height: number }> = {
    '100x100': { width: 100, height: 100 },
    '200x200': { width: 200, height: 200 },
    '400x400': { width: 400, height: 400 },
    '800x800': { width: 800, height: 800 },
  }

  const transform = thumb ? thumbSizes[thumb] : undefined

  return getFileUrl('products', path, transform)
}

/**
 * Get avatar/profile image URL (convenience wrapper)
 */
export const getAvatarUrl = (path: string | null | undefined, size: number = 100): string | null => {
  if (!path) return null

  // Handle legacy PocketBase-style URLs
  if (path.startsWith('http')) return path

  return getFileUrl('avatars', path, { width: size, height: size })
}

/**
 * Check if user is authenticated
 */
export const isAuthenticated = (): boolean => {
  return cachedSession !== null && cachedUser !== null
}

/**
 * Get current user
 */
export const getCurrentUser = (): User | null => {
  return cachedUser
}

/**
 * Get current session
 */
export const getCurrentSession = (): Session | null => {
  return cachedSession
}

/**
 * Get auth token
 */
export const getAuthToken = (): string | null => {
  return cachedSession?.access_token || null
}

/**
 * Clear auth (logout)
 */
export const clearAuth = async (): Promise<void> => {
  await supabase.auth.signOut()
  cachedSession = null
  cachedUser = null
}

/**
 * Sign up with email
 */
export const signUp = async (email: string, password: string, metadata?: Record<string, any>) => {
  return await supabase.auth.signUp({
    email,
    password,
    options: {
      data: metadata
    }
  })
}

/**
 * Sign in with email
 */
export const signIn = async (email: string, password: string) => {
  return await supabase.auth.signInWithPassword({
    email,
    password
  })
}

/**
 * Sign in with phone (OTP)
 */
export const signInWithPhone = async (phone: string) => {
  return await supabase.auth.signInWithOtp({
    phone
  })
}

/**
 * Verify phone OTP
 */
export const verifyPhoneOTP = async (phone: string, token: string) => {
  return await supabase.auth.verifyOtp({
    phone,
    token,
    type: 'sms'
  })
}

/**
 * Upload file to Supabase Storage
 */
export const uploadFile = async (
  bucket: string,
  path: string,
  file: Blob | File | ArrayBuffer,
  options?: {
    contentType?: string
    upsert?: boolean
  }
) => {
  return await supabase.storage.from(bucket).upload(path, file, {
    contentType: options?.contentType,
    upsert: options?.upsert ?? false
  })
}

/**
 * Delete file from Supabase Storage
 */
export const deleteFile = async (bucket: string, paths: string[]) => {
  return await supabase.storage.from(bucket).remove(paths)
}

export default supabase

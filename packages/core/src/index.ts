// Re-export from all subdirectories
export * from './db'
export * from './types'
export * from './utils'
export * from './services'

// Export Supabase client and utilities (replaces PocketBase)
export {
  supabase,
  getFileUrl,
  getProductImageUrl,
  getAvatarUrl,
  isAuthenticated,
  getCurrentUser,
  getCurrentSession,
  getAuthToken,
  clearAuth,
  signUp,
  signIn,
  signInWithPhone,
  verifyPhoneOTP,
  uploadFile,
  deleteFile,
} from './lib/supabase'

// Export PowerSync
export { powerSyncService } from './lib/powersync/service'
export { database, initDatabase } from './lib/powersync/db'

// Legacy alias for backward compatibility during migration
export { supabase as pb } from './lib/supabase'

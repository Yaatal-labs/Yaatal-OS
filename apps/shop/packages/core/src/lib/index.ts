/**
 * PocketBase Client Configuration
 * Singleton instance for the entire app
 */

import PocketBase from 'pocketbase'

// Get PocketBase URL from environment variable
const POCKETBASE_URL = process.env.EXPO_PUBLIC_POCKETBASE_URL || 'http://localhost:8090'

// Create PocketBase instance
export const pb = new PocketBase(POCKETBASE_URL)

// Configure PocketBase
pb.autoCancellation(false)  // Don't auto-cancel pending requests

// Helper to get file URL
export const getFileUrl = (record: any, filename: string, thumb?: string) => {
  if (!filename) return null
  return pb.files.getUrl(record, filename, thumb ? { thumb } : {})
}

// Helper to check if user is authenticated
export const isAuthenticated = () => {
  return pb.authStore.isValid
}

// Helper to get current user
export const getCurrentUser = () => {
  return pb.authStore.model
}

// Helper to get auth token
export const getAuthToken = () => {
  return pb.authStore.token
}

// Clear auth (logout)
export const clearAuth = () => {
  pb.authStore.clear()
}

export default pb

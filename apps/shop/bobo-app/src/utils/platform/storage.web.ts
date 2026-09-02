/**
 * Storage - Web Implementation
 * localStorage wrapper matching AsyncStorage API
 * Provides persistent key-value storage for web
 */

export interface StorageAdapter {
  getItem: (key: string) => Promise<string | null>
  setItem: (key: string, value: string) => Promise<void>
  removeItem: (key: string) => Promise<void>
  clear: () => Promise<void>
  getAllKeys: () => Promise<string[]>
  multiGet: (keys: string[]) => Promise<(string | null)[]>
  multiSet: (kvPairs: [string, string][]) => Promise<void>
  multiRemove: (keys: string[]) => Promise<void>
}

/**
 * Check if localStorage is available
 */
const isLocalStorageAvailable = (): boolean => {
  try {
    const test = '__BOBO_STORAGE_TEST__'
    localStorage.setItem(test, test)
    localStorage.removeItem(test)
    return true
  } catch {
    return false
  }
}

/**
 * Fallback in-memory storage for private browsing or blocked localStorage
 */
class InMemoryStorage implements StorageAdapter {
  private store = new Map<string, string>()

  async getItem(key: string): Promise<string | null> {
    return this.store.get(key) ?? null
  }

  async setItem(key: string, value: string): Promise<void> {
    this.store.set(key, value)
  }

  async removeItem(key: string): Promise<void> {
    this.store.delete(key)
  }

  async clear(): Promise<void> {
    this.store.clear()
  }

  async getAllKeys(): Promise<string[]> {
    return Array.from(this.store.keys())
  }

  async multiGet(keys: string[]): Promise<(string | null)[]> {
    return keys.map((key) => this.store.get(key) ?? null)
  }

  async multiSet(kvPairs: [string, string][]): Promise<void> {
    kvPairs.forEach(([key, value]) => {
      this.store.set(key, value)
    })
  }

  async multiRemove(keys: string[]): Promise<void> {
    keys.forEach((key) => {
      this.store.delete(key)
    })
  }
}

/**
 * localStorage adapter
 */
class LocalStorageAdapter implements StorageAdapter {
  async getItem(key: string): Promise<string | null> {
    return localStorage.getItem(key)
  }

  async setItem(key: string, value: string): Promise<void> {
    localStorage.setItem(key, value)
  }

  async removeItem(key: string): Promise<void> {
    localStorage.removeItem(key)
  }

  async clear(): Promise<void> {
    localStorage.clear()
  }

  async getAllKeys(): Promise<string[]> {
    const keys: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key) keys.push(key)
    }
    return keys
  }

  async multiGet(keys: string[]): Promise<(string | null)[]> {
    return keys.map((key) => localStorage.getItem(key))
  }

  async multiSet(kvPairs: [string, string][]): Promise<void> {
    kvPairs.forEach(([key, value]) => {
      localStorage.setItem(key, value)
    })
  }

  async multiRemove(keys: string[]): Promise<void> {
    keys.forEach((key) => {
      localStorage.removeItem(key)
    })
  }
}

/**
 * Get appropriate storage adapter
 * Uses localStorage if available, falls back to in-memory storage
 */
const getStorageAdapter = (): StorageAdapter => {
  if (typeof window === 'undefined') {
    // SSR: not in browser context
    return new InMemoryStorage()
  }

  if (isLocalStorageAvailable()) {
    return new LocalStorageAdapter()
  }

  // Fallback for private browsing mode or quota exceeded
  console.warn('localStorage unavailable, using in-memory storage')
  return new InMemoryStorage()
}

// Singleton instance
const storage = getStorageAdapter()

/**
 * Get value for a key
 * AsyncStorage-compatible API
 */
export const getItem = async (key: string): Promise<string | null> => {
  try {
    return await storage.getItem(key)
  } catch (error) {
    console.error(`Failed to get item "${key}":`, error)
    return null
  }
}

/**
 * Set value for a key
 * AsyncStorage-compatible API
 */
export const setItem = async (key: string, value: string): Promise<void> => {
  try {
    await storage.setItem(key, value)
  } catch (error) {
    console.error(`Failed to set item "${key}":`, error)
    throw error
  }
}

/**
 * Remove value for a key
 * AsyncStorage-compatible API
 */
export const removeItem = async (key: string): Promise<void> => {
  try {
    await storage.removeItem(key)
  } catch (error) {
    console.error(`Failed to remove item "${key}":`, error)
    throw error
  }
}

/**
 * Clear all storage
 * AsyncStorage-compatible API
 */
export const clear = async (): Promise<void> => {
  try {
    await storage.clear()
  } catch (error) {
    console.error('Failed to clear storage:', error)
    throw error
  }
}

/**
 * Get all keys
 * AsyncStorage-compatible API
 */
export const getAllKeys = async (): Promise<string[]> => {
  try {
    return await storage.getAllKeys()
  } catch (error) {
    console.error('Failed to get all keys:', error)
    return []
  }
}

/**
 * Get multiple values
 * AsyncStorage-compatible API
 */
export const multiGet = async (
  keys: string[]
): Promise<(string | null)[]> => {
  try {
    return await storage.multiGet(keys)
  } catch (error) {
    console.error('Failed to multiGet:', error)
    return keys.map(() => null)
  }
}

/**
 * Set multiple values
 * AsyncStorage-compatible API
 */
export const multiSet = async (kvPairs: [string, string][]): Promise<void> => {
  try {
    await storage.multiSet(kvPairs)
  } catch (error) {
    console.error('Failed to multiSet:', error)
    throw error
  }
}

/**
 * Remove multiple values
 * AsyncStorage-compatible API
 */
export const multiRemove = async (keys: string[]): Promise<void> => {
  try {
    await storage.multiRemove(keys)
  } catch (error) {
    console.error('Failed to multiRemove:', error)
    throw error
  }
}

// Export storage adapter for custom usage
export { LocalStorageAdapter, InMemoryStorage }

export default {
  getItem,
  setItem,
  removeItem,
  clear,
  getAllKeys,
  multiGet,
  multiSet,
  multiRemove,
}

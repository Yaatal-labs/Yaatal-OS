/**
 * Cart Store
 * Zustand store for managing shopping cart state
 */

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import AsyncStorage from '@react-native-async-storage/async-storage'
import type { Product } from '../types/models'

export interface CartItem {
  productId: string
  quantity: number
  product?: Product
}

export interface CartState {
  // State
  items: CartItem[]
  total: number

  // Actions
  addToCart: (product: Product, quantity: number) => void
  removeFromCart: (productId: string) => void
  updateQuantity: (productId: string, quantity: number) => void
  clearCart: () => void
  getCartItem: (productId: string) => CartItem | undefined
  getItemCount: () => number
  recalculateTotal: () => void
}

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      // Initial state
      items: [],
      total: 0,

      // Add item to cart
      addToCart: (product, quantity) => {
        set((state) => {
          const existingItem = state.items.find((i) => i.productId === product.id)

          let newItems: CartItem[]
          if (existingItem) {
            // Update quantity if item already exists
            newItems = state.items.map((i) =>
              i.productId === product.id
                ? { ...i, quantity: i.quantity + quantity }
                : i
            )
          } else {
            // Add new item
            newItems = [
              ...state.items,
              {
                productId: product.id,
                quantity,
                product,
              },
            ]
          }

          // Recalculate total
          const newTotal = newItems.reduce((sum, item) => {
            if (!item.product) return sum
            const price = item.product.discount_price ?? item.product.price
            return sum + price * item.quantity
          }, 0)

          return { items: newItems, total: newTotal }
        })
      },

      // Remove item from cart
      removeFromCart: (productId) => {
        set((state) => {
          const newItems = state.items.filter((i) => i.productId !== productId)

          // Recalculate total
          const newTotal = newItems.reduce((sum, item) => {
            if (!item.product) return sum
            const price = item.product.discount_price ?? item.product.price
            return sum + price * item.quantity
          }, 0)

          return { items: newItems, total: newTotal }
        })
      },

      // Update item quantity
      updateQuantity: (productId, quantity) => {
        set((state) => {
          let newItems: CartItem[]

          if (quantity <= 0) {
            // Remove item if quantity is 0 or less
            newItems = state.items.filter((i) => i.productId !== productId)
          } else {
            // Update quantity
            newItems = state.items.map((i) =>
              i.productId === productId ? { ...i, quantity } : i
            )
          }

          // Recalculate total
          const newTotal = newItems.reduce((sum, item) => {
            if (!item.product) return sum
            const price = item.product.discount_price ?? item.product.price
            return sum + price * item.quantity
          }, 0)

          return { items: newItems, total: newTotal }
        })
      },

      // Clear all items from cart
      clearCart: () => {
        set({ items: [], total: 0 })
      },

      // Get specific cart item
      getCartItem: (productId) => {
        return get().items.find((i) => i.productId === productId)
      },

      // Get total item count
      getItemCount: () => {
        return get().items.reduce((sum, item) => sum + item.quantity, 0)
      },

      // Recalculate total (useful when product prices change)
      recalculateTotal: () => {
        set((state) => {
          const newTotal = state.items.reduce((sum, item) => {
            if (!item.product) return sum
            const price = item.product.discount_price ?? item.product.price
            return sum + price * item.quantity
          }, 0)

          return { total: newTotal }
        })
      },
    }),
    {
      name: 'bobo-cart-storage',
      storage: createJSONStorage(() => AsyncStorage),
      // Persist these fields
      partialize: (state) => ({
        items: state.items,
        total: state.total,
      }),
    }
  )
)

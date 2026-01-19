/**
 * Authentication Store
 * Zustand store for managing auth state
 */

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { authService } from '@njooba/core'
import type { Profile, SignupFormData, LoginFormData } from '../types/models'

interface AuthState {
  // State
  user: any | null
  profile: Profile | null
  isAuthenticated: boolean
  isLoading: boolean
  error: string | null

  // Actions
  signUp: (data: SignupFormData) => Promise<boolean>
  signIn: (data: LoginFormData) => Promise<boolean>
  signOut: () => Promise<void>
  updateProfile: (updates: Partial<Profile>) => Promise<boolean>
  updateAvatar: (imageUri: string) => Promise<boolean>
  refreshProfile: () => Promise<void>
  clearError: () => void
  initialize: () => Promise<void>
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      // Initial state
      user: null,
      profile: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,

      // Sign up
      signUp: async (data) => {
        set({ isLoading: true, error: null })

        const result = await authService.signUp(data)

        if (result.success && result.user && result.profile) {
          set({
            user: result.user,
            profile: result.profile,
            isAuthenticated: true,
            isLoading: false,
            error: null,
          })
          return true
        } else {
          set({
            error: result.error || 'Erreur lors de l\'inscription',
            isLoading: false,
          })
          return false
        }
      },

      // Sign in
      signIn: async (data) => {
        set({ isLoading: true, error: null })

        const result = await authService.signIn(data)

        if (result.success && result.user && result.profile) {
          set({
            user: result.user,
            profile: result.profile,
            isAuthenticated: true,
            isLoading: false,
            error: null,
          })
          return true
        } else {
          set({
            error: result.error || 'Erreur lors de la connexion',
            isLoading: false,
          })
          return false
        }
      },

      // Sign out
      signOut: async () => {
        set({ isLoading: true })
        await authService.signOut()
        set({
          user: null,
          profile: null,
          isAuthenticated: false,
          isLoading: false,
          error: null,
        })
      },

      // Update profile
      updateProfile: async (updates) => {
        const profile = get().profile
        if (!profile) return false

        set({ isLoading: true, error: null })

        const result = await authService.updateProfile(profile.id, updates)

        if (result.success && result.profile) {
          set({
            profile: result.profile,
            isLoading: false,
            error: null,
          })
          return true
        } else {
          set({
            error: result.error || 'Erreur lors de la mise à jour',
            isLoading: false,
          })
          return false
        }
      },

      // Update avatar
      updateAvatar: async (imageUri) => {
        const profile = get().profile
        if (!profile) return false

        set({ isLoading: true, error: null })

        const result = await authService.updateAvatar(profile.id, imageUri)

        if (result.success && result.profile) {
          set({
            profile: result.profile,
            isLoading: false,
            error: null,
          })
          return true
        } else {
          set({
            error: result.error || 'Erreur lors de la mise à jour de la photo',
            isLoading: false,
          })
          return false
        }
      },

      // Refresh profile from server
      refreshProfile: async () => {
        const user = get().user
        if (!user) return

        const profile = await authService.getUserProfile(user.id)
        if (profile) {
          set({ profile })
        }
      },

      // Clear error
      clearError: () => {
        set({ error: null })
      },

      // Initialize (check if user is already logged in)
      initialize: async () => {
        if (authService.isAuthenticated()) {
          const user = authService.getCurrentUser()
          const profile = await authService.getUserProfile()

          if (user && profile) {
            set({
              user,
              profile,
              isAuthenticated: true,
            })
          }
        }
      },
    }),
    {
      name: 'bobo-auth-storage',
      storage: createJSONStorage(() => AsyncStorage),
      // Only persist these fields
      partialize: (state) => ({
        user: state.user,
        profile: state.profile,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
)

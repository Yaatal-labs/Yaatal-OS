/**
 * Authentication Service - Engine HTTP Version
 * Keeps the BOBO auth surface while using Engine auth endpoints.
 */

import {
  validateEmail,
  validatePassword,
  validateUsername,
  validatePhoneNumber,
} from '../utils/validation'
import type { LoginFormData, Profile, SignupFormData } from '../types/models'
import {
  engineRequest,
  getEngineAuthToken,
  setEngineAuthToken,
} from './engine.client'

type EngineLoginResponse = {
  token: string
  pid: string
  name: string
  is_verified: boolean
}

const nowIso = () => new Date().toISOString()

const profileFromEngineUser = (
  user: EngineLoginResponse,
  email: string,
  isMerchant: boolean = false
): Profile => {
  const now = nowIso()

  return {
    id: user.pid,
    user_id: user.pid,
    username: user.name || email,
    full_name: user.name,
    is_merchant: isMerchant,
    level: 1,
    xp: 0,
    streak_days: 0,
    total_posts: 0,
    total_sales: 0,
    created: now,
    updated: now,
  }
}

export class AuthService {
  private currentUser: any | null = null
  private currentProfile: Profile | null = null

  async signUp(data: SignupFormData): Promise<{
    success: boolean
    user?: any
    profile?: Profile
    error?: string
  }> {
    try {
      const emailValidation = validateEmail(data.email)
      if (!emailValidation.valid) {
        return { success: false, error: emailValidation.error }
      }

      const passwordValidation = validatePassword(data.password)
      if (!passwordValidation.valid) {
        return { success: false, error: passwordValidation.error }
      }

      const usernameValidation = validateUsername(data.username)
      if (!usernameValidation.valid) {
        return { success: false, error: usernameValidation.error }
      }

      if (data.password !== data.passwordConfirm) {
        return { success: false, error: 'Les mots de passe ne correspondent pas' }
      }

      await engineRequest('/api/auth/register', {
        method: 'POST',
        auth: false,
        body: JSON.stringify({
          email: data.email.trim().toLowerCase(),
          password: data.password,
          name: data.username.trim(),
        }),
      })

      const result = await this.signIn({
        email: data.email,
        password: data.password,
      })

      if (result.success && result.profile) {
        result.profile.is_merchant = data.isMerchant
        this.currentProfile = result.profile
      }

      return result
    } catch (error: any) {
      console.error('Signup error:', error)
      return {
        success: false,
        error: error?.message || 'Erreur lors de l\'inscription. Veuillez réessayer.',
      }
    }
  }

  async signIn(data: LoginFormData): Promise<{
    success: boolean
    user?: any
    profile?: Profile
    error?: string
  }> {
    try {
      const emailValidation = validateEmail(data.email)
      if (!emailValidation.valid) {
        return { success: false, error: emailValidation.error }
      }

      if (!data.password) {
        return { success: false, error: 'Le mot de passe est requis' }
      }

      const email = data.email.trim().toLowerCase()
      const login = await engineRequest<EngineLoginResponse>('/api/auth/login', {
        method: 'POST',
        auth: false,
        body: JSON.stringify({
          email,
          password: data.password,
        }),
      })

      setEngineAuthToken(login.token)

      const user = {
        id: login.pid,
        email,
        name: login.name,
        isVerified: login.is_verified,
        accessToken: login.token,
      }
      const profile = profileFromEngineUser(login, email)

      this.currentUser = user
      this.currentProfile = profile

      return {
        success: true,
        user,
        profile,
      }
    } catch (error: any) {
      console.error('Sign in error:', error)
      return {
        success: false,
        error: 'Erreur lors de la connexion. Veuillez réessayer.',
      }
    }
  }

  async signOut(): Promise<{ success: boolean }> {
    this.currentUser = null
    this.currentProfile = null
    setEngineAuthToken(null)
    return { success: true }
  }

  restoreSession(user: any, profile: Profile) {
    this.currentUser = user
    this.currentProfile = profile
    setEngineAuthToken(user?.accessToken || null)
  }

  getCurrentUser() {
    return this.currentUser
  }

  isAuthenticated(): boolean {
    return !!getEngineAuthToken()
  }

  async getUserProfile(userId?: string): Promise<Profile | undefined> {
    if (!userId || this.currentProfile?.user_id === userId || this.currentProfile?.id === userId) {
      return this.currentProfile || undefined
    }

    return undefined
  }

  async updateProfile(
    profileId: string,
    updates: Partial<Profile>
  ): Promise<{
    success: boolean
    profile?: Profile
    error?: string
  }> {
    if (!this.currentProfile || this.currentProfile.id !== profileId) {
      return { success: false, error: 'Profil introuvable' }
    }

    if (updates.username) {
      const usernameValidation = validateUsername(updates.username)
      if (!usernameValidation.valid) {
        return { success: false, error: usernameValidation.error }
      }
    }

    if (updates.phone_number) {
      const phoneValidation = validatePhoneNumber(updates.phone_number)
      if (!phoneValidation.valid) {
        return { success: false, error: phoneValidation.error }
      }
    }

    this.currentProfile = {
      ...this.currentProfile,
      ...updates,
      updated: nowIso(),
    }

    return {
      success: true,
      profile: this.currentProfile,
    }
  }

  async updateAvatar(
    profileId: string,
    imageUri: string
  ): Promise<{
    success: boolean
    profile?: Profile
    error?: string
  }> {
    return this.updateProfile(profileId, { avatar_url: imageUri })
  }

  async requestPasswordReset(email: string): Promise<{
    success: boolean
    error?: string
  }> {
    const emailValidation = validateEmail(email)
    if (!emailValidation.valid) {
      return { success: false, error: emailValidation.error }
    }

    await engineRequest('/api/auth/forgot', {
      method: 'POST',
      auth: false,
      body: JSON.stringify({ email: email.trim().toLowerCase() }),
    })

    return { success: true }
  }
}

export const authService = new AuthService()
export const authServiceEngine = authService

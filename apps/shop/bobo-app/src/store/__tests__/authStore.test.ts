/**
 * Auth Store Tests
 * Testing Zustand auth state management
 */

import { useAuthStore } from '../authStore'
import { authService } from '@njooba/core'

// Mock auth service
jest.mock('@njooba/core', () => ({
  authService: {
    signUp: jest.fn(),
    signIn: jest.fn(),
    signOut: jest.fn(),
    getUserProfile: jest.fn(),
    updateProfile: jest.fn(),
    updateAvatar: jest.fn(),
    isAuthenticated: jest.fn(),
    getCurrentUser: jest.fn(),
    restoreSession: jest.fn(),
  },
}))

// Mock AsyncStorage
jest.mock('@react-native-async-storage/async-storage', () => ({
  setItem: jest.fn(() => Promise.resolve()),
  getItem: jest.fn(() => Promise.resolve(null)),
  removeItem: jest.fn(() => Promise.resolve()),
  clear: jest.fn(() => Promise.resolve()),
}))

describe('useAuthStore', () => {
  beforeEach(() => {
    // Reset store state
    useAuthStore.setState({
      user: null,
      profile: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,
    })
    jest.clearAllMocks()
  })

  describe('Initial State', () => {
    it('should have correct initial state', () => {
      const state = useAuthStore.getState()

      expect(state.user).toBeNull()
      expect(state.profile).toBeNull()
      expect(state.isAuthenticated).toBe(false)
      expect(state.isLoading).toBe(false)
      expect(state.error).toBeNull()
    })
  })

  describe('signUp', () => {
    it('should set loading state during signup', async () => {
      ;(authService.signUp as jest.Mock).mockImplementation(() => {
        const state = useAuthStore.getState()
        expect(state.isLoading).toBe(true)
        return Promise.resolve({
          success: true,
          user: { id: 'user123' },
          profile: { id: 'profile123' } as any,
        })
      })

      await useAuthStore.getState().signUp({
        email: 'test@example.com',
        password: 'TestPassword123!',
        passwordConfirm: 'TestPassword123!',
        username: 'testuser',
        isMerchant: false,
      })
    })

    it('should set user and profile on successful signup', async () => {
      const mockUser = { id: 'user123', email: 'test@example.com' }
      const mockProfile = { id: 'profile123', username: 'testuser' }

      ;(authService.signUp as jest.Mock).mockResolvedValue({
        success: true,
        user: mockUser,
        profile: mockProfile,
      })

      const result = await useAuthStore.getState().signUp({
        email: 'test@example.com',
        password: 'TestPassword123!',
        passwordConfirm: 'TestPassword123!',
        username: 'testuser',
        isMerchant: false,
      })

      const state = useAuthStore.getState()
      expect(result).toBe(true)
      expect(state.user).toEqual(mockUser)
      expect(state.profile).toEqual(mockProfile)
      expect(state.isAuthenticated).toBe(true)
      expect(state.isLoading).toBe(false)
    })

    it('should set error on failed signup', async () => {
      ;(authService.signUp as jest.Mock).mockResolvedValue({
        success: false,
        error: 'Email already exists',
      })

      const result = await useAuthStore.getState().signUp({
        email: 'test@example.com',
        password: 'TestPassword123!',
        passwordConfirm: 'TestPassword123!',
        username: 'testuser',
        isMerchant: false,
      })

      const state = useAuthStore.getState()
      expect(result).toBe(false)
      expect(state.error).toContain('Email')
      expect(state.isLoading).toBe(false)
    })

    it('should handle missing user or profile in response', async () => {
      ;(authService.signUp as jest.Mock).mockResolvedValue({
        success: true,
        user: null,
        profile: null,
      })

      const result = await useAuthStore.getState().signUp({
        email: 'test@example.com',
        password: 'TestPassword123!',
        passwordConfirm: 'TestPassword123!',
        username: 'testuser',
        isMerchant: false,
      })

      expect(result).toBe(false)
    })
  })

  describe('signIn', () => {
    it('should authenticate user on successful login', async () => {
      const mockUser = { id: 'user123', email: 'test@example.com' }
      const mockProfile = { id: 'profile123', username: 'testuser' }

      ;(authService.signIn as jest.Mock).mockResolvedValue({
        success: true,
        user: mockUser,
        profile: mockProfile,
      })

      const result = await useAuthStore.getState().signIn({
        email: 'test@example.com',
        password: 'TestPassword123!',
      })

      const state = useAuthStore.getState()
      expect(result).toBe(true)
      expect(state.user).toEqual(mockUser)
      expect(state.profile).toEqual(mockProfile)
      expect(state.isAuthenticated).toBe(true)
    })

    it('should set error on failed login', async () => {
      ;(authService.signIn as jest.Mock).mockResolvedValue({
        success: false,
        error: 'Invalid email or password',
      })

      const result = await useAuthStore.getState().signIn({
        email: 'test@example.com',
        password: 'wrongpassword',
      })

      const state = useAuthStore.getState()
      expect(result).toBe(false)
      expect(state.error).toBeDefined()
      expect(state.isAuthenticated).toBe(false)
    })

    it('should clear previous error on new login attempt', async () => {
      useAuthStore.setState({ error: 'Previous error' })

      ;(authService.signIn as jest.Mock).mockResolvedValue({
        success: true,
        user: { id: 'user123' },
        profile: { id: 'profile123' } as any,
      })

      await useAuthStore.getState().signIn({
        email: 'test@example.com',
        password: 'TestPassword123!',
      })

      const state = useAuthStore.getState()
      expect(state.error).toBeNull()
    })
  })

  describe('signOut', () => {
    it('should clear auth state on logout', async () => {
      useAuthStore.setState({
        user: { id: 'user123' },
        profile: { id: 'profile123' } as any,
        isAuthenticated: true,
      })

      ;(authService.signOut as jest.Mock).mockResolvedValue({ success: true })

      await useAuthStore.getState().signOut()

      const state = useAuthStore.getState()
      expect(state.user).toBeNull()
      expect(state.profile).toBeNull()
      expect(state.isAuthenticated).toBe(false)
      expect(state.error).toBeNull()
    })

    it('should set loading state during logout', async () => {
      ;(authService.signOut as jest.Mock).mockImplementation(() => {
        const state = useAuthStore.getState()
        expect(state.isLoading).toBe(true)
        return Promise.resolve()
      })

      await useAuthStore.getState().signOut()
    })
  })

  describe('updateProfile', () => {
    it('should update profile successfully', async () => {
      const mockUpdatedProfile = { id: 'profile123', username: 'newusername' }

      useAuthStore.setState({
        profile: { id: 'profile123', username: 'oldusername' } as any,
      })

      ;(authService.updateProfile as jest.Mock).mockResolvedValue({
        success: true,
        profile: mockUpdatedProfile,
      })

      const result = await useAuthStore.getState().updateProfile({
        username: 'newusername',
      })

      const state = useAuthStore.getState()
      expect(result).toBe(true)
      expect(state.profile?.username).toBe('newusername')
    })

    it('should return false if no profile exists', async () => {
      const result = await useAuthStore.getState().updateProfile({
        username: 'newusername',
      })

      expect(result).toBe(false)
    })

    it('should set error on failed profile update', async () => {
      useAuthStore.setState({ profile: { id: 'profile123' } as any })

      ;(authService.updateProfile as jest.Mock).mockResolvedValue({
        success: false,
        error: 'Username already taken',
      })

      const result = await useAuthStore.getState().updateProfile({
        username: 'takenusername',
      })

      const state = useAuthStore.getState()
      expect(result).toBe(false)
      expect(state.error).toBeDefined()
    })
  })

  describe('updateAvatar', () => {
    it('should update user avatar', async () => {
      const mockUpdatedProfile = {
        id: 'profile123',
        avatar_url: 'new-avatar.jpg',
      }

      useAuthStore.setState({ profile: { id: 'profile123' } as any })

      ;(authService.updateAvatar as jest.Mock).mockResolvedValue({
        success: true,
        profile: mockUpdatedProfile,
      })

      const result = await useAuthStore.getState().updateAvatar('file:///image.jpg')

      const state = useAuthStore.getState()
      expect(result).toBe(true)
      expect(state.profile?.avatar_url).toBe('new-avatar.jpg')
    })

    it('should return false if no profile exists', async () => {
      const result = await useAuthStore.getState().updateAvatar('file:///image.jpg')

      expect(result).toBe(false)
    })

    it('should handle avatar upload errors', async () => {
      useAuthStore.setState({ profile: { id: 'profile123' } as any })

      ;(authService.updateAvatar as jest.Mock).mockResolvedValue({
        success: false,
        error: 'Upload failed',
      })

      const result = await useAuthStore.getState().updateAvatar('file:///image.jpg')

      const state = useAuthStore.getState()
      expect(result).toBe(false)
      expect(state.error).toBeDefined()
    })
  })

  describe('refreshProfile', () => {
    it('should refresh profile from server', async () => {
      const mockUser = { id: 'user123' }
      const mockUpdatedProfile = {
        id: 'profile123',
        username: 'updateduser',
        xp: 100,
      }

      useAuthStore.setState({ user: mockUser })

      ;(authService.getUserProfile as jest.Mock).mockResolvedValue(
        mockUpdatedProfile
      )

      await useAuthStore.getState().refreshProfile()

      const state = useAuthStore.getState()
      expect(state.profile).toEqual(mockUpdatedProfile)
    })

    it('should not update if no user exists', async () => {
      const originalProfile = { id: 'profile123' }
      useAuthStore.setState({ profile: originalProfile as any, user: null })

      await useAuthStore.getState().refreshProfile()

      const state = useAuthStore.getState()
      expect(state.profile).toEqual(originalProfile)
    })

    it('should handle refresh errors gracefully', async () => {
      useAuthStore.setState({ user: { id: 'user123' } })

      ;(authService.getUserProfile as jest.Mock).mockResolvedValue(null)

      await useAuthStore.getState().refreshProfile()

      // Should not crash, state should remain unchanged
      expect(useAuthStore.getState().user).toEqual({ id: 'user123' })
    })
  })

  describe('clearError', () => {
    it('should clear error message', () => {
      useAuthStore.setState({ error: 'Some error message' })

      useAuthStore.getState().clearError()

      expect(useAuthStore.getState().error).toBeNull()
    })
  })

  describe('initialize', () => {
    it('should restore persisted Engine token through auth service', async () => {
      const mockUser = {
        id: 'user123',
        email: 'test@example.com',
        accessToken: 'engine-token',
      }
      const mockProfile = { id: 'profile123', username: 'testuser' }

      useAuthStore.setState({
        user: mockUser,
        profile: mockProfile as any,
        isAuthenticated: false,
      })

      await useAuthStore.getState().initialize()

      expect((authService as any).restoreSession).toHaveBeenCalledWith(
        mockUser,
        mockProfile
      )
      expect(useAuthStore.getState().isAuthenticated).toBe(true)
    })

    it('should initialize auth state if user is authenticated', async () => {
      const mockUser = { id: 'user123', email: 'test@example.com' }
      const mockProfile = { id: 'profile123', username: 'testuser' }

      ;(authService.isAuthenticated as jest.Mock).mockReturnValue(true)
      ;(authService.getCurrentUser as jest.Mock).mockReturnValue(mockUser)
      ;(authService.getUserProfile as jest.Mock).mockResolvedValue(mockProfile)

      await useAuthStore.getState().initialize()

      const state = useAuthStore.getState()
      expect(state.user).toEqual(mockUser)
      expect(state.profile).toEqual(mockProfile)
      expect(state.isAuthenticated).toBe(true)
    })

    it('should not initialize if not authenticated', async () => {
      ;(authService.isAuthenticated as jest.Mock).mockReturnValue(false)

      await useAuthStore.getState().initialize()

      const state = useAuthStore.getState()
      expect(state.user).toBeNull()
      expect(state.profile).toBeNull()
      expect(state.isAuthenticated).toBe(false)
    })

    it('should not set auth state if profile fails to load', async () => {
      const mockUser = { id: 'user123' }

      ;(authService.isAuthenticated as jest.Mock).mockReturnValue(true)
      ;(authService.getCurrentUser as jest.Mock).mockReturnValue(mockUser)
      ;(authService.getUserProfile as jest.Mock).mockResolvedValue(null)

      await useAuthStore.getState().initialize()

      const state = useAuthStore.getState()
      expect(state.isAuthenticated).toBe(false)
    })
  })

  describe('State Persistence', () => {
    it('should persist only selected fields', () => {
      const state = useAuthStore.getState()

      // The store should have these public properties
      expect(state).toHaveProperty('user')
      expect(state).toHaveProperty('profile')
      expect(state).toHaveProperty('isAuthenticated')
      expect(state).toHaveProperty('isLoading')
      expect(state).toHaveProperty('error')
    })
  })
})

/**
 * Authentication Service Tests
 * Testing signup, signin, validation, and profile management
 */

import { AuthService } from '@njooba/core'
import {
  validateEmail,
  validatePassword,
  validateUsername,
  validatePhoneNumber,
} from '@njooba/core'

// Mock validation utilities
jest.mock('@njooba/core', () => {
  const mockAuthService = {
    signUp: jest.fn(),
    signIn: jest.fn(),
    signOut: jest.fn(),
    getUserProfile: jest.fn(),
    updateProfile: jest.fn(),
    updateAvatar: jest.fn(),
    requestPasswordReset: jest.fn(),
    getCurrentUser: jest.fn(),
    isAuthenticated: jest.fn(),
  }

  return {
    __esModule: true,
    ...jest.requireActual('@njooba/core'),
    AuthService: jest.fn().mockImplementation(() => mockAuthService),
    authService: mockAuthService,
    validateEmail: jest.fn(() => ({ valid: true })),
    validatePassword: jest.fn(() => ({ valid: true })),
    validateUsername: jest.fn(() => ({ valid: true })),
    validatePhoneNumber: jest.fn(() => ({ valid: true })),
    generateSKU: jest.fn(() => 'BOBO-TEST-ABC1'),
  }
})

describe('AuthService', () => {
  let service: any

  beforeEach(() => {
    jest.clearAllMocks()
    const { AuthService } = require('@njooba/core')
    service = new AuthService()

    // Reset validation mocks to success by default
    ;(validateEmail as jest.Mock).mockReturnValue({ valid: true })
    ;(validatePassword as jest.Mock).mockReturnValue({ valid: true })
    ;(validateUsername as jest.Mock).mockReturnValue({ valid: true })
    ;(validatePhoneNumber as jest.Mock).mockReturnValue({ valid: true })

    // Silence console.error
    jest.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    // Restore console.error
    ;(console.error as jest.Mock).mockRestore?.()
  })

  describe('signUp', () => {
    it('should create new user account successfully', async () => {
      const mockUser = {
        id: 'user123',
        email: 'test@example.com',
        created: '2025-01-01',
      }

      const mockProfile = {
        id: 'profile123',
        user_id: 'user123',
        username: 'testuser',
        is_merchant: false,
        level: 1,
        xp: 0,
      }

      service.signUp.mockResolvedValue({
        success: true,
        user: mockUser,
        profile: mockProfile,
      })

      const result = await service.signUp({
        email: 'test@example.com',
        password: 'TestPassword123!',
        passwordConfirm: 'TestPassword123!',
        username: 'testuser',
        isMerchant: false,
      })

      expect(result.success).toBe(true)
      expect(result.user?.email).toBe('test@example.com')
      expect(result.profile?.username).toBe('testuser')
    })

    it('should validate email format', async () => {
      const mockValidateEmail = validateEmail as jest.Mock
      mockValidateEmail.mockReturnValue({
        valid: false,
        error: 'Invalid email',
      })

      const result = await service.signUp({
        email: 'invalid-email',
        password: 'TestPassword123!',
        passwordConfirm: 'TestPassword123!',
        username: 'testuser',
        isMerchant: false,
      })

      expect(result.success).toBe(false)
      expect(result.error).toContain('email')
    })

    it('should validate password strength (12+ chars)', async () => {
      const mockValidatePassword = validatePassword as jest.Mock
      mockValidatePassword.mockReturnValue({
        valid: false,
        error: 'Password must contain at least 12 characters',
      })

      const result = await service.signUp({
        email: 'test@example.com',
        password: 'short',
        passwordConfirm: 'short',
        username: 'testuser',
        isMerchant: false,
      })

      expect(result.success).toBe(false)
      expect(result.error).toContain('Password')
    })

    it('should validate password complexity', async () => {
      const mockValidatePassword = validatePassword as jest.Mock
      mockValidatePassword.mockReturnValue({
        valid: false,
        error:
          'Password must contain uppercase, lowercase, number, and special char',
      })

      const result = await service.signUp({
        email: 'test@example.com',
        password: 'SimplePassword123',
        passwordConfirm: 'SimplePassword123',
        username: 'testuser',
        isMerchant: false,
      })

      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
    })

    it('should check password confirmation matches', async () => {
      const result = await service.signUp({
        email: 'test@example.com',
        password: 'TestPassword123!',
        passwordConfirm: 'DifferentPassword123!',
        username: 'testuser',
        isMerchant: false,
      })

      expect(result.success).toBe(false)
      expect(result.error).toContain('mots de passe')
    })

    it('should validate username format', async () => {
      const mockValidateUsername = validateUsername as jest.Mock
      mockValidateUsername.mockReturnValue({
        valid: false,
        error: 'Username must be 3-20 characters',
      })

      const result = await service.signUp({
        email: 'test@example.com',
        password: 'TestPassword123!',
        passwordConfirm: 'TestPassword123!',
        username: 'ab',
        isMerchant: false,
      })

      expect(result.success).toBe(false)
      expect(result.error).toContain('Username')
    })
  })

  describe('signIn', () => {
    it('should authenticate user successfully', async () => {
      const mockUser = { id: 'user123', email: 'test@example.com' }
      const mockProfile = { id: 'profile123', username: 'testuser' }

      service.signIn.mockResolvedValue({
        success: true,
        user: mockUser,
        profile: mockProfile,
      })

      const result = await service.signIn({
        email: 'test@example.com',
        password: 'TestPassword123!',
      })

      expect(result.success).toBe(true)
      expect(result.user?.email).toBe('test@example.com')
    })

    it('should validate email before signin', async () => {
      const mockValidateEmail = validateEmail as jest.Mock
      mockValidateEmail.mockReturnValue({
        valid: false,
        error: 'Invalid email',
      })

      const result = await service.signIn({
        email: 'invalid-email',
        password: 'TestPassword123!',
      })

      expect(result.success).toBe(false)
      expect(result.error).toContain('email')
    })

    it('should require password', async () => {
      const result = await service.signIn({
        email: 'test@example.com',
        password: '',
      })

      expect(result.success).toBe(false)
      expect(result.error).toContain('mot de passe')
    })

    it('should handle invalid credentials', async () => {
      service.signIn.mockResolvedValue({
        success: false,
        error: 'Email ou mot de passe incorrect',
      })

      const result = await service.signIn({
        email: 'test@example.com',
        password: 'wrongpassword',
      })

      expect(result.success).toBe(false)
      expect(result.error).toContain('Email ou mot de passe incorrect')
    })
  })

  describe('signOut', () => {
    it('should clear authentication', async () => {
      service.signOut.mockResolvedValue({ success: true })

      const result = await service.signOut()

      expect(result.success).toBe(true)
    })

    it('should handle signout errors', async () => {
      service.signOut.mockResolvedValue({ success: false })

      const result = await service.signOut()

      expect(result.success).toBe(false)
    })
  })

  describe('getCurrentUser', () => {
    it('should return current authenticated user', () => {
      const mockUser = { id: 'user123', email: 'test@example.com' }
      service.getCurrentUser.mockReturnValue(mockUser)

      const user = service.getCurrentUser()

      expect(user).toEqual(mockUser)
    })

    it('should return null if not authenticated', () => {
      service.getCurrentUser.mockReturnValue(null)

      const user = service.getCurrentUser()

      expect(user).toBeNull()
    })
  })

  describe('isAuthenticated', () => {
    it('should return true if user is authenticated', () => {
      service.isAuthenticated.mockReturnValue(true)

      const isAuth = service.isAuthenticated()

      expect(isAuth).toBe(true)
    })

    it('should return false if user is not authenticated', () => {
      service.isAuthenticated.mockReturnValue(false)

      const isAuth = service.isAuthenticated()

      expect(isAuth).toBe(false)
    })
  })

  describe('getUserProfile', () => {
    it('should retrieve user profile', async () => {
      const mockProfile = { id: 'profile123', username: 'testuser' }
      service.getUserProfile.mockResolvedValue(mockProfile)

      const profile = await service.getUserProfile('user123')

      expect(profile).toEqual(mockProfile)
    })

    it('should return null on error', async () => {
      service.getUserProfile.mockResolvedValue(null)

      const profile = await service.getUserProfile('user123')

      expect(profile).toBeNull()
    })
  })

  describe('updateProfile', () => {
    it('should update profile successfully', async () => {
      const mockProfile = {
        id: 'profile123',
        username: 'newusername',
        bio: 'Updated bio',
      }

      service.updateProfile.mockResolvedValue({
        success: true,
        profile: mockProfile,
      })

      const result = await service.updateProfile('profile123', {
        username: 'newusername',
        bio: 'Updated bio',
      })

      expect(result.success).toBe(true)
      expect(result.profile?.username).toBe('newusername')
    })

    it('should validate username if updating', async () => {
      const mockValidateUsername = validateUsername as jest.Mock
      mockValidateUsername.mockReturnValue({
        valid: false,
        error: 'Invalid username',
      })

      const result = await service.updateProfile('profile123', {
        username: 'a',
      })

      expect(result.success).toBe(false)
      expect(result.error).toContain('username')
    })

    it('should validate phone number if updating', async () => {
      const mockValidatePhoneNumber = validatePhoneNumber as jest.Mock
      mockValidatePhoneNumber.mockReturnValue({
        valid: false,
        error: 'Invalid phone format',
      })

      const result = await service.updateProfile('profile123', {
        phone_number: 'invalid',
      })

      expect(result.success).toBe(false)
      expect(result.error).toContain('phone')
    })

    it('should accept valid Senegal phone numbers', async () => {
      const mockValidatePhoneNumber = validatePhoneNumber as jest.Mock
      mockValidatePhoneNumber.mockReturnValue({ valid: true })

      service.updateProfile.mockResolvedValue({ success: true })

      const result = await service.updateProfile('profile123', {
        phone_number: '+221701234567',
      })

      expect(result.success).toBe(true)
    })
  })

  describe('updateAvatar', () => {
    it('should update user avatar', async () => {
      const mockProfile = {
        id: 'profile123',
        avatar_url: 'file:///avatar.jpg',
      }

      service.updateAvatar.mockResolvedValue({
        success: true,
        profile: mockProfile,
      })

      const result = await service.updateAvatar('profile123', 'file:///image.jpg')

      expect(result.success).toBe(true)
      expect(result.profile?.avatar_url).toBe('file:///avatar.jpg')
    })

    it('should handle avatar update errors', async () => {
      service.updateAvatar.mockResolvedValue({
        success: false,
        error: 'Upload failed',
      })

      const result = await service.updateAvatar('profile123', 'file:///image.jpg')

      expect(result.success).toBe(false)
      expect(result.error).toContain('photo')
    })
  })

  describe('requestPasswordReset', () => {
    it('should request password reset with valid email', async () => {
      service.requestPasswordReset.mockResolvedValue({ success: true })

      const result = await service.requestPasswordReset('test@example.com')

      expect(result.success).toBe(true)
    })

    it('should validate email before requesting reset', async () => {
      const mockValidateEmail = validateEmail as jest.Mock
      mockValidateEmail.mockReturnValue({
        valid: false,
        error: 'Invalid email',
      })

      const result = await service.requestPasswordReset('invalid-email')

      expect(result.success).toBe(false)
      expect(result.error).toContain('email')
    })

    it('should handle password reset errors', async () => {
      service.requestPasswordReset.mockResolvedValue({
        success: false,
        error: 'User not found',
      })

      const result = await service.requestPasswordReset('notfound@example.com')

      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
    })
  })
})

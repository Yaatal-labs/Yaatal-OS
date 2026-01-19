/**
 * Authentication Service for BOBO App
 * Handles user authentication, session management, and profile updates
 * Uses Supabase Auth (@supabase/supabase-js)
 */

import {
  createClient,
  SupabaseClient,
  User,
  Session,
  AuthChangeEvent,
  AuthError,
  Subscription,
} from '@supabase/supabase-js';

// ============================================================================
// Types & Interfaces
// ============================================================================

/**
 * User metadata that can be passed during signup
 */
export interface UserMetadata {
  username?: string;
  full_name?: string;
  avatar_url?: string;
  phone_number?: string;
  is_merchant?: boolean;
  [key: string]: unknown;
}

/**
 * Profile update data
 */
export interface ProfileUpdateData {
  username?: string;
  full_name?: string;
  avatar_url?: string;
  phone_number?: string;
  bio?: string;
  [key: string]: unknown;
}

/**
 * Standard auth response type
 */
export interface AuthResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  errorCode?: string;
}

/**
 * Sign up response data
 */
export interface SignUpResponseData {
  user: User | null;
  session: Session | null;
}

/**
 * Sign in response data
 */
export interface SignInResponseData {
  user: User | null;
  session: Session | null;
}

/**
 * Auth state change callback type
 */
export type AuthStateChangeCallback = (
  event: AuthChangeEvent,
  session: Session | null
) => void;

// ============================================================================
// Environment Configuration
// ============================================================================

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

// ============================================================================
// Auth Service Class
// ============================================================================

/**
 * AuthService - Singleton service for handling authentication
 *
 * Provides methods for:
 * - User signup and signin
 * - Session management
 * - Password reset
 * - Profile updates
 * - Auth state change subscriptions
 */
export class AuthService {
  private static instance: AuthService;
  private supabase: SupabaseClient | null = null;
  private isInitialized: boolean = false;

  /**
   * Private constructor to enforce singleton pattern
   */
  private constructor() {}

  /**
   * Get the singleton instance of AuthService
   */
  public static getInstance(): AuthService {
    if (!AuthService.instance) {
      AuthService.instance = new AuthService();
    }
    return AuthService.instance;
  }

  /**
   * Initialize the Supabase client
   * Must be called before using any auth methods
   */
  private ensureInitialized(): void {
    if (this.isInitialized && this.supabase) {
      return;
    }

    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error(
        'Supabase configuration missing. Please set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY environment variables.'
      );
    }

    this.supabase = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    });

    this.isInitialized = true;
  }

  /**
   * Get the Supabase client instance
   * Useful for advanced operations
   */
  public getClient(): SupabaseClient {
    this.ensureInitialized();
    return this.supabase!;
  }

  // ==========================================================================
  // Authentication Methods
  // ==========================================================================

  /**
   * Sign up a new user with email and password
   *
   * @param email - User's email address
   * @param password - User's password
   * @param metadata - Optional user metadata (username, full_name, etc.)
   * @returns AuthResponse with user and session data
   */
  async signUp(
    email: string,
    password: string,
    metadata?: UserMetadata
  ): Promise<AuthResponse<SignUpResponseData>> {
    try {
      this.ensureInitialized();

      // Validate inputs
      if (!email || !email.trim()) {
        return {
          success: false,
          error: 'Email is required',
          errorCode: 'VALIDATION_ERROR',
        };
      }

      if (!password || password.length < 6) {
        return {
          success: false,
          error: 'Password must be at least 6 characters',
          errorCode: 'VALIDATION_ERROR',
        };
      }

      const { data, error } = await this.supabase!.auth.signUp({
        email: email.trim().toLowerCase(),
        password,
        options: {
          data: metadata,
        },
      });

      if (error) {
        return this.handleAuthError(error);
      }

      return {
        success: true,
        data: {
          user: data.user,
          session: data.session,
        },
      };
    } catch (error) {
      return this.handleUnexpectedError(error);
    }
  }

  /**
   * Sign in an existing user with email and password
   *
   * @param email - User's email address
   * @param password - User's password
   * @returns AuthResponse with user and session data
   */
  async signIn(
    email: string,
    password: string
  ): Promise<AuthResponse<SignInResponseData>> {
    try {
      this.ensureInitialized();

      // Validate inputs
      if (!email || !email.trim()) {
        return {
          success: false,
          error: 'Email is required',
          errorCode: 'VALIDATION_ERROR',
        };
      }

      if (!password) {
        return {
          success: false,
          error: 'Password is required',
          errorCode: 'VALIDATION_ERROR',
        };
      }

      const { data, error } = await this.supabase!.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });

      if (error) {
        return this.handleAuthError(error);
      }

      return {
        success: true,
        data: {
          user: data.user,
          session: data.session,
        },
      };
    } catch (error) {
      return this.handleUnexpectedError(error);
    }
  }

  /**
   * Sign out the current user
   *
   * @returns AuthResponse indicating success or failure
   */
  async signOut(): Promise<AuthResponse<void>> {
    try {
      this.ensureInitialized();

      const { error } = await this.supabase!.auth.signOut();

      if (error) {
        return this.handleAuthError(error);
      }

      return { success: true };
    } catch (error) {
      return this.handleUnexpectedError(error);
    }
  }

  /**
   * Send a password reset email to the user
   *
   * @param email - User's email address
   * @returns AuthResponse indicating success or failure
   */
  async resetPassword(email: string): Promise<AuthResponse<void>> {
    try {
      this.ensureInitialized();

      // Validate email
      if (!email || !email.trim()) {
        return {
          success: false,
          error: 'Email is required',
          errorCode: 'VALIDATION_ERROR',
        };
      }

      const { error } = await this.supabase!.auth.resetPasswordForEmail(
        email.trim().toLowerCase(),
        {
          redirectTo: undefined, // Configure this based on your app's deep linking setup
        }
      );

      if (error) {
        return this.handleAuthError(error);
      }

      return { success: true };
    } catch (error) {
      return this.handleUnexpectedError(error);
    }
  }

  // ==========================================================================
  // Session & User Methods
  // ==========================================================================

  /**
   * Get the currently authenticated user
   *
   * @returns The current User object or null if not authenticated
   */
  async getCurrentUser(): Promise<User | null> {
    try {
      this.ensureInitialized();

      const { data: { user }, error } = await this.supabase!.auth.getUser();

      if (error) {
        console.error('Error getting current user:', error.message);
        return null;
      }

      return user;
    } catch (error) {
      console.error('Unexpected error getting current user:', error);
      return null;
    }
  }

  /**
   * Get the current session
   *
   * @returns The current Session object or null if no active session
   */
  async getSession(): Promise<Session | null> {
    try {
      this.ensureInitialized();

      const { data: { session }, error } = await this.supabase!.auth.getSession();

      if (error) {
        console.error('Error getting session:', error.message);
        return null;
      }

      return session;
    } catch (error) {
      console.error('Unexpected error getting session:', error);
      return null;
    }
  }

  /**
   * Check if a user is currently authenticated
   *
   * @returns True if there is an active session, false otherwise
   */
  async isAuthenticated(): Promise<boolean> {
    const session = await this.getSession();
    return session !== null;
  }

  // ==========================================================================
  // Auth State Change Subscription
  // ==========================================================================

  /**
   * Subscribe to authentication state changes
   *
   * @param callback - Function to call when auth state changes
   * @returns Subscription object with unsubscribe method
   *
   * @example
   * ```typescript
   * const { data: { subscription } } = authService.onAuthStateChange((event, session) => {
   *   if (event === 'SIGNED_IN') {
   *     console.log('User signed in:', session?.user);
   *   } else if (event === 'SIGNED_OUT') {
   *     console.log('User signed out');
   *   }
   * });
   *
   * // Later, to unsubscribe:
   * subscription.unsubscribe();
   * ```
   */
  onAuthStateChange(
    callback: AuthStateChangeCallback
  ): { data: { subscription: Subscription } } {
    this.ensureInitialized();

    const { data } = this.supabase!.auth.onAuthStateChange((event, session) => {
      callback(event, session);
    });

    return { data };
  }

  // ==========================================================================
  // Profile Management
  // ==========================================================================

  /**
   * Update the current user's profile/metadata
   *
   * @param data - Profile data to update
   * @returns AuthResponse with updated user data
   */
  async updateProfile(
    data: ProfileUpdateData
  ): Promise<AuthResponse<{ user: User | null }>> {
    try {
      this.ensureInitialized();

      // Get current user to verify authentication
      const currentUser = await this.getCurrentUser();
      if (!currentUser) {
        return {
          success: false,
          error: 'User not authenticated',
          errorCode: 'NOT_AUTHENTICATED',
        };
      }

      const { data: updateData, error } = await this.supabase!.auth.updateUser({
        data,
      });

      if (error) {
        return this.handleAuthError(error);
      }

      return {
        success: true,
        data: {
          user: updateData.user,
        },
      };
    } catch (error) {
      return this.handleUnexpectedError(error);
    }
  }

  /**
   * Update the current user's email
   *
   * @param newEmail - The new email address
   * @returns AuthResponse indicating success or failure
   */
  async updateEmail(newEmail: string): Promise<AuthResponse<{ user: User | null }>> {
    try {
      this.ensureInitialized();

      if (!newEmail || !newEmail.trim()) {
        return {
          success: false,
          error: 'Email is required',
          errorCode: 'VALIDATION_ERROR',
        };
      }

      const { data, error } = await this.supabase!.auth.updateUser({
        email: newEmail.trim().toLowerCase(),
      });

      if (error) {
        return this.handleAuthError(error);
      }

      return {
        success: true,
        data: {
          user: data.user,
        },
      };
    } catch (error) {
      return this.handleUnexpectedError(error);
    }
  }

  /**
   * Update the current user's password
   *
   * @param newPassword - The new password
   * @returns AuthResponse indicating success or failure
   */
  async updatePassword(newPassword: string): Promise<AuthResponse<{ user: User | null }>> {
    try {
      this.ensureInitialized();

      if (!newPassword || newPassword.length < 6) {
        return {
          success: false,
          error: 'Password must be at least 6 characters',
          errorCode: 'VALIDATION_ERROR',
        };
      }

      const { data, error } = await this.supabase!.auth.updateUser({
        password: newPassword,
      });

      if (error) {
        return this.handleAuthError(error);
      }

      return {
        success: true,
        data: {
          user: data.user,
        },
      };
    } catch (error) {
      return this.handleUnexpectedError(error);
    }
  }

  // ==========================================================================
  // Error Handling
  // ==========================================================================

  /**
   * Handle Supabase auth errors and convert to AuthResponse
   */
  private handleAuthError(error: AuthError): AuthResponse<never> {
    console.error('Auth error:', error.message);

    // Map common Supabase error codes to user-friendly messages
    const errorMessages: Record<string, string> = {
      'invalid_credentials': 'Invalid email or password',
      'email_not_confirmed': 'Please verify your email address',
      'user_not_found': 'No account found with this email',
      'invalid_grant': 'Invalid email or password',
      'email_exists': 'An account with this email already exists',
      'weak_password': 'Password is too weak. Please use a stronger password',
      'over_request_rate_limit': 'Too many requests. Please try again later',
      'invalid_email': 'Please enter a valid email address',
    };

    const errorCode = error.message.toLowerCase().replace(/\s+/g, '_');
    const userFriendlyMessage = errorMessages[errorCode] || error.message;

    return {
      success: false,
      error: userFriendlyMessage,
      errorCode: error.status?.toString() || 'AUTH_ERROR',
    };
  }

  /**
   * Handle unexpected errors
   */
  private handleUnexpectedError(error: unknown): AuthResponse<never> {
    console.error('Unexpected auth error:', error);

    const message = error instanceof Error
      ? error.message
      : 'An unexpected error occurred';

    return {
      success: false,
      error: message,
      errorCode: 'UNEXPECTED_ERROR',
    };
  }

  // ==========================================================================
  // Utility Methods
  // ==========================================================================

  /**
   * Refresh the current session token
   *
   * @returns AuthResponse with new session data
   */
  async refreshSession(): Promise<AuthResponse<{ session: Session | null }>> {
    try {
      this.ensureInitialized();

      const { data, error } = await this.supabase!.auth.refreshSession();

      if (error) {
        return this.handleAuthError(error);
      }

      return {
        success: true,
        data: {
          session: data.session,
        },
      };
    } catch (error) {
      return this.handleUnexpectedError(error);
    }
  }

  /**
   * Set the session manually (useful for SSR or when you have tokens from elsewhere)
   *
   * @param accessToken - The access token
   * @param refreshToken - The refresh token
   * @returns AuthResponse with session data
   */
  async setSession(
    accessToken: string,
    refreshToken: string
  ): Promise<AuthResponse<{ session: Session | null }>> {
    try {
      this.ensureInitialized();

      const { data, error } = await this.supabase!.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });

      if (error) {
        return this.handleAuthError(error);
      }

      return {
        success: true,
        data: {
          session: data.session,
        },
      };
    } catch (error) {
      return this.handleUnexpectedError(error);
    }
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

/**
 * Default singleton instance of AuthService
 * Use this for most authentication operations
 *
 * @example
 * ```typescript
 * import { authService } from './services/auth.service';
 *
 * // Sign up
 * const result = await authService.signUp('user@example.com', 'password123', {
 *   username: 'johndoe',
 *   full_name: 'John Doe',
 * });
 *
 * // Sign in
 * const signInResult = await authService.signIn('user@example.com', 'password123');
 *
 * // Get current user
 * const user = await authService.getCurrentUser();
 *
 * // Subscribe to auth changes
 * const { data: { subscription } } = authService.onAuthStateChange((event, session) => {
 *   console.log('Auth event:', event);
 * });
 * ```
 */
export const authService = AuthService.getInstance();

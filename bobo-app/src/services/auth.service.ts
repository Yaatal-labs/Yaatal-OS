/**
 * Authentication Service for BOBO App
 * Uses the Yaatal Engine SDK via @njooba/core's Engine-backed AuthService.
 *
 * This module re-exports the Engine-backed auth service from @njooba/core,
 * which uses @yaatal/client (createYaatalClient) under the hood.
 *
 * The previous implementation used Supabase Auth (@supabase/supabase-js).
 * Supabase has been replaced by the Yaatal Engine.
 */

export {
  AuthService,
  authService,
  authServiceEngine,
} from '@njooba/core'

// Re-export commonly used types for backward compatibility
export type {
  Profile,
  SignupFormData,
  LoginFormData,
} from '@njooba/core'

/** Default singleton instance — use this for most authentication operations. */
import { authService as _authService } from '@njooba/core'
export default _authService
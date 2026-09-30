/**
 * Authentication Service for BOBO App
 * Uses the Yaatal Engine SDK via @yaatal/core's Engine-backed AuthService.
 *
 * This module re-exports the Engine-backed auth service from @yaatal/core,
 * which uses @yaatal/client (createYaatalClient) under the hood.
 *
 * The previous backend auth dependency has been fully replaced by the
 * Yaatal Engine.
 */

export {
  AuthService,
  authService,
  authServiceEngine,
} from '@yaatal/core'

// Re-export commonly used types for backward compatibility
export type {
  Profile,
  SignupFormData,
  LoginFormData,
} from '@yaatal/core'

/** Default singleton instance — use this for most authentication operations. */
import { authService as _authService } from '@yaatal/core'
export default _authService
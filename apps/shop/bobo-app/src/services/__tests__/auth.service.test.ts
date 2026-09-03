/**
 * AuthService — input validation at the auth boundary.
 *
 * This suite replaces one that could not run and, once it could, turned out to
 * be testing nothing: it mocked `AuthService` itself, called
 * `service.signUp.mockResolvedValue({success: true})`, and then asserted that
 * the mock returned `{success: true}`. Its "validation" cases mocked
 * `validateEmail` and friends off the `@yaatal/core` barrel, but
 * `auth.service.engine.ts` imports them from its own `../utils/validation`, so
 * those mocks never applied — and because `clearAllMocks()` clears calls but
 * not implementations, each case inherited the previous one's resolved value.
 *
 * So: no mocked service and no mocked validators here. The real
 * `authService` runs against the mocked `@yaatal/client` (wired globally in
 * `jest.config.js`), which means a rejection below is the real validator
 * refusing real input before any network call.
 */

import { authService } from '@yaatal/core'

// Not `TestPassword123!` — the validator keeps a common-password blocklist and
// refuses it, which is the correct behaviour and made a poor "valid" fixture.
const PASSWORD = 'Njaay$Sarax7211'

const VALID = {
  email: 'buyer@example.com',
  password: PASSWORD,
  passwordConfirm: PASSWORD,
  username: 'testuser',
  isMerchant: false,
}

describe('AuthService validation', () => {
  beforeEach(() => {
    jest.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  describe('signUp', () => {
    it('accepts well-formed input', async () => {
      const result = await authService.signUp({ ...VALID })
      // The client is mocked, so this asserts only that nothing was rejected
      // locally -- the point of the negative cases below.
      expect(result.error).toBeUndefined()
    })

    it('rejects a malformed email', async () => {
      const result = await authService.signUp({ ...VALID, email: 'not-an-email' })
      expect(result.success).toBe(false)
      expect(result.error).toBeTruthy()
    })

    it.each([
      ['too short', 'Short1!'],
      ['no digit or symbol', 'passwordpassword'],
    ])('rejects a weak password (%s)', async (_label, password) => {
      const result = await authService.signUp({
        ...VALID,
        password,
        passwordConfirm: password,
      })
      expect(result.success).toBe(false)
      expect(result.error).toBeTruthy()
    })

    it('rejects a confirmation that does not match', async () => {
      const result = await authService.signUp({
        ...VALID,
        passwordConfirm: 'DifferentPassword123!',
      })
      expect(result.success).toBe(false)
      expect(result.error).toBeTruthy()
    })

    it('rejects a malformed username', async () => {
      const result = await authService.signUp({ ...VALID, username: 'a' })
      expect(result.success).toBe(false)
      expect(result.error).toBeTruthy()
    })
  })

  describe('signIn', () => {
    it('rejects a malformed email before calling the Engine', async () => {
      const result = await authService.signIn({
        email: 'not-an-email',
        password: PASSWORD,
      })
      expect(result.success).toBe(false)
      expect(result.error).toBeTruthy()
    })

    it('rejects an empty password', async () => {
      const result = await authService.signIn({
        email: VALID.email,
        password: '',
      })
      expect(result.success).toBe(false)
      expect(result.error).toBeTruthy()
    })
  })

  describe('updateProfile', () => {
    it('rejects a malformed username', async () => {
      const result = await authService.updateProfile('user123', { username: 'a' })
      expect(result.success).toBe(false)
      expect(result.error).toBeTruthy()
    })

    it('rejects a malformed phone number', async () => {
      const result = await authService.updateProfile('user123', {
        phone_number: '123',
      })
      expect(result.success).toBe(false)
      expect(result.error).toBeTruthy()
    })
  })
})

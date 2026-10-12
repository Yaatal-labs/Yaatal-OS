# Native Google sign-in handoff: contract (Kairmel server ↔ Kairmel shell)

Problem: the Kairmel desktop/Android app is a WebView around https://kairmel.com. Google refuses OAuth
inside embedded WebViews (403 disallowed_useragent). So Google sign-in must run in the system browser,
and the resulting session must come back into the app's WebView. PKCE-style binding makes an intercepted
code useless without the verifier only the app holds.

## Flow
1. In the WebView the user taps "Google". The page navigates to
   `https://kairmel.com/api/auth/oauth/google[?redirect_url=...]`.
2. The shell's navigation handler intercepts exactly that path (same origin, path `/api/auth/oauth/google`),
   cancels it in the WebView, and:
   - generates `verifier` = 32 random bytes, base64url without padding (43 chars), kept in app memory
     (one pending login at a time; a new one replaces the old; expires after 10 minutes);
   - computes `challenge` = base64url-nopad(SHA-256(verifier ASCII bytes)) (43 chars);
   - opens the **system browser** at
     `https://kairmel.com/api/auth/oauth/google?native_challenge=<challenge>[&redirect_url=<original>]`.
3. Kairmel server, `GET /api/auth/oauth/google?native_challenge=...`: validates the challenge
   (`^[A-Za-z0-9_-]{43}$`, else 400), stores it with the OAuth state (alongside the existing intended
   redirect), sets the nonce cookie and 302s to Google exactly as today.
4. Kairmel server, `GET /api/auth/callback/google` (in the system browser): does the normal checks
   (state, nonce cookie, Google code exchange, user lookup/creation). If the state carries a
   `native_challenge`:
   - it does NOT set session cookies in the browser;
   - it mints a one-time `code` (32 random bytes, base64url-nopad), stores
     `{ code_hash = SHA-256(code), challenge, user_id, redirect_path, expires_at = now + 120 s, used_at = null }`;
   - it returns a small HTML page (French, Kairmel style, `Cache-Control: no-store`) that redirects to
     `com.kairmel.app://auth/callback?code=<code>` and also shows a button "Retourner dans l'application"
     with that same link (browsers may ask for confirmation, and some block auto-redirects to custom schemes).
   Without `native_challenge`, behaviour is byte-for-byte today's.
5. The shell receives the deep link `com.kairmel.app://auth/callback?code=<code>` (desktop: deep-link
   plugin via single-instance; Android: intent filter), takes the pending verifier (and clears it), and
   navigates the WebView to
   `https://kairmel.com/api/auth/native/exchange?code=<code>&verifier=<verifier>`.
6. Kairmel server, `GET /api/auth/native/exchange?code=&verifier=` (in the WebView): looks up the row by
   SHA-256(code); requires unused, unexpired, and base64url-nopad(SHA-256(verifier)) == stored challenge
   (constant-time compare); marks it used atomically (single use even under races); creates a session
   for `user_id` exactly as the normal OAuth callback does (`setSecureAuthCookies` with a fresh access
   token); 302 to the stored `redirect_path` re-validated with `validateRedirectUrl` (fallback `/`).
   Any failure → 302 to `/?error=auth_failed` (never reveal which check failed). `Cache-Control: no-store`.

## Constants (both sides must match)
- Deep link scheme/host/path: `com.kairmel.app://auth/callback`
- Start path intercepted by the shell: `/api/auth/oauth/google` on the Kairmel origin
- Exchange path: `/api/auth/native/exchange`
- Query params: `native_challenge`, `code`, `verifier`
- Code TTL 120 s on the server; verifier TTL 10 min in the app.

## Out of scope
GitHub/email/WhatsApp sign-in (already work in-app), account linking flow (`/settings` link), iOS.

//! Native Google sign-in handoff (see `NATIVE-GOOGLE-AUTH.md`).
//!
//! Google refuses OAuth inside embedded WebViews, so the shell intercepts the
//! Kairmel Google start URL, runs the flow in the system browser, and receives
//! a one-time `code` back through the `com.kairmel.app://auth/callback` deep
//! link. A PKCE-style verifier that never leaves app memory (until the final
//! exchange request) binds the code to this app instance.
//!
//! Everything here is free of Tauri types so it can be unit tested alone.

use std::sync::Mutex;
use std::time::{Duration, Instant};

use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use sha2::{Digest, Sha256};
use url::Url;

use crate::kairmel::origin_key;

pub const GOOGLE_START_PATH: &str = "/api/auth/oauth/google";
pub const EXCHANGE_PATH: &str = "/api/auth/native/exchange";
pub const DEEP_LINK_SCHEME: &str = "com.kairmel.app";
pub const DEEP_LINK_HOST: &str = "auth";
pub const DEEP_LINK_PATH: &str = "/callback";
pub const PARAM_CHALLENGE: &str = "native_challenge";
pub const PARAM_CODE: &str = "code";
pub const PARAM_VERIFIER: &str = "verifier";
/// How long a pending login stays valid in the app.
pub const VERIFIER_TTL: Duration = Duration::from_secs(10 * 60);

/// True for exactly `<kairmel origin>/api/auth/oauth/google` (any query or
/// fragment). Look-alike paths (`.../google-evil`, `.../google/`), other
/// hosts, other schemes/ports and URLs with credentials do not match.
pub fn is_google_start(url: &Url, kairmel_origin: &Url) -> bool {
    origin_key(url) == origin_key(kairmel_origin)
        && url.username().is_empty()
        && url.password().is_none()
        && url.path() == GOOGLE_START_PATH
}

/// The URL to open in the system browser: the original start URL with
/// `native_challenge=<challenge>` set. Every other query pair (notably
/// `redirect_url`) is preserved in order. A `native_challenge` already present
/// on the incoming URL (page-supplied) is discarded so the page can never
/// choose the challenge; the fragment is dropped.
pub fn build_system_browser_url(start: &Url, challenge: &str) -> Url {
    let kept: Vec<(String, String)> = start
        .query_pairs()
        .filter(|(k, _)| k != PARAM_CHALLENGE)
        .map(|(k, v)| (k.into_owned(), v.into_owned()))
        .collect();
    let mut out = start.clone();
    out.set_fragment(None);
    {
        let mut q = out.query_pairs_mut();
        q.clear();
        for (k, v) in &kept {
            q.append_pair(k, v);
        }
        q.append_pair(PARAM_CHALLENGE, challenge);
    }
    out
}

/// 32 random bytes, base64url without padding (43 chars).
pub fn generate_verifier() -> Result<String, getrandom::Error> {
    let mut bytes = [0u8; 32];
    getrandom::fill(&mut bytes)?;
    Ok(URL_SAFE_NO_PAD.encode(bytes))
}

/// `base64url-nopad(SHA-256(verifier ASCII bytes))` (RFC 7636 S256).
pub fn challenge_for(verifier: &str) -> String {
    URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()))
}

fn is_code_char(c: char) -> bool {
    c.is_ascii_alphanumeric() || c == '-' || c == '_'
}

/// Validate a deep link `com.kairmel.app://auth/callback?code=<code>` and
/// return the code. Anything else (scheme, host, path, port, credentials,
/// missing/duplicated/odd `code`) is rejected.
pub fn parse_callback(url: &Url) -> Option<String> {
    if url.scheme() != DEEP_LINK_SCHEME
        || url.host_str() != Some(DEEP_LINK_HOST)
        || url.port().is_some()
        || !url.username().is_empty()
        || url.password().is_some()
        || url.path() != DEEP_LINK_PATH
    {
        return None;
    }
    let mut codes = url.query_pairs().filter(|(k, _)| k == PARAM_CODE);
    let code = codes.next()?.1.into_owned();
    if codes.next().is_some() {
        return None;
    }
    let ok = (20..=100).contains(&code.len()) && code.chars().all(is_code_char);
    ok.then_some(code)
}

/// `<origin>/api/auth/native/exchange?code=..&verifier=..`, params URL-encoded.
pub fn build_exchange_url(kairmel_origin: &Url, code: &str, verifier: &str) -> Option<Url> {
    let mut url = kairmel_origin.join(EXCHANGE_PATH).ok()?;
    url.set_query(None);
    url.query_pairs_mut()
        .append_pair(PARAM_CODE, code)
        .append_pair(PARAM_VERIFIER, verifier);
    Some(url)
}

struct Pending {
    verifier: String,
    created_at: Instant,
}

/// At most one pending login. A newer `begin` replaces the older one;
/// `take` is single-use and honours the 10-minute TTL.
#[derive(Default)]
pub struct PendingLogin {
    slot: Mutex<Option<Pending>>,
}

impl PendingLogin {
    pub fn begin(&self, verifier: String, now: Instant) {
        *self.slot.lock().unwrap_or_else(|e| e.into_inner()) = Some(Pending {
            verifier,
            created_at: now,
        });
    }

    /// Remove and return the verifier if it exists and has not expired.
    /// An expired entry is dropped too.
    pub fn take(&self, now: Instant) -> Option<String> {
        let pending = self.slot.lock().unwrap_or_else(|e| e.into_inner()).take()?;
        (now.saturating_duration_since(pending.created_at) <= VERIFIER_TTL)
            .then_some(pending.verifier)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn origin() -> Url {
        Url::parse("https://kairmel.com/").unwrap()
    }
    fn u(s: &str) -> Url {
        Url::parse(s).unwrap()
    }
    const CODE: &str = "abcdefghijklmnopqrstuvwxyz0123456789-_ABCDE";

    #[test]
    fn rfc7636_appendix_b_vector() {
        assert_eq!(
            challenge_for("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"),
            "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"
        );
    }

    #[test]
    fn verifier_is_43_url_safe_chars_and_random() {
        let a = generate_verifier().unwrap();
        let b = generate_verifier().unwrap();
        assert_eq!(a.len(), 43);
        assert!(a.chars().all(is_code_char));
        assert_ne!(a, b);
        assert_eq!(challenge_for(&a).len(), 43);
    }

    #[test]
    fn detects_google_start() {
        for raw in [
            "https://kairmel.com/api/auth/oauth/google",
            "https://kairmel.com/api/auth/oauth/google?redirect_url=%2Fapps",
            "https://kairmel.com:443/api/auth/oauth/google#x",
            "https://KAIRMEL.com/api/auth/oauth/google",
        ] {
            assert!(is_google_start(&u(raw), &origin()), "{raw}");
        }
    }

    #[test]
    fn rejects_lookalike_starts() {
        for raw in [
            "https://kairmel.com/api/auth/oauth/google-evil",
            "https://kairmel.com/api/auth/oauth/google/",
            "https://kairmel.com/api/auth/oauth/googl",
            "https://kairmel.com/x/api/auth/oauth/google",
            "https://kairmel.com/api/auth/oauth/github",
            "https://kairmel.com/api/auth/callback/google",
            "https://marche.kairmel.com/api/auth/oauth/google",
            "https://kairmel.com.evil.example/api/auth/oauth/google",
            "https://evil.example/api/auth/oauth/google",
            "http://kairmel.com/api/auth/oauth/google",
            "https://kairmel.com:8443/api/auth/oauth/google",
            "https://user:pw@kairmel.com/api/auth/oauth/google",
        ] {
            assert!(!is_google_start(&u(raw), &origin()), "{raw}");
        }
    }

    #[test]
    fn browser_url_adds_challenge_and_keeps_redirect() {
        let start =
            u("https://kairmel.com/api/auth/oauth/google?redirect_url=%2Fapps%3Fa%3D1&x=y#frag");
        let out = build_system_browser_url(&start, "CHAL");
        assert_eq!(out.path(), GOOGLE_START_PATH);
        assert_eq!(out.fragment(), None);
        let pairs: Vec<_> = out.query_pairs().into_owned().collect();
        assert_eq!(
            pairs,
            vec![
                ("redirect_url".to_string(), "/apps?a=1".to_string()),
                ("x".to_string(), "y".to_string()),
                ("native_challenge".to_string(), "CHAL".to_string()),
            ]
        );
    }

    #[test]
    fn browser_url_without_query_and_page_supplied_challenge() {
        let out = build_system_browser_url(&u("https://kairmel.com/api/auth/oauth/google"), "C");
        assert_eq!(out.query(), Some("native_challenge=C"));
        let out = build_system_browser_url(
            &u("https://kairmel.com/api/auth/oauth/google?native_challenge=EVIL&native_challenge=EVIL2"),
            "C",
        );
        assert_eq!(out.query(), Some("native_challenge=C"));
    }

    #[test]
    fn parses_valid_callback() {
        let url = u(&format!("com.kairmel.app://auth/callback?code={CODE}"));
        assert_eq!(parse_callback(&url).as_deref(), Some(CODE));
    }

    #[test]
    fn rejects_malformed_callbacks() {
        let long = "a".repeat(101);
        let short = "a".repeat(19);
        let bad = [
            "com.kairmel.app://auth/callback".to_string(),
            "com.kairmel.app://auth/callback?code=".to_string(),
            format!("com.kairmel.app://auth/callback?code={short}"),
            format!("com.kairmel.app://auth/callback?code={long}"),
            format!("com.kairmel.app://auth/callback?code={CODE}%2F"),
            format!("com.kairmel.app://auth/callback?code={CODE}!"),
            format!("com.kairmel.app://auth/callback?code={CODE}&code={CODE}"),
            format!("com.kairmel.app://auth/callback?other={CODE}"),
            format!("com.kairmel.app://evil/callback?code={CODE}"),
            format!("com.kairmel.app://auth/callback/x?code={CODE}"),
            format!("com.kairmel.app://auth/callbackx?code={CODE}"),
            format!("com.kairmel.app://auth/?code={CODE}"),
            format!("com.kairmel.app://auth:80/callback?code={CODE}"),
            format!("com.kairmel.app://u:p@auth/callback?code={CODE}"),
            format!("com.kairmel.other://auth/callback?code={CODE}"),
            format!("https://auth/callback?code={CODE}"),
            format!("https://kairmel.com/auth/callback?code={CODE}"),
        ];
        for raw in bad {
            assert_eq!(parse_callback(&u(&raw)), None, "{raw}");
        }
    }

    #[test]
    fn accepts_code_length_bounds() {
        for n in [20usize, 100] {
            let c = "A".repeat(n);
            let url = u(&format!("com.kairmel.app://auth/callback?code={c}"));
            assert_eq!(parse_callback(&url), Some(c));
        }
    }

    #[test]
    fn exchange_url_encodes_params_on_origin() {
        let url =
            build_exchange_url(&u("https://kairmel.com/some/path?q=1"), "a b&c", "v=1+/").unwrap();
        assert_eq!(url.origin(), origin().origin());
        assert_eq!(url.path(), EXCHANGE_PATH);
        let pairs: Vec<_> = url.query_pairs().into_owned().collect();
        assert_eq!(
            pairs,
            vec![
                ("code".to_string(), "a b&c".to_string()),
                ("verifier".to_string(), "v=1+/".to_string())
            ]
        );
        // Raw '&' in a value must be percent-encoded: only one separator remains.
        assert_eq!(url.query().unwrap().matches('&').count(), 1);
        assert!(!url.query().unwrap().contains(' '));
    }

    #[test]
    fn pending_is_take_once() {
        let store = PendingLogin::default();
        let t0 = Instant::now();
        store.begin("v1".into(), t0);
        assert_eq!(store.take(t0).as_deref(), Some("v1"));
        assert_eq!(store.take(t0), None);
    }

    #[test]
    fn pending_empty_returns_none() {
        assert_eq!(PendingLogin::default().take(Instant::now()), None);
    }

    #[test]
    fn newer_login_replaces_older() {
        let store = PendingLogin::default();
        let t0 = Instant::now();
        store.begin("old".into(), t0);
        store.begin("new".into(), t0);
        assert_eq!(store.take(t0).as_deref(), Some("new"));
        assert_eq!(store.take(t0), None);
    }

    #[test]
    fn pending_expires_after_ten_minutes() {
        let store = PendingLogin::default();
        let t0 = Instant::now();
        store.begin("v".into(), t0);
        assert_eq!(store.take(t0 + VERIFIER_TTL + Duration::from_secs(1)), None);
        // An expired entry is consumed, not resurrected.
        assert_eq!(store.take(t0), None);

        store.begin("v".into(), t0);
        assert_eq!(store.take(t0 + VERIFIER_TTL).as_deref(), Some("v"));
    }
}

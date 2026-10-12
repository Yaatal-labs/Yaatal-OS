//! Kairmel origin configuration: URL validation and the navigation allowlist
//! decision. Kept free of any Tauri types so it is trivial to unit test and
//! to reason about independently of the windowing/runtime glue in `lib.rs`.

use std::net::IpAddr;
use url::Url;

/// Placeholder default. The real address is supplied at build time via the
/// `KAIRMEL_URL` environment variable (see README).
pub const DEFAULT_KAIRMEL_URL: &str = "https://kairmel.com";
pub const DEFAULT_KAIRMEL_MARCHE_URL: &str = "https://marche.kairmel.com";

/// Default workspace paths, relative to the configured Kairmel origin.
pub const DEFAULT_PATH_CREER: &str = "/";
pub const DEFAULT_PATH_APPS: &str = "/apps";
pub const DEFAULT_PATH_DECOUVRIR: &str = "/discover";

/// Why a configured Kairmel URL was rejected.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum UrlValidationError {
    /// Not a parseable absolute URL.
    Malformed,
    /// Scheme is neither `http` nor `https`.
    UnsupportedScheme,
    /// `http` was used on a non-loopback host. Only `https` may leave the
    /// machine; plaintext `http` is accepted solely for local dev servers.
    HttpNotLoopback,
    /// The URL carries a `user:pass@host` component. Credentials must never
    /// ride on a configured URL.
    ContainsCredentials,
}

impl std::fmt::Display for UrlValidationError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let message = match self {
            UrlValidationError::Malformed => "not a valid absolute URL",
            UrlValidationError::UnsupportedScheme => "scheme must be http or https",
            UrlValidationError::HttpNotLoopback => "http is only allowed on loopback (dev)",
            UrlValidationError::ContainsCredentials => "URL must not contain credentials",
        };
        f.write_str(message)
    }
}

/// Validate a configured Kairmel URL: `https` anywhere, `http` only on
/// loopback (`localhost`, `127.0.0.1`, `[::1]`, any port), never with
/// embedded credentials.
pub fn validate_kairmel_url(raw: &str) -> Result<Url, UrlValidationError> {
    let url = Url::parse(raw).map_err(|_| UrlValidationError::Malformed)?;

    match url.scheme() {
        "https" => {}
        "http" => {
            if !is_loopback_host(&url) {
                return Err(UrlValidationError::HttpNotLoopback);
            }
        }
        _ => return Err(UrlValidationError::UnsupportedScheme),
    }

    if !url.username().is_empty() || url.password().is_some() {
        return Err(UrlValidationError::ContainsCredentials);
    }

    Ok(url)
}

fn is_loopback_host(url: &Url) -> bool {
    match url.host_str() {
        Some(host) => {
            if host.eq_ignore_ascii_case("localhost") {
                return true;
            }
            // `Url::host_str` keeps the `[...]` brackets on an IPv6
            // literal (that's the URL syntax for it); `IpAddr` parsing
            // does not accept them, so strip before parsing.
            let host = host.strip_prefix('[').unwrap_or(host);
            let host = host.strip_suffix(']').unwrap_or(host);
            host.parse::<IpAddr>()
                .map(|ip| ip.is_loopback())
                .unwrap_or(false)
        }
        None => false,
    }
}

/// Join a workspace path (e.g. `/create`) onto a validated base URL.
pub fn join_path(base: &Url, path: &str) -> Result<Url, UrlValidationError> {
    base.join(path).map_err(|_| UrlValidationError::Malformed)
}

/// Configured origins and the three Kairmel workspace destinations.
#[derive(Debug, Clone)]
pub struct KairmelUrls {
    pub origin: Url,
    pub marche: Url,
    pub creer: Url,
    // These URLs are still validated on mobile; only the desktop menu reads them.
    #[cfg_attr(mobile, allow(dead_code))]
    pub apps: Url,
    #[cfg_attr(mobile, allow(dead_code))]
    pub decouvrir: Url,
}

pub(crate) fn origin_key(url: &Url) -> (String, String, Option<u16>) {
    (
        url.scheme().to_ascii_lowercase(),
        url.host_str().unwrap_or_default().to_ascii_lowercase(),
        url.port_or_known_default(),
    )
}

/// True when `target` is on one of the configured Kairmel origins (same
/// scheme, host and port), or on GitHub's HTTPS sign-in endpoints.
/// Google OAuth must use the system browser: embedded WebViews get
/// `403 disallowed_useragent` from accounts.google.com.
pub fn is_internal_navigation(target: &Url, allowed_origins: &[Url]) -> bool {
    if target.scheme() != "http" && target.scheme() != "https" {
        return false;
    }
    let target_key = origin_key(target);
    allowed_origins
        .iter()
        .any(|origin| origin_key(origin) == target_key)
        || is_github_sign_in(target)
}

fn is_github_sign_in(url: &Url) -> bool {
    if url.scheme() != "https"
        || url.host_str() != Some("github.com")
        || url.port_or_known_default() != Some(443)
        || !url.username().is_empty()
        || url.password().is_some()
    {
        return false;
    }

    let path = url.path();
    path == "/login"
        || path == "/login/oauth"
        || path.starts_with("/login/oauth/")
        // The login form itself posts to `/session`; 2FA and verification live under `/sessions/`.
        || path == "/session"
        || path == "/sessions"
        || path.starts_with("/sessions/")
}

/// Only these schemes may be passed to the OS browser or URL handler.
/// In particular, Android intent URLs are blocked rather than executed.
pub fn should_open_externally(url: &Url) -> bool {
    matches!(
        url.scheme(),
        "https" | "http" | "mailto" | "tel" | "whatsapp" | "sms"
    )
}

/// True for the app's own bundled assets (the offline page), which are
/// always safe to load regardless of the Kairmel origin allowlist. Tauri
/// serves them from the `tauri://` scheme on Linux/macOS and from
/// `https://tauri.localhost` on Windows (WebView2 has no custom scheme
/// support, so Tauri maps bundled assets onto a reserved HTTPS host there).
pub fn is_local_asset(url: &Url) -> bool {
    url.scheme() == "tauri" || url.host_str() == Some("tauri.localhost")
}

/// The full stay-in-webview decision used by the window's navigation
/// handler: local assets are always fine, everything else must resolve to
/// a configured Kairmel / Marché origin or a GitHub sign-in endpoint.
pub fn should_stay_in_webview(url: &Url, allowed_origins: &[Url]) -> bool {
    is_local_asset(url) || is_internal_navigation(url, allowed_origins)
}

#[cfg(test)]
mod tests {
    use super::*;

    // --- validate_kairmel_url ---------------------------------------------

    #[test]
    fn accepts_plain_https() {
        assert!(validate_kairmel_url("https://kairmel.example/").is_ok());
        assert!(validate_kairmel_url("https://app.kairmel.example/marche").is_ok());
    }

    #[test]
    fn rejects_malformed_strings() {
        assert_eq!(
            validate_kairmel_url("not a url"),
            Err(UrlValidationError::Malformed)
        );
        assert_eq!(validate_kairmel_url(""), Err(UrlValidationError::Malformed));
    }

    #[test]
    fn rejects_non_http_schemes() {
        assert_eq!(
            validate_kairmel_url("ftp://kairmel.example/"),
            Err(UrlValidationError::UnsupportedScheme)
        );
        assert_eq!(
            validate_kairmel_url("file:///etc/passwd"),
            Err(UrlValidationError::UnsupportedScheme)
        );
        assert_eq!(
            validate_kairmel_url("javascript:alert(1)"),
            Err(UrlValidationError::UnsupportedScheme)
        );
    }

    #[test]
    fn rejects_http_off_loopback() {
        assert_eq!(
            validate_kairmel_url("http://kairmel.example/"),
            Err(UrlValidationError::HttpNotLoopback)
        );
        assert_eq!(
            validate_kairmel_url("http://example.com/"),
            Err(UrlValidationError::HttpNotLoopback)
        );
    }

    #[test]
    fn accepts_http_on_loopback_any_port() {
        assert!(validate_kairmel_url("http://localhost/").is_ok());
        assert!(validate_kairmel_url("http://localhost:5173/").is_ok());
        assert!(validate_kairmel_url("http://localhost:65535/").is_ok());
        assert!(validate_kairmel_url("http://127.0.0.1:3000/").is_ok());
        assert!(validate_kairmel_url("http://[::1]:4000/").is_ok());
    }

    #[test]
    fn rejects_credentials_even_on_https() {
        assert_eq!(
            validate_kairmel_url("https://user:pass@kairmel.example/"),
            Err(UrlValidationError::ContainsCredentials)
        );
        assert_eq!(
            validate_kairmel_url("https://user@kairmel.example/"),
            Err(UrlValidationError::ContainsCredentials)
        );
    }

    #[test]
    fn rejects_credentials_on_loopback_http() {
        assert_eq!(
            validate_kairmel_url("http://user:pass@localhost:5173/"),
            Err(UrlValidationError::ContainsCredentials)
        );
    }

    // --- join_path ----------------------------------------------------------

    #[test]
    fn join_path_stays_on_the_same_origin() {
        let base = validate_kairmel_url("https://kairmel.example/").unwrap();
        let create = join_path(&base, "/create").unwrap();
        assert_eq!(create.as_str(), "https://kairmel.example/create");
        assert_eq!(origin_key(&create), origin_key(&base));
    }

    // --- is_internal_navigation ----------------------------------------------

    fn origins() -> Vec<Url> {
        vec![Url::parse("https://kairmel.example/").unwrap()]
    }

    #[test]
    fn same_origin_paths_are_internal() {
        let target = Url::parse("https://kairmel.example/marche").unwrap();
        assert!(is_internal_navigation(&target, &origins()));
    }

    #[test]
    fn different_host_is_external() {
        let target = Url::parse("https://wa.me/221000000000").unwrap();
        assert!(!is_internal_navigation(&target, &origins()));
    }

    #[test]
    fn different_scheme_is_external() {
        let target = Url::parse("http://kairmel.example/").unwrap();
        assert!(!is_internal_navigation(&target, &origins()));
    }

    #[test]
    fn different_port_is_external() {
        let target = Url::parse("https://kairmel.example:8443/").unwrap();
        assert!(!is_internal_navigation(&target, &origins()));
    }

    #[test]
    fn non_web_schemes_are_always_external() {
        let mailto = Url::parse("mailto:hello@kairmel.example").unwrap();
        let tel = Url::parse("tel:+221000000000").unwrap();
        assert!(!is_internal_navigation(&mailto, &origins()));
        assert!(!is_internal_navigation(&tel, &origins()));
    }

    #[test]
    fn subdomain_is_a_different_origin_unless_configured() {
        let target = Url::parse("https://evil.kairmel.example/").unwrap();
        assert!(!is_internal_navigation(&target, &origins()));
    }

    #[test]
    fn marche_origin_stays_in_webview() {
        let allowed = vec![
            Url::parse(DEFAULT_KAIRMEL_URL).unwrap(),
            validate_kairmel_url(DEFAULT_KAIRMEL_MARCHE_URL).unwrap(),
        ];
        for raw in [
            "https://marche.kairmel.com",
            "https://marche.kairmel.com/products/123?from=kairmel",
            "https://marche.kairmel.com:443/checkout",
        ] {
            assert!(
                should_stay_in_webview(&Url::parse(raw).unwrap(), &allowed),
                "{raw}"
            );
        }
        for raw in [
            "https://marche.kairmel.com.evil.example/",
            "http://marche.kairmel.com/",
            "https://marche.kairmel.com:8443/",
            "https://other.marche.kairmel.com/",
        ] {
            assert!(
                !should_stay_in_webview(&Url::parse(raw).unwrap(), &allowed),
                "{raw}"
            );
        }
    }

    #[test]
    fn marche_origin_can_be_overridden() {
        for raw in ["https://market.example:8443/shop", "http://localhost:3001/"] {
            let marche = validate_kairmel_url(raw).unwrap();
            let allowed = vec![marche.clone()];
            assert!(should_stay_in_webview(
                &marche.join("/checkout").unwrap(),
                &allowed
            ));
            assert!(!should_stay_in_webview(
                &Url::parse(DEFAULT_KAIRMEL_MARCHE_URL).unwrap(),
                &allowed
            ));
        }
    }

    #[test]
    fn marche_configuration_uses_the_same_validation_rules() {
        for (raw, error) in [
            ("not a url", UrlValidationError::Malformed),
            (
                "http://marche.kairmel.com",
                UrlValidationError::HttpNotLoopback,
            ),
            (
                "https://user:pass@marche.kairmel.com",
                UrlValidationError::ContainsCredentials,
            ),
            ("whatsapp://send", UrlValidationError::UnsupportedScheme),
        ] {
            assert_eq!(validate_kairmel_url(raw), Err(error), "{raw}");
        }
    }

    #[test]
    fn github_sign_in_stays_in_webview() {
        for raw in [
            "https://github.com/login",
            "https://github.com/login?return_to=%2Flogin%2Foauth%2Fauthorize",
            "https://github.com/login/oauth",
            "https://github.com/login/oauth/authorize?client_id=123",
            "https://github.com/login/oauth/authorize/confirm",
            "https://github.com/sessions",
            "https://github.com/session",
            "https://github.com/sessions/two-factor",
            "https://github.com/sessions/verified-device",
        ] {
            assert!(
                should_stay_in_webview(&Url::parse(raw).unwrap(), &origins()),
                "{raw}"
            );
        }
    }

    #[test]
    fn other_github_urls_and_lookalikes_are_external() {
        for raw in [
            "https://github.com/",
            "https://github.com/yaatal/yaatal-os",
            "https://github.com/login.evil",
            "https://github.com/login/other",
            "https://github.com/login/oauth-evil/authorize",
            "https://github.com/sessions-evil/two-factor",
            "https://github.com.evil.example/login",
            "https://evilgithub.com/login/oauth/authorize",
            "https://www.github.com/login",
            "http://github.com/login",
            "https://github.com:8443/login",
            "https://user:pass@github.com/login",
        ] {
            assert!(
                !should_stay_in_webview(&Url::parse(raw).unwrap(), &origins()),
                "{raw}"
            );
        }
    }

    #[test]
    fn google_sign_in_uses_the_system_browser() {
        let google =
            Url::parse("https://accounts.google.com/o/oauth2/v2/auth?client_id=123").unwrap();
        assert!(!should_stay_in_webview(&google, &origins()));
        assert!(should_open_externally(&google));
    }

    #[test]
    fn explicit_external_schemes_use_the_os_handler() {
        for raw in [
            "https://wa.me/221000000000",
            "http://example.com/",
            "mailto:hello@kairmel.com",
            "tel:+221000000000",
            "whatsapp://send?phone=221000000000",
            "sms:+221000000000?body=Hello",
        ] {
            let url = Url::parse(raw).unwrap();
            assert!(!should_stay_in_webview(&url, &origins()), "{raw}");
            assert!(should_open_externally(&url), "{raw}");
        }
    }

    #[test]
    fn unsafe_and_unknown_schemes_are_never_opened_externally() {
        for raw in [
            "javascript:alert(1)",
            "file:///etc/passwd",
            "data:text/html,hello",
            "intent://send/#Intent;scheme=whatsapp;end",
            "ftp://example.com/file",
            "custom://example.com/",
            "tauri://localhost/offline.html",
        ] {
            assert!(!should_open_externally(&Url::parse(raw).unwrap()), "{raw}");
        }
    }

    // --- is_local_asset / should_stay_in_webview -----------------------------

    #[test]
    fn tauri_scheme_assets_are_local() {
        let offline = Url::parse("tauri://localhost/offline.html").unwrap();
        assert!(is_local_asset(&offline));
        assert!(should_stay_in_webview(&offline, &origins()));
    }

    #[test]
    fn windows_asset_host_is_local() {
        let offline = Url::parse("https://tauri.localhost/offline.html").unwrap();
        assert!(is_local_asset(&offline));
        assert!(should_stay_in_webview(&offline, &origins()));
    }

    #[test]
    fn external_link_does_not_stay_in_webview() {
        let whatsapp = Url::parse("https://wa.me/221000000000").unwrap();
        assert!(!should_stay_in_webview(&whatsapp, &origins()));
    }
}

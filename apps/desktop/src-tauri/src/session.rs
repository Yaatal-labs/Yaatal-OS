//! OS-level session broker (UXR-04).
//!
//! One Engine login unlocks SELL and SHOP. Raw tokens live only in this
//! Rust process; it is never serialized to a renderer or placed in a URL. Panes
//! receive a sanitized session event (merchant name, verification state)
//! through the bounded OS protocol.

use serde::{Deserialize, Serialize};

use crate::{MAIN_WINDOW, PROTOCOL_VERSION};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "snake_case")]
pub struct SanitizedSession {
    pub authenticated: bool,
    pub merchant_name: Option<String>,
    pub verified: Option<bool>,
}

#[derive(Debug, Clone, Deserialize)]
struct EngineLoginResponse {
    token: String,
    #[allow(dead_code)]
    pid: String,
    name: String,
    is_verified: bool,
}

const STUDIO_SURFACE: &str = "studio";
const BOOTSTRAP_NONCE_LEN: usize = 43;
const BOOTSTRAP_TTL_MAX_SECONDS: i64 = 90;
/// Keep credential payloads bounded before they become JSON request bodies.
pub const MAX_PASSWORD_BYTES: usize = 4096;

pub fn validate_login_credentials(email: &str, password: &str) -> Result<(), String> {
    if email.trim().is_empty()
        || password.is_empty()
        || email.len() > 254
        || password.len() > MAX_PASSWORD_BYTES
    {
        return Err("invalid credentials shape".into());
    }
    Ok(())
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct StudioBootstrapGrant {
    pub(crate) nonce: String,
    pub(crate) surface: String,
    #[serde(rename(serialize = "expiresInSeconds", deserialize = "expires_in_seconds"))]
    expires_in_seconds: i64,
}

#[derive(Default)]
pub struct SessionState {
    pub(crate) generation: u64,
    #[cfg(feature = "unified-ui")]
    pub(crate) studio_client: Option<tauri_plugin_http::reqwest::Client>,
    #[cfg(feature = "unified-ui")]
    pub(crate) commerce_links: std::collections::HashMap<String, crate::gateway::CommerceIntent>,
    token: Option<String>,
    merchant_name: Option<String>,
    verified: Option<bool>,
}

impl SessionState {
    #[cfg(feature = "unified-ui")]
    fn discard_studio_access(&mut self) {
        self.studio_client = None;
        self.commerce_links.clear();
    }

    pub fn invalidate(&mut self) {
        self.generation = self.generation.wrapping_add(1);
        #[cfg(feature = "unified-ui")]
        self.discard_studio_access();
        self.token = None;
        self.merchant_name = None;
        self.verified = None;
    }

    pub fn check_generation(&self, generation: u64) -> Result<(), String> {
        if self.generation == generation {
            Ok(())
        } else {
            Err("session_changed".into())
        }
    }

    /// A Studio process restart invalidates its loopback cookie jar, but does
    /// not turn a successful Engine login into a renderer-visible logout.
    #[cfg(feature = "unified-ui")]
    pub fn invalidate_studio(&mut self) {
        self.generation = self.generation.wrapping_add(1);
        self.discard_studio_access();
    }

    pub fn sanitized(&self) -> SanitizedSession {
        SanitizedSession {
            authenticated: self.token.is_some(),
            merchant_name: self.merchant_name.clone(),
            verified: self.verified,
        }
    }

    pub fn logged_out() -> Self {
        Self::default()
    }

    pub fn engine_token(&self) -> Result<&str, String> {
        self.token
            .as_deref()
            .ok_or_else(|| "Engine session is not authenticated".to_string())
    }
}

pub fn emit_session(app: &tauri::AppHandle, state: &SessionState) -> Result<(), tauri::Error> {
    use tauri::Emitter;
    app.emit_to(MAIN_WINDOW, "yaatal://session", session_event(state))
}

/// Session event shape crossing to panes; versioned and sanitized.
#[derive(Debug, Clone, Serialize)]
pub struct SessionEvent {
    pub version: &'static str,
    pub kind: &'static str,
    #[serde(flatten)]
    pub session: SanitizedSession,
}

pub fn session_event(state: &SessionState) -> SessionEvent {
    SessionEvent {
        version: PROTOCOL_VERSION,
        kind: "session",
        session: state.sanitized(),
    }
}

/// Call the Engine login endpoint through the scoped HTTP plugin.
/// Returns the raw response body on success; the token never leaves Rust.
pub fn engine_login(
    app: &tauri::AppHandle,
    base_url: &str,
    email: &str,
    password: &str,
) -> Result<String, String> {
    let _ = app;
    let base = crate::http::engine_base(base_url)?;
    let body = serde_json::json!({"email":email,"password":password});
    crate::http::request_text(
        &crate::http::client(false)?,
        tauri_plugin_http::reqwest::Method::POST,
        base.join("api/auth/login")
            .map_err(|_| "engine_configuration_invalid")?,
        Some(body),
        None,
    )
}

/// Mint a one-use Studio grant while keeping the Engine JWT inside Rust.
pub fn engine_studio_bootstrap_start(
    app: &tauri::AppHandle,
    base_url: &str,
    token: &str,
) -> Result<String, String> {
    let _ = app;
    let base = crate::http::engine_base(base_url)?;
    crate::http::request_text(
        &crate::http::client(false)?,
        tauri_plugin_http::reqwest::Method::POST,
        base.join("api/auth/bootstrap/start")
            .map_err(|_| "engine_configuration_invalid")?,
        Some(serde_json::json!({"surface":"studio"})),
        Some(token),
    )
}

pub fn validate_studio_bootstrap_grant(body: &str) -> Result<StudioBootstrapGrant, String> {
    let grant: StudioBootstrapGrant = ::serde_json::from_str(body)
        .map_err(|_| "unexpected Engine bootstrap payload".to_string())?;
    if grant.surface != STUDIO_SURFACE
        || grant.nonce.len() != BOOTSTRAP_NONCE_LEN
        || !grant
            .nonce
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-' || byte == b'_')
        || !(1..=BOOTSTRAP_TTL_MAX_SECONDS).contains(&grant.expires_in_seconds)
    {
        return Err("invalid Engine bootstrap grant".to_string());
    }
    Ok(grant)
}

pub fn apply_login(state: &mut SessionState, body: &str) -> Result<SanitizedSession, String> {
    let response: EngineLoginResponse =
        ::serde_json::from_str(body).map_err(|_| "unexpected Engine login payload".to_string())?;
    if response.token.is_empty()
        || response.token.len() > 8192
        || response.name.len() > 200
        || response.name.chars().any(char::is_control)
    {
        return Err("unexpected Engine login payload".into());
    }
    state.token = Some(response.token);
    state.merchant_name = Some(response.name);
    state.verified = Some(response.is_verified);
    Ok(state.sanitized())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn grant_json(surface: &str, nonce: &str, ttl: i64) -> String {
        serde_json::json!({
            "nonce": nonce,
            "surface": surface,
            "expires_in_seconds": ttl,
        })
        .to_string()
    }

    #[test]
    fn studio_bootstrap_grant_is_narrow_and_renderer_safe() {
        let nonce = "A".repeat(BOOTSTRAP_NONCE_LEN);
        let grant = validate_studio_bootstrap_grant(&grant_json("studio", &nonce, 90))
            .expect("valid Studio grant");
        let rendered = serde_json::to_value(grant).expect("serialize grant");
        assert_eq!(rendered["surface"], "studio");
        assert_eq!(rendered["expiresInSeconds"], 90);
        assert!(rendered.get("token").is_none());
    }

    #[test]
    fn bootstrap_grant_rejects_wrong_surface_nonce_or_ttl() {
        let nonce = "A".repeat(BOOTSTRAP_NONCE_LEN);
        assert!(validate_studio_bootstrap_grant(&grant_json("shop", &nonce, 90)).is_err());
        assert!(validate_studio_bootstrap_grant(&grant_json("studio", "short", 90)).is_err());
        let invalid = format!("{}!", "A".repeat(BOOTSTRAP_NONCE_LEN - 1));
        assert!(validate_studio_bootstrap_grant(&grant_json("studio", &invalid, 90)).is_err());
        assert!(validate_studio_bootstrap_grant(&grant_json("studio", &nonce, 0)).is_err());
        assert!(validate_studio_bootstrap_grant(&grant_json("studio", &nonce, 91)).is_err());
    }

    #[test]
    fn oversized_password_is_rejected_before_request_serialization() {
        assert_eq!(
            validate_login_credentials("seller@example.com", &"a".repeat(MAX_PASSWORD_BYTES + 1)),
            Err("invalid credentials shape".into())
        );
        assert!(
            validate_login_credentials("seller@example.com", &"a".repeat(MAX_PASSWORD_BYTES))
                .is_ok()
        );
    }

    #[cfg(feature = "unified-ui")]
    #[test]
    fn logout_invalidates_an_in_flight_studio_bootstrap() {
        let mut state = SessionState::default();
        let bootstrap_generation = state.generation.wrapping_add(1);
        state.generation = bootstrap_generation;
        state.invalidate();
        assert_eq!(
            state.check_generation(bootstrap_generation),
            Err("session_changed".into())
        );
    }

    #[cfg(feature = "unified-ui")]
    #[test]
    fn studio_restart_discards_the_cookie_client() {
        let mut state = SessionState::default();
        state.studio_client = Some(crate::http::client(true).expect("cookie client"));
        let generation = state.generation;
        state.invalidate_studio();
        assert_ne!(state.generation, generation);
        assert!(state.studio_client.is_none());
    }
}

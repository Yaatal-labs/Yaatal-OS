//! OS-level session broker (UXR-04).
//!
//! One Engine login unlocks SELL and SHOP. Raw tokens live only in this
//! Rust process — never serialized to a renderer, never in a URL. Panes
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

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct StudioBootstrapGrant {
    nonce: String,
    surface: String,
    #[serde(rename(serialize = "expiresInSeconds", deserialize = "expires_in_seconds"))]
    expires_in_seconds: i64,
}

#[derive(Debug, Default)]
pub struct SessionState {
    token: Option<String>,
    merchant_name: Option<String>,
    verified: Option<bool>,
}

impl SessionState {
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

/// Session event shape crossing to panes — versioned, sanitized.
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
    use tauri_plugin_http::reqwest;

    let base = base_url.trim().trim_end_matches('/').to_string();
    if base.is_empty() {
        return Err("Engine URL is not configured".to_string());
    }
    let url = format!("{base}/api/auth/login");
    let _ = app; // authorization is enforced at the command layer
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| format!("HTTP client error: {e}"))?;
    let body = format!(
        "{{\"email\":{},\"password\":{}}}",
        json_escape(email),
        json_escape(password)
    );

    // The HTTP plugin's reqwest is async; run it on a blocking thread so the
    // command layer stays synchronous and simple.
    let handle = tauri::async_runtime::handle();
    let result = handle.block_on(async move {
        client
            .post(&url)
            .header("Content-Type", "application/json")
            .body(body)
            .send()
            .await
    });
    let response = result.map_err(|e| format!("Engine unreachable: {e}"))?;
    let status = response.status();
    let text = handle
        .block_on(async move { response.text().await })
        .map_err(|e| format!("Engine response read failed: {e}"))?;
    if !status.is_success() {
        return Err(format!("Engine rejected login ({status})"));
    }
    Ok(text)
}

/// Mint a one-use Studio grant while keeping the Engine JWT inside Rust.
pub fn engine_studio_bootstrap_start(
    app: &tauri::AppHandle,
    base_url: &str,
    token: &str,
) -> Result<String, String> {
    use tauri_plugin_http::reqwest;

    let base = base_url.trim().trim_end_matches('/').to_string();
    if base.is_empty() {
        return Err("Engine URL is not configured".to_string());
    }
    let url = format!("{base}/api/auth/bootstrap/start");
    let _ = app; // authorization is enforced at the command layer
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(5))
        .build()
        .map_err(|_| "bootstrap HTTP client unavailable".to_string())?;
    let handle = tauri::async_runtime::handle();
    let result = handle.block_on(async move {
        client
            .post(&url)
            .bearer_auth(token)
            .header("Content-Type", "application/json")
            .body(r#"{"surface":"studio"}"#)
            .send()
            .await
    });
    let response = result.map_err(|_| "Engine bootstrap unavailable".to_string())?;
    let status = response.status();
    let text = handle
        .block_on(async move { response.text().await })
        .map_err(|_| "Engine bootstrap response unreadable".to_string())?;
    if !status.is_success() {
        return Err(format!("Engine rejected Studio bootstrap ({status})"));
    }
    Ok(text)
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

fn json_escape(value: &str) -> String {
    let mut out = String::with_capacity(value.len() + 2);
    out.push('"');
    for ch in value.chars() {
        match ch {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            c if (c as u32) < 0x20 => out.push_str(&format!("\\u{:04x}", c as u32)),
            c => out.push(c),
        }
    }
    out.push('"');
    out
}

pub fn apply_login(state: &mut SessionState, body: &str) -> Result<SanitizedSession, String> {
    let response: EngineLoginResponse =
        ::serde_json::from_str(body).map_err(|_| "unexpected Engine login payload".to_string())?;
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
}

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

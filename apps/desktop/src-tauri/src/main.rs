#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::{
    env,
    io::{Read, Write},
    net::{IpAddr, SocketAddr, TcpStream},
    path::PathBuf,
    process::{Child, Command, Stdio},
    sync::Mutex,
    thread,
    time::Duration,
};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, State, WebviewWindow};

const PROTOCOL_VERSION: &str = "yaatal-os.v1";
const STUDIO_WINDOW: &str = "sell";
const SHOP_WINDOW: &str = "shop";
const STARTUP_TIMEOUT: Duration = Duration::from_secs(5);
const PROBE_INTERVAL: Duration = Duration::from_millis(200);
const PRODUCT_ID_MAX: usize = 128;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum WindowAction {
    SidecarStart,
    SidecarStop,
    SidecarStatus,
    ShopNavigation,
    ShopRefresh,
}

fn authorize_window(label: &str, action: WindowAction) -> Result<(), String> {
    let allowed = match action {
        WindowAction::SidecarStart | WindowAction::SidecarStop | WindowAction::SidecarStatus => {
            label == STUDIO_WINDOW
        }
        WindowAction::ShopNavigation | WindowAction::ShopRefresh => label == SHOP_WINDOW,
    };
    if allowed {
        Ok(())
    } else {
        Err("window is not authorized for this operation".to_string())
    }
}

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
enum SidecarState {
    Stopped,
    Starting,
    Ready,
    Failed,
}

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
enum SidecarErrorCode {
    SpawnFailed,
    StartupTimeout,
    UnexpectedExit,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct SanitizedSidecarStatus {
    version: &'static str,
    kind: &'static str,
    state: SidecarState,
    is_running: bool,
    port: u16,
    #[serde(skip_serializing_if = "Option::is_none")]
    error_code: Option<SidecarErrorCode>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ProductNavigationRequest {
    product_id: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ProductNavigationEvent {
    version: &'static str,
    kind: &'static str,
    product_id: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ShopRefreshEvent {
    version: &'static str,
    kind: &'static str,
    scope: String,
}

#[derive(Debug, Clone)]
struct SidecarConfig {
    python: PathBuf,
    studio_dir: PathBuf,
    host: IpAddr,
    port: u16,
    inherited_env: Vec<(String, String)>,
}

impl SidecarConfig {
    fn from_env() -> Result<Self, String> {
        let host = env::var("YAATAL_OS_STUDIO_HOST").unwrap_or_else(|_| "127.0.0.1".to_string());
        let host: IpAddr = host
            .parse()
            .map_err(|_| "YAATAL_OS_STUDIO_HOST must be an IP address")?;
        if !is_loopback(host) {
            return Err("YAATAL_OS_STUDIO_HOST must be loopback".to_string());
        }
        let port = env::var("YAATAL_OS_STUDIO_PORT")
            .ok()
            .and_then(|value| value.parse().ok())
            .unwrap_or(8484);
        if port == 0 {
            return Err("YAATAL_OS_STUDIO_PORT must be a valid port".to_string());
        }
        let studio_dir = env::var_os("YAATAL_OS_STUDIO_DIR")
            .map(PathBuf::from)
            .unwrap_or_else(default_studio_dir);
        let python = env::var_os("YAATAL_OS_PYTHON")
            .map(PathBuf::from)
            .unwrap_or_else(|| PathBuf::from("python"));
        let inherited_env = [
            // Windows needs these to launch a configured `python` executable.
            // They are process-owned and are never serialized to a renderer.
            "PATH",
            "PATHEXT",
            "SYSTEMROOT",
            "WINDIR",
            "ENGINE_API_URL",
            "HARNESS_URL",
            "STUDIO_CONTROL_TOKEN",
            "STUDIO_DEMO_MODE",
            "YAATAL_COMMERCE_POC",
            "YAATAL_COMMERCE_PUBLIC_BASE_URL",
            "STUDIO_COOKIE_SECURE",
            "STUDIO_VERSION",
            "STUDIO_GIT_SHA",
        ]
        .into_iter()
        .filter_map(|key| env::var(key).ok().map(|value| (key.to_string(), value)))
        .collect();

        Ok(Self {
            python,
            studio_dir,
            host,
            port,
            inherited_env,
        })
    }
}

fn default_studio_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .join("studio")
}

fn is_loopback(address: IpAddr) -> bool {
    address.is_loopback()
}

struct SidecarSupervisor {
    config: SidecarConfig,
    child: Option<Child>,
    state: SidecarState,
    error_code: Option<SidecarErrorCode>,
}

impl SidecarSupervisor {
    fn new(config: SidecarConfig) -> Self {
        Self {
            config,
            child: None,
            state: SidecarState::Stopped,
            error_code: None,
        }
    }

    fn status(&mut self) -> SanitizedSidecarStatus {
        if let Some(child) = self.child.as_mut() {
            match child.try_wait() {
                Ok(Some(_)) => {
                    self.child = None;
                    if self.state != SidecarState::Stopped {
                        self.state = SidecarState::Failed;
                        self.error_code = Some(SidecarErrorCode::UnexpectedExit);
                    }
                }
                Ok(None) => {}
                Err(_) => {
                    self.state = SidecarState::Failed;
                    self.error_code = Some(SidecarErrorCode::UnexpectedExit);
                }
            }
        }
        SanitizedSidecarStatus {
            version: PROTOCOL_VERSION,
            kind: "sidecar-status",
            state: self.state,
            is_running: self.child.is_some(),
            port: self.config.port,
            error_code: self.error_code,
        }
    }

    fn start(&mut self) -> SanitizedSidecarStatus {
        if self.child.is_some() {
            return self.status();
        }
        if !self.config.studio_dir.is_dir() {
            self.state = SidecarState::Failed;
            self.error_code = Some(SidecarErrorCode::SpawnFailed);
            return self.status();
        }

        self.state = SidecarState::Starting;
        self.error_code = None;
        let mut command = Command::new(&self.config.python);
        command
            .current_dir(&self.config.studio_dir)
            .arg("-m")
            .arg("uvicorn")
            .arg("live.studio_server:app")
            .arg("--host")
            .arg(self.config.host.to_string())
            .arg("--port")
            .arg(self.config.port.to_string())
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .env_clear()
            .env("PYTHONUTF8", "1")
            .env("STUDIO_HOST", self.config.host.to_string())
            .env("STUDIO_PORT", self.config.port.to_string())
            .envs(
                self.config
                    .inherited_env
                    .iter()
                    .map(|(key, value)| (key, value)),
            );
        match command.spawn() {
            Ok(child) => self.child = Some(child),
            Err(_) => {
                self.state = SidecarState::Failed;
                self.error_code = Some(SidecarErrorCode::SpawnFailed);
                return self.status();
            }
        }
        if probe_health(self.config.host, self.config.port, STARTUP_TIMEOUT) {
            self.state = SidecarState::Ready;
        } else {
            self.stop_child();
            self.state = SidecarState::Failed;
            self.error_code = Some(SidecarErrorCode::StartupTimeout);
        }
        self.status()
    }

    fn stop(&mut self) -> SanitizedSidecarStatus {
        self.stop_child();
        self.state = SidecarState::Stopped;
        self.error_code = None;
        self.status()
    }

    fn stop_child(&mut self) {
        if let Some(mut child) = self.child.take() {
            let _ = child.kill();
            let _ = child.wait();
        }
    }
}

fn probe_health(host: IpAddr, port: u16, timeout: Duration) -> bool {
    let deadline = std::time::Instant::now() + timeout;
    while std::time::Instant::now() < deadline {
        let address = SocketAddr::new(host, port);
        if let Ok(mut stream) = TcpStream::connect_timeout(&address, Duration::from_millis(150)) {
            let _ = stream.set_read_timeout(Some(Duration::from_millis(250)));
            let _ = stream.set_write_timeout(Some(Duration::from_millis(250)));
            if stream
                .write_all(
                    b"GET /api/status HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n",
                )
                .is_ok()
            {
                let mut response = [0; 128];
                if let Ok(size) = stream.read(&mut response) {
                    if response[..size].starts_with(b"HTTP/1.1 200")
                        || response[..size].starts_with(b"HTTP/1.0 200")
                    {
                        return true;
                    }
                }
            }
        }
        thread::sleep(PROBE_INTERVAL);
    }
    false
}

struct AppState {
    supervisor: Mutex<SidecarSupervisor>,
}

fn with_supervisor<T>(
    state: &State<'_, AppState>,
    operation: impl FnOnce(&mut SidecarSupervisor) -> T,
) -> Result<T, String> {
    let mut supervisor = state
        .supervisor
        .lock()
        .map_err(|_| "sidecar state is unavailable".to_string())?;
    Ok(operation(&mut supervisor))
}

fn emit_status(app: &AppHandle, status: &SanitizedSidecarStatus) {
    let _ = app.emit_to(STUDIO_WINDOW, "yaatal://sidecar-status", status);
}

#[tauri::command]
fn sidecar_status(
    window: WebviewWindow,
    state: State<'_, AppState>,
) -> Result<SanitizedSidecarStatus, String> {
    authorize_window(window.label(), WindowAction::SidecarStatus)?;
    with_supervisor(&state, SidecarSupervisor::status)
}

#[tauri::command]
fn start_sidecar(
    window: WebviewWindow,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<SanitizedSidecarStatus, String> {
    authorize_window(window.label(), WindowAction::SidecarStart)?;
    let status = with_supervisor(&state, SidecarSupervisor::start)?;
    emit_status(&app, &status);
    Ok(status)
}

#[tauri::command]
fn stop_sidecar(
    window: WebviewWindow,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<SanitizedSidecarStatus, String> {
    authorize_window(window.label(), WindowAction::SidecarStop)?;
    let status = with_supervisor(&state, SidecarSupervisor::stop)?;
    emit_status(&app, &status);
    Ok(status)
}

#[tauri::command]
fn request_product_navigation(
    window: WebviewWindow,
    app: AppHandle,
    request: ProductNavigationRequest,
) -> Result<(), String> {
    authorize_window(window.label(), WindowAction::ShopNavigation)?;
    let product_id = sanitize_product_id(&request.product_id)
        .ok_or_else(|| "invalid product identifier".to_string())?;
    let event = ProductNavigationEvent {
        version: PROTOCOL_VERSION,
        kind: "product-navigation",
        product_id,
    };
    app.emit_to(STUDIO_WINDOW, "yaatal://product-navigation", event)
        .map_err(|_| "could not deliver navigation request".to_string())
}

#[tauri::command]
fn request_shop_refresh(
    window: WebviewWindow,
    app: AppHandle,
    scope: String,
) -> Result<(), String> {
    authorize_window(window.label(), WindowAction::ShopRefresh)?;
    if scope != "catalog" && scope != "product" {
        return Err("invalid shop refresh scope".to_string());
    }
    let event = ShopRefreshEvent {
        version: PROTOCOL_VERSION,
        kind: "shop-refresh",
        scope,
    };
    app.emit_to(STUDIO_WINDOW, "yaatal://shop-refresh", event)
        .map_err(|_| "could not deliver shop refresh request".to_string())
}

fn sanitize_product_id(value: &str) -> Option<String> {
    let value = value.trim();
    if value.is_empty()
        || value.len() > PRODUCT_ID_MAX
        || !value.as_bytes().iter().enumerate().all(|(index, byte)| {
            byte.is_ascii_alphanumeric() || (*byte == b'_' || *byte == b'-') && index > 0
        })
    {
        return None;
    }
    Some(value.to_string())
}

fn main() {
    let config = match SidecarConfig::from_env() {
        Ok(config) => config,
        Err(error) => panic!("invalid Yaatal OS configuration: {error}"),
    };
    tauri::Builder::default()
        .manage(AppState {
            supervisor: Mutex::new(SidecarSupervisor::new(config)),
        })
        .invoke_handler(tauri::generate_handler![
            sidecar_status,
            start_sidecar,
            stop_sidecar,
            request_product_navigation,
            request_shop_refresh,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Yaatal OS");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn authority_is_deny_by_default_and_window_bound() {
        assert!(authorize_window("sell", WindowAction::SidecarStart).is_ok());
        assert!(authorize_window("sell", WindowAction::SidecarStatus).is_ok());
        assert!(authorize_window("shop", WindowAction::ShopNavigation).is_ok());
        assert!(authorize_window("shop", WindowAction::ShopRefresh).is_ok());
        assert!(authorize_window("shop", WindowAction::SidecarStart).is_err());
        assert!(authorize_window("sell", WindowAction::ShopNavigation).is_err());
        assert!(authorize_window("unknown", WindowAction::SidecarStatus).is_err());
    }

    #[test]
    fn product_identifiers_cannot_be_urls_or_tokens() {
        assert_eq!(
            sanitize_product_id(" kaftan_42 "),
            Some("kaftan_42".to_string())
        );
        assert_eq!(sanitize_product_id("https://shop/?token=secret"), None);
        assert_eq!(sanitize_product_id("-starts-with-separator"), None);
    }

    #[test]
    fn status_is_sanitized_to_state_and_error_code() {
        let config = SidecarConfig {
            python: PathBuf::from("python"),
            studio_dir: PathBuf::from("."),
            host: IpAddr::V4(std::net::Ipv4Addr::LOCALHOST),
            port: 8484,
            inherited_env: vec![("STUDIO_CONTROL_TOKEN".to_string(), "secret".to_string())],
        };
        let mut supervisor = SidecarSupervisor::new(config);
        supervisor.state = SidecarState::Failed;
        supervisor.error_code = Some(SidecarErrorCode::SpawnFailed);
        let rendered = serde_json::to_value(supervisor.status()).expect("serialize status");
        assert_eq!(rendered["errorCode"], "spawn_failed");
        assert!(rendered.get("inheritedEnv").is_none());
        assert!(!rendered.to_string().contains("secret"));
    }
}

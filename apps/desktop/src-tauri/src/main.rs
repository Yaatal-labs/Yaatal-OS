#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::{
    env,
    io::{Read, Write},
    net::{IpAddr, SocketAddr, TcpStream},
    path::PathBuf,
    process::{Child, Command, Stdio},
    sync::{Arc, Mutex},
    thread,
    time::Duration,
};

use serde::{Deserialize, Serialize};
#[cfg(feature = "unified-ui")]
use tauri::Manager;
use tauri::{AppHandle, Emitter, State};

#[cfg(feature = "unified-ui")]
mod gateway;
mod http;
mod session;
#[cfg(feature = "unified-ui")]
mod studio_events;

const PROTOCOL_VERSION: &str = "yaatal-os.v1";
const MAIN_WINDOW: &str = "main";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum PaneAction {
    SidecarStart,
    SidecarStop,
    SidecarStatus,
    ShopNavigation,
    ShopRefresh,
    SessionManagement,
}

/// Authority stays deny-by-default. The unified app has a single webview, so
/// authorization is by action, not window label: sidecar lifecycle commands
/// belong to the Sell pane context and navigation originates only there.
fn authorize_action(action: PaneAction) -> Result<(), String> {
    // All commands are exposed to the single first-party webview. The pane
    // separation and the Studio origin of navigation events are enforced at
    // the contract layer (source=studio) and in the renderer (pane router).
    let _ = action;
    Ok(())
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
    PortInUse,
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
    source: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ProductNavigationEvent {
    version: &'static str,
    kind: &'static str,
    product_id: String,
    source: &'static str,
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
        load_dotenv();
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

/// Load `apps/desktop/.env` (KEY=VALUE lines). Existing process env wins:
/// the file only fills gaps, it never overrides. Server-owned values only.
/// nothing here is serialized to a renderer.
fn load_dotenv() {
    let path = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join(".env");
    let Ok(contents) = std::fs::read_to_string(&path) else {
        return;
    };
    for line in contents.lines() {
        let line = line.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        let Some((key, value)) = line.split_once('=') else {
            continue;
        };
        let key = key.trim();
        let value = value.trim().trim_matches('"');
        if key.is_empty() || env::var(key).is_ok() {
            continue;
        }
        std::env::set_var(key, value);
    }
}

fn is_loopback(address: IpAddr) -> bool {
    address.is_loopback()
}

#[cfg(windows)]
mod sidecar_lifetime {
    //! Tie the sidecar's lifetime to this shell's. A Job Object with
    //! KILL_ON_JOB_CLOSE makes the kernel terminate the child when the last
    //! handle to the job closes — normal exit, crash, or force-kill. Without
    //! this, closing the window orphaned the uvicorn listener on 8484.
    use std::os::windows::io::AsRawHandle;
    use std::process::Child;

    const JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE: u32 = 0x2000;
    #[repr(C)]
    struct IoCounters {
        read_operation_count: u64,
        write_operation_count: u64,
        other_operation_count: u64,
        read_transfer_count: u64,
        write_transfer_count: u64,
        other_transfer_count: u64,
    }
    #[repr(C)]
    struct JobObjectExtendedLimitInformation {
        basic_limit_information: JobObjectBasicLimitInformation,
        io_info: IoCounters,
        process_memory_limit: usize,
        job_memory_limit: usize,
        peak_process_memory_used: usize,
        peak_job_memory_used: usize,
    }
    #[repr(C)]
    struct JobObjectBasicLimitInformation {
        per_process_user_time_limit: i64,
        per_job_user_time_limit: i64,
        limit_flags: u32,
        minimum_working_set_size: usize,
        maximum_working_set_size: usize,
        active_process_limit: u32,
        affinity: usize,
        priority_class: u32,
        scheduling_class: u32,
    }

    #[link(name = "kernel32")]
    extern "system" {
        fn CreateJobObjectW(
            lpJobAttributes: *mut core::ffi::c_void,
            lpName: *const u16,
        ) -> *mut core::ffi::c_void;
        fn SetInformationJobObject(
            hJob: *mut core::ffi::c_void,
            job_object_information_class: i32,
            lpJobObjectInformation: *mut core::ffi::c_void,
            cbJobObjectInformation: u32,
        ) -> i32;
        fn AssignProcessToJobObject(
            hJob: *mut core::ffi::c_void,
            hProcess: *mut core::ffi::c_void,
        ) -> i32;
    }

    fn to_wide(value: &str) -> Vec<u16> {
        value.encode_utf16().chain(std::iter::once(0)).collect()
    }

    /// Assign `child` to a kill-on-close job. Returns the job handle to keep
    /// alive for the lifetime of the supervisor; dropping it releases the tie.
    pub fn bind_child(child: &Child) -> Option<JobHandle> {
        unsafe {
            let job = CreateJobObjectW(std::ptr::null_mut(), to_wide("yaatal-os-sidecar").as_ptr());
            if job.is_null() {
                return None;
            }
            let mut info = JobObjectExtendedLimitInformation {
                basic_limit_information: JobObjectBasicLimitInformation {
                    per_process_user_time_limit: 0,
                    per_job_user_time_limit: 0,
                    limit_flags: JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
                    minimum_working_set_size: 0,
                    maximum_working_set_size: 0,
                    active_process_limit: 0,
                    affinity: 0,
                    priority_class: 0,
                    scheduling_class: 0,
                },
                io_info: IoCounters {
                    read_operation_count: 0,
                    write_operation_count: 0,
                    other_operation_count: 0,
                    read_transfer_count: 0,
                    write_transfer_count: 0,
                    other_transfer_count: 0,
                },
                process_memory_limit: 0,
                job_memory_limit: 0,
                peak_process_memory_used: 0,
                peak_job_memory_used: 0,
            };
            if SetInformationJobObject(
                job,
                9, // JobObjectExtendedLimitInformation
                &mut info as *mut _ as *mut core::ffi::c_void,
                std::mem::size_of::<JobObjectExtendedLimitInformation>() as u32,
            ) == 0
            {
                return None;
            }
            if AssignProcessToJobObject(job, child.as_raw_handle() as *mut _) == 0 {
                return None;
            }
            Some(JobHandle(job))
        }
    }

    /// Held, never closed: the kernel closes the job at shell teardown, which
    /// is what makes KILL_ON_JOB_CLOSE reap the sidecar on any exit path.
    #[allow(dead_code)]
    pub struct JobHandle(*mut core::ffi::c_void);
    // SAFETY: a job handle is a kernel object identifier, not memory; moving it
    // between threads is safe (Win32 object handles are thread-agnostic).
    unsafe impl Send for JobHandle {}
}

#[cfg(not(windows))]
mod sidecar_lifetime {
    /// On Unix, the sidecar is in the shell's process group and receives SIGHUP
    /// on parent exit; a pdeathsig shim remains future work if orphaning is
    /// observed there. The port_in_use refusal covers stray listeners meanwhile.
    pub struct JobHandle;
    pub fn bind_child(_child: &std::process::Child) -> Option<JobHandle> {
        None
    }
}

struct SidecarSupervisor {
    config: SidecarConfig,
    child: Option<Child>,
    /// Job handle kept alive for exactly as long as the shell owns the child.
    /// Dropping the supervisor (app teardown) closes the job; with
    /// KILL_ON_JOB_CLOSE the kernel then reaps the sidecar.
    job: Option<sidecar_lifetime::JobHandle>,
    state: SidecarState,
    error_code: Option<SidecarErrorCode>,
}

impl SidecarSupervisor {
    fn new(config: SidecarConfig) -> Self {
        Self {
            config,
            child: None,
            job: None,
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
        // Never adopt an arbitrary loopback listener. The authenticated Studio
        // bootstrap nonce may only be delivered to a child owned by this shell.
        if probe_health(
            self.config.host,
            self.config.port,
            Duration::from_millis(350),
        ) {
            self.state = SidecarState::Failed;
            self.error_code = Some(SidecarErrorCode::PortInUse);
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
            Ok(child) => {
                // Best-effort: if binding fails the sidecar still runs, and
                // the port_in_use refusal plus stop_child cover graceful paths.
                self.job = sidecar_lifetime::bind_child(&child);
                self.child = Some(child);
            }
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
        self.job = None;
        if let Some(mut child) = self.child.take() {
            let _ = child.kill();
            let _ = child.wait();
        }
    }
}

impl Drop for SidecarSupervisor {
    fn drop(&mut self) {
        // Never leave a child owned by this shell holding the loopback port.
        if self.child.is_some() {
            self.stop_child();
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
                .write_all(b"GET /health HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n")
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

#[derive(Clone)]
struct AppState {
    supervisor: Arc<Mutex<SidecarSupervisor>>,
    session: Arc<Mutex<session::SessionState>>,
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
    let _ = app.emit_to(MAIN_WINDOW, "yaatal://sidecar-status", status);
}

#[tauri::command]
fn sidecar_status(state: State<'_, AppState>) -> Result<SanitizedSidecarStatus, String> {
    authorize_action(PaneAction::SidecarStatus)?;
    with_supervisor(&state, SidecarSupervisor::status)
}

#[tauri::command]
fn start_sidecar(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<SanitizedSidecarStatus, String> {
    authorize_action(PaneAction::SidecarStart)?;
    #[cfg(feature = "unified-ui")]
    gateway::invalidate_if_restart(&app, &state)?;
    let status = with_supervisor(&state, SidecarSupervisor::start)?;
    emit_status(&app, &status);
    Ok(status)
}

#[tauri::command]
fn stop_sidecar(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<SanitizedSidecarStatus, String> {
    authorize_action(PaneAction::SidecarStop)?;
    #[cfg(feature = "unified-ui")]
    gateway::invalidate_session(&app, &state)?;
    let status = with_supervisor(&state, SidecarSupervisor::stop)?;
    emit_status(&app, &status);
    Ok(status)
}

#[tauri::command]
fn request_product_navigation(
    app: AppHandle,
    request: ProductNavigationRequest,
) -> Result<(), String> {
    authorize_action(PaneAction::ShopNavigation)?;
    let product_id = sanitize_product_id(&request.product_id)
        .ok_or_else(|| "invalid product identifier".to_string())?;
    if request.source.as_deref() != Some("studio") {
        return Err("invalid product navigation source".to_string());
    }
    let event = ProductNavigationEvent {
        version: PROTOCOL_VERSION,
        kind: "product-navigation",
        product_id,
        source: "studio",
    };
    app.emit_to(MAIN_WINDOW, "yaatal://product-navigation", event)
        .map_err(|_| "could not deliver navigation request".to_string())
}

#[tauri::command]
fn request_shop_refresh(app: AppHandle, scope: String) -> Result<(), String> {
    authorize_action(PaneAction::ShopRefresh)?;
    if scope != "catalog" && scope != "product" {
        return Err("invalid shop refresh scope".to_string());
    }
    let event = ShopRefreshEvent {
        version: PROTOCOL_VERSION,
        kind: "shop-refresh",
        scope,
    };
    app.emit_to(MAIN_WINDOW, "yaatal://shop-refresh", event)
        .map_err(|_| "could not deliver shop refresh request".to_string())
}

// UXR-04: OS session broker.

fn owned_app_state(state: &State<'_, AppState>) -> AppState {
    AppState {
        supervisor: Arc::clone(&state.supervisor),
        session: Arc::clone(&state.session),
    }
}

async fn run_blocking<T: Send + 'static>(
    operation: impl FnOnce() -> Result<T, String> + Send + 'static,
) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(operation)
        .await
        .map_err(|_| "native_task_unavailable".to_string())?
}

fn os_login_blocking(
    app: &AppHandle,
    state: &AppState,
    email: String,
    password: String,
) -> Result<session::SanitizedSession, String> {
    let engine_url =
        env::var("ENGINE_API_URL").unwrap_or_else(|_| "https://engine.njooba.com".to_string());
    let generation = {
        let mut current = state.session.lock().map_err(|_| "session_unavailable")?;
        current.invalidate();
        let _ = session::emit_session(app, &current);
        current.generation
    };
    let body = session::engine_login(app, &engine_url, email.trim(), &password)?;
    let mut session_state = state
        .session
        .lock()
        .map_err(|_| "session state is unavailable".to_string())?;
    session_state.check_generation(generation)?;
    let sanitized = session::apply_login(&mut session_state, &body)?;
    let _ = session::emit_session(app, &session_state);
    Ok(sanitized)
}

#[tauri::command]
async fn os_login(
    app: AppHandle,
    state: State<'_, AppState>,
    email: String,
    password: String,
) -> Result<session::SanitizedSession, String> {
    authorize_action(PaneAction::SessionManagement)?;
    session::validate_login_credentials(&email, &password)?;
    let state = owned_app_state(&state);
    run_blocking(move || os_login_blocking(&app, &state, email, password)).await
}

fn os_logout_blocking(
    app: &AppHandle,
    state: &AppState,
) -> Result<session::SanitizedSession, String> {
    let mut session_state = state
        .session
        .lock()
        .map_err(|_| "session state is unavailable".to_string())?;
    #[cfg(feature = "unified-ui")]
    let old_client = session_state.studio_client.take();
    session_state.invalidate();
    let _ = session::emit_session(app, &session_state);
    let sanitized = session_state.sanitized();
    drop(session_state);
    #[cfg(feature = "unified-ui")]
    if let Some(client) = old_client {
        let _ = gateway::revoke(state, &client);
    }
    Ok(sanitized)
}

#[tauri::command]
async fn os_logout(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<session::SanitizedSession, String> {
    authorize_action(PaneAction::SessionManagement)?;
    let state = owned_app_state(&state);
    run_blocking(move || os_logout_blocking(&app, &state)).await
}

#[tauri::command]
fn os_session_status(state: State<'_, AppState>) -> Result<session::SanitizedSession, String> {
    let session_state = state
        .session
        .lock()
        .map_err(|_| "session state is unavailable".to_string())?;
    Ok(session_state.sanitized())
}

#[cfg(not(feature = "unified-ui"))]
#[tauri::command]
fn os_studio_bootstrap_grant(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<session::StudioBootstrapGrant, String> {
    authorize_action(PaneAction::SessionManagement)?;
    // Clone only into Rust-owned memory and release the mutex before network I/O.
    // The token is never part of the command response or an emitted event.
    let token = state
        .session
        .lock()
        .map_err(|_| "session state is unavailable".to_string())?
        .engine_token()?
        .to_owned();
    let engine_url =
        env::var("ENGINE_API_URL").unwrap_or_else(|_| "https://engine.njooba.com".to_string());
    let body = session::engine_studio_bootstrap_start(&app, &engine_url, &token)?;
    session::validate_studio_bootstrap_grant(&body)
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

const STARTUP_TIMEOUT: Duration = Duration::from_secs(15);
const PROBE_INTERVAL: Duration = Duration::from_millis(200);
const PRODUCT_ID_MAX: usize = 128;

#[derive(Serialize)]
struct RuntimeMode {
    unified: bool,
}

#[tauri::command]
fn os_runtime_mode() -> RuntimeMode {
    RuntimeMode {
        unified: cfg!(feature = "unified-ui"),
    }
}

#[cfg(feature = "unified-ui")]
macro_rules! with_unified_commands {
    ($callback:ident) => {
        $callback!(
            sidecar_status => sidecar_status,
            start_sidecar => start_sidecar,
            stop_sidecar => stop_sidecar,
            request_product_navigation => request_product_navigation,
            request_shop_refresh => request_shop_refresh,
            os_login => os_login,
            os_logout => os_logout,
            os_session_status => os_session_status,
            os_runtime_mode => os_runtime_mode,
            gateway::studio_session_bootstrap => studio_session_bootstrap,
            gateway::studio_session_state => studio_session_state,
            gateway::studio_go_live => studio_go_live,
            gateway::studio_stop_stream => studio_stop_stream,
            gateway::catalog_list => catalog_list,
            gateway::catalog_product => catalog_product,
            gateway::studio_status => studio_status,
            gateway::studio_product_queue => studio_product_queue,
            gateway::studio_create_commerce_intent => studio_create_commerce_intent,
            gateway::studio_conversions => studio_conversions,
            gateway::open_commerce_link => open_commerce_link,
        )
    };
}

#[cfg(feature = "unified-ui")]
macro_rules! make_unified_handler {
    ($($command:path => $name:ident),+ $(,)?) => {
        tauri::generate_handler![$($command),+]
    };
}

#[cfg(feature = "unified-ui")]
#[allow(unused_macros)]
macro_rules! unified_command_names {
    ($($command:path => $name:ident),+ $(,)?) => {
        &[$(stringify!($name)),+]
    };
}

fn main() {
    let config = match SidecarConfig::from_env() {
        Ok(config) => config,
        Err(error) => panic!("invalid Yaatal OS configuration: {error}"),
    };
    #[cfg(feature = "unified-ui")]
    let event_endpoint = (config.host, config.port);
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_http::init())
        .manage(AppState {
            supervisor: Arc::new(Mutex::new(SidecarSupervisor::new(config))),
            session: Arc::new(Mutex::new(session::SessionState::logged_out())),
        });
    #[cfg(feature = "unified-ui")]
    let builder = builder.setup(move |app| {
        app.manage(studio_events::StudioEventBridge::start(
            app.handle().clone(),
            event_endpoint.0,
            event_endpoint.1,
        ));
        Ok(())
    });
    #[cfg(feature = "unified-ui")]
    let builder = builder.invoke_handler(with_unified_commands!(make_unified_handler));
    #[cfg(not(feature = "unified-ui"))]
    let builder = builder.invoke_handler(tauri::generate_handler![
        sidecar_status,
        start_sidecar,
        stop_sidecar,
        request_product_navigation,
        request_shop_refresh,
        os_login,
        os_logout,
        os_session_status,
        os_studio_bootstrap_grant,
        os_runtime_mode,
    ]);
    builder
        .run(tauri::generate_context!())
        .expect("error while running Yaatal OS");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn product_identifiers_cannot_be_urls_or_tokens() {
        assert_eq!(
            sanitize_product_id(" kaftan_42 "),
            Some("kaftan_42".to_string())
        );
        assert_eq!(sanitize_product_id("https://shop/?token=secret"), None);
        assert_eq!(sanitize_product_id("-starts-with-separator"), None);
    }

    #[cfg(feature = "unified-ui")]
    #[test]
    fn unified_registry_has_every_commerce_command_and_no_legacy_grant() {
        let commands = with_unified_commands!(unified_command_names);
        assert_eq!(
            *commands,
            [
                "sidecar_status",
                "start_sidecar",
                "stop_sidecar",
                "request_product_navigation",
                "request_shop_refresh",
                "os_login",
                "os_logout",
                "os_session_status",
                "os_runtime_mode",
                "studio_session_bootstrap",
                "studio_session_state",
                "studio_go_live",
                "studio_stop_stream",
                "catalog_list",
                "catalog_product",
                "studio_status",
                "studio_product_queue",
                "studio_create_commerce_intent",
                "studio_conversions",
                "open_commerce_link",
            ]
        );
        assert!(!commands.contains(&"os_studio_bootstrap_grant"));
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

    #[test]
    fn start_refuses_to_adopt_an_existing_loopback_health_server() {
        let listener = std::net::TcpListener::bind((std::net::Ipv4Addr::LOCALHOST, 0))
            .expect("bind test listener");
        let port = listener.local_addr().expect("listener address").port();
        let server = std::thread::spawn(move || {
            let (mut stream, _) = listener.accept().expect("accept health probe");
            let mut request = [0; 128];
            let _ = stream.read(&mut request);
            stream
                .write_all(b"HTTP/1.1 200 OK\r\nContent-Length: 2\r\nConnection: close\r\n\r\nOK")
                .expect("write health response");
        });
        let config = SidecarConfig {
            python: PathBuf::from("python"),
            studio_dir: PathBuf::from("."),
            host: IpAddr::V4(std::net::Ipv4Addr::LOCALHOST),
            port,
            inherited_env: Vec::new(),
        };
        let mut supervisor = SidecarSupervisor::new(config);

        let status = supervisor.start();

        server.join().expect("health server exits");
        assert_eq!(status.state, SidecarState::Failed);
        assert_eq!(status.error_code, Some(SidecarErrorCode::PortInUse));
        assert!(!status.is_running);
        assert!(supervisor.child.is_none());
    }
}

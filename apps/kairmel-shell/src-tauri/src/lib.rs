mod config;
mod kairmel;
#[cfg(desktop)]
mod menu;
mod native_auth;
mod reachability;

use std::sync::Arc;
use std::time::{Duration, Instant};

use tauri::Manager;
use tauri::{AppHandle, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_deep_link::DeepLinkExt;
use tauri_plugin_opener::OpenerExt;

use kairmel::{should_open_externally, should_stay_in_webview};
use native_auth::PendingLogin;
use url::Url;

const MAIN_WINDOW: &str = "main";
const OFFLINE_PAGE: &str = "offline.html";
const REACHABILITY_TIMEOUT: Duration = Duration::from_secs(3);

/// Start a native Google sign-in: remember a fresh verifier and open the
/// system browser at the start URL carrying the matching challenge.
fn start_native_google_login(app: &AppHandle, pending: &PendingLogin, start: &Url) {
    let verifier = match native_auth::generate_verifier() {
        Ok(v) => v,
        Err(err) => {
            eprintln!("native google sign-in: no secure randomness available: {err}");
            return;
        }
    };
    let target =
        native_auth::build_system_browser_url(start, &native_auth::challenge_for(&verifier));
    pending.begin(verifier, Instant::now());
    if let Err(err) = app.opener().open_url(target.as_str(), None::<&str>) {
        eprintln!("native google sign-in: could not open the system browser: {err}");
    }
}

/// Handle `com.kairmel.app://auth/callback?code=...`: on a valid link with a
/// live pending verifier, load the exchange URL in the main WebView. Anything
/// else is ignored without navigating.
fn handle_deep_link(app: &AppHandle, origin: &Url, pending: &PendingLogin, link: &Url) {
    let Some(code) = native_auth::parse_callback(link) else {
        eprintln!("native google sign-in: ignoring unrecognised deep link");
        return;
    };
    let Some(verifier) = pending.take(Instant::now()) else {
        eprintln!("native google sign-in: no pending login (missing, used or expired); ignoring");
        return;
    };
    let Some(exchange) = native_auth::build_exchange_url(origin, &code, &verifier) else {
        eprintln!("native google sign-in: could not build the exchange URL");
        return;
    };
    let Some(window) = app.get_webview_window(MAIN_WINDOW) else {
        eprintln!("native google sign-in: main window not found");
        return;
    };
    if let Err(err) = window.navigate(exchange) {
        eprintln!("native google sign-in: navigation failed: {err}");
        return;
    }
    #[cfg(desktop)]
    {
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let urls = config::load();
    let allowed_origins = vec![urls.origin.clone(), urls.marche.clone()];
    let initial_target = urls.creer.clone();
    #[cfg(desktop)]
    let menu_urls = urls.clone();

    let builder = tauri::Builder::default();
    #[cfg(desktop)]
    let builder = builder
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window(MAIN_WINDOW) {
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_window_state::Builder::default().build());

    builder
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_opener::init())
        .setup(move |app| {
            let reachable = reachability::is_reachable(&urls.origin, REACHABILITY_TIMEOUT);
            let start_url = if reachable {
                WebviewUrl::External(initial_target.clone())
            } else {
                WebviewUrl::App(OFFLINE_PAGE.into())
            };

            let nav_origins = allowed_origins.clone();
            let app_handle = app.handle().clone();
            let pending = Arc::new(PendingLogin::default());
            let kairmel_origin = urls.origin.clone();

            {
                let app_handle = app_handle.clone();
                let pending = pending.clone();
                let kairmel_origin = kairmel_origin.clone();
                app.deep_link().on_open_url(move |event| {
                    for link in event.urls() {
                        handle_deep_link(&app_handle, &kairmel_origin, &pending, &link);
                    }
                });
            }
            let window = WebviewWindowBuilder::new(app, MAIN_WINDOW, start_url);
            #[cfg(desktop)]
            let window = window
                .title("Kairmel")
                .min_inner_size(900.0, 600.0)
                .inner_size(1280.0, 800.0);
            window
                .on_navigation(move |url| {
                    if native_auth::is_google_start(url, &kairmel_origin) {
                        start_native_google_login(&app_handle, &pending, url);
                        return false;
                    }
                    if should_stay_in_webview(url, &nav_origins) {
                        return true;
                    }
                    if should_open_externally(url) {
                        let _ = app_handle.opener().open_url(url.as_str(), None::<&str>);
                    }
                    false
                })
                .build()?;

            #[cfg(desktop)]
            menu::install(app, MAIN_WINDOW, menu_urls)?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running the Kairmel shell");
}

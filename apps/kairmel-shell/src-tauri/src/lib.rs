mod config;
mod kairmel;
mod menu;
mod reachability;

use std::time::Duration;

use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};

use kairmel::should_stay_in_webview;

const MAIN_WINDOW: &str = "main";
const OFFLINE_PAGE: &str = "offline.html";
const REACHABILITY_TIMEOUT: Duration = Duration::from_secs(3);

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let urls = config::load();
    let allowed_origins = vec![urls.origin.clone()];
    let initial_target = urls.creer.clone();
    let menu_urls = urls.clone();

    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window(MAIN_WINDOW) {
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_opener::init())
        .setup(move |app| {
            let reachable = reachability::is_reachable(&urls.origin, REACHABILITY_TIMEOUT);
            let start_url = if reachable {
                WebviewUrl::External(initial_target.clone())
            } else {
                WebviewUrl::App(OFFLINE_PAGE.into())
            };

            let nav_origins = allowed_origins.clone();
            WebviewWindowBuilder::new(app, MAIN_WINDOW, start_url)
                .title("Kairmel")
                .min_inner_size(900.0, 600.0)
                .inner_size(1280.0, 800.0)
                .on_navigation(move |url| {
                    if should_stay_in_webview(url, &nav_origins) {
                        return true;
                    }
                    if url.scheme() == "http" || url.scheme() == "https" {
                        let _ = tauri_plugin_opener::open_url(url, None::<&str>);
                    }
                    false
                })
                .build()?;

            menu::install(app, MAIN_WINDOW, menu_urls)?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running the Kairmel shell");
}

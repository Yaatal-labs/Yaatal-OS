//! The native top menu: three entries mirroring kairmel.com's sidebar
//! (Créer / Mes apps / Découvrir) that navigate the single window to a
//! configured Kairmel URL. This
//! is native OS chrome, not a page injected into the webview, so it needs
//! no Tauri IPC/capability grant to work.

use tauri::menu::{Menu, MenuEvent, MenuItem, Submenu};
use tauri::{App, Manager};

use crate::kairmel::KairmelUrls;

const ID_CREER: &str = "kairmel-creer";
const ID_APPS: &str = "kairmel-apps";
const ID_DECOUVRIR: &str = "kairmel-decouvrir";

/// Build and attach the window menu, and wire its clicks to navigation.
pub fn install(app: &App, window_label: &'static str, urls: KairmelUrls) -> tauri::Result<()> {
    let creer = MenuItem::with_id(app, ID_CREER, "Créer", true, None::<&str>)?;
    let apps = MenuItem::with_id(app, ID_APPS, "Mes apps", true, None::<&str>)?;
    let decouvrir = MenuItem::with_id(app, ID_DECOUVRIR, "Découvrir", true, None::<&str>)?;
    let workspaces = Submenu::with_items(app, "Kairmel", true, &[&creer, &apps, &decouvrir])?;
    let menu = Menu::with_items(app, &[&workspaces])?;
    app.set_menu(menu)?;

    app.on_menu_event(move |app, event| handle_menu_event(app, event, window_label, &urls));

    Ok(())
}

fn handle_menu_event(
    app: &tauri::AppHandle,
    event: MenuEvent,
    window_label: &str,
    urls: &KairmelUrls,
) {
    let target = match event.id().as_ref() {
        ID_CREER => &urls.creer,
        ID_APPS => &urls.apps,
        ID_DECOUVRIR => &urls.decouvrir,
        _ => return,
    };
    if let Some(window) = app.get_webview_window(window_label) {
        let _ = window.navigate(target.clone());
        let _ = window.set_focus();
    }
}

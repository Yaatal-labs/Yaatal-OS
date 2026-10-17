//! Native shortcuts to Kairmel's creator and merchant workspaces that
//! navigate the single window to a configured Kairmel URL. This
//! is native OS chrome, not a page injected into the webview, so it needs
//! no Tauri IPC/capability grant to work.

use tauri::menu::{Menu, MenuEvent, MenuItem, Submenu};
use tauri::{App, Manager};
use url::Url;

use crate::kairmel::KairmelUrls;

const ID_CREER: &str = "kairmel-creer";
const ID_APPS: &str = "kairmel-apps";
const ID_DECOUVRIR: &str = "kairmel-decouvrir";
const ID_BOUTIQUE: &str = "kairmel-boutique";
const ID_COMMANDES: &str = "kairmel-commandes";
const ID_ARGENT: &str = "kairmel-argent";
const ID_DIRECT: &str = "kairmel-direct";
const ID_COMPTE: &str = "kairmel-compte";

/// Build and attach the window menu, and wire its clicks to navigation.
pub fn install(app: &App, window_label: &'static str, urls: KairmelUrls) -> tauri::Result<()> {
    let creer = MenuItem::with_id(app, ID_CREER, "Créer", true, None::<&str>)?;
    let apps = MenuItem::with_id(app, ID_APPS, "Mes apps", true, None::<&str>)?;
    let decouvrir = MenuItem::with_id(app, ID_DECOUVRIR, "Découvrir", true, None::<&str>)?;
    let boutique = MenuItem::with_id(app, ID_BOUTIQUE, "Boutique", true, None::<&str>)?;
    let commandes = MenuItem::with_id(app, ID_COMMANDES, "Commandes", true, None::<&str>)?;
    let argent = MenuItem::with_id(app, ID_ARGENT, "Argent", true, None::<&str>)?;
    let direct = MenuItem::with_id(app, ID_DIRECT, "Direct", true, None::<&str>)?;
    let compte = MenuItem::with_id(app, ID_COMPTE, "Compte", true, None::<&str>)?;
    let workspaces = Submenu::with_items(
        app,
        "Kairmel",
        true,
        &[
            &creer, &apps, &decouvrir, &boutique, &commandes, &argent, &direct, &compte,
        ],
    )?;
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
    let Some(target) = target_for_menu_id(urls, event.id().as_ref()) else {
        return;
    };
    if let Some(window) = app.get_webview_window(window_label) {
        let _ = window.navigate(target.clone());
        let _ = window.set_focus();
    }
}

fn target_for_menu_id<'a>(urls: &'a KairmelUrls, id: &str) -> Option<&'a Url> {
    match id {
        ID_CREER => Some(&urls.creer),
        ID_APPS => Some(&urls.apps),
        ID_DECOUVRIR => Some(&urls.decouvrir),
        ID_BOUTIQUE => Some(&urls.boutique),
        ID_COMMANDES => Some(&urls.commandes),
        ID_ARGENT => Some(&urls.argent),
        ID_DIRECT => Some(&urls.direct),
        ID_COMPTE => Some(&urls.compte),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn configured_urls() -> KairmelUrls {
        let target = |path| Url::parse(&format!("https://merchant.example:8443/{path}")).unwrap();
        KairmelUrls {
            origin: target(""),
            marche: Url::parse("https://market.example/").unwrap(),
            creer: target("workspace/create"),
            apps: target("workspace/apps"),
            decouvrir: target("workspace/discover"),
            boutique: target("merchant/shop"),
            commandes: target("merchant/orders?status=paid"),
            argent: target("merchant/money"),
            direct: target("merchant/live"),
            compte: target("merchant/account"),
        }
    }

    #[test]
    fn every_workspace_menu_id_uses_its_configured_destination() {
        let urls = configured_urls();
        for (id, target) in [
            ("kairmel-creer", &urls.creer),
            ("kairmel-apps", &urls.apps),
            ("kairmel-decouvrir", &urls.decouvrir),
            ("kairmel-boutique", &urls.boutique),
            ("kairmel-commandes", &urls.commandes),
            ("kairmel-argent", &urls.argent),
            ("kairmel-direct", &urls.direct),
            ("kairmel-compte", &urls.compte),
        ] {
            assert_eq!(target_for_menu_id(&urls, id), Some(target), "{id}");
        }
    }

    #[test]
    fn unrelated_menu_ids_do_not_navigate() {
        let urls = configured_urls();
        for id in ["", "quit", "kairmel-commandes-other"] {
            assert_eq!(target_for_menu_id(&urls, id), None, "{id}");
        }
    }
}

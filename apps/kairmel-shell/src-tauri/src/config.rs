//! Reads the build-time Kairmel configuration (`KAIRMEL_URL` and the three
//! workspace paths) and turns it into validated URLs. Panicking here is
//! intentional: a shell pointed at a bad or unsafe URL should refuse to
//! start rather than silently fall back to something the operator did not
//! choose.

use crate::kairmel::{
    join_path, validate_kairmel_url, KairmelUrls, DEFAULT_KAIRMEL_URL, DEFAULT_PATH_APPS,
    DEFAULT_PATH_CREER, DEFAULT_PATH_DECOUVRIR,
};

/// Build the configured Kairmel URLs from compile-time environment
/// variables, falling back to the documented defaults for anything unset.
pub fn load() -> KairmelUrls {
    let raw_url = option_env!("KAIRMEL_URL").unwrap_or(DEFAULT_KAIRMEL_URL);
    let origin = validate_kairmel_url(raw_url).unwrap_or_else(|err| {
        panic!("KAIRMEL_URL={raw_url:?} is not a valid Kairmel URL: {err}");
    });

    let creer_path = option_env!("KAIRMEL_PATH_CREER").unwrap_or(DEFAULT_PATH_CREER);
    let apps_path = option_env!("KAIRMEL_PATH_APPS").unwrap_or(DEFAULT_PATH_APPS);
    let decouvrir_path = option_env!("KAIRMEL_PATH_DECOUVRIR").unwrap_or(DEFAULT_PATH_DECOUVRIR);

    let creer = join_path(&origin, creer_path)
        .unwrap_or_else(|err| panic!("KAIRMEL_PATH_CREER={creer_path:?}: {err}"));
    let apps = join_path(&origin, apps_path)
        .unwrap_or_else(|err| panic!("KAIRMEL_PATH_APPS={apps_path:?}: {err}"));
    let decouvrir = join_path(&origin, decouvrir_path)
        .unwrap_or_else(|err| panic!("KAIRMEL_PATH_DECOUVRIR={decouvrir_path:?}: {err}"));

    KairmelUrls {
        origin,
        creer,
        apps,
        decouvrir,
    }
}

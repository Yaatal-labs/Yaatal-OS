//! Reads the build-time Kairmel configuration (`KAIRMEL_URL` and the three
//! workspace paths) and turns it into validated URLs. Panicking here is
//! intentional: a shell pointed at a bad or unsafe URL should refuse to
//! start rather than silently fall back to something the operator did not
//! choose.

use crate::kairmel::{
    join_path, validate_kairmel_url, KairmelUrls, DEFAULT_KAIRMEL_URL, DEFAULT_PATH_CREER,
    DEFAULT_PATH_DISCUTER, DEFAULT_PATH_MARCHE,
};

/// Build the configured Kairmel URLs from compile-time environment
/// variables, falling back to the documented defaults for anything unset.
pub fn load() -> KairmelUrls {
    let raw_url = option_env!("KAIRMEL_URL").unwrap_or(DEFAULT_KAIRMEL_URL);
    let origin = validate_kairmel_url(raw_url).unwrap_or_else(|err| {
        panic!("KAIRMEL_URL={raw_url:?} is not a valid Kairmel URL: {err}");
    });

    let discuter_path = option_env!("KAIRMEL_PATH_DISCUTER").unwrap_or(DEFAULT_PATH_DISCUTER);
    let creer_path = option_env!("KAIRMEL_PATH_CREER").unwrap_or(DEFAULT_PATH_CREER);
    let marche_path = option_env!("KAIRMEL_PATH_MARCHE").unwrap_or(DEFAULT_PATH_MARCHE);

    let discuter = join_path(&origin, discuter_path)
        .unwrap_or_else(|err| panic!("KAIRMEL_PATH_DISCUTER={discuter_path:?}: {err}"));
    let creer = join_path(&origin, creer_path)
        .unwrap_or_else(|err| panic!("KAIRMEL_PATH_CREER={creer_path:?}: {err}"));
    let marche = join_path(&origin, marche_path)
        .unwrap_or_else(|err| panic!("KAIRMEL_PATH_MARCHE={marche_path:?}: {err}"));

    KairmelUrls {
        origin,
        discuter,
        creer,
        marche,
    }
}

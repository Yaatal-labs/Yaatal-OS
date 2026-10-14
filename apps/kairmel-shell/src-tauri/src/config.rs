//! Reads the build-time Kairmel configuration (Kairmel / Marché URLs and the
//! workspace paths) and turns it into validated URLs. Panicking here is
//! intentional: a shell pointed at a bad or unsafe URL should refuse to
//! start rather than silently fall back to something the operator did not
//! choose.

use crate::kairmel::{
    join_path, validate_kairmel_url, KairmelUrls, DEFAULT_KAIRMEL_MARCHE_URL, DEFAULT_KAIRMEL_URL,
    DEFAULT_PATH_APPS, DEFAULT_PATH_ARGENT, DEFAULT_PATH_BOUTIQUE, DEFAULT_PATH_COMMANDES,
    DEFAULT_PATH_COMPTE, DEFAULT_PATH_CREER, DEFAULT_PATH_DECOUVRIR, DEFAULT_PATH_DIRECT,
};

/// Build the configured Kairmel URLs from compile-time environment
/// variables, falling back to the documented defaults for anything unset.
pub fn load() -> KairmelUrls {
    let raw_url = option_env!("KAIRMEL_URL").unwrap_or(DEFAULT_KAIRMEL_URL);
    let origin = validate_kairmel_url(raw_url).unwrap_or_else(|err| {
        panic!("KAIRMEL_URL={raw_url:?} is not a valid Kairmel URL: {err}");
    });
    let raw_marche_url = option_env!("KAIRMEL_MARCHE_URL").unwrap_or(DEFAULT_KAIRMEL_MARCHE_URL);
    let marche = validate_kairmel_url(raw_marche_url).unwrap_or_else(|err| {
        panic!("KAIRMEL_MARCHE_URL={raw_marche_url:?} is not a valid Marché URL: {err}");
    });

    let creer_path = option_env!("KAIRMEL_PATH_CREER").unwrap_or(DEFAULT_PATH_CREER);
    let apps_path = option_env!("KAIRMEL_PATH_APPS").unwrap_or(DEFAULT_PATH_APPS);
    let decouvrir_path = option_env!("KAIRMEL_PATH_DECOUVRIR").unwrap_or(DEFAULT_PATH_DECOUVRIR);
    let boutique_path = option_env!("KAIRMEL_PATH_BOUTIQUE").unwrap_or(DEFAULT_PATH_BOUTIQUE);
    let commandes_path = option_env!("KAIRMEL_PATH_COMMANDES").unwrap_or(DEFAULT_PATH_COMMANDES);
    let argent_path = option_env!("KAIRMEL_PATH_ARGENT").unwrap_or(DEFAULT_PATH_ARGENT);
    let direct_path = option_env!("KAIRMEL_PATH_DIRECT").unwrap_or(DEFAULT_PATH_DIRECT);
    let compte_path = option_env!("KAIRMEL_PATH_COMPTE").unwrap_or(DEFAULT_PATH_COMPTE);

    let creer = join_path(&origin, creer_path)
        .unwrap_or_else(|err| panic!("KAIRMEL_PATH_CREER={creer_path:?}: {err}"));
    let apps = join_path(&origin, apps_path)
        .unwrap_or_else(|err| panic!("KAIRMEL_PATH_APPS={apps_path:?}: {err}"));
    let decouvrir = join_path(&origin, decouvrir_path)
        .unwrap_or_else(|err| panic!("KAIRMEL_PATH_DECOUVRIR={decouvrir_path:?}: {err}"));
    let boutique = join_path(&origin, boutique_path)
        .unwrap_or_else(|err| panic!("KAIRMEL_PATH_BOUTIQUE={boutique_path:?}: {err}"));
    let commandes = join_path(&origin, commandes_path)
        .unwrap_or_else(|err| panic!("KAIRMEL_PATH_COMMANDES={commandes_path:?}: {err}"));
    let argent = join_path(&origin, argent_path)
        .unwrap_or_else(|err| panic!("KAIRMEL_PATH_ARGENT={argent_path:?}: {err}"));
    let direct = join_path(&origin, direct_path)
        .unwrap_or_else(|err| panic!("KAIRMEL_PATH_DIRECT={direct_path:?}: {err}"));
    let compte = join_path(&origin, compte_path)
        .unwrap_or_else(|err| panic!("KAIRMEL_PATH_COMPTE={compte_path:?}: {err}"));

    KairmelUrls {
        origin,
        marche,
        creer,
        apps,
        decouvrir,
        boutique,
        commandes,
        argent,
        direct,
        compte,
    }
}

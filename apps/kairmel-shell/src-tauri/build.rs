fn main() {
    // These are read with `option_env!` at compile time (see src/config.rs),
    // so cargo must know to recompile when any of them changes.
    for var in [
        "KAIRMEL_URL",
        "KAIRMEL_MARCHE_URL",
        "KAIRMEL_PATH_CREER",
        "KAIRMEL_PATH_APPS",
        "KAIRMEL_PATH_DECOUVRIR",
        "KAIRMEL_PATH_BOUTIQUE",
        "KAIRMEL_PATH_COMMANDES",
        "KAIRMEL_PATH_ARGENT",
        "KAIRMEL_PATH_DIRECT",
        "KAIRMEL_PATH_COMPTE",
    ] {
        println!("cargo:rerun-if-env-changed={var}");
    }
    tauri_build::build();
}

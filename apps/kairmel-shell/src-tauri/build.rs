fn main() {
    // These are read with `option_env!` at compile time (see src/config.rs),
    // so cargo must know to recompile when any of them changes.
    for var in [
        "KAIRMEL_URL",
        "KAIRMEL_PATH_DISCUTER",
        "KAIRMEL_PATH_CREER",
        "KAIRMEL_PATH_MARCHE",
    ] {
        println!("cargo:rerun-if-env-changed={var}");
    }
    tauri_build::build();
}

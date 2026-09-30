/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** The marche-api Worker's origin (no trailing slash), e.g. "http://localhost:8787". When
   *  set, the catalogue is fetched from `${VITE_CATALOGUE_URL}/v1/catalogue` and falls back to
   *  the bundled `catalogue.json` if that fails. Unset -> always the bundled file. See
   *  `src/catalogue/source.ts`. */
  readonly VITE_CATALOGUE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

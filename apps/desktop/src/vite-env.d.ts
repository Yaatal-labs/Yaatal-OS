/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_YAATAL_OS_SHOP_URL?: string;
  readonly VITE_YAATAL_OS_ATELIER_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

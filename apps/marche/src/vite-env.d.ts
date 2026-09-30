/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** The marche-api Worker's origin (no trailing slash), e.g. "http://localhost:8787". When
   *  set, the catalogue is fetched from `${VITE_CATALOGUE_URL}/v1/catalogue` and falls back to
   *  the bundled `catalogue.json` if that fails. Unset -> always the bundled file. See
   *  `src/catalogue/source.ts`. */
  readonly VITE_CATALOGUE_URL?: string;
  /** Dev-only escape hatch: `"true"` makes `identity()` use the old per-device placeholder
   *  (`src/host/identity-provider.ts`'s `DeviceIdentityProvider`) instead of requiring WhatsApp
   *  sign-in, so `apps/marche`'s standalone `pnpm dev` can still exercise `identity()` without a
   *  running marche-api + Engine. Unset or anything else -> the real, sign-in-backed provider.
   *  Never set this for a deployment a real person uses. */
  readonly VITE_DEV_PLACEHOLDER_IDENTITY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

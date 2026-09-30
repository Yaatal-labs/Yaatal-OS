import catalogueData from "../../public/catalogue.json";
import type { AppManifest } from "../manifest/types";

/**
 * The seed catalogue for local development, screenshots, and tests. `public/catalogue.json`
 * is the single source of truth — this module just types it — so the host, at runtime, and
 * this file, at build/test time, can never drift apart.
 *
 * Every entry here is a fictional example app on `example.com` (reserved for documentation
 * by RFC 2606) — not a real, deployed mini-app — and says so in its own name and description.
 */
export const EXAMPLE_CATALOGUE = catalogueData as AppManifest[];

export type Workspace = "sell" | "shop";
export type Theme = "light" | "dark";
export const THEME_KEY = "yaatal-os-theme";
export const RAIL_KEY = "yaatal-os-rail";
export const WORKSPACE_KEY = "yaatal-os-workspace";
export function readPreference(key: string): string | null { try { return localStorage.getItem(key); } catch { return null; } }
export function savePreference(key: string, value: string): void { try { localStorage.setItem(key, value); } catch { /* Storage may be disabled; in-memory state still works. */ } }
export function initialTheme(): Theme { const saved = readPreference(THEME_KEY); return saved === "dark" || saved === "light" ? saved : window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light"; }

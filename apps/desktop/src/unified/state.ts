export type Workspace = "sell" | "shop";
export type Theme = "light" | "dark";
export type ThemePreference = Theme | "system";
export const THEME_KEY = "yaatal-os-theme";
export const RAIL_KEY = "yaatal-os-rail";
export const WORKSPACE_KEY = "yaatal-os-workspace";
export const LOCALE_KEY = "yaatal-os-locale";
export function readPreference(key: string): string | null { try { return localStorage.getItem(key); } catch { return null; } }
export function savePreference(key: string, value: string): void { try { localStorage.setItem(key, value); } catch { /* Storage may be disabled; in-memory state still works. */ } }
export function initialThemePreference(): ThemePreference {
  const saved = readPreference(THEME_KEY);
  return saved === "dark" || saved === "light" ? saved : "system";
}
export function systemTheme(): Theme {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}
export function resolveTheme(preference: ThemePreference): Theme { return preference === "system" ? systemTheme() : preference; }
export function readLocale(): "en" | "fr" { return readPreference(LOCALE_KEY) === "fr" ? "fr" : "en"; }

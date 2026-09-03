/**
 * BOBO Color Palette (Refined for "Classy Afro-Tech")
 * Inspired by: Taobao (Energy), Amazon (Trust), Alibaba (Commerce)
 * Philosophy: "Lagos Gold & Midnight Indigo"
 */

export const colors = {
  // Brand Core
  primary: '#2E1065',      // Midnight Indigo - Tech, Depth, Trust (Amazon/Alibaba logic but richer)
  secondary: '#F59E0B',    // Lagos Gold/Amber - Wealth, Optimism, African Sun (Taobao Energy)
  accent: '#10B981',       // Signal Green - Success, Verified Payment, Growth

  // Functional Palette
  success: '#059669',      // Emerald 600
  warning: '#D97706',      // Amber 600
  error: '#DC2626',        // Red 600
  info: '#2563EB',         // Royal Blue 600

  // Surface & Backgrounds (The "Classy" Element)
  background: {
    main: '#FDFBF7',       // Warm Paper/Sand - Replaces sterile white. Easy on eyes.
    surface: '#FFFFFF',    // Pure White - For cards (Contrast against Sand)
    subtle: '#F3F4F6',     // Cool Gray 100 - For secondary areas
    dark: '#111827',       // Gray 900 - For dark mode / headers
  },

  // Typography Colors
  text: {
    primary: '#111827',    // Gray 900 - Sharp, readable
    secondary: '#4B5563',  // Gray 600 - Softer metadata
    tertiary: '#9CA3AF',   // Gray 400 - Placeholders
    inverse: '#FFFFFF',    // White text on dark backgrounds
    gold: '#B45309',       // Dark Amber - Text version of gold
  },

  // Borders & Dividers
  border: {
    light: '#E5E7EB',      // Gray 200
    medium: '#D1D5DB',     // Gray 300
    active: '#2E1065',     // Indigo (Primary)
  },

  // Interactive Elements
  active: {
    base: '#2E1065',       // Primary
    pressed: '#1E1B4B',    // Darker Indigo
    hover: '#4C1D95',      // Lighter Indigo
  },
} as const

// Category Colors (Refined for the new palette)
export const categoryColors = {
  fashion: '#BE185D',      // Pink 700 (Vibrant)
  electronics: '#2E1065',  // Indigo (Tech)
  beauty: '#D946EF',       // Fuchsia 500
  food: '#059669',         // Emerald (Fresh)
  home: '#EA580C',         // Orange 600 (Warmth)
  other: '#6B7280',        // Gray 500
} as const

// Gamification Levels (Gold/Indigo Theme)
export const levelColors = {
  newcomer: '#059669',     // Green (Growth)
  shopper: '#2563EB',      // Blue (Trust)
  seller: '#7C3AED',       // Violet (Skill)
  merchant: '#F59E0B',     // Amber (Gold status)
  mogul: '#DC2626',        // Red (Power)
  leader: '#111827',       // Black (Authority)
} as const
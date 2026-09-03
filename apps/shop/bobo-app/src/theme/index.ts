/**
 * BOBO Theme Export
 * Unified access point for the Design System
 */

import { colors, categoryColors, levelColors } from './colors'
import { typography, fontFamilies, combineTextStyles } from './typography'
import { spacing } from './spacing'

export { colors, categoryColors, levelColors, typography, fontFamilies, spacing, combineTextStyles }

// Adinkra Symbols Mapping (Conceptual - would need actual assets/SVGs)
export const symbols = {
  wisdom: 'ntesie', // Knowledge/AI
  security: 'eban', // Trust/Safety
  unity: 'funtunfunefu', // Community
  excellence: 'nea_onnim', // Premium
}

export const theme = {
  colors,
  categoryColors,
  levelColors,
  typography,
  fontFamilies,
  spacing,
  symbols,
  
  // Helper to get shadow styles consistent
  shadows: {
    small: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 2,
      elevation: 2,
    },
    medium: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.1,
      shadowRadius: 6,
      elevation: 4,
    },
    large: {
      shadowColor: '#1E1B4B', // Indigo tinted shadow
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: 0.15,
      shadowRadius: 20,
      elevation: 10,
    },
  },
}

export type Theme = typeof theme
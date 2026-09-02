/**
 * BOBO Typography
 * Refined for "Classy" Readability
 * System fonts with careful hierarchy
 */

import { StyleSheet, TextStyle } from 'react-native'
import { colors } from './colors'

// Font Families
export const fontFamilies = {
  heading: 'System',  // Keep system for performance/native feel
  body: 'System',
  monospace: 'Courier New',
} as const

// Typography Styles
export const typography = StyleSheet.create({
  // Display (Large hero text - "Waouh" factor)
  display: {
    fontFamily: fontFamilies.heading,
    fontSize: 34,
    fontWeight: '800' as TextStyle['fontWeight'],
    lineHeight: 40,
    letterSpacing: -0.5,
    color: colors.text.primary,
  },

  // Headings
  h1: {
    fontFamily: fontFamilies.heading,
    fontSize: 26,
    fontWeight: '700' as TextStyle['fontWeight'],
    lineHeight: 32,
    letterSpacing: -0.4,
    color: colors.text.primary,
  },

  h2: {
    fontFamily: fontFamilies.heading,
    fontSize: 22,
    fontWeight: '600' as TextStyle['fontWeight'],
    lineHeight: 28,
    letterSpacing: -0.3,
    color: colors.text.primary,
  },

  h3: {
    fontFamily: fontFamilies.heading,
    fontSize: 18,
    fontWeight: '600' as TextStyle['fontWeight'],
    lineHeight: 24,
    letterSpacing: -0.2,
    color: colors.text.primary,
  },

  // Body Text (Readable, spacious)
  body: {
    fontFamily: fontFamilies.body,
    fontSize: 16,
    fontWeight: '400' as TextStyle['fontWeight'],
    lineHeight: 24,
    color: colors.text.secondary,
  },

  bodyBold: {
    fontFamily: fontFamilies.body,
    fontSize: 16,
    fontWeight: '600' as TextStyle['fontWeight'],
    lineHeight: 24,
    color: colors.text.primary,
  },

  bodySmall: {
    fontFamily: fontFamilies.body,
    fontSize: 14,
    fontWeight: '400' as TextStyle['fontWeight'],
    lineHeight: 20,
    color: colors.text.secondary,
  },

  // Caption (Metadata, timestamps)
  caption: {
    fontFamily: fontFamilies.body,
    fontSize: 12,
    fontWeight: '500' as TextStyle['fontWeight'],
    lineHeight: 16,
    color: colors.text.tertiary,
  },

  captionBold: {
    fontFamily: fontFamilies.body,
    fontSize: 12,
    fontWeight: '700' as TextStyle['fontWeight'],
    lineHeight: 16,
    color: colors.text.primary,
  },

  micro: {
    fontFamily: fontFamilies.body,
    fontSize: 10,
    fontWeight: '700' as TextStyle['fontWeight'],
    lineHeight: 12,
    color: colors.text.tertiary,
    textTransform: 'uppercase' as TextStyle['textTransform'],
  },

  // Specialized
  price: {
    fontFamily: fontFamilies.heading,
    fontSize: 18,
    fontWeight: '700' as TextStyle['fontWeight'],
    lineHeight: 24,
    color: colors.text.primary,
  },

  priceLarge: {
    fontFamily: fontFamilies.heading,
    fontSize: 24,
    fontWeight: '800' as TextStyle['fontWeight'],
    lineHeight: 30,
    color: colors.secondary, // Lagos Gold
  },

  button: {
    fontFamily: fontFamilies.heading,
    fontSize: 16,
    fontWeight: '600' as TextStyle['fontWeight'],
    lineHeight: 24,
    letterSpacing: 0.5,
    color: colors.text.inverse,
  },
})

export const combineTextStyles = (...styles: any[]) => {
  return StyleSheet.flatten(styles)
}
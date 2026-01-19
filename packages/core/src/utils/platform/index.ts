/**
 * Platform Adapter Index
 * Auto-imports correct implementation based on platform (native/web)
 * Provides unified API across React Native and React Web
 */

import { Platform } from 'react-native'

// Import native implementations
import * as ImagePickerNative from './imagePicker.native'

// Import web implementations conditionally
let ImagePickerWeb: any = null
let StorageWeb: any = null
let ScannerWeb: any = null

if (Platform.OS === 'web') {
  // Only load web implementations on web platform
  ImagePickerWeb = require('./imagePicker.web')
  StorageWeb = require('./storage.web')
  ScannerWeb = require('./scanner.web')
}

/**
 * Image Picker Export
 * Automatically selects native or web implementation
 */
export const ImagePicker = Platform.select({
  native: () => ImagePickerNative,
  web: () => ImagePickerWeb,
  default: () => ImagePickerNative,
})()

/**
 * Storage Export
 * Automatically selects AsyncStorage (native) or localStorage wrapper (web)
 */
export const Storage = Platform.select({
  native: () => require('@react-native-async-storage/async-storage'),
  web: () => StorageWeb,
  default: () => require('@react-native-async-storage/async-storage'),
})()

/**
 * QR Scanner Export
 * Automatically selects native or web implementation
 */
export const QRScanner = Platform.select({
  native: () => ({
    // Native QR scanning is handled directly in screens
    // This is just a placeholder for consistency
  }),
  web: () => ScannerWeb,
  default: () => ({
    // Default fallback
  }),
})()

/**
 * Platform detection helper
 */
export const isWeb = Platform.OS === 'web'
export const isNative = Platform.OS !== 'web'

/**
 * Type exports
 */
export type { ImagePickerResult } from './imagePicker.native'
export type { QRScannerProps, QRScannerInstance } from './scanner.web'

/**
 * Example usage:
 *
 * // Image Picker
 * import { ImagePicker } from '@/utils/platform'
 * const result = await ImagePicker.pickImage({ quality: 0.8 })
 *
 * // Storage
 * import { Storage } from '@/utils/platform'
 * await Storage.setItem('key', 'value')
 * const value = await Storage.getItem('key')
 *
 * // QR Scanner (Web)
 * import { QRScanner } from '@/utils/platform'
 * const scanner = QRScanner.createQRScanner('qr-reader', { onScan, onError })
 * await scanner.start()
 */

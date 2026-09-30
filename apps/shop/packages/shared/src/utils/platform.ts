declare const window: Window | undefined;
declare const document: Document | undefined;
declare const navigator: Navigator | undefined;

export function isWeb(): boolean {
  return typeof window !== 'undefined' && typeof document !== 'undefined';
}

export function isNative(): boolean {
  return typeof navigator !== 'undefined' && navigator.product === 'ReactNative';
}

export function isIOS(): boolean {
  if (isNative()) {
    try {
      const { Platform } = require('react-native');
      return Platform.OS === 'ios';
    } catch { return false; }
  }
  if (isWeb()) return /iPad|iPhone|iPod/.test(navigator?.userAgent || '');
  return false;
}

export function isAndroid(): boolean {
  if (isNative()) {
    try {
      const { Platform } = require('react-native');
      return Platform.OS === 'android';
    } catch { return false; }
  }
  if (isWeb()) return /Android/.test(navigator?.userAgent || '');
  return false;
}

export function isSlowConnection(): boolean {
  if (isWeb() && 'connection' in navigator) {
    const conn = (navigator as any).connection;
    return conn?.effectiveType === '2g' || conn?.effectiveType === 'slow-2g';
  }
  return false;
}

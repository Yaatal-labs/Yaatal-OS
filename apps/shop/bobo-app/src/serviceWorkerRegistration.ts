// Service Worker Registration for PWA support

import { Platform } from 'react-native'

export function register() {
  if (Platform.OS === 'web' && 'serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      const swUrl = '/service-worker.js'
      navigator.serviceWorker
        .register(swUrl)
        .then((registration) => {
          console.log('ServiceWorker registration successful with scope: ', registration.scope)
        })
        .catch((err) => {
          console.log('ServiceWorker registration failed: ', err)
        })
    })
  }
}

export function unregister() {
  if (Platform.OS === 'web' && 'serviceWorker' in navigator) {
    navigator.serviceWorker.ready
      .then((registration) => {
        registration.unregister()
      })
      .catch((error) => {
        console.error(error.message)
      })
  }
}

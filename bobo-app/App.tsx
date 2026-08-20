/**
 * BOBO App Entry Point
 * African Live Commerce Marketplace
 */

import React from 'react'
import { StatusBar } from 'expo-status-bar'
import { setEngineApiUrl } from '@yaatal/core'
import { RootNavigator } from './src/navigation/RootNavigator'
import * as serviceWorkerRegistration from './src/serviceWorkerRegistration'

setEngineApiUrl(process.env.EXPO_PUBLIC_ENGINE_API_URL)

// Register service worker for PWA
serviceWorkerRegistration.register()

export default function App() {
  return (
    <>
      <StatusBar style="auto" />
      <RootNavigator />
    </>
  )
}

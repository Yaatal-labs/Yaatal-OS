/**
 * BOBO App Entry Point
 * African Live Commerce Marketplace
 */

import React, { useEffect } from 'react'
import { StatusBar } from 'expo-status-bar'
import { RootNavigator } from './src/navigation/RootNavigator'
import * as serviceWorkerRegistration from './src/serviceWorkerRegistration'
import { powerSyncService } from './src/lib/powersync/service'

// Register service worker for PWA
serviceWorkerRegistration.register()

export default function App() {
  useEffect(() => {
    const initializePowerSync = async () => {
      try {
        await powerSyncService.initialize();
        console.log('PowerSync initialized successfully');
      } catch (error) {
        console.error('Failed to initialize PowerSync:', error);
      }
    };

    initializePowerSync();

    // Cleanup on unmount
    return () => {
      powerSyncService.close();
    };
  }, []);

  return (
    <>
      <StatusBar style="auto" />
      <RootNavigator />
    </>
  )
}
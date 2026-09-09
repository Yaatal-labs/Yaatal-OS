/**
 * Root Navigator
 * Handles routing between auth and main app
 */

import React, { useEffect } from 'react'
import { Platform } from 'react-native'
import { NavigationContainer } from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { useAuthStore } from '../store/authStore'

// Auth screens
import { LoginScreen } from '../screens/auth/LoginScreen'
import { SignupScreen } from '../screens/auth/SignupScreen'

// Main app navigators
import { MerchantNavigator } from './MerchantNavigator'
import { CustomerNavigator, EmbeddedCustomerNavigator } from './CustomerNavigator'
import {
  isEmbeddedWebGuestMode,
  selectRootNavigatorSurface,
} from './embeddedWebGuestMode'

const Stack = createNativeStackNavigator()

const linking = {
  prefixes: ['bobo://', 'https://'],
  config: {
    screens: {
      Discovery: {
        screens: {
          ProductDetail: 'product/:productId',
        },
      },
      Scanner: {
        screens: {
          ProductDetail: 'scan/product/:productId',
        },
      },
    },
  },
}

export const RootNavigator = () => {
  const { isAuthenticated, profile, initialize } = useAuthStore()
  const isEmbeddedGuest = isEmbeddedWebGuestMode(
    Platform.OS,
    typeof window === 'undefined' ? undefined : window.location,
  )
  const navigatorSurface = selectRootNavigatorSurface({
    isAuthenticated,
    isMerchant: profile?.is_merchant === true,
    isEmbedded: isEmbeddedGuest,
  })

  // Initialize auth state on app start
  useEffect(() => {
    initialize()
  }, [])

  return (
    <NavigationContainer linking={linking as any}>
      {navigatorSurface === 'auth' ? (
        // Auth Stack
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          <Stack.Screen name="Login" component={LoginScreen} />
          <Stack.Screen name="Signup" component={SignupScreen} />
        </Stack.Navigator>
      ) : navigatorSurface === 'merchant' ? (
        // Merchant App
        <MerchantNavigator />
      ) : navigatorSurface === 'embedded-read-only' ? (
        // OS-embedded buyer catalog; no account or commerce mutation routes.
        <EmbeddedCustomerNavigator />
      ) : (
        // Customer App
        <CustomerNavigator />
      )}
    </NavigationContainer>
  )
}

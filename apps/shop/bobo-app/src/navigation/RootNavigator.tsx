/**
 * Root Navigator
 * Handles routing between auth and main app
 */

import React, { useEffect } from 'react'
import { NavigationContainer } from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { useAuthStore } from '../store/authStore'

// Auth screens
import { LoginScreen } from '../screens/auth/LoginScreen'
import { SignupScreen } from '../screens/auth/SignupScreen'

// Main app navigators
import { MerchantNavigator } from './MerchantNavigator'
import { CustomerNavigator } from './CustomerNavigator'

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

  // Initialize auth state on app start
  useEffect(() => {
    initialize()
  }, [])

  return (
    <NavigationContainer linking={linking as any}>
      {!isAuthenticated ? (
        // Auth Stack
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          <Stack.Screen name="Login" component={LoginScreen} />
          <Stack.Screen name="Signup" component={SignupScreen} />
        </Stack.Navigator>
      ) : profile?.is_merchant ? (
        // Merchant App
        <MerchantNavigator />
      ) : (
        // Customer App
        <CustomerNavigator />
      )}
    </NavigationContainer>
  )
}

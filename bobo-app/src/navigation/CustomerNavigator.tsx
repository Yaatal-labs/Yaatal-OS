/**
 * Customer Navigator ("Omni-Navigator")
 * The heart of the Bobo experience.
 * Features a custom "Afro-Flux" Tab Bar with a floating AI Command Center.
 */

import React from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Dimensions,
} from 'react-native'
import {
  createBottomTabNavigator,
  BottomTabBarProps,
} from '@react-navigation/bottom-tabs'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { colors, theme, combineTextStyles } from '../theme'
import Ionicons from 'react-native-vector-icons/Ionicons'

// Real screens
import { DiscoveryScreen } from '../screens/customer/DiscoveryScreen'
import { QRScannerScreen } from '../screens/customer/QRScannerScreen'
import { ProductDetailScreen } from '../screens/customer/ProductDetailScreen'
import { CheckoutScreen } from '../screens/customer/CheckoutScreen'
import { OrdersScreen } from '../screens/customer/OrdersScreen'
import { OrderDetailScreen } from '../screens/customer/OrderDetailScreen'

// Placeholder screens (to be implemented)
const PlaceholderScreen = ({ title }: { title: string }) => (
  <View style={styles.placeholder}>
    <Text style={theme.typography.h1}>{title}</Text>
    <Text style={theme.typography.body}>Coming soon to Bobo...</Text>
  </View>
)

const CategoriesScreen = () => <PlaceholderScreen title="Collections" />
const CartScreen = () => <PlaceholderScreen title="Panier" />
const ProfileScreen = () => <PlaceholderScreen title="Profil" />

const Tab = createBottomTabNavigator()
const Stack = createNativeStackNavigator()

// Discovery Stack (Home Feed)
const DiscoveryStack = () => (
  <Stack.Navigator
    screenOptions={{
      headerStyle: { backgroundColor: colors.background.main },
      headerTintColor: colors.text.primary,
      headerTitleStyle: theme.typography.h3,
    }}
  >
    <Stack.Screen
      name="DiscoveryFeed"
      component={DiscoveryScreen}
      options={{ headerShown: false }}
    />
    <Stack.Screen
      name="ProductDetail"
      component={ProductDetailScreen}
      options={{ title: 'Détails' }}
    />
    <Stack.Screen
      name="Checkout"
      component={CheckoutScreen}
      options={{ title: 'Paiement' }}
    />
  </Stack.Navigator>
)

// Scanner Stack (AI/Camera)
const ScannerStack = () => (
  <Stack.Navigator>
    <Stack.Screen
      name="QRScan"
      component={QRScannerScreen}
      options={{ headerShown: false }}
    />
    {/* ProductDetail/Checkout accessible here too */}
  </Stack.Navigator>
)

// ------------------------------------------------------------------
// Custom Tab Bar Component ("The Omni-Bar")
// ------------------------------------------------------------------
const CustomTabBar = ({ state, descriptors, navigation }: BottomTabBarProps) => {
  return (
    <View style={styles.tabBarContainer}>
      <View style={styles.tabBar}>
        {state.routes.map((route, index) => {
          const { options } = descriptors[route.key]
          const isFocused = state.index === index

          // The "Omni" Button (Middle)
          const isOmniButton = index === 2

          const onPress = () => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            })

            if (!isFocused && !event.defaultPrevented) {
              navigation.navigate(route.name)
            }
          }

          if (isOmniButton) {
            return (
              <View key={index} style={styles.omniButtonWrapper}>
                <TouchableOpacity
                  onPress={onPress}
                  style={styles.omniButton}
                  activeOpacity={0.9}
                >
                  <Ionicons name="scan-outline" size={32} color={colors.text.inverse} />
                </TouchableOpacity>
              </View>
            )
          }

          // Standard Tab Buttons
          let iconName = 'square'
          if (route.name === 'Discovery') iconName = isFocused ? 'home' : 'home-outline'
          else if (route.name === 'Categories') iconName = isFocused ? 'grid' : 'grid-outline'
          else if (route.name === 'Cart') iconName = isFocused ? 'cart' : 'cart-outline'
          else if (route.name === 'Profile') iconName = isFocused ? 'person' : 'person-outline'

          return (
            <TouchableOpacity
              key={index}
              accessibilityRole="button"
              accessibilityState={isFocused ? { selected: true } : {}}
              accessibilityLabel={options.tabBarAccessibilityLabel}
              testID={options.tabBarTestID}
              onPress={onPress}
              style={styles.tabItem}
            >
              <Ionicons
                name={iconName}
                size={24}
                color={isFocused ? colors.primary : colors.text.tertiary}
              />
              <Text
                style={[
                  styles.tabLabel,
                  { color: isFocused ? colors.primary : colors.text.tertiary },
                ]}
              >
                {options.title}
              </Text>
            </TouchableOpacity>
          )
        })}
      </View>
    </View>
  )
}

// ------------------------------------------------------------------
// Main Navigator
// ------------------------------------------------------------------
export const CustomerNavigator = () => {
  return (
    <Tab.Navigator
      tabBar={(props) => <CustomTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        tabBarHideOnKeyboard: true,
      }}
    >
      <Tab.Screen
        name="Discovery"
        component={DiscoveryStack}
        options={{ title: 'Home' }}
      />
      <Tab.Screen
        name="Categories"
        component={CategoriesScreen}
        options={{ title: 'Catalog' }}
      />
      <Tab.Screen
        name="Scanner"
        component={ScannerStack}
        options={{ title: 'AI Scan' }}
      />
      <Tab.Screen
        name="Cart"
        component={CartScreen}
        options={{ title: 'Cart' }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{ title: 'Profile' }}
      />
    </Tab.Navigator>
  )
}

const styles = StyleSheet.create({
  // Container that handles the floating effect
  tabBarContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  // The actual bar background
  tabBar: {
    flexDirection: 'row',
    backgroundColor: colors.background.surface,
    width: '100%',
    height: Platform.OS === 'ios' ? 85 : 65,
    paddingBottom: Platform.OS === 'ios' ? 25 : 5,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    // Glassy Shadow
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 20,
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
  },
  tabLabel: {
    ...theme.typography.micro,
    marginTop: 4,
  },
  // The Floating Omni-Button Container
  omniButtonWrapper: {
    width: 60,
    height: '100%',
    justifyContent: 'flex-start', // Align to top of bar
    alignItems: 'center',
    zIndex: 10,
  },
  // The Button Itself
  omniButton: {
    top: -20, // Float upwards
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.primary, // Midnight Indigo
    justifyContent: 'center',
    alignItems: 'center',
    // Gold Glow
    shadowColor: colors.secondary, // Lagos Gold
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 10,
    borderWidth: 4,
    borderColor: colors.background.surface, // Clean cutout effect
  },
  placeholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background.main,
  },
})
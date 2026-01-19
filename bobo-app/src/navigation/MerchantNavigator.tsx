/**
 * Merchant Navigator
 * Bottom tabs for merchant users
 */

import React from 'react'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { colors } from '../theme'

// Screens
import { Text, View, StyleSheet } from 'react-native'
import { ProductsListScreen } from '../screens/merchant/ProductsListScreen'
import { AddProductScreen } from '../screens/merchant/AddProductScreen'
import { OrdersScreen } from '../screens/merchant/OrdersScreen'
import { OrderDetailScreen } from '../screens/merchant/OrderDetailScreen'
import { DashboardScreen } from '../screens/merchant/DashboardScreen'

// Placeholder screens
const PlaceholderScreen = ({ title }: { title: string }) => (
  <View style={styles.placeholder}>
    <Text style={styles.placeholderText}>{title}</Text>
    <Text style={styles.placeholderSubtext}>Coming soon...</Text>
  </View>
)

const ChatListScreen = () => <PlaceholderScreen title="💬 Messages" />
const ProfileScreen = () => <PlaceholderScreen title="👤 Profil" />

const Tab = createBottomTabNavigator()
const Stack = createNativeStackNavigator()

// Products Stack Navigator
const ProductsStack = () => (
  <Stack.Navigator>
    <Stack.Screen
      name="ProductsList"
      component={ProductsListScreen}
      options={{ title: 'Mes Produits' }}
    />
    <Stack.Screen
      name="AddProduct"
      component={AddProductScreen}
      options={{ title: 'Ajouter un Produit' }}
    />
  </Stack.Navigator>
)

// Orders Stack Navigator
const OrdersStack = () => (
  <Stack.Navigator>
    <Stack.Screen
      name="OrdersList"
      component={OrdersScreen}
      options={{ title: 'Mes Commandes' }}
    />
    <Stack.Screen
      name="OrderDetail"
      component={OrderDetailScreen}
      options={{ title: 'Détails de la commande' }}
    />
  </Stack.Navigator>
)

export const MerchantNavigator = () => {
  return (
    <Tab.Navigator
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.text.tertiary,
        tabBarStyle: {
          backgroundColor: colors.background.main,
          borderTopColor: colors.border.light,
        },
        headerStyle: {
          backgroundColor: colors.background.main,
        },
        headerTintColor: colors.text.primary,
      }}
    >
      <Tab.Screen
        name="Dashboard"
        component={DashboardScreen}
        options={{
          title: 'Tableau de bord',
          tabBarIcon: ({ color }) => <Text style={{ fontSize: 24 }}>📊</Text>,
        }}
      />
      <Tab.Screen
        name="Products"
        component={ProductsStack}
        options={{
          title: 'Produits',
          tabBarIcon: ({ color }) => <Text style={{ fontSize: 24 }}>📦</Text>,
          headerShown: false,
        }}
      />
      <Tab.Screen
        name="Orders"
        component={OrdersStack}
        options={{
          title: 'Commandes',
          tabBarIcon: ({ color }) => <Text style={{ fontSize: 24 }}>🛒</Text>,
          headerShown: false,
        }}
      />
      <Tab.Screen
        name="ChatList"
        component={ChatListScreen}
        options={{
          title: 'Messages',
          tabBarIcon: ({ color }) => <Text style={{ fontSize: 24 }}>💬</Text>,
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          title: 'Profil',
          tabBarIcon: ({ color }) => <Text style={{ fontSize: 24 }}>👤</Text>,
        }}
      />
    </Tab.Navigator>
  )
}

const styles = StyleSheet.create({
  placeholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background.main,
  },
  placeholderText: {
    fontSize: 32,
    marginBottom: 8,
  },
  placeholderSubtext: {
    fontSize: 16,
    color: colors.text.secondary,
  },
})

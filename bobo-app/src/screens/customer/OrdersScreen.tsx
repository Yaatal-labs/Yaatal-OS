/**
 * Customer Orders Screen
 * List all customer orders with filtering and status tracking
 */

import React, { useState, useEffect } from 'react'
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Image,
  RefreshControl,
  ActivityIndicator,
  ScrollView,
  Alert,
} from 'react-native'
import { useAuthStore } from '../../store/authStore'
import { ordersService, getProductImageUrl } from '@yaatal/core'
import { colors, typography, spacing } from '../../theme'
import { formatCFA, formatDateTime, formatOrderStatus, type Order } from '@yaatal/core'

type FilterStatus = 'active' | 'completed' | 'cancelled'

const FILTER_TABS: { value: FilterStatus; label: string; icon: string }[] = [
  { value: 'active', label: 'En cours', icon: '⏳' },
  { value: 'completed', label: 'Complétées', icon: '✅' },
  { value: 'cancelled', label: 'Annulées', icon: '✕' },
]

export const OrdersScreen = ({ navigation }: any) => {
  const { profile } = useAuthStore()
  const [orders, setOrders] = useState<Order[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [selectedFilter, setSelectedFilter] = useState<FilterStatus>('active')

  const loadOrders = async () => {
    if (!profile) return

    setIsLoading(true)
    try {
      const result = await ordersService.getOrdersByBuyer(profile.id)
      setOrders(result.items || [])
    } catch (error) {
      console.error('Error loading orders:', error)
      Alert.alert('Erreur', 'Impossible de charger vos commandes')
    }
    setIsLoading(false)
  }

  const onRefresh = async () => {
    setRefreshing(true)
    await loadOrders()
    setRefreshing(false)
  }

  useEffect(() => {
    loadOrders()
  }, [profile])

  const filteredOrders = orders.filter(order => {
    if (selectedFilter === 'active') {
      return (
        order.status !== 'delivered' &&
        order.status !== 'cancelled'
      )
    }
    if (selectedFilter === 'completed') {
      return order.status === 'delivered'
    }
    if (selectedFilter === 'cancelled') {
      return order.status === 'cancelled'
    }
    return true
  })

  const handleOrderPress = (order: Order) => {
    navigation.navigate('OrderDetail', { orderId: order.id })
  }

  const handleCancelOrder = (order: Order) => {
    Alert.alert(
      'Annuler la commande',
      'Êtes-vous sûr de vouloir annuler cette commande?',
      [
        { text: 'Non', style: 'cancel' },
        {
          text: 'Oui',
          style: 'destructive',
          onPress: async () => {
            try {
              const result = await ordersService.cancelOrder(order.id)
              if (result.success) {
                Alert.alert('Succès', 'Commande annulée')
                await loadOrders()
              } else {
                Alert.alert('Erreur', result.error)
              }
            } catch (error) {
              Alert.alert('Erreur', 'Une erreur est survenue')
            }
          },
        },
      ]
    )
  }

  const renderOrderCard = ({ item: order }: { item: Order }) => {
    const imageUrl = order.expand?.product_id?.image_url
      ? getProductImageUrl(order.expand.product_id.image_url) || 'https://via.placeholder.com/80'
      : undefined
    const seller = order.expand?.seller_id?.username || 'Vendeur'
    const statusInfo = formatOrderStatus(order.status)

    // Calculate delivery progress
    const getProgressPercent = () => {
      if (order.status === 'pending_payment') return 25
      if (order.status === 'paid') return 50
      if (order.status === 'shipped') return 75
      if (order.status === 'delivered') return 100
      return 0
    }

    return (
      <TouchableOpacity
        style={styles.orderCard}
        onPress={() => handleOrderPress(order)}
        activeOpacity={0.7}
      >
        {/* Image and Basic Info */}
        <View style={styles.orderHeader}>
          {imageUrl && (
            <Image source={{ uri: imageUrl }} style={styles.productImage} />
          )}

          <View style={styles.orderInfo}>
            <Text style={styles.productTitle} numberOfLines={2}>
              {order.expand?.product_id?.title || 'Produit inconnu'}
            </Text>
            <Text style={styles.sellerName}>{seller}</Text>
            <View style={styles.priceRow}>
              <Text style={styles.price}>{formatCFA(order.total_price)}</Text>
              <Text style={styles.quantity}>x{order.quantity}</Text>
            </View>
          </View>
        </View>

        {/* Status Badge */}
        <View style={[styles.statusBadge, { backgroundColor: statusInfo.color + '20' }]}>
          <Text style={[styles.statusBadgeText, { color: statusInfo.color }]}>
            {statusInfo.label}
          </Text>
        </View>

        {/* Delivery Progress for Active Orders */}
        {selectedFilter === 'active' && (
          <View style={styles.progressContainer}>
            <View style={styles.progressBar}>
              <View
                style={[
                  styles.progressFill,
                  { width: `${getProgressPercent()}%` },
                ]}
              />
            </View>
            <Text style={styles.progressLabel}>
              {order.status === 'pending_payment'
                ? 'En attente du paiement'
                : order.status === 'paid'
                ? 'Préparation...'
                : order.status === 'shipped'
                ? 'En transit...'
                : 'Livré'}
            </Text>
          </View>
        )}

        {/* Order Date */}
        <Text style={styles.orderDate}>{formatDateTime(order.created)}</Text>

        {/* Cancel Button for Pending Orders */}
        {order.status === 'pending_payment' && (
          <TouchableOpacity
            style={styles.cancelButton}
            onPress={() => handleCancelOrder(order)}
          >
            <Text style={styles.cancelButtonText}>✕ Annuler la commande</Text>
          </TouchableOpacity>
        )}
      </TouchableOpacity>
    )
  }

  const renderEmpty = () => (
    <View style={styles.empty}>
      <Text style={styles.emptyIcon}>📦</Text>
      <Text style={styles.emptyText}>Aucune commande</Text>
      <Text style={styles.emptySubtext}>
        {selectedFilter === 'active'
          ? 'Commencez vos achats maintenant!'
          : `Aucune commande ${selectedFilter === 'completed' ? 'complétée' : 'annulée'}`}
      </Text>
    </View>
  )

  return (
    <View style={styles.container}>
      {/* Filter Tabs */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterContainer}
        contentContainerStyle={styles.filterContent}
      >
        {FILTER_TABS.map(tab => (
          <TouchableOpacity
            key={tab.value}
            style={[
              styles.filterTab,
              selectedFilter === tab.value && styles.filterTabActive,
            ]}
            onPress={() => setSelectedFilter(tab.value)}
          >
            <Text style={styles.filterIcon}>{tab.icon}</Text>
            <Text
              style={[
                styles.filterLabel,
                selectedFilter === tab.value && styles.filterLabelActive,
              ]}
            >
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Orders List */}
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={filteredOrders}
          renderItem={renderOrderCard}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={renderEmpty}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.primary}
            />
          }
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background.main,
  },
  filterContainer: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border.light,
    backgroundColor: colors.background.surface,
  },
  filterContent: {
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
  },
  filterTab: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginRight: spacing.md,
    borderRadius: 20,
    backgroundColor: colors.background.main,
    borderWidth: 1,
    borderColor: colors.border.light,
  },
  filterTabActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  filterIcon: {
    fontSize: 16,
    marginRight: spacing.xs,
  },
  filterLabel: {
    ...typography.captionBold,
    color: colors.text.primary,
  },
  filterLabelActive: {
    color: colors.text.inverse,
  },
  listContent: {
    padding: spacing.base,
  },
  orderCard: {
    backgroundColor: colors.background.surface,
    borderRadius: 12,
    padding: spacing.base,
    marginBottom: spacing.base,
    borderWidth: 1,
    borderColor: colors.border.light,
  },
  orderHeader: {
    flexDirection: 'row',
    marginBottom: spacing.md,
  },
  productImage: {
    width: 80,
    height: 80,
    borderRadius: 8,
    backgroundColor: colors.background.subtle,
    marginRight: spacing.md,
  },
  orderInfo: {
    flex: 1,
  },
  productTitle: {
    ...typography.h3,
    color: colors.text.primary,
    marginBottom: spacing.xs,
  },
  sellerName: {
    ...typography.caption,
    color: colors.text.secondary,
    marginBottom: spacing.sm,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  price: {
    ...typography.price,
    color: colors.primary,
  },
  quantity: {
    ...typography.caption,
    color: colors.text.secondary,
  },
  statusBadge: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 6,
    marginBottom: spacing.md,
    alignSelf: 'flex-start',
  },
  statusBadgeText: {
    ...typography.micro,
    fontWeight: '700',
  },
  progressContainer: {
    marginBottom: spacing.md,
  },
  progressBar: {
    height: 6,
    backgroundColor: colors.border.light,
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: spacing.sm,
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.primary,
  },
  progressLabel: {
    ...typography.micro,
    color: colors.text.secondary,
  },
  orderDate: {
    ...typography.caption,
    color: colors.text.tertiary,
    marginBottom: spacing.md,
  },
  cancelButton: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.error,
    backgroundColor: colors.error + '10',
    alignItems: 'center',
  },
  cancelButtonText: {
    ...typography.micro,
    color: colors.error,
    fontWeight: '700',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  empty: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing['4xl'],
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: spacing.md,
  },
  emptyText: {
    ...typography.h2,
    color: colors.text.primary,
    marginBottom: spacing.sm,
  },
  emptySubtext: {
    ...typography.body,
    color: colors.text.secondary,
    textAlign: 'center',
    maxWidth: 280,
  },
})


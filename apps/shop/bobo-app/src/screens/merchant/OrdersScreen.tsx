/**
 * Merchant Orders Screen
 * List all orders for this seller with filtering and status management
 */

import React, { useState, useEffect } from 'react'
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Image,
  Alert,
  RefreshControl,
  ActivityIndicator,
  ScrollView,
} from 'react-native'
import { useAuthStore } from '../../store/authStore'
import { ordersService } from '@njooba/core'
import { colors, typography, spacing } from '../../theme'
import { formatCFA, formatDateTime, formatOrderStatus } from '../../utils/formatters'
import type { Order } from '../../types/models'

type OrderStatus = 'all' | 'pending_payment' | 'paid' | 'shipped' | 'delivered'

const FILTER_TABS: { value: OrderStatus; label: string; icon: string }[] = [
  { value: 'all', label: 'Tous', icon: '📦' },
  { value: 'pending_payment', label: 'En attente', icon: '⏳' },
  { value: 'paid', label: 'Payé', icon: '✓' },
  { value: 'shipped', label: 'Expédié', icon: '🚚' },
  { value: 'delivered', label: 'Livré', icon: '✅' },
]

export const OrdersScreen = ({ navigation }: any) => {
  const { profile } = useAuthStore()
  const [orders, setOrders] = useState<Order[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [selectedFilter, setSelectedFilter] = useState<OrderStatus>('all')

  const loadOrders = async () => {
    if (!profile) return

    setIsLoading(true)
    try {
      const result = await ordersService.getOrdersBySeller(profile.id)
      setOrders(result.items || [])
    } catch (error) {
      console.error('Error loading orders:', error)
      Alert.alert('Erreur', 'Impossible de charger les commandes')
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
    if (selectedFilter === 'all') return true
    return order.status === selectedFilter
  })

  const handleOrderPress = (order: Order) => {
    navigation.navigate('OrderDetail', { orderId: order.id })
  }

  const handleMarkAsShipped = async (order: Order) => {
    Alert.alert(
      'Marquer comme expédié',
      `Êtes-vous sûr de vouloir marquer cette commande comme expédiée?`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Confirmer',
          onPress: async () => {
            try {
              const result = await ordersService.updateOrderStatus(order.id, 'shipped')
              if (result.success) {
                Alert.alert('Succès', 'Commande marquée comme expédiée')
                await loadOrders()
              } else {
                Alert.alert('Erreur', result.error || 'Impossible de mettre à jour la commande')
              }
            } catch (error) {
              Alert.alert('Erreur', 'Une erreur est survenue')
            }
          },
        },
      ]
    )
  }

  const handleMarkAsDelivered = async (order: Order) => {
    Alert.alert(
      'Marquer comme livré',
      `Êtes-vous sûr de vouloir marquer cette commande comme livrée?`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Confirmer',
          onPress: async () => {
            try {
              const result = await ordersService.updateOrderStatus(order.id, 'delivered')
              if (result.success) {
                Alert.alert('Succès', 'Commande marquée comme livrée')
                await loadOrders()
              } else {
                Alert.alert('Erreur', result.error || 'Impossible de mettre à jour la commande')
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
    const statusInfo = formatOrderStatus(order.status)
    const buyerName = order.expand?.buyer_id?.username || 'Client inconnu'
    const productTitle = order.expand?.product_id?.title || 'Produit inconnu'

    return (
      <TouchableOpacity
        style={styles.orderCard}
        onPress={() => handleOrderPress(order)}
        activeOpacity={0.7}
      >
        {/* Header with Status Badge */}
        <View style={styles.orderHeader}>
          <View style={styles.orderInfo}>
            <Text style={styles.orderId}>Commande #{order.id.slice(-6).toUpperCase()}</Text>
            <Text style={styles.orderDate}>{formatDateTime(order.created)}</Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: statusInfo.color + '20' }]}>
            <Text style={[styles.statusBadgeText, { color: statusInfo.color }]}>
              {statusInfo.label}
            </Text>
          </View>
        </View>

        {/* Buyer Info */}
        <View style={styles.buyerSection}>
          <Text style={styles.sectionLabel}>Client</Text>
          <Text style={styles.buyerName}>{buyerName}</Text>
          {order.phone_number && (
            <Text style={styles.buyerPhone}>{order.phone_number}</Text>
          )}
        </View>

        {/* Product Info */}
        <View style={styles.productSection}>
          <Text style={styles.sectionLabel}>Produit</Text>
          <Text style={styles.productTitle} numberOfLines={2}>
            {productTitle}
          </Text>
          <View style={styles.productDetails}>
            <Text style={styles.quantity}>Qté: {order.quantity}</Text>
            <Text style={styles.unitPrice}>{formatCFA(order.unit_price)}</Text>
          </View>
        </View>

        {/* Total */}
        <View style={styles.totalSection}>
          <Text style={styles.totalLabel}>Total</Text>
          <Text style={styles.totalPrice}>{formatCFA(order.total_price)}</Text>
        </View>

        {/* Action Buttons */}
        {order.status !== 'delivered' && order.status !== 'cancelled' && (
          <View style={styles.actionButtons}>
            {order.status === 'paid' && (
              <TouchableOpacity
                style={[styles.actionButton, styles.shipButton]}
                onPress={() => handleMarkAsShipped(order)}
              >
                <Text style={styles.shipButtonText}>🚚 Expédier</Text>
              </TouchableOpacity>
            )}

            {order.status === 'shipped' && (
              <TouchableOpacity
                style={[styles.actionButton, styles.deliverButton]}
                onPress={() => handleMarkAsDelivered(order)}
              >
                <Text style={styles.deliverButtonText}>✅ Livrer</Text>
              </TouchableOpacity>
            )}

            {order.status === 'pending_payment' && (
              <TouchableOpacity
                style={[styles.actionButton, styles.viewButton]}
                onPress={() => handleOrderPress(order)}
              >
                <Text style={styles.viewButtonText}>👁️ Détails</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </TouchableOpacity>
    )
  }

  const renderEmpty = () => (
    <View style={styles.empty}>
      <Text style={styles.emptyIcon}>📦</Text>
      <Text style={styles.emptyText}>Aucune commande</Text>
      <Text style={styles.emptySubtext}>
        {selectedFilter === 'all'
          ? 'Vous n\'avez pas encore de commandes'
          : `Aucune commande avec le statut "${FILTER_TABS.find(t => t.value === selectedFilter)?.label}"`}
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
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.md,
  },
  orderInfo: {
    flex: 1,
  },
  orderId: {
    ...typography.h3,
    color: colors.text.primary,
    marginBottom: spacing.xs,
  },
  orderDate: {
    ...typography.caption,
    color: colors.text.secondary,
  },
  statusBadge: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 8,
    marginLeft: spacing.md,
  },
  statusBadgeText: {
    ...typography.micro,
    fontWeight: '700',
  },
  buyerSection: {
    marginBottom: spacing.md,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.light,
  },
  sectionLabel: {
    ...typography.micro,
    color: colors.text.tertiary,
    marginBottom: spacing.xs,
    textTransform: 'uppercase',
  },
  buyerName: {
    ...typography.h3,
    color: colors.text.primary,
    marginBottom: spacing.xs,
  },
  buyerPhone: {
    ...typography.body,
    color: colors.primary,
  },
  productSection: {
    marginBottom: spacing.md,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.light,
  },
  productTitle: {
    ...typography.body,
    color: colors.text.primary,
    marginBottom: spacing.sm,
  },
  productDetails: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  quantity: {
    ...typography.caption,
    color: colors.text.secondary,
  },
  unitPrice: {
    ...typography.captionBold,
    color: colors.secondary,
  },
  totalSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.light,
  },
  totalLabel: {
    ...typography.captionBold,
    color: colors.text.secondary,
  },
  totalPrice: {
    ...typography.price,
    color: colors.primary,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  actionButton: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shipButton: {
    backgroundColor: colors.primary + '20',
    borderWidth: 1,
    borderColor: colors.primary,
  },
  shipButtonText: {
    ...typography.captionBold,
    color: colors.primary,
  },
  deliverButton: {
    backgroundColor: colors.success + '20',
    borderWidth: 1,
    borderColor: colors.success,
  },
  deliverButtonText: {
    ...typography.captionBold,
    color: colors.success,
  },
  viewButton: {
    backgroundColor: colors.primary + '20',
    borderWidth: 1,
    borderColor: colors.primary,
  },
  viewButtonText: {
    ...typography.captionBold,
    color: colors.primary,
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


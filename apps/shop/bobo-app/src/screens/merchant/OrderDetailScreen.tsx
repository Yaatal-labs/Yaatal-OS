/**
 * Merchant Order Detail Screen
 * Full order details with buyer contact info, product details, and status updates
 */

import React, { useState, useEffect } from 'react'
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Linking,
} from 'react-native'
import { useAuthStore } from '../../store/authStore'
import { ordersService } from '@yaatal/core'
import { colors, typography, spacing } from '../../theme'
import { formatCFA, formatDateTime, formatOrderStatus, formatPhoneNumber } from '../../utils/formatters'
import type { Order } from '../../types/models'

export const OrderDetailScreen = ({ route, navigation }: any) => {
  const { orderId } = route.params
  const [order, setOrder] = useState<Order | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isUpdating, setIsUpdating] = useState(false)

  const loadOrder = async () => {
    setIsLoading(true)
    try {
      const result = await ordersService.getOrderById(orderId)
      if (result) {
        setOrder(result)
        navigation.setOptions({ title: `Commande #${result.id.slice(-6).toUpperCase()}` })
      } else {
        Alert.alert('Erreur', 'Impossible de charger la commande')
      }
    } catch (error) {
      Alert.alert('Erreur', 'Une erreur est survenue lors du chargement')
    }
    setIsLoading(false)
  }

  useEffect(() => {
    loadOrder()
  }, [orderId])

  const handleCallBuyer = () => {
    if (!order?.phone_number) {
      Alert.alert('Erreur', 'Numéro de téléphone non disponible')
      return
    }
    const phoneUrl = `tel:${order.phone_number}`
    Linking.openURL(phoneUrl).catch(() => {
      Alert.alert('Erreur', 'Impossible d\'appeler')
    })
  }

  const handleMarkAsShipped = async () => {
    if (!order) return

    Alert.alert(
      'Marquer comme expédié',
      'Êtes-vous sûr? Le client sera notifié.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Confirmer',
          onPress: async () => {
            setIsUpdating(true)
            try {
              const result = await ordersService.updateOrderStatus(order.id, 'shipped')
              if (result.success) {
                Alert.alert('Succès', 'Statut mis à jour')
                await loadOrder()
              } else {
                Alert.alert('Erreur', result.error)
              }
            } catch (error) {
              Alert.alert('Erreur', 'Une erreur est survenue')
            }
            setIsUpdating(false)
          },
        },
      ]
    )
  }

  const handleMarkAsDelivered = async () => {
    if (!order) return

    Alert.alert(
      'Marquer comme livré',
      'Confirmez-vous la livraison? Le client sera notifié.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Confirmer',
          onPress: async () => {
            setIsUpdating(true)
            try {
              const result = await ordersService.updateOrderStatus(order.id, 'delivered')
              if (result.success) {
                Alert.alert('Succès', 'Statut mis à jour')
                await loadOrder()
              } else {
                Alert.alert('Erreur', result.error)
              }
            } catch (error) {
              Alert.alert('Erreur', 'Une erreur est survenue')
            }
            setIsUpdating(false)
          },
        },
      ]
    )
  }

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    )
  }

  if (!order) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>Commande non trouvée</Text>
      </View>
    )
  }

  const statusInfo = formatOrderStatus(order.status)
  const buyer = order.expand?.buyer_id
  const product = order.expand?.product_id

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* Status Card */}
      <View style={styles.statusCard}>
        <View style={[styles.statusBadge, { backgroundColor: statusInfo.color + '20' }]}>
          <Text style={[styles.statusText, { color: statusInfo.color }]}>
            {statusInfo.label}
          </Text>
        </View>
        <Text style={styles.orderId}>Commande #{order.id.slice(-6).toUpperCase()}</Text>
        <Text style={styles.createdDate}>{formatDateTime(order.created)}</Text>
      </View>

      {/* Buyer Information */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Client</Text>
        <View style={styles.sectionContent}>
          <View style={styles.buyerInfo}>
            <Text style={styles.label}>Nom</Text>
            <Text style={styles.value}>{buyer?.username || 'Inconnu'}</Text>
          </View>

          <View style={styles.buyerInfo}>
            <Text style={styles.label}>Téléphone</Text>
            <Text style={styles.value}>
              {order.phone_number ? formatPhoneNumber(order.phone_number) : 'Non disponible'}
            </Text>
          </View>

          {order.shipping_address && (
            <View style={styles.buyerInfo}>
              <Text style={styles.label}>Adresse de livraison</Text>
              <Text style={styles.value}>{order.shipping_address}</Text>
            </View>
          )}

          <TouchableOpacity
            style={styles.callButton}
            onPress={handleCallBuyer}
            disabled={!order.phone_number}
          >
            <Text style={styles.callButtonText}>📞 Appeler le client</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Product Information */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Produit</Text>
        <View style={styles.sectionContent}>
          <View style={styles.productRow}>
            <Text style={styles.label}>Nom du produit</Text>
            <Text style={styles.value}>{product?.title || 'Inconnu'}</Text>
          </View>

          <View style={styles.productRow}>
            <Text style={styles.label}>SKU</Text>
            <Text style={styles.value}>{product?.sku || 'N/A'}</Text>
          </View>

          <View style={styles.productRow}>
            <Text style={styles.label}>Quantité</Text>
            <Text style={styles.value}>{order.quantity}</Text>
          </View>

          <View style={styles.productRow}>
            <Text style={styles.label}>Prix unitaire</Text>
            <Text style={styles.value}>{formatCFA(order.unit_price)}</Text>
          </View>
        </View>
      </View>

      {/* Payment Information */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Paiement</Text>
        <View style={styles.sectionContent}>
          <View style={styles.paymentRow}>
            <Text style={styles.label}>Méthode</Text>
            <Text style={styles.value}>{order.payment_method || 'N/A'}</Text>
          </View>

          {order.payment_reference && (
            <View style={styles.paymentRow}>
              <Text style={styles.label}>Référence</Text>
              <Text style={styles.value}>{order.payment_reference}</Text>
            </View>
          )}

          <View style={styles.paymentRow}>
            <Text style={styles.label}>Statut du paiement</Text>
            <View style={[styles.paymentBadge, { backgroundColor: statusInfo.color + '20' }]}>
              <Text style={[styles.paymentBadgeText, { color: statusInfo.color }]}>
                {statusInfo.label}
              </Text>
            </View>
          </View>
        </View>
      </View>

      {/* Order Summary */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Résumé</Text>
        <View style={styles.sectionContent}>
          <View style={styles.summaryRow}>
            <Text style={styles.label}>Sous-total</Text>
            <Text style={styles.value}>{formatCFA(order.unit_price * order.quantity)}</Text>
          </View>

          <View style={styles.summaryRow}>
            <Text style={styles.label}>Frais de livraison</Text>
            <Text style={styles.value}>{formatCFA(0)}</Text>
          </View>

          <View style={[styles.summaryRow, styles.totalRow]}>
            <Text style={styles.totalLabel}>Total</Text>
            <Text style={styles.totalValue}>{formatCFA(order.total_price)}</Text>
          </View>
        </View>
      </View>

      {/* Tracking Information */}
      {order.tracking_number && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Suivi</Text>
          <View style={styles.sectionContent}>
            <Text style={styles.label}>Numéro de suivi</Text>
            <Text style={[styles.value, styles.trackingNumber]}>{order.tracking_number}</Text>
          </View>
        </View>
      )}

      {/* Status Timeline */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Historique</Text>
        <View style={styles.timeline}>
          <TimelineItem
            status="pending_payment"
            label="Commande créée"
            timestamp={order.created}
            isActive={true}
          />
          <TimelineItem
            status="paid"
            label="Paiement reçu"
            timestamp={order.updated}
            isActive={
              order.status === 'paid' ||
              order.status === 'shipped' ||
              order.status === 'delivered'
            }
          />
          <TimelineItem
            status="shipped"
            label="Expédié"
            timestamp={order.updated}
            isActive={order.status === 'shipped' || order.status === 'delivered'}
          />
          <TimelineItem
            status="delivered"
            label="Livré"
            timestamp={order.updated}
            isActive={order.status === 'delivered'}
          />
        </View>
      </View>

      {/* Action Buttons */}
      <View style={styles.actionSection}>
        {order.status === 'paid' && (
          <TouchableOpacity
            style={[styles.actionButton, styles.shipButton]}
            onPress={handleMarkAsShipped}
            disabled={isUpdating}
          >
            <Text style={styles.shipButtonText}>
              {isUpdating ? '⏳' : '🚚'} Marquer comme expédié
            </Text>
          </TouchableOpacity>
        )}

        {order.status === 'shipped' && (
          <TouchableOpacity
            style={[styles.actionButton, styles.deliverButton]}
            onPress={handleMarkAsDelivered}
            disabled={isUpdating}
          >
            <Text style={styles.deliverButtonText}>
              {isUpdating ? '⏳' : '✅'} Marquer comme livré
            </Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.spacer} />
    </ScrollView>
  )
}

interface TimelineItemProps {
  status: string
  label: string
  timestamp: string
  isActive: boolean
}

const TimelineItem = ({ status, label, timestamp, isActive }: TimelineItemProps) => {
  const statusInfo = formatOrderStatus(status)

  return (
    <View style={styles.timelineItem}>
      <View
        style={[
          styles.timelineDot,
          { backgroundColor: isActive ? statusInfo.color : colors.border.light },
        ]}
      />
      <View style={styles.timelineContent}>
        <Text style={[styles.timelineLabel, { color: isActive ? colors.text.primary : colors.text.tertiary }]}>
          {label}
        </Text>
        {isActive && <Text style={styles.timelineTime}>{formatDateTime(timestamp)}</Text>}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background.main,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    ...typography.body,
    color: colors.text.secondary,
  },
  statusCard: {
    padding: spacing.base,
    paddingVertical: spacing.lg,
    backgroundColor: colors.background.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.light,
    alignItems: 'center',
  },
  statusBadge: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 8,
    marginBottom: spacing.md,
  },
  statusText: {
    ...typography.captionBold,
    fontWeight: '700',
  },
  orderId: {
    ...typography.h2,
    color: colors.text.primary,
    marginBottom: spacing.xs,
  },
  createdDate: {
    ...typography.caption,
    color: colors.text.secondary,
  },
  section: {
    padding: spacing.base,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.light,
  },
  sectionTitle: {
    ...typography.h3,
    color: colors.text.primary,
    marginBottom: spacing.md,
  },
  sectionContent: {
    gap: spacing.md,
  },
  buyerInfo: {
    paddingBottom: spacing.md,
  },
  label: {
    ...typography.caption,
    color: colors.text.secondary,
    marginBottom: spacing.xs,
    textTransform: 'uppercase',
  },
  value: {
    ...typography.body,
    color: colors.text.primary,
  },
  callButton: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.base,
    backgroundColor: colors.primary + '20',
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  callButtonText: {
    ...typography.captionBold,
    color: colors.primary,
  },
  productRow: {
    paddingBottom: spacing.md,
  },
  paymentRow: {
    paddingBottom: spacing.md,
  },
  paymentBadge: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  paymentBadgeText: {
    ...typography.micro,
    fontWeight: '700',
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: spacing.md,
  },
  totalRow: {
    borderTopWidth: 1,
    borderTopColor: colors.border.light,
    paddingTop: spacing.md,
  },
  totalLabel: {
    ...typography.h3,
    color: colors.text.primary,
    fontWeight: '700',
  },
  totalValue: {
    ...typography.priceLarge,
    color: colors.primary,
  },
  trackingNumber: {
    fontFamily: 'monospace',
    fontSize: 12,
  },
  timeline: {
    gap: spacing.md,
  },
  timelineItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  timelineDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: spacing.md,
    marginTop: spacing.sm,
  },
  timelineContent: {
    flex: 1,
  },
  timelineLabel: {
    ...typography.body,
    marginBottom: spacing.xs,
  },
  timelineTime: {
    ...typography.caption,
    color: colors.text.secondary,
  },
  actionSection: {
    padding: spacing.base,
    gap: spacing.sm,
  },
  actionButton: {
    paddingVertical: spacing.md,
    borderRadius: 8,
    alignItems: 'center',
  },
  shipButton: {
    backgroundColor: colors.primary,
  },
  shipButtonText: {
    ...typography.captionBold,
    color: colors.text.inverse,
  },
  deliverButton: {
    backgroundColor: colors.success,
  },
  deliverButtonText: {
    ...typography.captionBold,
    color: colors.text.inverse,
  },
  spacer: {
    height: spacing.base,
  },
})


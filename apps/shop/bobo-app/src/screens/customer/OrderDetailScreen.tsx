/**
 * Customer Order Detail Screen
 * Full order details with seller contact, delivery tracking, and reorder functionality
 */

import React, { useState, useEffect } from 'react'
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Image,
  Alert,
  ActivityIndicator,
  Linking,
} from 'react-native'
import { useAuthStore } from '../../store/authStore'
import { ordersService, getProductImageUrl, getAvatarUrl } from '@njooba/core'
import { colors, typography, spacing } from '../../theme'
import { formatCFA, formatDateTime, formatOrderStatus, formatPhoneNumber, type Order, type Product } from '@njooba/core'

export const OrderDetailScreen = ({ route, navigation }: any) => {
  const { orderId } = route.params
  const [order, setOrder] = useState<Order | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isCancelling, setIsCancelling] = useState(false)

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

  const handleContactSeller = () => {
    if (!order?.expand?.seller_id) {
      Alert.alert('Erreur', 'Informations du vendeur non disponibles')
      return
    }
    // Navigate to chat with seller
    // navigation.navigate('Chat', { conversationId: order.seller_id })
    Alert.alert('Message', 'Ouvrir le chat avec le vendeur')
  }

  const handleCallSeller = () => {
    if (!order?.expand?.seller_id?.phone_number) {
      Alert.alert('Erreur', 'Numéro de téléphone du vendeur non disponible')
      return
    }
    const phoneUrl = `tel:${order.expand.seller_id.phone_number}`
    Linking.openURL(phoneUrl).catch(() => {
      Alert.alert('Erreur', 'Impossible d\'appeler')
    })
  }

  const handleCancelOrder = () => {
    Alert.alert(
      'Annuler la commande',
      'Êtes-vous sûr de vouloir annuler cette commande?',
      [
        { text: 'Non', style: 'cancel' },
        {
          text: 'Oui',
          style: 'destructive',
          onPress: async () => {
            if (!order) return

            setIsCancelling(true)
            try {
              const result = await ordersService.cancelOrder(order.id)
              if (result.success) {
                Alert.alert('Succès', 'Commande annulée')
                await loadOrder()
              } else {
                Alert.alert('Erreur', result.error)
              }
            } catch (error) {
              Alert.alert('Erreur', 'Une erreur est survenue')
            }
            setIsCancelling(false)
          },
        },
      ]
    )
  }

  const handleReorder = () => {
    if (!order?.expand?.product_id) return
    // Navigate to checkout with product
    navigation.navigate('Checkout', { product: order.expand.product_id })
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
  const seller = order.expand?.seller_id
  const product = order.expand?.product_id
  const imageUrl = product?.image_url
    ? getProductImageUrl(product.image_url) || 'https://via.placeholder.com/100'
    : undefined

  // Calculate delivery progress
  const getDeliveryStage = () => {
    if (order.status === 'pending_payment') return 1
    if (order.status === 'paid') return 2
    if (order.status === 'shipped') return 3
    if (order.status === 'delivered') return 4
    return 0
  }

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

      {/* Delivery Tracking - Visual Timeline */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Statut de livraison</Text>
        <View style={styles.deliveryTimeline}>
          <DeliveryStep
            number={1}
            label="Paiement"
            isActive={getDeliveryStage() >= 1}
            isCompleted={getDeliveryStage() > 1}
            icon="💳"
          />
          <View style={[styles.timelineConnector, getDeliveryStage() > 1 && styles.timelineConnectorActive]} />
          <DeliveryStep
            number={2}
            label="Préparation"
            isActive={getDeliveryStage() >= 2}
            isCompleted={getDeliveryStage() > 2}
            icon="📦"
          />
          <View style={[styles.timelineConnector, getDeliveryStage() > 2 && styles.timelineConnectorActive]} />
          <DeliveryStep
            number={3}
            label="Expédition"
            isActive={getDeliveryStage() >= 3}
            isCompleted={getDeliveryStage() > 3}
            icon="🚚"
          />
          <View style={[styles.timelineConnector, getDeliveryStage() > 3 && styles.timelineConnectorActive]} />
          <DeliveryStep
            number={4}
            label="Livré"
            isActive={getDeliveryStage() >= 4}
            isCompleted={getDeliveryStage() > 4}
            icon="✅"
          />
        </View>
      </View>

      {/* Seller Information */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Vendeur</Text>
        <View style={styles.sectionContent}>
          <View style={styles.sellerHeader}>
            {seller?.avatar_url && (
              <Image
                source={{
                  uri: getAvatarUrl(seller.avatar_url, 48) || 'https://via.placeholder.com/48',
                }}
                style={styles.sellerAvatar}
              />
            )}
            <View style={styles.sellerInfo}>
              <Text style={styles.sellerName}>{seller?.username || 'Inconnu'}</Text>
              {seller?.seller_rating && (
                <Text style={styles.sellerRating}>⭐ {seller.seller_rating.toFixed(1)}</Text>
              )}
            </View>
          </View>

          <View style={styles.sellerActions}>
            <TouchableOpacity
              style={[styles.contactButton, styles.chatButton]}
              onPress={handleContactSeller}
            >
              <Text style={styles.chatButtonText}>💬 Discuter</Text>
            </TouchableOpacity>
            {seller?.phone_number && (
              <TouchableOpacity
                style={[styles.contactButton, styles.callButton]}
                onPress={handleCallSeller}
              >
                <Text style={styles.callButtonText}>📞 Appeler</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>

      {/* Product Information */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Produit commandé</Text>
        <View style={styles.productCard}>
          {imageUrl && (
            <Image source={{ uri: imageUrl }} style={styles.productImage} />
          )}
          <View style={styles.productInfo}>
            <Text style={styles.productTitle} numberOfLines={2}>
              {product?.title || 'Produit inconnu'}
            </Text>
            <View style={styles.productDetails}>
              <Text style={styles.detailLabel}>SKU: </Text>
              <Text style={styles.detailValue}>{product?.sku || 'N/A'}</Text>
            </View>
            <View style={styles.productDetails}>
              <Text style={styles.detailLabel}>Catégorie: </Text>
              <Text style={styles.detailValue}>{product?.category || 'N/A'}</Text>
            </View>
          </View>
        </View>
      </View>

      {/* Order Summary */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Résumé de la commande</Text>
        <View style={styles.sectionContent}>
          <View style={styles.summaryRow}>
            <Text style={styles.label}>Quantité</Text>
            <Text style={styles.value}>{order.quantity}</Text>
          </View>

          <View style={styles.summaryRow}>
            <Text style={styles.label}>Prix unitaire</Text>
            <Text style={styles.value}>{formatCFA(order.unit_price)}</Text>
          </View>

          <View style={styles.summaryRow}>
            <Text style={styles.label}>Sous-total</Text>
            <Text style={styles.value}>{formatCFA(order.unit_price * order.quantity)}</Text>
          </View>

          <View style={styles.summaryRow}>
            <Text style={styles.label}>Frais de livraison</Text>
            <Text style={styles.value}>{formatCFA(0)}</Text>
          </View>

          <View style={[styles.summaryRow, styles.totalRow]}>
            <Text style={styles.totalLabel}>Total payé</Text>
            <Text style={styles.totalValue}>{formatCFA(order.total_price)}</Text>
          </View>
        </View>
      </View>

      {/* Delivery Address */}
      {order.shipping_address && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Adresse de livraison</Text>
          <View style={styles.sectionContent}>
            <Text style={styles.addressText}>{order.shipping_address}</Text>
          </View>
        </View>
      )}

      {/* Tracking Number */}
      {order.tracking_number && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Numéro de suivi</Text>
          <View style={styles.trackingBox}>
            <Text style={styles.trackingNumber}>{order.tracking_number}</Text>
          </View>
        </View>
      )}

      {/* Payment Information */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Paiement</Text>
        <View style={styles.sectionContent}>
          <View style={styles.infoRow}>
            <Text style={styles.label}>Méthode</Text>
            <Text style={styles.value}>{order.payment_method || 'N/A'}</Text>
          </View>

          {order.payment_reference && (
            <View style={styles.infoRow}>
              <Text style={styles.label}>Référence</Text>
              <Text style={styles.value}>{order.payment_reference}</Text>
            </View>
          )}

          <View style={styles.infoRow}>
            <Text style={styles.label}>Statut du paiement</Text>
            <View style={[styles.paymentBadge, { backgroundColor: statusInfo.color + '20' }]}>
              <Text style={[styles.paymentBadgeText, { color: statusInfo.color }]}>
                {statusInfo.label}
              </Text>
            </View>
          </View>
        </View>
      </View>

      {/* Action Buttons */}
      <View style={styles.actionSection}>
        {order.status === 'pending_payment' && (
          <TouchableOpacity
            style={[styles.actionButton, styles.cancelButton]}
            onPress={handleCancelOrder}
            disabled={isCancelling}
          >
            <Text style={styles.cancelButtonText}>
              {isCancelling ? '⏳' : '✕'} Annuler la commande
            </Text>
          </TouchableOpacity>
        )}

        {(order.status === 'delivered' || order.status === 'cancelled') && (
          <TouchableOpacity
            style={[styles.actionButton, styles.reorderButton]}
            onPress={handleReorder}
          >
            <Text style={styles.reorderButtonText}>🔄 Recommander</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.spacer} />
    </ScrollView>
  )
}

interface DeliveryStepProps {
  number: number
  label: string
  isActive: boolean
  isCompleted: boolean
  icon: string
}

const DeliveryStep = ({ number, label, isActive, isCompleted, icon }: DeliveryStepProps) => {
  return (
    <View style={styles.deliveryStep}>
      <View
        style={[
          styles.deliveryDot,
          isCompleted && styles.deliveryDotCompleted,
          isActive && !isCompleted && styles.deliveryDotActive,
        ]}
      >
        {isCompleted ? (
          <Text style={styles.deliveryDotIcon}>✓</Text>
        ) : (
          <Text style={styles.deliveryDotIcon}>{icon}</Text>
        )}
      </View>
      <Text
        style={[
          styles.deliveryLabel,
          isActive && styles.deliveryLabelActive,
        ]}
      >
        {label}
      </Text>
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
  deliveryTimeline: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  deliveryStep: {
    alignItems: 'center',
    flex: 1,
  },
  deliveryDot: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.border.light,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  deliveryDotActive: {
    backgroundColor: colors.primary,
  },
  deliveryDotCompleted: {
    backgroundColor: colors.success,
  },
  deliveryDotIcon: {
    fontSize: 24,
  },
  deliveryLabel: {
    ...typography.micro,
    color: colors.text.secondary,
    textAlign: 'center',
  },
  deliveryLabelActive: {
    color: colors.text.primary,
    fontWeight: '700',
  },
  timelineConnector: {
    height: 2,
    flex: 1,
    backgroundColor: colors.border.light,
    marginBottom: spacing['3xl'],
  },
  timelineConnectorActive: {
    backgroundColor: colors.success,
  },
  sellerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  sellerAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.background.surface,
    marginRight: spacing.md,
  },
  sellerInfo: {
    flex: 1,
  },
  sellerName: {
    ...typography.h3,
    color: colors.text.primary,
    marginBottom: spacing.xs,
  },
  sellerRating: {
    ...typography.caption,
    color: colors.secondary,
  },
  sellerActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  contactButton: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: 8,
    alignItems: 'center',
  },
  chatButton: {
    backgroundColor: colors.primary + '20',
    borderWidth: 1,
    borderColor: colors.primary,
  },
  chatButtonText: {
    ...typography.captionBold,
    color: colors.primary,
  },
  callButton: {
    backgroundColor: colors.primary + '20',
    borderWidth: 1,
    borderColor: colors.primary,
  },
  callButtonText: {
    ...typography.captionBold,
    color: colors.primary,
  },
  productCard: {
    flexDirection: 'row',
    backgroundColor: colors.background.surface,
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border.light,
  },
  productImage: {
    width: 100,
    height: 100,
    backgroundColor: colors.background.main,
  },
  productInfo: {
    flex: 1,
    padding: spacing.md,
    justifyContent: 'center',
  },
  productTitle: {
    ...typography.h3,
    color: colors.text.primary,
    marginBottom: spacing.sm,
  },
  productDetails: {
    flexDirection: 'row',
    marginBottom: spacing.xs,
  },
  detailLabel: {
    ...typography.caption,
    color: colors.text.secondary,
  },
  detailValue: {
    ...typography.caption,
    color: colors.text.primary,
    fontWeight: '600',
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingBottom: spacing.md,
  },
  totalRow: {
    borderTopWidth: 1,
    borderTopColor: colors.border.light,
    paddingTop: spacing.md,
  },
  label: {
    ...typography.caption,
    color: colors.text.secondary,
  },
  value: {
    ...typography.body,
    color: colors.text.primary,
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
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: spacing.md,
  },
  paymentBadge: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 6,
  },
  paymentBadgeText: {
    ...typography.micro,
    fontWeight: '700',
  },
  addressText: {
    ...typography.body,
    color: colors.text.primary,
    lineHeight: 22,
  },
  trackingBox: {
    backgroundColor: colors.background.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.base,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border.light,
    borderStyle: 'dashed',
  },
  trackingNumber: {
    ...typography.body,
    color: colors.primary,
    fontFamily: 'monospace',
    fontWeight: '600',
    textAlign: 'center',
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
  cancelButton: {
    backgroundColor: colors.error + '20',
    borderWidth: 1,
    borderColor: colors.error,
  },
  cancelButtonText: {
    ...typography.captionBold,
    color: colors.error,
  },
  reorderButton: {
    backgroundColor: colors.primary,
  },
  reorderButtonText: {
    ...typography.captionBold,
    color: colors.text.inverse,
  },
  spacer: {
    height: spacing.base,
  },
})


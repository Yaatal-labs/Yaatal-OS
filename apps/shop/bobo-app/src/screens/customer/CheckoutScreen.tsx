/**
 * Checkout Screen (Customer)
 * Complete checkout flow with shipping, payment method selection, and order creation
 * Supports Wave stub and Cash on Delivery payments through Engine
 */

import React, { useState, useEffect } from 'react'
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  Image,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
} from 'react-native'
import { useAuthStore } from '../../store/authStore'
import { ordersService, type ShippingInfo, getProductImageUrl } from '@njooba/core'
import { colors, typography, spacing } from '../../theme'
import { formatCFA, validatePhoneNumber, type Product, type Order } from '@njooba/core'
import { shippingService } from '../../services/shipping.service'

const { width: SCREEN_WIDTH } = Dimensions.get('window')

export const CheckoutScreen = ({ route, navigation }: any) => {
  const { product, quantity } = route.params as {
    product: Product
    quantity?: number
  }
  const { profile } = useAuthStore()
  const selectedQuantity = quantity ?? 1

  // Form states
  const [shippingAddress, setShippingAddress] = useState('')
  const [city, setCity] = useState('')
  const [region, setRegion] = useState('')
  const [zipCode, setZipCode] = useState('')
  const [phoneNumber, setPhoneNumber] = useState(profile?.phone_number || '')
  const [paymentMethod, setPaymentMethod] = useState<'wave' | 'cash'>('cash')

  // UI states
  const [isLoading, setIsLoading] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [orderCreated, setOrderCreated] = useState<Order | null>(null)

  // Calculate prices
  const unitPrice = product.discount_price ?? product.price
  const subtotal = unitPrice * selectedQuantity
  const sellerCity = (product as any).seller_city || 'Dakar'
  const shippingCost = shippingService.calculateShippingCost(sellerCity, city || 'Dakar')
  const total = subtotal + shippingCost

  // Senegalese regions
  const SENEGAL_REGIONS = [
    'Dakar',
    'Thiès',
    'Saint-Louis',
    'Kaolack',
    'Tambacounda',
    'Kolda',
    'Ziguinchor',
    'Sédhiou',
    'Matam',
    'Louga',
    'Fatick',
    'Kedougou',
  ]

  // Validate form
  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {}

    if (!shippingAddress.trim()) {
      newErrors.address = 'Adresse requise'
    }

    if (!city.trim()) {
      newErrors.city = 'Ville requise'
    }

    if (!region) {
      newErrors.region = 'Région requise'
    }

    const phoneValidation = validatePhoneNumber(phoneNumber)
    if (!phoneValidation.valid) {
      newErrors.phone = phoneValidation.error || 'Numéro invalide'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  // Handle checkout
  const handleCheckout = async () => {
    const sellerId = product.expand?.seller_id?.id || product.seller_id

    if (!profile || !sellerId) {
      Alert.alert('Erreur', 'Informations manquantes')
      return
    }

    if (!validateForm()) {
      return
    }

    setIsLoading(true)

    try {
      const shippingInfo: ShippingInfo = {
        address: shippingAddress.trim(),
        city: city.trim(),
        region,
        zipCode: zipCode.trim() || undefined,
        phoneNumber: phoneNumber.trim(),
      }

      const result = await ordersService.createOrder(
        profile.id,
        sellerId,
        product.id,
        selectedQuantity,
        shippingInfo,
        paymentMethod
      )

      if (result.success && result.order) {
        setOrderCreated(result.order)

        // Handle payment based on method
        if (paymentMethod === 'cash') {
          // Cash on delivery - navigate to success
          setTimeout(() => {
            navigation.navigate('OrderSuccess', { orderId: result.order!.id })
          }, 1000)
        } else {
          navigation.navigate('PaymentPending', {
            orderId: result.order!.id,
            transactionId: (result as any).payment?.provider_ref,
            boboOrderId: (result.order as any).bobo_order_id,
            redirectUrl: (result as any).payment?.redirect_url,
          })
        }
      } else {
        Alert.alert('Erreur', result.error || 'Impossible de créer la commande')
      }
    } catch (error) {
      console.error('Checkout error:', error)
      Alert.alert('Erreur', 'Une erreur est survenue lors du paiement')
    } finally {
      setIsLoading(false)
    }
  }

  if (!product || !profile) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    )
  }

  const imageUrl = getProductImageUrl(product.image_url) || 'https://via.placeholder.com/80'
  const hasDiscount = product.discount_price && product.discount_price < product.price

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {/* Order Summary Card */}
        <View style={styles.summaryCard}>
          <Text style={styles.sectionTitle}>📦 Résumé de la commande</Text>

          <View style={styles.productRow}>
            <Image source={{ uri: imageUrl }} style={styles.productImage} />
            <View style={styles.productInfo}>
              <Text style={styles.productTitle} numberOfLines={2}>
                {product.title}
              </Text>
              <Text style={styles.sku}>SKU: {product.sku}</Text>
              <Text style={styles.quantity}>Quantité: {selectedQuantity}</Text>
            </View>
          </View>

          {/* Price Breakdown */}
          <View style={styles.priceBreakdown}>
            <View style={styles.priceRow}>
              <Text style={styles.priceLabel}>Prix unitaire:</Text>
              <Text style={styles.priceValue}>{formatCFA(unitPrice)}</Text>
            </View>

            {hasDiscount && (
              <View style={styles.discountRow}>
                <Text style={styles.discountLabel}>
                  Réduc. ({Math.round(((product.price - product.discount_price!) / product.price) * 100)}%):
                </Text>
                <Text style={styles.discountValue}>
                  -{formatCFA(product.price - product.discount_price!)}
                </Text>
              </View>
            )}

            <View style={styles.subtotalRow}>
              <Text style={styles.subtotalLabel}>Sous-total ({selectedQuantity}x):</Text>
              <Text style={styles.subtotalValue}>{formatCFA(subtotal)}</Text>
            </View>

            <View style={styles.shippingRow}>
              <Text style={styles.shippingLabel}>Frais de livraison:</Text>
              <Text style={styles.shippingValue}>{formatCFA(shippingCost)}</Text>
            </View>

            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Total:</Text>
              <Text style={styles.totalValue}>{formatCFA(total)}</Text>
            </View>
          </View>
        </View>

        {/* Shipping Information Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>📍 Adresse de livraison</Text>

          {/* Address */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Adresse complète *</Text>
            <TextInput
              style={[styles.input, errors.address && styles.inputError]}
              placeholder="Ex: 123 Rue de la Paix, Apt 5"
              placeholderTextColor={colors.text.tertiary}
              value={shippingAddress}
              onChangeText={setShippingAddress}
              multiline
              numberOfLines={2}
            />
            {errors.address && <Text style={styles.errorText}>{errors.address}</Text>}
          </View>

          {/* City */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Ville *</Text>
            <TextInput
              style={[styles.input, errors.city && styles.inputError]}
              placeholder="Ex: Dakar"
              placeholderTextColor={colors.text.tertiary}
              value={city}
              onChangeText={setCity}
            />
            {errors.city && <Text style={styles.errorText}>{errors.city}</Text>}
          </View>

          {/* Region Picker */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Région *</Text>
            <View style={[styles.regionPicker, errors.region && styles.inputError]}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.regionScroll}
              >
                {SENEGAL_REGIONS.map((r) => (
                  <TouchableOpacity
                    key={r}
                    style={[
                      styles.regionButton,
                      region === r && styles.regionButtonActive,
                    ]}
                    onPress={() => setRegion(r)}
                  >
                    <Text
                      style={[
                        styles.regionButtonText,
                        region === r && styles.regionButtonTextActive,
                      ]}
                    >
                      {r}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
            {errors.region && <Text style={styles.errorText}>{errors.region}</Text>}
          </View>

          {/* ZIP Code */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Code postal (optionnel)</Text>
            <TextInput
              style={styles.input}
              placeholder="Ex: 10000"
              placeholderTextColor={colors.text.tertiary}
              value={zipCode}
              onChangeText={setZipCode}
              keyboardType="number-pad"
            />
          </View>
        </View>

        {/* Contact Information Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>📱 Numéro de contact</Text>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Téléphone (Sénégal) *</Text>
            <TextInput
              style={[styles.input, errors.phone && styles.inputError]}
              placeholder="+221XXXXXXXXX ou 7XXXXXXXX"
              placeholderTextColor={colors.text.tertiary}
              value={phoneNumber}
              onChangeText={setPhoneNumber}
              keyboardType="phone-pad"
            />
            {errors.phone && <Text style={styles.errorText}>{errors.phone}</Text>}
            <Text style={styles.helperText}>Format: +221XXXXXXXXX ou 7XXXXXXXX</Text>
          </View>
        </View>

        {/* Payment Method Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>💳 Méthode de paiement</Text>

          {/* Wave */}
          <TouchableOpacity
            style={[
              styles.paymentButton,
              paymentMethod === 'wave' && styles.paymentButtonActive,
            ]}
            onPress={() => setPaymentMethod('wave')}
          >
            <View style={styles.paymentButtonContent}>
              <Text style={styles.paymentIcon}>🌊</Text>
              <View style={styles.paymentInfo}>
                <Text style={styles.paymentName}>Wave Money</Text>
                <Text style={styles.paymentDesc}>Paiement mobile sécurisé</Text>
              </View>
            </View>
            <View
              style={[
                styles.radioButton,
                paymentMethod === 'wave' && styles.radioButtonActive,
              ]}
            />
          </TouchableOpacity>

          {/* Cash on Delivery */}
          <TouchableOpacity
            style={[
              styles.paymentButton,
              paymentMethod === 'cash' && styles.paymentButtonActive,
            ]}
            onPress={() => setPaymentMethod('cash')}
          >
            <View style={styles.paymentButtonContent}>
              <Text style={styles.paymentIcon}>💵</Text>
              <View style={styles.paymentInfo}>
                <Text style={styles.paymentName}>Paiement à la livraison</Text>
                <Text style={styles.paymentDesc}>Payez quand vous recevez</Text>
              </View>
            </View>
            <View
              style={[
                styles.radioButton,
                paymentMethod === 'cash' && styles.radioButtonActive,
              ]}
            />
          </TouchableOpacity>

          {/* Payment Info */}
          {paymentMethod === 'wave' && (
            <View style={styles.paymentInfoBox}>
              <Text style={styles.paymentInfoText}>
                💡 Wave est branché sur le stub Engine MVP. Le statut restera en attente
                jusqu'à la confirmation provider.
              </Text>
            </View>
          )}
        </View>

        {/* Terms & Conditions */}
        <View style={styles.termsSection}>
          <Text style={styles.termsText}>
            En confirmant votre commande, vous acceptez nos conditions d'utilisation et notre
            politique de confidentialité.
          </Text>
        </View>

        <View style={styles.bottomSpacer} />
      </ScrollView>

      {/* Bottom Action Bar */}
      <View style={styles.bottomBar}>
        <View style={styles.totalBarSection}>
          <Text style={styles.totalBarLabel}>Total:</Text>
          <Text style={styles.totalBarValue}>{formatCFA(total)}</Text>
        </View>

        <TouchableOpacity
          style={[styles.checkoutButton, isLoading && styles.checkoutButtonDisabled]}
          onPress={handleCheckout}
          disabled={isLoading}
        >
          {isLoading ? (
            <ActivityIndicator color={colors.text.inverse} size="small" />
          ) : (
            <Text style={styles.checkoutButtonText}>Confirmer la commande</Text>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background.main,
  },
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background.main,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 120,
  },

  // Summary Card
  summaryCard: {
    margin: spacing.md,
    backgroundColor: colors.background.surface,
    borderRadius: 12,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border.light,
  },
  sectionTitle: {
    ...typography.h2,
    color: colors.text.primary,
    marginBottom: spacing.md,
  },
  productRow: {
    flexDirection: 'row',
    marginBottom: spacing.lg,
  },
  productImage: {
    width: 80,
    height: 80,
    borderRadius: 8,
    marginRight: spacing.md,
    backgroundColor: colors.background.main,
  },
  productInfo: {
    flex: 1,
  },
  productTitle: {
    ...typography.h3,
    color: colors.text.primary,
    marginBottom: spacing.xs,
  },
  sku: {
    ...typography.caption,
    color: colors.text.secondary,
    marginBottom: 4,
  },
  quantity: {
    ...typography.body,
    color: colors.text.secondary,
  },

  // Price Breakdown
  priceBreakdown: {
    borderTopWidth: 1,
    borderTopColor: colors.border.light,
    paddingTop: spacing.md,
  },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  priceLabel: {
    ...typography.body,
    color: colors.text.secondary,
  },
  priceValue: {
    ...typography.body,
    color: colors.text.primary,
  },
  discountRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  discountLabel: {
    ...typography.body,
    color: colors.success,
  },
  discountValue: {
    ...typography.bodyBold,
    color: colors.success,
  },
  subtotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  subtotalLabel: {
    ...typography.body,
    color: colors.text.secondary,
  },
  subtotalValue: {
    ...typography.bodyBold,
    color: colors.text.primary,
  },
  shippingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.light,
  },
  shippingLabel: {
    ...typography.body,
    color: colors.text.secondary,
  },
  shippingValue: {
    ...typography.body,
    color: colors.text.primary,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  totalLabel: {
    ...typography.h2,
    color: colors.text.primary,
  },
  totalValue: {
    ...typography.h2,
    color: colors.secondary,
  },

  // Sections
  section: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.lg,
  },

  // Form Inputs
  inputGroup: {
    marginBottom: spacing.md,
  },
  label: {
    ...typography.bodyBold,
    color: colors.text.primary,
    marginBottom: spacing.sm,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border.light,
    borderRadius: 8,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.base,
    ...typography.body,
    color: colors.text.primary,
    backgroundColor: colors.background.main,
  },
  inputError: {
    borderColor: colors.error,
    backgroundColor: colors.error + '10',
  },
  errorText: {
    ...typography.caption,
    color: colors.error,
    marginTop: spacing.xs,
  },
  helperText: {
    ...typography.caption,
    color: colors.text.tertiary,
    marginTop: spacing.xs,
  },

  // Region Picker
  regionPicker: {
    borderWidth: 1,
    borderColor: colors.border.light,
    borderRadius: 8,
    padding: spacing.sm,
    backgroundColor: colors.background.main,
  },
  regionScroll: {
    flexGrow: 0,
  },
  regionButton: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 8,
    borderRadius: 6,
    marginRight: spacing.xs,
    backgroundColor: colors.background.surface,
    borderWidth: 1,
    borderColor: colors.border.light,
  },
  regionButtonActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  regionButtonText: {
    ...typography.caption,
    color: colors.text.primary,
  },
  regionButtonTextActive: {
    color: colors.text.inverse,
    fontWeight: '700',
  },

  // Payment Methods
  paymentButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.background.surface,
    borderRadius: 12,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 2,
    borderColor: colors.border.light,
  },
  paymentButtonActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primary + '10',
  },
  paymentButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  paymentIcon: {
    fontSize: 32,
    marginRight: spacing.md,
  },
  paymentInfo: {
    flex: 1,
  },
  paymentName: {
    ...typography.h3,
    color: colors.text.primary,
    marginBottom: 4,
  },
  paymentDesc: {
    ...typography.caption,
    color: colors.text.secondary,
  },
  radioButton: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.border.medium,
    marginLeft: spacing.md,
  },
  radioButtonActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primary,
  },

  // Payment Info Box
  paymentInfoBox: {
    backgroundColor: colors.primary + '15',
    borderRadius: 8,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderLeftWidth: 4,
    borderLeftColor: colors.primary,
  },
  paymentInfoText: {
    ...typography.caption,
    color: colors.text.primary,
  },

  // Terms Section
  termsSection: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.lg,
    padding: spacing.md,
    backgroundColor: colors.background.surface,
    borderRadius: 8,
  },
  termsText: {
    ...typography.caption,
    color: colors.text.secondary,
    lineHeight: 20,
  },

  // Bottom Section
  bottomSpacer: {
    height: spacing.xl,
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.background.main,
    borderTopWidth: 1,
    borderTopColor: colors.border.light,
    padding: spacing.md,
    paddingBottom: spacing.lg,
  },
  totalBarSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  totalBarLabel: {
    ...typography.h3,
    color: colors.text.secondary,
  },
  totalBarValue: {
    ...typography.h1,
    color: colors.secondary,
  },
  checkoutButton: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: spacing.base,
    alignItems: 'center',
  },
  checkoutButtonDisabled: {
    backgroundColor: colors.text.tertiary,
    opacity: 0.6,
  },
  checkoutButtonText: {
    ...typography.button,
    color: colors.text.inverse,
  },
})


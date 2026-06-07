import React, { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Linking,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { ordersService } from '@yaatal/core'
import { colors, spacing, typography } from '../../theme'

export const PaymentPendingScreen = ({ route, navigation }: any) => {
  const { orderId, transactionId, boboOrderId, redirectUrl } = route.params || {}
  const [paymentStatus, setPaymentStatus] = useState('pending')
  const [isChecking, setIsChecking] = useState(false)

  const handleContinueShopping = () => {
    const parent = navigation.getParent?.()
    if (parent) {
      parent.navigate('Discovery')
      return
    }

    navigation.navigate('DiscoveryFeed')
  }

  const checkPaymentStatus = async () => {
    if (!boboOrderId) return

    setIsChecking(true)
    try {
      const payment = await (ordersService as any).getCheckoutPaymentStatus(boboOrderId)
      if (payment?.status) {
        setPaymentStatus(payment.status)
      }

      if (payment?.status === 'succeeded' || payment?.status === 'paid') {
        navigation.replace('OrderSuccess', { orderId })
      }
    } catch (error) {
      console.error('Payment status check failed:', error)
    } finally {
      setIsChecking(false)
    }
  }

  useEffect(() => {
    checkPaymentStatus()
  }, [boboOrderId])

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.title}>Paiement en attente</Text>
        <Text style={styles.subtitle}>
          Votre commande est créée. Le paiement Wave sera confirmé depuis Engine.
        </Text>

        <View style={styles.referenceBox}>
          <Text style={styles.referenceLabel}>Commande</Text>
          <Text style={styles.referenceValue}>{orderId}</Text>
          {transactionId && (
            <>
              <Text style={styles.referenceLabel}>Référence paiement</Text>
              <Text style={styles.referenceValue}>{transactionId}</Text>
            </>
          )}
          <Text style={styles.referenceLabel}>Statut</Text>
          <Text style={styles.referenceValue}>{paymentStatus}</Text>
        </View>

        {redirectUrl && (
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={() => Linking.openURL(redirectUrl)}
          >
            <Text style={styles.primaryButtonText}>Ouvrir Wave</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={checkPaymentStatus}
          disabled={isChecking}
        >
          <Text style={styles.secondaryButtonText}>
            {isChecking ? 'Vérification...' : 'Vérifier le statut'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.linkButton}
          onPress={handleContinueShopping}
        >
          <Text style={styles.linkButtonText}>Continuer les achats</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background.main,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    padding: spacing.xl,
  },
  title: {
    ...typography.h1,
    color: colors.text.primary,
    textAlign: 'center',
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  subtitle: {
    ...typography.body,
    color: colors.text.secondary,
    textAlign: 'center',
    marginBottom: spacing.xl,
  },
  referenceBox: {
    backgroundColor: colors.background.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border.light,
    padding: spacing.md,
    marginBottom: spacing.xl,
  },
  referenceLabel: {
    ...typography.micro,
    color: colors.text.tertiary,
    marginBottom: spacing.xs,
    textTransform: 'uppercase',
  },
  referenceValue: {
    ...typography.body,
    color: colors.text.primary,
    marginBottom: spacing.md,
  },
  primaryButton: {
    backgroundColor: colors.primary,
    borderRadius: 8,
    paddingVertical: spacing.base,
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  primaryButtonText: {
    ...typography.button,
    color: colors.text.inverse,
  },
  secondaryButton: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.primary,
    paddingVertical: spacing.base,
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  secondaryButtonText: {
    ...typography.button,
    color: colors.primary,
  },
  linkButton: {
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  linkButtonText: {
    ...typography.captionBold,
    color: colors.text.secondary,
  },
})

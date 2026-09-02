import React from 'react'
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { colors, spacing, typography } from '../../theme'

export const OrderSuccessScreen = ({ route, navigation }: any) => {
  const { orderId } = route.params || {}
  const handleContinueShopping = () => {
    const parent = navigation.getParent?.()
    if (parent) {
      parent.navigate('Discovery')
      return
    }

    navigation.navigate('DiscoveryFeed')
  }

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <View style={styles.iconCircle}>
          <Text style={styles.icon}>✓</Text>
        </View>
        <Text style={styles.title}>Commande confirmée</Text>
        <Text style={styles.subtitle}>
          Votre commande est enregistrée dans Engine et le vendeur peut la traiter.
        </Text>

        {orderId && (
          <View style={styles.referenceBox}>
            <Text style={styles.referenceLabel}>Commande</Text>
            <Text style={styles.referenceValue}>{orderId}</Text>
          </View>
        )}

        <TouchableOpacity
          style={styles.primaryButton}
          onPress={handleContinueShopping}
        >
          <Text style={styles.primaryButtonText}>Continuer les achats</Text>
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
  iconCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: colors.success,
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'center',
    marginBottom: spacing.xl,
  },
  icon: {
    fontSize: 48,
    color: colors.text.inverse,
    fontWeight: '700',
  },
  title: {
    ...typography.h1,
    color: colors.text.primary,
    textAlign: 'center',
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
  },
  primaryButton: {
    backgroundColor: colors.primary,
    borderRadius: 8,
    paddingVertical: spacing.base,
    alignItems: 'center',
  },
  primaryButtonText: {
    ...typography.button,
    color: colors.text.inverse,
  },
})

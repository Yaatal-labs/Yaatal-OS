/**
 * Merchant Dashboard Screen
 * Analytics, Quick Actions, and Overview
 */

import React, { useEffect, useState } from 'react'
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Dimensions,
} from 'react-native'
import { useAuthStore } from '../../store/authStore'
import { ordersService } from '@njooba/core'
import { colors, typography, spacing, theme } from '../../theme'
import { formatCFA } from '../../utils/formatters'
import Svg, { Path, Rect, G } from 'react-native-svg'

const { width } = Dimensions.get('window')

export const DashboardScreen = ({ navigation }: any) => {
  const { profile } = useAuthStore()
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [stats, setStats] = useState({
    totalOrders: 0,
    totalRevenue: 0,
    pendingOrders: 0,
    shippedOrders: 0,
  })

  const loadStats = async () => {
    if (!profile) return
    setLoading(true)
    const data = await ordersService.getSellerStats(profile.id)
    setStats(data)
    setLoading(false)
  }

  const onRefresh = async () => {
    setRefreshing(true)
    await loadStats()
    setRefreshing(false)
  }

  useEffect(() => {
    loadStats()
  }, [profile])

  const renderChart = () => {
    // Simple bar chart visualization for mock data
    // In a real app, this would use historical data
    const data = [40, 65, 30, 80, 55, 90, stats.totalOrders > 0 ? 100 : 20]
    const max = Math.max(...data)
    const barWidth = (width - 64) / data.length - 8
    const height = 150

    return (
      <View style={styles.chartContainer}>
        <Text style={styles.chartTitle}>Ventes (7 derniers jours)</Text>
        <Svg width={width - 48} height={height}>
          {data.map((value, index) => (
            <Rect
              key={index}
              x={index * (barWidth + 8)}
              y={height - (value / max) * height}
              width={barWidth}
              height={(value / max) * height}
              fill={index === data.length - 1 ? colors.primary : colors.primary + '40'}
              rx={4}
            />
          ))}
        </Svg>
      </View>
    )
  }

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={colors.primary}
        />
      }
    >
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.welcomeText}>Bonjour, {profile?.username || 'Vendeur'} 👋</Text>
        <Text style={styles.dateText}>
          {new Date().toLocaleDateString('fr-FR', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
          })}
        </Text>
      </View>

      {/* Stats Grid */}
      <View style={styles.statsGrid}>
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>Chiffre d'affaires</Text>
          <Text style={styles.statValue}>{formatCFA(stats.totalRevenue)}</Text>
          <Text style={styles.statTrend}>↗️ +12% vs sem. dernière</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>Commandes</Text>
          <Text style={styles.statValue}>{stats.totalOrders}</Text>
          <Text style={[styles.statTrend, { color: colors.secondary }]}>
            📦 {stats.pendingOrders} en attente
          </Text>
        </View>
      </View>

      {/* Chart */}
      {renderChart()}

      {/* Quick Actions */}
      <Text style={styles.sectionTitle}>Actions Rapides</Text>
      <View style={styles.actionsGrid}>
        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => navigation.navigate('Products', { screen: 'AddProduct' })}
        >
          <Text style={styles.actionIcon}>➕</Text>
          <Text style={styles.actionLabel}>Ajouter Produit</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => navigation.navigate('Orders')}
        >
          <Text style={styles.actionIcon}>📦</Text>
          <Text style={styles.actionLabel}>Gérer Commandes</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => navigation.navigate('Products')}
        >
          <Text style={styles.actionIcon}>🏷️</Text>
          <Text style={styles.actionLabel}>Mes Produits</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => navigation.navigate('Profile')}
        >
          <Text style={styles.actionIcon}>⚙️</Text>
          <Text style={styles.actionLabel}>Paramètres</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.spacer} />
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background.main,
    padding: spacing.lg,
  },
  header: {
    marginBottom: spacing.xl,
  },
  welcomeText: {
    ...typography.h2,
    color: colors.text.primary,
  },
  dateText: {
    ...typography.body,
    color: colors.text.secondary,
    textTransform: 'capitalize',
  },
  statsGrid: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.xl,
  },
  statCard: {
    flex: 1,
    backgroundColor: colors.background.surface,
    padding: spacing.md,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border.light,
    ...theme.shadows.small,
  },
  statLabel: {
    ...typography.caption,
    color: colors.text.secondary,
    marginBottom: spacing.xs,
  },
  statValue: {
    ...typography.h3,
    color: colors.primary,
    marginBottom: spacing.xs,
  },
  statTrend: {
    ...typography.micro,
    color: colors.success,
  },
  chartContainer: {
    backgroundColor: colors.background.surface,
    padding: spacing.lg,
    borderRadius: 16,
    marginBottom: spacing.xl,
    borderWidth: 1,
    borderColor: colors.border.light,
  },
  chartTitle: {
    ...typography.h3,
    color: colors.text.primary,
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    ...typography.h3,
    color: colors.text.primary,
    marginBottom: spacing.md,
  },
  actionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  actionButton: {
    width: (width - 48 - spacing.md) / 2,
    backgroundColor: colors.background.surface,
    padding: spacing.md,
    borderRadius: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border.light,
  },
  actionIcon: {
    fontSize: 24,
    marginBottom: spacing.sm,
  },
  actionLabel: {
    ...typography.captionBold,
    color: colors.text.primary,
  },
  spacer: {
    height: 100,
  },
})

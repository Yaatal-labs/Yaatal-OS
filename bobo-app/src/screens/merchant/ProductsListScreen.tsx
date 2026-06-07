/**
 * Products List Screen (Merchant)
 * View and manage merchant's products with QR codes
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
} from 'react-native'
import QRCode from 'react-native-qrcode-svg'
import { useAuthStore } from '../../store/authStore'
import { productsService, getProductImageUrl } from '@yaatal/core'
import { colors, typography, spacing } from '../../theme'
import { formatCFA } from '../../utils/formatters'
import type { Product } from '../../types/models'

export const ProductsListScreen = ({ navigation }: any) => {
  const { profile } = useAuthStore()
  const [products, setProducts] = useState<Product[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  const loadProducts = async () => {
    if (!profile) return

    setIsLoading(true)
    const result = await productsService.getBySeller(profile.id)
    setProducts(result.items)
    setIsLoading(false)
  }

  const onRefresh = async () => {
    setRefreshing(true)
    await loadProducts()
    setRefreshing(false)
  }

  useEffect(() => {
    loadProducts()
  }, [profile])

  const handleDelete = (product: Product) => {
    Alert.alert(
      'Supprimer le produit',
      `Êtes-vous sûr de vouloir supprimer "${product.title}" ?`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: async () => {
            const result = await productsService.delete(product.id)
            if (result.success) {
              loadProducts()
            } else {
              Alert.alert('Erreur', result.error)
            }
          },
        },
      ]
    )
  }

  const renderProduct = ({ item }: { item: Product }) => {
    const imageUrl = getProductImageUrl(item.image_url) || 'https://via.placeholder.com/400'
    const deepLink = `bobo://product/${item.id}`

    return (
      <View style={styles.productCard}>
        <View style={styles.productHeader}>
          <Image source={{ uri: imageUrl }} style={styles.productImage} />

          <View style={styles.productInfo}>
            <Text style={styles.productTitle} numberOfLines={2}>
              {item.title}
            </Text>
            <Text style={styles.productPrice}>{formatCFA(item.price)}</Text>
            <Text style={styles.productStock}>
              Stock: {item.stock_quantity} {item.stock_quantity > 1 ? 'unités' : 'unité'}
            </Text>
            <Text style={styles.productSKU}>SKU: {item.sku}</Text>
          </View>
        </View>

        {/* QR Code Section */}
        <View style={styles.qrSection}>
          <View style={styles.qrContainer}>
            <QRCode value={deepLink} size={120} />
          </View>
          <View style={styles.qrInfo}>
            <Text style={styles.qrLabel}>QR Code du produit</Text>
            <Text style={styles.qrInstructions}>
              Montrez ce code lors de vos livestreams sur TikTok/Instagram
            </Text>
            <Text style={styles.qrLink} numberOfLines={1}>
              {deepLink}
            </Text>
          </View>
        </View>

        {/* Actions */}
        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.actionButton, styles.editButton]}
            onPress={() =>
              navigation.navigate('EditProduct', { productId: item.id })
            }
          >
            <Text style={styles.editButtonText}>✏️ Modifier</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionButton, styles.deleteButton]}
            onPress={() => handleDelete(item)}
          >
            <Text style={styles.deleteButtonText}>🗑️ Supprimer</Text>
          </TouchableOpacity>
        </View>
      </View>
    )
  }

  const renderEmpty = () => (
    <View style={styles.empty}>
      <Text style={styles.emptyIcon}>📦</Text>
      <Text style={styles.emptyText}>Aucun produit</Text>
      <Text style={styles.emptySubtext}>
        Appuyez sur + pour ajouter votre premier produit
      </Text>
    </View>
  )

  return (
    <View style={styles.container}>
      <FlatList
        data={products}
        renderItem={renderProduct}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={!isLoading ? renderEmpty : null}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        }
      />

      {/* Floating Add Button */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => navigation.navigate('AddProduct')}
      >
        <Text style={styles.fabIcon}>+</Text>
      </TouchableOpacity>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background.main,
  },
  listContent: {
    padding: spacing.base,
    paddingBottom: 100,
  },
  productCard: {
    backgroundColor: colors.background.surface,
    borderRadius: 12,
    padding: spacing.base,
    marginBottom: spacing.base,
    borderWidth: 1,
    borderColor: colors.border.light,
  },
  productHeader: {
    flexDirection: 'row',
    marginBottom: spacing.base,
  },
  productImage: {
    width: 80,
    height: 80,
    borderRadius: 8,
    backgroundColor: colors.background.subtle,
  },
  productInfo: {
    flex: 1,
    marginLeft: spacing.md,
    justifyContent: 'center',
  },
  productTitle: {
    ...typography.h3,
    color: colors.text.primary,
    marginBottom: spacing.xs,
  },
  productPrice: {
    ...typography.price,
    color: colors.secondary,
    marginBottom: spacing.xs,
  },
  productStock: {
    ...typography.caption,
    color: colors.text.secondary,
  },
  productSKU: {
    ...typography.micro,
    color: colors.text.tertiary,
    marginTop: spacing.xs,
  },
  qrSection: {
    flexDirection: 'row',
    backgroundColor: colors.background.subtle,
    borderRadius: 8,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  qrContainer: {
    padding: spacing.sm,
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
  },
  qrInfo: {
    flex: 1,
    marginLeft: spacing.md,
    justifyContent: 'center',
  },
  qrLabel: {
    ...typography.captionBold,
    color: colors.text.primary,
    marginBottom: spacing.xs,
  },
  qrInstructions: {
    ...typography.micro,
    color: colors.text.secondary,
    marginBottom: spacing.xs,
  },
  qrLink: {
    ...typography.micro,
    color: colors.primary,
    fontFamily: 'monospace',
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  actionButton: {
    flex: 1,
    borderRadius: 8,
    padding: spacing.sm,
    alignItems: 'center',
  },
  editButton: {
    backgroundColor: colors.primary + '20',
    borderWidth: 1,
    borderColor: colors.primary,
  },
  editButtonText: {
    ...typography.captionBold,
    color: colors.primary,
  },
  deleteButton: {
    backgroundColor: colors.error + '20',
    borderWidth: 1,
    borderColor: colors.error,
  },
  deleteButtonText: {
    ...typography.captionBold,
    color: colors.error,
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
  },
  fab: {
    position: 'absolute',
    bottom: spacing.xl,
    right: spacing.xl,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    ...StyleSheet.create({
      shadow: {
        shadowColor: colors.primary,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 8,
      },
    }).shadow,
  },
  fabIcon: {
    fontSize: 32,
    color: colors.text.inverse,
    fontWeight: '300',
  },
})


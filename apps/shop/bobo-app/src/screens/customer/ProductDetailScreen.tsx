/**
 * Product Detail Screen (Customer)
 * Full product view with VOD video player, seller info, and purchase options
 */

import React, { useState, useEffect, useRef } from 'react'
import {
  View,
  Text,
  ScrollView,
  Image,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Dimensions,
} from 'react-native'
import { Video, ResizeMode, AVPlaybackStatus } from 'expo-av'
import { useAuthStore } from '../../store/authStore'
import {
  catalogService,
  productsService,
  getProductImageUrl,
  getAvatarUrl,
  getFileUrl,
  type CatalogProductView,
} from '@yaatal/core'
import { colors, typography, spacing } from '../../theme'
import { formatCFA } from '../../utils/formatters'
import { calculateLevel } from '../../constants/gamification'

const { width: SCREEN_WIDTH } = Dimensions.get('window')

export const ProductDetailScreen = ({ route, navigation }: any) => {
  const { productId } = route.params
  const { profile } = useAuthStore()
  const videoRef = useRef<any>(null)

  const [product, setProduct] = useState<CatalogProductView | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isUpvoted, setIsUpvoted] = useState(false)
  const [upvoteCount, setUpvoteCount] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)

  useEffect(() => {
    loadProduct()
  }, [productId])

  const loadProduct = async () => {
    setIsLoading(true)

    try {
      const fetchedProduct = await catalogService.getCatalogProduct(productId)

      if (!fetchedProduct) {
        Alert.alert('Erreur', 'Produit introuvable')
        navigation.goBack()
        return
      }

      setProduct(fetchedProduct)
      setUpvoteCount(fetchedProduct.upvotes || 0)

      // Check if user has upvoted (simplified - would use a upvotes junction table in production)
      setIsUpvoted(false)
    } catch (error) {
      Alert.alert('Erreur', 'Impossible de charger le produit')
      navigation.goBack()
    }

    setIsLoading(false)
  }

  const handleUpvote = async () => {
    if (!profile || !product) return

    const result = await productsService.toggleUpvote(product.id, profile.id)

    if (result) {
      setIsUpvoted(!isUpvoted)
      setUpvoteCount(isUpvoted ? upvoteCount - 1 : upvoteCount + 1)
    }
  }

  const handleBuyNow = () => {
    if (!product) return

    // Navigate to checkout with product and default quantity of 1
    navigation.navigate('Checkout', {
      product,
      quantity: 1,
    })
  }

  const handleContactSeller = () => {
    if (!product?.expand?.seller_id) return

    // Navigate to chat (to be implemented in Days 4-7)
    Alert.alert(
      'Contacter le vendeur',
      `Envoyer un message à ${product.expand.seller_id.username}?`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Envoyer',
          onPress: () => {
            // TODO: Navigate to chat
            Alert.alert('Coming soon', 'Le chat sera ajouté aux Jours 4-7!')
          },
        },
      ]
    )
  }

  const handleVideoPlayback = (status: any) => {
    if (status.isLoaded) {
      setIsPlaying(status.isPlaying)
    }
  }

  if (isLoading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    )
  }

  if (!product) {
    return (
      <View style={styles.loading}>
        <Text style={styles.errorText}>Produit introuvable</Text>
      </View>
    )
  }

  const hasDiscount = product.discount_price && product.discount_price < product.price
  const displayPrice = hasDiscount ? product.discount_price! : product.price
  // Prefer the Engine's preformatted catalog display strings, fall back to numeric.
  const priceText = product.discount_price_display || product.price_display || formatCFA(displayPrice)
  const originalPriceText = product.price_display || formatCFA(product.price)
  const isOutOfStock = product.stock_status
    ? product.stock_status === 'out_of_stock'
    : product.stock_quantity === 0
  const imageUrl =
    (product.demo_visual
      ? product.images[0] || product.image_url
      : getProductImageUrl(product.images[0] || product.image_url)) ||
    'https://via.placeholder.com/400'
  const videoUrl = product.video_url ? getFileUrl('videos', product.video_url) : null
  const seller = product.expand?.seller_id
  const sellerLevel = seller ? calculateLevel(seller.xp) : null

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {/* Video or Image */}
        {videoUrl ? (
          <View style={styles.videoContainer}>
            <Video
              ref={videoRef}
              source={{ uri: videoUrl }}
              style={styles.video}
              useNativeControls
              resizeMode={ResizeMode.CONTAIN}
              isLooping
              onPlaybackStatusUpdate={handleVideoPlayback}
            />
            {!isPlaying && (
              <TouchableOpacity
                style={styles.playOverlay}
                onPress={() => videoRef.current?.playAsync()}
              >
                <View style={styles.playButton}>
                  <Text style={styles.playIcon}>▶️</Text>
                </View>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <View style={styles.imageContainer}>
            <Image
              source={{ uri: imageUrl }}
              style={styles.image}
              accessibilityLabel={product.image_alt || product.title}
            />
            {product.demo_visual && (
              <View style={styles.demoBadge}>
                <Text style={styles.demoBadgeText}>Demo visual</Text>
              </View>
            )}
          </View>
        )}

        {/* Product Info */}
        <View style={styles.infoContainer}>
          {/* Title & Featured Badge */}
          <View style={styles.titleRow}>
            <Text style={styles.title}>{product.title}</Text>
            {product.is_featured && (
              <View style={styles.featuredBadge}>
                <Text style={styles.featuredIcon}>⭐</Text>
              </View>
            )}
          </View>

          {/* Price */}
          <View style={styles.priceContainer}>
            <Text style={styles.price}>{priceText}</Text>
            {hasDiscount && (
              <View style={styles.discountRow}>
                <Text style={styles.originalPrice}>{originalPriceText}</Text>
                <View style={styles.discountBadge}>
                  <Text style={styles.discountText}>
                    -{Math.round(((product.price - product.discount_price!) / product.price) * 100)}%
                  </Text>
                </View>
              </View>
            )}
          </View>

          {/* Stock Status */}
          {isOutOfStock ? (
            <View style={styles.outOfStockBanner}>
              <Text style={styles.outOfStockText}>❌ Rupture de stock</Text>
            </View>
          ) : (
            <View style={styles.inStockBanner}>
              <Text style={styles.inStockText}>
                ✅ En stock ({product.stock_quantity} disponible{product.stock_quantity > 1 ? 's' : ''})
              </Text>
            </View>
          )}

          {/* Seller Info */}
          {seller && (
            <TouchableOpacity
              style={styles.sellerCard}
              onPress={() => {
                // TODO: Navigate to seller profile
                Alert.alert('Coming soon', 'Profil du vendeur bientôt disponible!')
              }}
            >
              <Image
                source={{
                  uri: getAvatarUrl(seller.avatar_url, 48) || 'https://via.placeholder.com/48',
                }}
                style={styles.sellerAvatar}
              />
              <View style={styles.sellerInfo}>
                <Text style={styles.sellerName}>{seller.username}</Text>
                {sellerLevel && (
                  <View style={styles.sellerLevel}>
                    <Text style={styles.sellerLevelEmoji}>{sellerLevel.emoji}</Text>
                    <Text style={styles.sellerLevelText}>{sellerLevel.title}</Text>
                  </View>
                )}
              </View>
              <TouchableOpacity style={styles.contactButton} onPress={handleContactSeller}>
                <Text style={styles.contactButtonText}>💬 Contacter</Text>
              </TouchableOpacity>
            </TouchableOpacity>
          )}

          {/* Description */}
          {product.description && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>📝 Description</Text>
              <Text style={styles.description}>{product.description}</Text>
            </View>
          )}

          {/* Product Details */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>📋 Détails</Text>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Catégorie:</Text>
              <Text style={styles.detailValue}>
                {product.category === 'fashion' && '👔 Mode'}
                {product.category === 'electronics' && '📱 Électronique'}
                {product.category === 'beauty' && '💄 Beauté'}
                {product.category === 'food' && '🍽️ Alimentation'}
                {product.category === 'home' && '🏠 Maison'}
                {product.category === 'other' && '📦 Autre'}
              </Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>SKU:</Text>
              <Text style={styles.detailValue}>{product.sku}</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Ajouté le:</Text>
              <Text style={styles.detailValue}>
                {new Date(product.created).toLocaleDateString('fr-FR')}
              </Text>
            </View>
          </View>

          {/* Social Stats */}
          <View style={styles.section}>
            <TouchableOpacity style={styles.upvoteButton} onPress={handleUpvote}>
              <Text style={styles.upvoteIcon}>{isUpvoted ? '❤️' : '🤍'}</Text>
              <Text style={[styles.upvoteText, isUpvoted && styles.upvoteTextActive]}>
                {upvoteCount} j'aime
              </Text>
            </TouchableOpacity>
          </View>

          {/* Spacer for bottom buttons */}
          <View style={styles.bottomSpacer} />
        </View>
      </ScrollView>

      {/* Bottom Action Buttons */}
      <View style={styles.bottomActions}>
        <TouchableOpacity
          style={[styles.buyButton, isOutOfStock && styles.buyButtonDisabled]}
          onPress={handleBuyNow}
          disabled={isOutOfStock}
        >
          <Text style={styles.buyButtonText}>
            {isOutOfStock ? 'Rupture de stock' : `🛒 Acheter - ${formatCFA(displayPrice)}`}
          </Text>
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
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background.main,
  },
  errorText: {
    ...typography.h2,
    color: colors.text.secondary,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 100,
  },
  videoContainer: {
    width: SCREEN_WIDTH,
    height: SCREEN_WIDTH * 0.75,
    backgroundColor: colors.background.dark,
    position: 'relative',
  },
  video: {
    width: '100%',
    height: '100%',
  },
  playOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  playButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  playIcon: {
    fontSize: 32,
  },
  image: {
    width: '100%',
    aspectRatio: 4 / 5,
    resizeMode: 'cover',
    backgroundColor: colors.background.subtle,
  },
  imageContainer: {
    position: 'relative',
    width: '100%',
    backgroundColor: colors.background.subtle,
  },
  demoBadge: {
    position: 'absolute',
    left: spacing.md,
    bottom: spacing.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
    backgroundColor: 'rgba(20, 31, 27, 0.82)',
    borderRadius: 6,
  },
  demoBadgeText: {
    ...typography.micro,
    color: colors.text.inverse,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  infoContainer: {
    padding: spacing.lg,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  title: {
    ...typography.h1,
    color: colors.text.primary,
    flex: 1,
    marginRight: spacing.md,
  },
  featuredBadge: {
    backgroundColor: colors.secondary,
    borderRadius: 20,
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  featuredIcon: {
    fontSize: 20,
  },
  priceContainer: {
    marginBottom: spacing.md,
  },
  price: {
    ...typography.priceLarge,
    fontSize: 32,
    marginBottom: spacing.xs,
  },
  discountRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  originalPrice: {
    ...typography.h3,
    color: colors.text.tertiary,
    textDecorationLine: 'line-through',
    marginRight: spacing.sm,
  },
  discountBadge: {
    backgroundColor: colors.secondary,
    borderRadius: 6,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  discountText: {
    ...typography.micro,
    color: colors.text.inverse,
    fontWeight: '700',
  },
  outOfStockBanner: {
    backgroundColor: colors.error + '20',
    borderRadius: 8,
    padding: spacing.md,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.error,
  },
  outOfStockText: {
    ...typography.bodyBold,
    color: colors.error,
    textAlign: 'center',
  },
  inStockBanner: {
    backgroundColor: colors.success + '20',
    borderRadius: 8,
    padding: spacing.md,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.success,
  },
  inStockText: {
    ...typography.bodyBold,
    color: colors.success,
    textAlign: 'center',
  },
  sellerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background.surface,
    borderRadius: 12,
    padding: spacing.md,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border.light,
  },
  sellerAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    marginRight: spacing.md,
    backgroundColor: colors.background.subtle,
  },
  sellerInfo: {
    flex: 1,
  },
  sellerName: {
    ...typography.h3,
    color: colors.text.primary,
    marginBottom: 4,
  },
  sellerLevel: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sellerLevelEmoji: {
    fontSize: 14,
    marginRight: spacing.xs,
  },
  sellerLevelText: {
    ...typography.caption,
    color: colors.text.secondary,
  },
  contactButton: {
    backgroundColor: colors.primary,
    borderRadius: 8,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  contactButtonText: {
    ...typography.captionBold,
    color: colors.text.inverse,
  },
  section: {
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    ...typography.h2,
    color: colors.text.primary,
    marginBottom: spacing.md,
  },
  description: {
    ...typography.body,
    color: colors.text.secondary,
    lineHeight: 24,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.light,
  },
  detailLabel: {
    ...typography.body,
    color: colors.text.secondary,
  },
  detailValue: {
    ...typography.bodyBold,
    color: colors.text.primary,
  },
  upvoteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background.surface,
    borderRadius: 12,
    padding: spacing.md,
    borderWidth: 2,
    borderColor: colors.border.light,
  },
  upvoteIcon: {
    fontSize: 24,
    marginRight: spacing.sm,
  },
  upvoteText: {
    ...typography.h3,
    color: colors.text.secondary,
  },
  upvoteTextActive: {
    color: colors.error,
  },
  bottomSpacer: {
    height: spacing.xl,
  },
  bottomActions: {
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
  buyButton: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    padding: spacing.base,
    alignItems: 'center',
  },
  buyButtonDisabled: {
    backgroundColor: colors.text.tertiary,
  },
  buyButtonText: {
    ...typography.button,
    color: colors.text.inverse,
  },
})

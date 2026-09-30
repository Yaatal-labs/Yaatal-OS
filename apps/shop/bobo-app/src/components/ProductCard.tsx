/**
 * Product Card Component
 * Refined for "Afro-Flux" Design System
 * Features Lagos Gold accents and elegant typography
 */

import React from 'react'
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
} from 'react-native'
import Ionicons from 'react-native-vector-icons/Ionicons'
import { theme, colors } from '../theme'
import { formatCFA, truncateText, getProductImageUrl, getAvatarUrl, type Product } from '@yaatal/core'

interface ProductCardProps {
  product: Product
  onPress: () => void
}

export const ProductCard = ({ product, onPress }: ProductCardProps) => {
  const imageUrl = (
    product.demo_visual
      ? product.image_url
      : getProductImageUrl(product.image_url)
  ) || 'https://via.placeholder.com/300'
  const hasVideo = !!product.video_url
  const hasDiscount = product.discount_price && product.discount_price < product.price
  const displayPrice = hasDiscount ? product.discount_price! : product.price
  const displayPriceText = (
    hasDiscount
      ? product.discount_price_display
      : product.price_display
  ) || formatCFA(displayPrice)

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={onPress}
      activeOpacity={0.9}
    >
      {/* Image Container */}
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

        {/* Video Badge - Glassy */}
        {hasVideo && (
          <View style={styles.videoBadge}>
            <Ionicons name="play-circle" size={16} color={colors.text.inverse} />
          </View>
        )}

        {/* Discount Badge - Gold Label */}
        {hasDiscount && (
          <View style={styles.discountBadge}>
            <Text style={styles.discountText}>
              -{Math.round(((product.price - product.discount_price!) / product.price) * 100)}%
            </Text>
          </View>
        )}

        {/* Favorite Button (Floating) */}
        <TouchableOpacity style={styles.favButton}>
          <Ionicons name="heart-outline" size={20} color={colors.primary} />
        </TouchableOpacity>
      </View>

      {/* Content */}
      <View style={styles.content}>
        {/* Title */}
        <Text style={theme.typography.h3} numberOfLines={1}>
          {product.title}
        </Text>

        {/* Price Row */}
        <View style={styles.priceRow}>
          <Text style={theme.typography.priceLarge}>{displayPriceText}</Text>
          {hasDiscount && (
            <Text style={styles.originalPrice}>
              {product.price_display || formatCFA(product.price)}
            </Text>
          )}
        </View>

        {/* Seller Info */}
        <View style={styles.footer}>
          <View style={styles.seller}>
            {product.expand?.seller_id && (
              <>
                <Image
                  source={{
                    uri: getAvatarUrl(product.expand.seller_id.avatar_url, 20) || 'https://via.placeholder.com/24',
                  }}
                  style={styles.avatar}
                />
                <Text style={theme.typography.caption} numberOfLines={1}>
                  {product.expand.seller_id.username}
                </Text>
              </>
            )}
          </View>

          {/* Upvotes */}
          <View style={styles.stats}>
            <Ionicons name="flame" size={14} color={colors.secondary} />
            <Text style={[theme.typography.caption, { marginLeft: 4, color: colors.secondary }]}>
              {product.upvotes}
            </Text>
          </View>
        </View>

        {/* Status */}
        {product.stock_quantity === 0 && (
          <View style={styles.outOfStock}>
            <Text style={styles.outOfStockText}>SOLD OUT</Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.background.surface,
    borderRadius: 20, // More rounded, modern
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border.light,
    ...theme.shadows.medium,
  },
  imageContainer: {
    position: 'relative',
    width: '100%',
    height: 220,
    backgroundColor: colors.background.subtle,
  },
  image: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  videoBadge: {
    position: 'absolute',
    top: 12,
    left: 12,
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderRadius: 12,
    padding: 6,
  },
  demoBadge: {
    position: 'absolute',
    left: 12,
    bottom: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: 'rgba(20, 31, 27, 0.82)',
    borderRadius: 6,
  },
  demoBadgeText: {
    ...theme.typography.micro,
    color: colors.text.inverse,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  discountBadge: {
    position: 'absolute',
    top: 12,
    right: 12,
    backgroundColor: colors.secondary, // Lagos Gold
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  discountText: {
    ...theme.typography.micro,
    color: colors.text.inverse,
    fontWeight: '800',
  },
  favButton: {
    position: 'absolute',
    bottom: -15, // Hanging off the image
    right: 12,
    backgroundColor: colors.background.surface,
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    ...theme.shadows.small,
    borderWidth: 1,
    borderColor: colors.border.light,
  },
  content: {
    padding: 16,
    paddingTop: 20, // Extra space for floating fav button
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginTop: 4,
    marginBottom: 12,
  },
  originalPrice: {
    ...theme.typography.caption,
    textDecorationLine: 'line-through',
    marginLeft: 8,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: colors.border.light,
    paddingTop: 12,
  },
  seller: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  avatar: {
    width: 20,
    height: 20,
    borderRadius: 10,
    marginRight: 8,
    backgroundColor: colors.background.subtle,
  },
  stats: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background.main,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  outOfStock: {
    marginTop: 12,
    paddingVertical: 4,
    paddingHorizontal: 8,
    backgroundColor: colors.error + '10',
    borderRadius: 4,
    alignSelf: 'flex-start',
  },
  outOfStockText: {
    ...theme.typography.micro,
    color: colors.error,
    fontWeight: '800',
  },
})

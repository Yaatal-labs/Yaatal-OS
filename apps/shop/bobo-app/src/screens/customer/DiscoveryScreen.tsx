/**
 * Discovery Screen (Omni-Feed)
 * "Afro-Flux" Redesign: Lagos Gold & Midnight Indigo
 */

import React, { useState, useEffect, useCallback } from 'react'
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  ScrollView,
  Alert,
  ActivityIndicator,
  StatusBar,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Ionicons from 'react-native-vector-icons/Ionicons'
import { ProductCard } from '../../components/ProductCard'
import { catalogService } from '@yaatal/core'
import { colors, theme } from '../../theme'
import type { Product } from '@yaatal/core'

// Public, unauthenticated marketplace browse over the Engine catalog. The catalog
// endpoint takes page/per_page/category/merchant_id only.
// ponytail: /api/catalog has no free-text param yet, so a search query filters the
//           returned page client-side. Upgrade path = add `q` to ListCatalogParams
//           and the Engine /api/catalog handler, then pass it straight through.
const browseCatalog = async (
  page: number,
  category?: string,
  query?: string
) => {
  const result = await catalogService.listCatalog({
    page,
    per_page: 20,
    ...(category ? { category } : {}),
  })

  const q = query?.trim().toLowerCase()
  if (!q) return result

  return {
    ...result,
    items: result.items.filter(
      (p) =>
        p.title.toLowerCase().includes(q) ||
        (p.description || '').toLowerCase().includes(q)
    ),
  }
}

const CATEGORIES = [
  { value: 'all', label: 'Tout', icon: 'apps-outline' },
  { value: 'fashion', label: 'Mode', icon: 'shirt-outline' },
  // Engine's canonical catalog category is `tech`; the adapter maps it to
  // BOBO's internal `electronics` product enum after the response arrives.
  { value: 'tech', label: 'Tech', icon: 'phone-portrait-outline' },
  { value: 'beauty', label: 'Beauté', icon: 'sparkles-outline' },
  { value: 'food', label: 'Food', icon: 'restaurant-outline' },
  { value: 'home', label: 'Maison', icon: 'home-outline' },
]

export const DiscoveryScreen = ({ navigation }: any) => {
  const insets = useSafeAreaInsets()
  
  // State
  const [products, setProducts] = useState<Product[]>([])
  const [featuredProducts, setFeaturedProducts] = useState<Product[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('all')
  const [page, setPage] = useState(1)
  const [isAISearching, setIsAISearching] = useState(false)
  
  // Voice Recording State
  const [isRecording, setIsRecording] = useState(false)

  // Data Loading
  const loadProducts = async (reset: boolean = false) => {
    if (isLoading) return

    setIsLoading(true)
    const currentPage = reset ? 1 : page

    try {
      const category = selectedCategory === 'all' ? undefined : selectedCategory
      const result = await browseCatalog(currentPage, category, searchQuery)
      setProducts(reset ? result.items : [...products, ...result.items])

      if (reset) {
        const featuredResult = await browseCatalog(1)
        const featured = featuredResult.items.filter(
          (p) => p.is_featured || p.upvotes > 5
        )
        setFeaturedProducts(featured)
      }

      setIsLoading(false)
      if (reset) setPage(2)
      else setPage(currentPage + 1)
    } catch (error) {
      console.error('Failed to load products', error)
      setIsLoading(false)
    }
  }

  // Initial Load
  useEffect(() => {
    loadProducts(true)
  }, [])

  // Handlers
  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    await loadProducts(true)
    setRefreshing(false)
  }, [])

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      setPage(1)
      await loadProducts(true)
      return
    }

    setIsAISearching(true)
    setPage(1)

    try {
      const result = await browseCatalog(
        1,
        selectedCategory === 'all' ? undefined : selectedCategory,
        searchQuery
      )
      setProducts(result.items)
      setPage(2)
    } catch (error) {
      console.error('Catalog search failed:', error)
      await loadProducts(true)
    } finally {
      setIsAISearching(false)
    }
  }

  const handleVoiceSearch = async () => {
    if (isRecording) {
      try {
        setIsRecording(false)
        setSearchQuery('Robe rouge')
        handleSearch()
      } catch (error) {
        Alert.alert('Erreur', 'Impossible de traiter la voix')
      }
    } else {
      setIsRecording(true)
    }
  }

  const handleProductPress = (product: Product) => {
    navigation.navigate('ProductDetail', { productId: product.id })
  }

  const handleCategoryPress = async (category: string) => {
    setSelectedCategory(category)
    setPage(1)
    setIsLoading(true)

    try {
      const result = await browseCatalog(
        1,
        category === 'all' ? undefined : category,
        searchQuery
      )
      setProducts(result.items)
      setPage(2)
    } catch (error) {
      console.error('Category browse failed:', error)
    } finally {
      setIsLoading(false)
    }
  }

  // --- RENDER COMPONENTS ---

  const renderOmniSearchBar = () => (
    <View style={[styles.omniSearchContainer, { marginTop: insets.top + 8 }]}>
      <View style={styles.searchSurface}>
        <Ionicons name="search" size={20} color={colors.text.tertiary} />
        <TextInput
          style={styles.searchInput}
          placeholder="Ask Bobo anything..."
          placeholderTextColor={colors.text.tertiary}
          value={searchQuery}
          onChangeText={setSearchQuery}
          onSubmitEditing={handleSearch}
          returnKeyType="search"
        />
        {/* Voice Button */}
        <TouchableOpacity onPress={handleVoiceSearch} style={styles.iconButton}>
          <Ionicons 
            name={isRecording ? "mic" : "mic-outline"} 
            size={22} 
            color={isRecording ? colors.error : colors.primary} 
          />
        </TouchableOpacity>
        {/* Camera Button */}
        <TouchableOpacity onPress={() => navigation.navigate('Scanner')} style={styles.iconButton}>
          <Ionicons name="camera-outline" size={22} color={colors.primary} />
        </TouchableOpacity>
      </View>
    </View>
  )

  const renderCategories = () => (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.categoriesContainer}
      contentContainerStyle={styles.categoriesContent}
    >
      {CATEGORIES.map((cat) => (
        <TouchableOpacity
          key={cat.value}
          style={[
            styles.categoryChip,
            selectedCategory === cat.value && styles.categoryChipActive,
          ]}
          onPress={() => handleCategoryPress(cat.value)}
        >
          <Ionicons 
            name={cat.icon as any} 
            size={18} 
            color={selectedCategory === cat.value ? colors.text.inverse : colors.text.primary} 
            style={{ marginRight: 6 }}
          />
          <Text
            style={[
              styles.categoryLabel,
              selectedCategory === cat.value && styles.categoryLabelActive,
            ]}
          >
            {cat.label}
          </Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  )

  const renderFeatured = () => {
    if (featuredProducts.length === 0 || selectedCategory !== 'all') return null
    
    return (
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={theme.typography.h2}>Trending in Dakar 🔥</Text>
          <TouchableOpacity>
            <Text style={[theme.typography.button, { color: colors.secondary, fontSize: 14 }]}>See All</Text>
          </TouchableOpacity>
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.horizontalList}
        >
          {featuredProducts.slice(0, 5).map((product) => (
            <View key={product.id} style={styles.horizontalCard}>
              <ProductCard
                product={product}
                onPress={() => handleProductPress(product)}
              />
            </View>
          ))}
        </ScrollView>
      </View>
    )
  }

  const renderFeedHeader = () => (
    <View style={styles.feedHeader}>
      {renderFeatured()}
      {renderCategories()}
      <Text style={[theme.typography.h2, { paddingHorizontal: 16, marginBottom: 12 }]}>
        {selectedCategory === 'all' ? 'Just For You' : CATEGORIES.find(c => c.value === selectedCategory)?.label}
      </Text>
    </View>
  )

  const filteredProducts = products

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />
      
      {/* Omni-Bar (Pinned) */}
      {renderOmniSearchBar()}

      {/* Main Feed */}
      <FlatList
        data={filteredProducts}
        renderItem={({ item }) => (
          <View style={styles.feedItem}>
            <ProductCard product={item} onPress={() => handleProductPress(item)} />
          </View>
        )}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={renderFeedHeader}
        ListFooterComponent={isLoading ? <ActivityIndicator color={colors.primary} style={{ margin: 20 }} /> : null}
        contentContainerStyle={{ paddingTop: 80, paddingBottom: 100 }} // Space for header & tab bar
        onEndReached={() => loadProducts(false)}
        onEndReachedThreshold={0.5}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]} // Android
          />
        }
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background.main,
  },
  // Omni-Search Bar (Floating)
  omniSearchContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 100,
    paddingHorizontal: 16,
    paddingBottom: 8,
    backgroundColor: 'rgba(253, 251, 247, 0.95)', // Blur effect background
  },
  searchSurface: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background.surface,
    height: 50,
    borderRadius: 25,
    paddingHorizontal: 16,
    // Glassy Shadow
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 8,
    borderWidth: 1,
    borderColor: colors.border.light,
  },
  searchInput: {
    flex: 1,
    ...theme.typography.body,
    marginLeft: 8,
    color: colors.text.primary,
  },
  iconButton: {
    padding: 8,
  },
  
  // Feed Layout
  feedHeader: {
    paddingTop: 16,
  },
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  horizontalList: {
    paddingHorizontal: 16,
  },
  horizontalCard: {
    width: 260,
    marginRight: 16,
  },
  
  // Categories
  categoriesContainer: {
    marginBottom: 24,
  },
  categoriesContent: {
    paddingHorizontal: 16,
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background.surface,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    marginRight: 8,
    borderWidth: 1,
    borderColor: colors.border.light,
  },
  categoryChipActive: {
    backgroundColor: colors.primary, // Indigo
    borderColor: colors.primary,
  },
  categoryLabel: {
    ...theme.typography.captionBold,
    color: colors.text.primary,
  },
  categoryLabelActive: {
    color: colors.text.inverse,
  },
  
  // Feed Items
  feedItem: {
    paddingHorizontal: 16,
    marginBottom: 16,
  },
})

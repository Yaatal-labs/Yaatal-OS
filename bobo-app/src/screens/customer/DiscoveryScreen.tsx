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
  ImageBackground,
  Platform,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Ionicons from 'react-native-vector-icons/Ionicons'
import { ProductCard } from '../../components/ProductCard'
import { productsService } from '@njooba/core'
import { useAuthStore } from '../../store/authStore'
import { colors, theme, combineTextStyles } from '../../theme'
import type { Product } from '@njooba/core'

const CATEGORIES = [
  { value: 'all', label: 'Tout', icon: 'apps-outline' },
  { value: 'fashion', label: 'Mode', icon: 'shirt-outline' },
  { value: 'electronics', label: 'Tech', icon: 'phone-portrait-outline' },
  { value: 'beauty', label: 'Beauté', icon: 'sparkles-outline' },
  { value: 'food', label: 'Food', icon: 'restaurant-outline' },
  { value: 'home', label: 'Maison', icon: 'home-outline' },
]

export const DiscoveryScreen = ({ navigation }: any) => {
  const insets = useSafeAreaInsets()
  const { profile } = useAuthStore()
  
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
      if (searchQuery) {
        const result = await productsService.search(searchQuery, currentPage, 20)
        setProducts(reset ? result.items : [...products, ...result.items])
      } else {
        const result = await productsService.getAll(currentPage, 20)
        setProducts(reset ? result.items : [...products, ...result.items])
      }

      if (reset) {
        const result = await productsService.getAll(1, 10)
        const featured = result.items.filter((p) => p.is_featured || p.upvotes > 5)
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
      // Hybrid AI Search (PowerSync version)
      const result = await productsService.search(searchQuery, 1, 20)
      setProducts(result.items)
    } catch (error) {
      console.error('AI search failed:', error)
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
          onPress={() => setSelectedCategory(cat.value)}
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

  const filteredProducts = selectedCategory === 'all'
    ? products
    : products.filter((p) => p.category === selectedCategory)

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
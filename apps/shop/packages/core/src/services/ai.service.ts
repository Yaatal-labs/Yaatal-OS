/**
 * AI Service - Smart Search Engine
 * Voice search, NLP, visual search, and recommendations
 * All optimized for PocketBase and zero external costs
 */

import * as Speech from 'expo-speech'
import { Audio } from 'expo-av'
import * as ImagePicker from 'expo-image-picker'
import { pb } from '../lib/pocketbase'
import type { Product } from '../types/models'

// ============================================================================
// NATURAL LANGUAGE PROCESSING (NLP)
// ============================================================================

interface SearchIntent {
  query: string
  category?: string
  minPrice?: number
  maxPrice?: number
  keywords: string[]
  isQuestion: boolean
  language: 'fr' | 'wo' | 'en' // French, Wolof, English
}

/**
 * Parse natural language queries into structured search intent
 * Examples:
 * - "robe rouge moins de 10000" → {keywords: ['robe', 'rouge'], maxPrice: 10000}
 * - "waxoon na téléphone bu rafet" → {keywords: ['téléphone', 'rafet'], category: 'electronics'}
 * - "quoi pour un mariage?" → {keywords: ['mariage', 'cérémonie'], category: 'fashion'}
 */
export class NLPEngine {
  // Price pattern matching
  private static readonly PRICE_PATTERNS = {
    fr: {
      lessThan: /(moins de|max|maximum|jusqu'à)\s*(\d+)/i,
      moreThan: /(plus de|min|minimum|à partir de)\s*(\d+)/i,
      between: /entre\s*(\d+)\s*et\s*(\d+)/i,
    },
    wo: {
      lessThan: /(dafa gën a\s+|maximum)\s*(\d+)/i,
      moreThan: /(dafa doy\s+|minimum)\s*(\d+)/i,
    },
  }

  // Category keywords (French + Wolof)
  private static readonly CATEGORY_KEYWORDS = {
    fashion: ['robe', 'vêtement', 'habit', 'tissu', 'tenue', 'mode', 'yéré', 'wax'],
    electronics: ['téléphone', 'phone', 'ordinateur', 'tablette', 'électronique', 'telefon'],
    beauty: ['beauté', 'maquillage', 'parfum', 'cosmétique', 'rafet', 'beauty'],
    food: ['nourriture', 'repas', 'manger', 'cuisine', 'lekk', 'food', 'thiéboudienne'],
    home: ['maison', 'décoration', 'meuble', 'kër', 'home'],
  }

  // Intent keywords
  private static readonly INTENT_KEYWORDS = {
    occasion: ['mariage', 'fête', 'cérémonie', 'baptême', 'tabaski', 'ramadan'],
    quality: ['qualité', 'bon', 'meilleur', 'rafet', 'baax', 'neex'],
    cheap: ['pas cher', 'bon marché', 'abordable', 'yomb', 'moins cher'],
    new: ['nouveau', 'récent', 'fresh', 'bees'],
  }

  // Wolof → French translations for common search terms
  private static readonly WOLOF_TRANSLATIONS: Record<string, string> = {
    rafet: 'beau',
    baax: 'bon',
    yomb: 'cher',
    lekk: 'manger',
    'kër': 'maison',
    yéré: 'vêtement',
    nekk: 'avoir',
    'waxoon na': 'je cherche',
    telefon: 'téléphone',
    bees: 'nouveau',
  }

  static parseQuery(rawQuery: string): SearchIntent {
    if (!rawQuery || typeof rawQuery !== 'string') {
      return {
        query: '',
        keywords: [],
        isQuestion: false,
        language: 'fr',
      }
    }

    const query = rawQuery.toLowerCase().trim()
    const intent: SearchIntent = {
      query: rawQuery,
      keywords: [],
      isQuestion: query.includes('?') || query.startsWith('quoi') || query.startsWith('où'),
      language: this.detectLanguage(query),
    }

    // Translate Wolof terms to French for better search
    let normalizedQuery = query
    Object.entries(this.WOLOF_TRANSLATIONS).forEach(([wolof, french]) => {
      // Use custom word boundary that includes accented characters
      // Capture the preceding character to preserve it
      const regex = new RegExp(`(^|[^a-zA-Z0-9À-ÿ])${wolof}(?=[^a-zA-Z0-9À-ÿ]|$)`, 'gi')
      normalizedQuery = normalizedQuery.replace(regex, `$1${french}`)
    })

    // Extract price constraints
    const priceInfo = this.extractPriceConstraints(query)
    if (priceInfo.minPrice) intent.minPrice = priceInfo.minPrice
    if (priceInfo.maxPrice) intent.maxPrice = priceInfo.maxPrice

    // Detect category
    intent.category = this.detectCategory(normalizedQuery)

    // Extract keywords (remove common words)
    const stopWords = [
      'je',
      'tu',
      'il',
      'elle',
      'nous',
      'vous',
      'ils',
      'le',
      'la',
      'les',
      'un',
      'une',
      'des',
      'pour',
      'dans',
      'sur',
      'avec',
      'sans',
      'de',
      'du',
      'à',
      'et',
      'ou',
      'mais',
      'cherche',
      'veux',
      'besoin',
      'want',
      'need',
    ]

    intent.keywords = normalizedQuery
      .split(/\s+/)
      .filter((word) => word.length > 2 && !stopWords.includes(word) && !/^\d+$/.test(word))
      .slice(0, 5) // Limit to 5 keywords

    return intent
  }

  private static detectLanguage(query: string): 'fr' | 'wo' | 'en' {
    const wolofWords = ['waxoon', 'rafet', 'baax', 'lekk', 'kër', 'yéré', 'na', 'nga']
    // Use word boundary check
    const hasWolof = wolofWords.some((word) =>
      new RegExp(`(^|[^a-zA-Z0-9À-ÿ])${word}(?=[^a-zA-Z0-9À-ÿ]|$)`, 'i').test(query)
    )
    if (hasWolof) return 'wo'

    const englishWords = ['phone', 'beautiful', 'cheap', 'want', 'need', 'good']
    const hasEnglish = englishWords.some((word) =>
      new RegExp(`(^|[^a-zA-Z0-9À-ÿ])${word}(?=[^a-zA-Z0-9À-ÿ]|$)`, 'i').test(query)
    )
    if (hasEnglish) return 'en'

    return 'fr' // Default to French
  }

  private static extractPriceConstraints(query: string): {
    minPrice?: number
    maxPrice?: number
  } {
    const result: { minPrice?: number; maxPrice?: number } = {}

    // Check "between X and Y"
    const betweenMatch =
      query.match(this.PRICE_PATTERNS.fr.between) || query.match(/(\d+)\s*-\s*(\d+)/)
    if (betweenMatch) {
      result.minPrice = parseInt(betweenMatch[1])
      result.maxPrice = parseInt(betweenMatch[2])
      return result
    }

    // Check "less than X"
    const lessThanMatch = query.match(this.PRICE_PATTERNS.fr.lessThan)
    if (lessThanMatch) {
      result.maxPrice = parseInt(lessThanMatch[2])
    }

    // Check "more than X"
    const moreThanMatch = query.match(this.PRICE_PATTERNS.fr.moreThan)
    if (moreThanMatch) {
      result.minPrice = parseInt(moreThanMatch[2])
    }

    // Extract standalone numbers as potential price hints
    const numbers = query.match(/\b(\d{4,})\b/g)
    if (numbers && !result.minPrice && !result.maxPrice) {
      // If a large number is mentioned, assume it's a max price
      result.maxPrice = parseInt(numbers[0])
    }

    return result
  }

  private static detectCategory(query: string): string | undefined {
    for (const [category, keywords] of Object.entries(this.CATEGORY_KEYWORDS)) {
      if (keywords.some((keyword) =>
        new RegExp(`(^|[^a-zA-Z0-9À-ÿ])${keyword}(?=[^a-zA-Z0-9À-ÿ]|$)`, 'i').test(query)
      )) {
        return category
      }
    }
    return undefined
  }
}

// ============================================================================
// VOICE SEARCH
// ============================================================================

export class VoiceSearch {
  private static recording: any | null = null

  /**
   * Start voice recording for search
   */
  static async startListening(): Promise<string> {
    try {
      // Request microphone permissions
      const { status } = await Audio.requestPermissionsAsync()
      if (status !== 'granted') {
        throw new Error('Microphone permission denied')
      }

      // Configure audio mode
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      })

      // Start recording
      this.recording = new Audio.Recording()
      await this.recording.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY)
      await this.recording.startAsync()

      return 'Recording started'
    } catch (error) {
      throw new Error('Failed to start voice recording: ' + error)
    }
  }

  /**
   * Stop recording and transcribe (simplified - would use actual speech-to-text in production)
   */
  static async stopListening(): Promise<string> {
    try {
      if (!this.recording) {
        throw new Error('No active recording')
      }

      await this.recording.stopAndUnloadAsync()
      const uri = this.recording.getURI()
      this.recording = null

      // In production, you would:
      // 1. Send audio to a speech-to-text API (Google Cloud Speech-to-Text free tier)
      // 2. Or use on-device speech recognition
      // For now, return placeholder
      return 'Transcription would happen here' // TODO: Implement actual STT
    } catch (error) {
      throw new Error('Failed to stop recording: ' + error)
    }
  }

  /**
   * Speak search results (text-to-speech feedback)
   */
  static speak(text: string, language: 'fr' | 'wo' | 'en' = 'fr') {
    const languageMap = { fr: 'fr-FR', wo: 'fr-FR', en: 'en-US' } // Wolof uses French voice
    Speech.speak(text, {
      language: languageMap[language],
      rate: 0.9,
    })
  }
}

// ============================================================================
// VISUAL SEARCH
// ============================================================================

export class VisualSearch {
  /**
   * Pick image from gallery for visual search
   */
  static async pickImage(): Promise<string | null> {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (status !== 'granted') {
      throw new Error('Gallery permission denied')
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.5, // Lower quality for faster processing
      base64: true, // Need base64 for image analysis
    })

    if (result.canceled || !result.assets[0]) {
      return null
    }

    return result.assets[0].base64 || result.assets[0].uri
  }

  /**
   * Take photo with camera for visual search
   */
  static async takePhoto(): Promise<string | null> {
    const { status } = await ImagePicker.requestCameraPermissionsAsync()
    if (status !== 'granted') {
      throw new Error('Camera permission denied')
    }

    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      quality: 0.5,
      base64: true,
    })

    if (result.canceled || !result.assets[0]) {
      return null
    }

    return result.assets[0].base64 || result.assets[0].uri
  }

  /**
   * Find similar products based on image
   * Uses simple color and category matching (can be enhanced with ML models)
   */
  static async findSimilarProducts(imageData: string): Promise<Product[]> {
    // In production, you would:
    // 1. Use TensorFlow Lite for on-device image classification
    // 2. Extract features (color palette, object detection, style)
    // 3. Match against product images in database
    // 4. Or use Google Cloud Vision API (free tier: 1000 requests/month)

    // For MVP, we'll do basic search across all products
    // and let the user refine by category
    const products = await pb.collection('products').getFullList<Product>({
      expand: 'seller_id',
      filter: 'stock_quantity > 0',
      sort: '-created',
    })

    // TODO: Implement actual image similarity
    // For now, return recent products
    return products.slice(0, 20)
  }
}

// ============================================================================
// SMART RECOMMENDATIONS
// ============================================================================

export class RecommendationEngine {
  /**
   * Get personalized recommendations based on user behavior
   */
  static async getPersonalizedRecommendations(
    userId: string,
    limit: number = 10
  ): Promise<Product[]> {
    try {
      // Get user's search history
      const searchHistory = await pb.collection('search_history').getList(1, 50, {
        filter: `user_id = "${userId}"`,
        sort: '-created',
      })

      // Extract frequently searched categories and keywords
      const categoryFrequency: Record<string, number> = {}
      const keywordFrequency: Record<string, number> = {}

      searchHistory.items.forEach((search: any) => {
        if (search.category) {
          categoryFrequency[search.category] = (categoryFrequency[search.category] || 0) + 1
        }
        if (search.keywords) {
          search.keywords.forEach((keyword: string) => {
            keywordFrequency[keyword] = (keywordFrequency[keyword] || 0) + 1
          })
        }
      })

      // Get top category
      const topCategory = Object.entries(categoryFrequency).sort((a, b) => b[1] - a[1])[0]?.[0]

      // Build filter
      let filter = 'stock_quantity > 0'
      if (topCategory) {
        filter += ` && category = "${topCategory}"`
      }

      // Fetch recommended products
      const products = await pb.collection('products').getList<Product>(1, limit, {
        expand: 'seller_id',
        filter,
        sort: '-upvotes,-created', // Popular + recent
      })

      return products.items
    } catch (error) {
      console.error('Failed to get recommendations:', error)
      // Fallback: return trending products
      return this.getTrendingProducts(limit)
    }
  }

  /**
   * Get trending products (most upvoted recently)
   */
  static async getTrendingProducts(limit: number = 10): Promise<Product[]> {
    const products = await pb.collection('products').getList<Product>(1, limit, {
      expand: 'seller_id',
      filter: 'stock_quantity > 0',
      sort: '-upvotes,-created',
    })
    return products.items
  }

  /**
   * Get "customers also viewed" recommendations
   */
  static async getRelatedProducts(productId: string, limit: number = 6): Promise<Product[]> {
    // Get the current product to match category
    const product = await pb.collection('products').getOne<Product>(productId)

    // Get products in same category
    const products = await pb.collection('products').getList<Product>(1, limit, {
      expand: 'seller_id',
      filter: `id != "${productId}" && category = "${product.category}" && stock_quantity > 0`,
      sort: '-upvotes',
    })

    return products.items
  }
}

// ============================================================================
// VERCEL AI SDK INTEGRATION (Hybrid Approach)
// ============================================================================

const VERCEL_API_BASE = process.env.EXPO_PUBLIC_VERCEL_API_URL || 'https://bobo-ai-api.vercel.app'

export class VercelAIService {
  /**
   * Check if query is complex enough to warrant AI
   * Simple queries use local NLP, complex ones use Vercel AI
   */
  static isComplexQuery(query: string): boolean {
    const complexityIndicators = [
      query.length > 30, // Long queries
      query.includes('?'), // Questions
      query.split(' ').length > 5, // Many words
      /comme|similar|ressemble|style/.test(query), // Similarity search
      /quoi|quel|comment/.test(query), // Question words
      /pour\s+(un|une|le|la)/.test(query), // Intent-based "for a..."
    ]

    return complexityIndicators.filter(Boolean).length >= 2
  }

  /**
   * Call Vercel AI smart search endpoint
   */
  static async smartSearchWithAI(query: string, userId?: string): Promise<SearchIntent> {
    try {
      const response = await fetch(`${VERCEL_API_BASE}/api/smart-search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, userId }),
      })

      if (!response.ok) {
        throw new Error('AI search failed')
      }

      return await response.json()
    } catch (error) {
      console.error('Vercel AI search failed, falling back to local NLP:', error)
      // Fallback to local NLP
      return NLPEngine.parseQuery(query)
    }
  }

  /**
   * Visual search using AI vision models
   */
  static async visualSearchWithAI(
    imageBase64: string,
    userId?: string
  ): Promise<{
    category: string
    keywords: string[]
    colors: string[]
    description: string
    suggestedSearchQuery: string
  }> {
    try {
      const response = await fetch(`${VERCEL_API_BASE}/api/visual-search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64, userId }),
      })

      if (!response.ok) {
        throw new Error('Visual search failed')
      }

      return await response.json()
    } catch (error) {
      console.error('Visual search failed:', error)
      throw error
    }
  }
}

// ============================================================================
// UNIFIED AI SEARCH SERVICE (HYBRID)
// ============================================================================

export class AISearchService {
  /**
   * Save search query to history for recommendations
   */
  static async saveSearchHistory(userId: string, intent: SearchIntent) {
    try {
      await pb.collection('search_history').create({
        user_id: userId,
        query: intent.query,
        category: intent.category,
        keywords: intent.keywords,
        language: intent.language,
      })
    } catch (error) {
      console.error('Failed to save search history:', error)
    }
  }

  /**
   * HYBRID SEARCH: Automatically chooses local NLP or Vercel AI
   * Simple searches: Local NLP (instant, free, offline)
   * Complex searches: Vercel AI (better understanding, slower)
   */
  static async hybridSearch(rawQuery: string, userId?: string): Promise<SearchIntent> {
    // Decide which approach to use
    const isComplex = VercelAIService.isComplexQuery(rawQuery)

    let intent: SearchIntent

    if (isComplex) {
      // Use Vercel AI for complex queries
      console.log('🤖 Using Vercel AI for complex query:', rawQuery)
      intent = await VercelAIService.smartSearchWithAI(rawQuery, userId)
    } else {
      // Use local NLP for simple queries
      console.log('⚡ Using local NLP for simple query:', rawQuery)
      intent = NLPEngine.parseQuery(rawQuery)
    }

    // Save to history
    if (userId) {
      await this.saveSearchHistory(userId, intent)
    }

    return intent
  }

  /**
   * Perform smart search with hybrid AI
   */
  static async smartSearch(rawQuery: string, userId?: string): Promise<Product[]> {
    // Get search intent (hybrid: local or AI)
    const intent = await this.hybridSearch(rawQuery, userId)

    // Build PocketBase filter
    const filters: string[] = ['stock_quantity > 0']

    // Category filter
    if (intent.category) {
      filters.push(`category = "${intent.category}"`)
    }

    // Price filters
    if (intent.minPrice !== undefined) {
      filters.push(`(price >= ${intent.minPrice} || discount_price >= ${intent.minPrice})`)
    }
    if (intent.maxPrice !== undefined) {
      filters.push(`(price <= ${intent.maxPrice} || discount_price <= ${intent.maxPrice})`)
    }

    // Keyword search (PocketBase full-text search)
    if (intent.keywords.length > 0) {
      const keywordFilters = intent.keywords.map(
        (keyword) => `(title ~ "${keyword}" || description ~ "${keyword}")`
      )
      filters.push(`(${keywordFilters.join(' || ')})`)
    }

    const filterString = filters.join(' && ')

    // Execute search
    const products = await pb.collection('products').getList<Product>(1, 50, {
      expand: 'seller_id',
      filter: filterString,
      sort: '-upvotes,-created',
    })

    return products.items
  }

  /**
   * Visual search: Find products by image
   */
  static async visualSearch(imageBase64: string, userId?: string): Promise<Product[]> {
    // Use Vercel AI vision
    const result = await VercelAIService.visualSearchWithAI(imageBase64, userId)

    // Use the suggested search query
    return this.smartSearch(result.suggestedSearchQuery, userId)
  }
}
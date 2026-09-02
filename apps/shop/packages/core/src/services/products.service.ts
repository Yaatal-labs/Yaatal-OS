/**
 * Products Service
 * CRUD operations for products
 */

import { pb } from '../lib/pocketbase'
import {
  validateProductTitle,
  validatePrice,
  validateStockQuantity,
  validateSKU,
  generateSKU,
} from '../utils/validation'
import type { Product, ProductFormData } from '../types/models'

export class ProductsService {
  /**
   * Get all products (paginated)
   */
  async getAll(page: number = 1, limit: number = 20): Promise<{
    items: Product[]
    totalItems: number
    totalPages: number
  }> {
    try {
      const result = await pb.collection('products').getList(page, limit, {
        filter: 'is_active = true',
        sort: '-created',
        expand: 'seller_id',
      })

      // Add seller address information to each product for delivery purposes
      const productsWithAddress = result.items.map(item => {
        if (item.expand && item.expand.seller_id) {
          const sellerProfile = item.expand.seller_id
          ;(item as any).seller_address = sellerProfile.address || sellerProfile.location || 'Seller location'
          ;(item as any).seller_city = sellerProfile.city || 'Dakar' // Default to Dakar
        }
        return item as unknown as Product
      })

      return {
        items: productsWithAddress,
        totalItems: result.totalItems,
        totalPages: result.totalPages,
      }
    } catch (error) {
      console.error('Get products error:', error)
      return { items: [], totalItems: 0, totalPages: 0 }
    }
  }

  /**
   * Get products by seller
   */
  async getBySeller(sellerId: string, page: number = 1, limit: number = 20) {
    try {
      const result = await pb.collection('products').getList(page, limit, {
        filter: `seller_id = "${sellerId}"`,
        sort: '-created',
      })

      return {
        items: result.items as unknown as Product[],
        totalItems: result.totalItems,
        totalPages: result.totalPages,
      }
    } catch (error) {
      console.error('Get seller products error:', error)
      return { items: [], totalItems: 0, totalPages: 0 }
    }
  }

  /**
   * Get single product by ID
   */
  async getById(productId: string): Promise<Product | null> {
    try {
      const product = await pb.collection('products').getOne(productId, {
        expand: 'seller_id',
      })

      // Try to get seller address from profile if available
      if (product && product.expand && product.expand.seller_id) {
        const sellerProfile = product.expand.seller_id
        // Add seller address information to product for delivery purposes
        const sellerAddress = sellerProfile.address || sellerProfile.location || 'Seller location'
        const sellerCity = sellerProfile.city || 'Dakar' // Default to Dakar

        ;(product as any).seller_address = sellerAddress
        ;(product as any).seller_city = sellerCity
      }

      return product as unknown as Product
    } catch (error) {
      console.error('Get product error:', error)
      return null
    }
  }

  /**
   * Search products
   */
  async search(query: string, page: number = 1, limit: number = 20) {
    try {
      const result = await pb.collection('products').getList(page, limit, {
        filter: `is_active = true && (title ~ "${query}" || description ~ "${query}")`,
        sort: '-created',
        expand: 'seller_id',
      })

      // Add seller address information to each product for delivery purposes
      const productsWithAddress = result.items.map(item => {
        if (item.expand && item.expand.seller_id) {
          const sellerProfile = item.expand.seller_id
          ;(item as any).seller_address = sellerProfile.address || sellerProfile.location || 'Seller location'
          ;(item as any).seller_city = sellerProfile.city || 'Dakar' // Default to Dakar
        }
        return item as unknown as Product
      })

      return {
        items: productsWithAddress,
        totalItems: result.totalItems,
        totalPages: result.totalPages,
      }
    } catch (error) {
      console.error('Search products error:', error)
      return { items: [], totalItems: 0, totalPages: 0 }
    }
  }

  /**
   * Create new product
   */
  async create(
    sellerId: string,
    data: ProductFormData
  ): Promise<{
    success: boolean
    product?: Product
    error?: string
  }> {
    try {
      // Validate inputs
      const titleValidation = validateProductTitle(data.title)
      if (!titleValidation.valid) {
        return { success: false, error: titleValidation.error }
      }

      const priceValidation = validatePrice(data.price)
      if (!priceValidation.valid) {
        return { success: false, error: priceValidation.error }
      }

      const stockValidation = validateStockQuantity(data.stock_quantity)
      if (!stockValidation.valid) {
        return { success: false, error: stockValidation.error }
      }

      if (!data.image_uri) {
        return { success: false, error: 'L\'image du produit est requise' }
      }

      // Generate unique SKU
      const sku = generateSKU('BOBO')

      // Create FormData for file upload
      const formData = new FormData()
      formData.append('seller_id', sellerId)
      formData.append('sku', sku)
      formData.append('title', data.title.trim())
      formData.append('description', data.description?.trim() || '')
      formData.append('price', data.price.toString())
      formData.append('category', data.category)
      formData.append('stock_quantity', data.stock_quantity.toString())
      formData.append('is_active', 'true')

      if (data.discount_price && data.discount_price < data.price) {
        formData.append('discount_price', data.discount_price.toString())
      }

      if (data.tags && data.tags.length > 0) {
        formData.append('tags', JSON.stringify(data.tags))
      }

      // Add image
      formData.append('image_url', {
        uri: data.image_uri,
        type: 'image/jpeg',
        name: `product_${Date.now()}.jpg`,
      } as any)

      // Add video if provided
      if (data.video_uri) {
        formData.append('video_url', {
          uri: data.video_uri,
          type: 'video/mp4',
          name: `video_${Date.now()}.mp4`,
        } as any)
      }

      const product = await pb.collection('products').create(formData)

      return {
        success: true,
        product: product as unknown as Product,
      }
    } catch (error: any) {
      console.error('Create product error:', error)
      return {
        success: false,
        error: 'Erreur lors de la création du produit',
      }
    }
  }

  /**
   * Update product
   */
  async update(
    productId: string,
    updates: Partial<ProductFormData>
  ): Promise<{
    success: boolean
    product?: Product
    error?: string
  }> {
    try {
      // Validate if fields are being updated
      if (updates.title) {
        const titleValidation = validateProductTitle(updates.title)
        if (!titleValidation.valid) {
          return { success: false, error: titleValidation.error }
        }
      }

      if (updates.price !== undefined) {
        const priceValidation = validatePrice(updates.price)
        if (!priceValidation.valid) {
          return { success: false, error: priceValidation.error }
        }
      }

      if (updates.stock_quantity !== undefined) {
        const stockValidation = validateStockQuantity(updates.stock_quantity)
        if (!stockValidation.valid) {
          return { success: false, error: stockValidation.error }
        }
      }

      const formData = new FormData()

      // Add text fields
      if (updates.title) formData.append('title', updates.title.trim())
      if (updates.description !== undefined)
        formData.append('description', updates.description.trim())
      if (updates.price !== undefined)
        formData.append('price', updates.price.toString())
      if (updates.discount_price !== undefined)
        formData.append('discount_price', updates.discount_price.toString())
      if (updates.category) formData.append('category', updates.category)
      if (updates.stock_quantity !== undefined)
        formData.append('stock_quantity', updates.stock_quantity.toString())
      if (updates.tags) formData.append('tags', JSON.stringify(updates.tags))

      // Add image if provided
      if (updates.image_uri) {
        formData.append('image_url', {
          uri: updates.image_uri,
          type: 'image/jpeg',
          name: `product_${Date.now()}.jpg`,
        } as any)
      }

      // Add video if provided
      if (updates.video_uri) {
        formData.append('video_url', {
          uri: updates.video_uri,
          type: 'video/mp4',
          name: `video_${Date.now()}.mp4`,
        } as any)
      }

      const product = await pb.collection('products').update(productId, formData)

      return {
        success: true,
        product: product as unknown as Product,
      }
    } catch (error) {
      console.error('Update product error:', error)
      return {
        success: false,
        error: 'Erreur lors de la mise à jour du produit',
      }
    }
  }

  /**
   * Delete product (soft delete - set is_active to false)
   */
  async delete(productId: string): Promise<{
    success: boolean
    error?: string
  }> {
    try {
      await pb.collection('products').update(productId, {
        is_active: false,
      })

      return { success: true }
    } catch (error) {
      console.error('Delete product error:', error)
      return {
        success: false,
        error: 'Erreur lors de la suppression du produit',
      }
    }
  }

  /**
   * Increment view count
   */
  async incrementViews(productId: string): Promise<void> {
    try {
      const product = await pb.collection('products').getOne(productId)
      await pb.collection('products').update(productId, {
        view_count: (product.view_count || 0) + 1,
      })
    } catch (error) {
      console.error('Increment views error:', error)
    }
  }

  /**
   * Toggle upvote
   */
  async toggleUpvote(productId: string, userId: string): Promise<boolean> {
    try {
      // Check if already upvoted
      const existing = await pb.collection('upvotes').getFullList({
        filter: `user_id = "${userId}" && post_id = "${productId}"`,
      })

      if (existing.length > 0) {
        // Remove upvote
        await pb.collection('upvotes').delete(existing[0].id)
        const product = await pb.collection('products').getOne(productId)
        await pb.collection('products').update(productId, {
          upvotes: Math.max(0, (product.upvotes || 0) - 1),
        })
        return false
      } else {
        // Add upvote
        await pb.collection('upvotes').create({
          user_id: userId,
          post_id: productId,
        })
        const product = await pb.collection('products').getOne(productId)
        await pb.collection('products').update(productId, {
          upvotes: (product.upvotes || 0) + 1,
        })
        return true
      }
    } catch (error) {
      console.error('Toggle upvote error:', error)
      return false
    }
  }
}

// Export singleton instance
export const productsService = new ProductsService()

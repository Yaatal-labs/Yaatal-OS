/**
 * Products Service - PowerSync Version
 * Offline-first CRUD operations for products
 */

import { powerSyncService } from '../lib/powersync/service';
import {
  validateProductTitle,
  validatePrice,
  validateStockQuantity,
  validateSKU,
  generateSKU,
} from '../utils/validation'
import type { Product, ProductFormData, Profile } from '../types/models'

export class ProductsServicePowerSync {
  /**
   * Get all products (from local SQLite - instant!)
   * Includes seller address information for delivery
   */
  async getAll(page: number = 1, limit: number = 20): Promise<{
    items: Product[]
    totalItems: number
    totalPages: number
  }> {
    try {
      const offset = (page - 1) * limit;
      const query = `
        SELECT * FROM products
        WHERE is_active = 1
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?
      `;

      let items = await powerSyncService.executeQuery<Product>(query, [limit, offset]);

      // Get total count
      const countResult = await powerSyncService.executeQuery<{count: number}>(
        'SELECT COUNT(*) as count FROM products WHERE is_active = 1'
      );

      const totalItems = countResult[0]?.count || 0;
      const totalPages = Math.ceil(totalItems / limit);

      // Add seller address information to each product for delivery purposes
      items = await Promise.all(items.map(async (item) => {
        const sellerProfile = await this.getSellerProfile(item.seller_id);
        if (sellerProfile) {
          (item as any).seller_address = sellerProfile.address || sellerProfile.location || 'Seller location';
          (item as any).seller_city = sellerProfile.city || 'Dakar'; // Default to Dakar
        }
        return item;
      }));

      return {
        items,
        totalItems,
        totalPages,
      }
    } catch (error) {
      console.error('Get products error:', error)
      return { items: [], totalItems: 0, totalPages: 0 }
    }
  }

  /**
   * Get products by seller (from local SQLite)
   */
  async getBySeller(sellerId: string, page: number = 1, limit: number = 20) {
    try {
      const offset = (page - 1) * limit;
      const query = `
        SELECT * FROM products
        WHERE seller_id = ?
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?
      `;

      const items = await powerSyncService.executeQuery<Product>(query, [sellerId, limit, offset]);

      // Get total count
      const countResult = await powerSyncService.executeQuery<{count: number}>(
        'SELECT COUNT(*) as count FROM products WHERE seller_id = ?',
        [sellerId]
      );

      const totalItems = countResult[0]?.count || 0;
      const totalPages = Math.ceil(totalItems / limit);

      return {
        items,
        totalItems,
        totalPages,
      }
    } catch (error) {
      console.error('Get seller products error:', error)
      return { items: [], totalItems: 0, totalPages: 0 }
    }
  }

  /**
   * Get single product by ID (from local SQLite)
   * Includes seller address information for delivery
   */
  async getById(productId: string): Promise<Product | undefined> {
    try {
      const query = 'SELECT * FROM products WHERE id = ?';
      const result = await powerSyncService.executeQuery<Product>(query, [productId]);

      if (result[0]) {
        const product = result[0];

        // Try to get seller address from profile if available
        const sellerProfile = await this.getSellerProfile(product.seller_id);
        if (sellerProfile) {
          // Add seller address information to product for delivery purposes
          const sellerAddress = sellerProfile.address || sellerProfile.location || 'Seller location';
          const sellerCity = sellerProfile.city || 'Dakar'; // Default to Dakar

          (product as any).seller_address = sellerAddress;
          (product as any).seller_city = sellerCity;
        }

        return product;
      }

      return undefined;
    } catch (error) {
      console.error('Get product error:', error)
      return undefined
    }
  }

  /**
   * Search products (from local SQLite - fast!)
   * Includes seller address information for delivery
   */
  async search(query: string, page: number = 1, limit: number = 20) {
    try {
      const offset = (page - 1) * limit;
      const searchQuery = `
        SELECT * FROM products
        WHERE is_active = 1
        AND (title LIKE ? OR description LIKE ?)
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?
      `;

      const searchTerm = `%${query}%`;
      let items = await powerSyncService.executeQuery<Product>(
        searchQuery,
        [searchTerm, searchTerm, limit, offset]
      );

      // Get total count
      const countResult = await powerSyncService.executeQuery<{count: number}>(
        'SELECT COUNT(*) as count FROM products WHERE is_active = 1 AND (title LIKE ? OR description LIKE ?)',
        [searchTerm, searchTerm]
      );

      const totalItems = countResult[0]?.count || 0;
      const totalPages = Math.ceil(totalItems / limit);

      // Add seller address information to each product for delivery purposes
      items = await Promise.all(items.map(async (item) => {
        const sellerProfile = await this.getSellerProfile(item.seller_id);
        if (sellerProfile) {
          (item as any).seller_address = sellerProfile.address || sellerProfile.location || 'Seller location';
          (item as any).seller_city = sellerProfile.city || 'Dakar'; // Default to Dakar
        }
        return item;
      }));

      return {
        items,
        totalItems,
        totalPages,
      }
    } catch (error) {
      console.error('Search products error:', error)
      return { items: [], totalItems: 0, totalPages: 0 }
    }
  }

  /**
   * Helper method to get seller profile
   */
  private async getSellerProfile(sellerId: string): Promise<Profile | undefined> {
    try {
      const query = 'SELECT * FROM profiles WHERE user_id = ? LIMIT 1';
      const result = await powerSyncService.executeQuery<Profile>(query, [sellerId]);
      return result[0] || undefined;
    } catch (error) {
      console.error('Get seller profile error:', error);
      return undefined;
    }
  }

  /**
   * Create new product (saves to local SQLite, queues for sync)
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

      // Prepare product data
      const productId = generateUUID();
      const now = new Date().toISOString();

      const insertQuery = `
        INSERT INTO products (
          id, seller_id, sku, title, description, price, discount_price,
          category, tags, image_url, video_url, stock_quantity, upvotes,
          view_count, is_featured, is_active, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, 1, ?, ?)
      `;

      await powerSyncService.executeWrite(insertQuery, [
        productId,
        sellerId,
        sku,
        data.title.trim(),
        data.description?.trim() || '',
        data.price,
        data.discount_price,
        data.category,
        JSON.stringify(data.tags || []),
        data.image_uri,
        data.video_uri || '',
        data.stock_quantity,
        now,
        now
      ]);

      // Return the created product
      const product: Product = {
        id: productId,
        seller_id: sellerId,
        sku,
        title: data.title.trim(),
        description: data.description?.trim() || '',
        price: data.price,
        discount_price: data.discount_price,
        category: data.category,
        tags: data.tags || [],
        image_url: data.image_uri,
        video_url: data.video_uri || '',
        stock_quantity: data.stock_quantity,
        upvotes: 0,
        view_count: 0,
        is_featured: false,
        is_active: true,
        created: now,
        updated: now
      };

      return {
        success: true,
        product,
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
   * Update product (updates local SQLite, queues for sync)
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

      // Build dynamic update query
      const updateFields: string[] = [];
      const updateValues: any[] = [];

      if (updates.title) {
        updateFields.push('title = ?');
        updateValues.push(updates.title.trim());
      }
      if (updates.description !== undefined) {
        updateFields.push('description = ?');
        updateValues.push(updates.description.trim());
      }
      if (updates.price !== undefined) {
        updateFields.push('price = ?');
        updateValues.push(updates.price);
      }
      if (updates.discount_price !== undefined) {
        updateFields.push('discount_price = ?');
        updateValues.push(updates.discount_price);
      }
      if (updates.category) {
        updateFields.push('category = ?');
        updateValues.push(updates.category);
      }
      if (updates.stock_quantity !== undefined) {
        updateFields.push('stock_quantity = ?');
        updateValues.push(updates.stock_quantity);
      }
      if (updates.tags) {
        updateFields.push('tags = ?');
        updateValues.push(JSON.stringify(updates.tags));
      }
      if (updates.image_uri) {
        updateFields.push('image_url = ?');
        updateValues.push(updates.image_uri);
      }
      if (updates.video_uri) {
        updateFields.push('video_url = ?');
        updateValues.push(updates.video_uri);
      }

      updateFields.push('updated_at = ?');
      updateValues.push(new Date().toISOString());
      updateValues.push(productId); // For WHERE clause

      const query = `UPDATE products SET ${updateFields.join(', ')} WHERE id = ?`;
      await powerSyncService.executeWrite(query, updateValues);

      // Return updated product
      const updatedProduct = await this.getById(productId);

      return {
        success: true,
        product: updatedProduct,
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
   * Delete product (soft delete - set is_active to 0)
   */
  async delete(productId: string): Promise<{
    success: boolean
    error?: string
  }> {
    try {
      await powerSyncService.executeWrite(
        'UPDATE products SET is_active = 0, updated_at = ? WHERE id = ?',
        [new Date().toISOString(), productId]
      );

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
      await powerSyncService.executeWrite(
        'UPDATE products SET view_count = view_count + 1, updated_at = ? WHERE id = ?',
        [new Date().toISOString(), productId]
      );
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
      const existingQuery = 'SELECT * FROM upvotes WHERE user_id = ? AND post_id = ?';
      const existing = await powerSyncService.executeQuery<any>(existingQuery, [userId, productId]);

      if (existing.length > 0) {
        // Remove upvote
        await powerSyncService.executeWrite(
          'DELETE FROM upvotes WHERE user_id = ? AND post_id = ?',
          [userId, productId]
        );
        await powerSyncService.executeWrite(
          'UPDATE products SET upvotes = MAX(0, upvotes - 1), updated_at = ? WHERE id = ?',
          [new Date().toISOString(), productId]
        );
        return false
      } else {
        // Add upvote
        await powerSyncService.executeWrite(
          'INSERT INTO upvotes (user_id, post_id, created_at) VALUES (?, ?, ?)',
          [userId, productId, new Date().toISOString()]
        );
        await powerSyncService.executeWrite(
          'UPDATE products SET upvotes = upvotes + 1, updated_at = ? WHERE id = ?',
          [new Date().toISOString(), productId]
        );
        return true
      }
    } catch (error) {
      console.error('Toggle upvote error:', error)
      return false
    }
  }

  /**
   * Watch for product changes (real-time updates)
   */
  watchAllProducts() {
    return powerSyncService.watchQuery(
      'SELECT * FROM products WHERE is_active = 1 ORDER BY created_at DESC'
    );
  }

  /**
   * Watch for products by seller (real-time updates)
   */
  watchBySeller(sellerId: string) {
    return powerSyncService.watchQuery(
      'SELECT * FROM products WHERE seller_id = ? ORDER BY created_at DESC',
      [sellerId]
    );
  }
}

// Helper function to generate UUID
function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// Export singleton instance
export const productsServicePowerSync = new ProductsServicePowerSync()

// Also export as default for convenience
export default new ProductsServicePowerSync()

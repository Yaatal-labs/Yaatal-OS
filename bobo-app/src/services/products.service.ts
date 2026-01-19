/**
 * Products Service for BOBO App
 * Offline-first product management using PowerSync
 * Provides CRUD operations, search, filtering, and real-time updates
 */

import { powerSyncService } from '../lib/powersync/service';

// ============================================================================
// Types
// ============================================================================

/**
 * Product entity as stored in the database
 */
export interface Product {
  id: string;
  merchant_id: string;
  name: string;
  description: string;
  price: number;
  discount_price: number;
  stock: number;
  category: string;
  images: string; // JSON string array of image URLs
  is_active: number; // 0 or 1 (SQLite boolean)
  upvotes: number;
  created_at?: string;
  updated_at?: string;
}

/**
 * Input type for creating/updating products
 */
export interface ProductInput {
  merchant_id: string;
  name: string;
  description?: string;
  price: number;
  discount_price?: number;
  stock?: number;
  category?: string;
  images?: string[]; // Array of image URLs
  is_active?: boolean;
}

/**
 * Filters for querying products
 */
export interface ProductFilters {
  category?: string;
  merchantId?: string;
  isActive?: boolean;
  minPrice?: number;
  maxPrice?: number;
}

/**
 * Result type for mutation operations
 */
export interface MutationResult<T = Product> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Observable result for watching products
 */
export interface WatchResult {
  unsubscribe: () => void;
}

// ============================================================================
// Products Service Class
// ============================================================================

export class ProductsService {
  private readonly tableName = 'products';

  // --------------------------------------------------------------------------
  // Read Operations
  // --------------------------------------------------------------------------

  /**
   * Get all products with optional filters
   * @param filters - Optional filters for category, merchant, active status
   * @returns Array of products matching the filters
   */
  async getAll(filters?: ProductFilters): Promise<Product[]> {
    try {
      const conditions: string[] = [];
      const params: any[] = [];

      if (filters?.category) {
        conditions.push('category = ?');
        params.push(filters.category);
      }

      if (filters?.merchantId) {
        conditions.push('merchant_id = ?');
        params.push(filters.merchantId);
      }

      if (filters?.isActive !== undefined) {
        conditions.push('is_active = ?');
        params.push(filters.isActive ? 1 : 0);
      }

      if (filters?.minPrice !== undefined) {
        conditions.push('price >= ?');
        params.push(filters.minPrice);
      }

      if (filters?.maxPrice !== undefined) {
        conditions.push('price <= ?');
        params.push(filters.maxPrice);
      }

      const whereClause = conditions.length > 0
        ? `WHERE ${conditions.join(' AND ')}`
        : '';

      const sql = `
        SELECT * FROM ${this.tableName}
        ${whereClause}
        ORDER BY created_at DESC
      `;

      const products = await powerSyncService.executeQuery<Product>(sql, params);
      return products;
    } catch (error) {
      console.error('[ProductsService] Error fetching products:', error);
      return [];
    }
  }

  /**
   * Get a single product by ID
   * @param id - The product ID
   * @returns The product if found, null otherwise
   */
  async getById(id: string): Promise<Product | null> {
    try {
      if (!id) {
        console.warn('[ProductsService] getById called with empty ID');
        return null;
      }

      const sql = `SELECT * FROM ${this.tableName} WHERE id = ? LIMIT 1`;
      const results = await powerSyncService.executeQuery<Product>(sql, [id]);

      return results.length > 0 ? results[0] : null;
    } catch (error) {
      console.error('[ProductsService] Error fetching product by ID:', error);
      return null;
    }
  }

  /**
   * Search products by name and description
   * @param query - Search query string
   * @returns Array of products matching the search query
   */
  async search(query: string): Promise<Product[]> {
    try {
      if (!query || query.trim().length === 0) {
        return this.getAll({ isActive: true });
      }

      const searchTerm = `%${query.trim()}%`;
      const sql = `
        SELECT * FROM ${this.tableName}
        WHERE is_active = 1
          AND (name LIKE ? OR description LIKE ? OR category LIKE ?)
        ORDER BY
          CASE
            WHEN name LIKE ? THEN 1
            WHEN description LIKE ? THEN 2
            ELSE 3
          END,
          upvotes DESC,
          created_at DESC
      `;

      const params = [
        searchTerm,
        searchTerm,
        searchTerm,
        searchTerm,
        searchTerm
      ];

      const products = await powerSyncService.executeQuery<Product>(sql, params);
      return products;
    } catch (error) {
      console.error('[ProductsService] Error searching products:', error);
      return [];
    }
  }

  /**
   * Get all products for a specific merchant
   * @param merchantId - The merchant's user ID
   * @returns Array of products belonging to the merchant
   */
  async getByMerchant(merchantId: string): Promise<Product[]> {
    try {
      if (!merchantId) {
        console.warn('[ProductsService] getByMerchant called with empty merchantId');
        return [];
      }

      const sql = `
        SELECT * FROM ${this.tableName}
        WHERE merchant_id = ?
        ORDER BY created_at DESC
      `;

      const products = await powerSyncService.executeQuery<Product>(sql, [merchantId]);
      return products;
    } catch (error) {
      console.error('[ProductsService] Error fetching products by merchant:', error);
      return [];
    }
  }

  /**
   * Get all products in a specific category
   * @param category - The category name
   * @returns Array of products in the category
   */
  async getByCategory(category: string): Promise<Product[]> {
    try {
      if (!category) {
        console.warn('[ProductsService] getByCategory called with empty category');
        return [];
      }

      const sql = `
        SELECT * FROM ${this.tableName}
        WHERE category = ? AND is_active = 1
        ORDER BY upvotes DESC, created_at DESC
      `;

      const products = await powerSyncService.executeQuery<Product>(sql, [category]);
      return products;
    } catch (error) {
      console.error('[ProductsService] Error fetching products by category:', error);
      return [];
    }
  }

  // --------------------------------------------------------------------------
  // Write Operations
  // --------------------------------------------------------------------------

  /**
   * Create a new product
   * @param product - The product data to create
   * @returns Result with the created product or error
   */
  async create(product: ProductInput): Promise<MutationResult> {
    try {
      // Validate required fields
      const validation = this.validateProductInput(product);
      if (!validation.valid) {
        return { success: false, error: validation.error };
      }

      const id = this.generateId();
      const now = new Date().toISOString();
      const images = product.images ? JSON.stringify(product.images) : '[]';

      const sql = `
        INSERT INTO ${this.tableName} (
          id, merchant_id, name, description, price, discount_price,
          stock, category, images, is_active, upvotes, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

      const params = [
        id,
        product.merchant_id,
        product.name.trim(),
        product.description?.trim() || '',
        product.price,
        product.discount_price || 0,
        product.stock ?? 0,
        product.category || 'other',
        images,
        product.is_active !== false ? 1 : 0,
        0, // Initial upvotes
        now,
        now
      ];

      await powerSyncService.executeWrite(sql, params);

      const createdProduct = await this.getById(id);
      return { success: true, data: createdProduct || undefined };
    } catch (error) {
      console.error('[ProductsService] Error creating product:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create product'
      };
    }
  }

  /**
   * Update an existing product
   * @param id - The product ID to update
   * @param data - Partial product data to update
   * @returns Result with the updated product or error
   */
  async update(id: string, data: Partial<ProductInput>): Promise<MutationResult> {
    try {
      if (!id) {
        return { success: false, error: 'Product ID is required' };
      }

      // Check if product exists
      const existing = await this.getById(id);
      if (!existing) {
        return { success: false, error: 'Product not found' };
      }

      // Validate update data
      if (data.name !== undefined && data.name.trim().length < 2) {
        return { success: false, error: 'Name must be at least 2 characters' };
      }

      if (data.price !== undefined && data.price < 0) {
        return { success: false, error: 'Price cannot be negative' };
      }

      // Build update query dynamically
      const updates: string[] = [];
      const params: any[] = [];

      if (data.name !== undefined) {
        updates.push('name = ?');
        params.push(data.name.trim());
      }

      if (data.description !== undefined) {
        updates.push('description = ?');
        params.push(data.description.trim());
      }

      if (data.price !== undefined) {
        updates.push('price = ?');
        params.push(data.price);
      }

      if (data.discount_price !== undefined) {
        updates.push('discount_price = ?');
        params.push(data.discount_price);
      }

      if (data.stock !== undefined) {
        updates.push('stock = ?');
        params.push(data.stock);
      }

      if (data.category !== undefined) {
        updates.push('category = ?');
        params.push(data.category);
      }

      if (data.images !== undefined) {
        updates.push('images = ?');
        params.push(JSON.stringify(data.images));
      }

      if (data.is_active !== undefined) {
        updates.push('is_active = ?');
        params.push(data.is_active ? 1 : 0);
      }

      if (updates.length === 0) {
        return { success: true, data: existing };
      }

      // Add updated_at timestamp
      updates.push('updated_at = ?');
      params.push(new Date().toISOString());

      // Add ID to params for WHERE clause
      params.push(id);

      const sql = `
        UPDATE ${this.tableName}
        SET ${updates.join(', ')}
        WHERE id = ?
      `;

      await powerSyncService.executeWrite(sql, params);

      const updatedProduct = await this.getById(id);
      return { success: true, data: updatedProduct || undefined };
    } catch (error) {
      console.error('[ProductsService] Error updating product:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update product'
      };
    }
  }

  /**
   * Delete a product (soft delete by setting is_active to 0)
   * @param id - The product ID to delete
   * @returns Result indicating success or error
   */
  async delete(id: string): Promise<MutationResult<void>> {
    try {
      if (!id) {
        return { success: false, error: 'Product ID is required' };
      }

      // Soft delete by setting is_active to 0
      const sql = `
        UPDATE ${this.tableName}
        SET is_active = 0, updated_at = ?
        WHERE id = ?
      `;

      await powerSyncService.executeWrite(sql, [new Date().toISOString(), id]);

      return { success: true };
    } catch (error) {
      console.error('[ProductsService] Error deleting product:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to delete product'
      };
    }
  }

  /**
   * Permanently delete a product from the database
   * Use with caution - this cannot be undone
   * @param id - The product ID to permanently delete
   * @returns Result indicating success or error
   */
  async hardDelete(id: string): Promise<MutationResult<void>> {
    try {
      if (!id) {
        return { success: false, error: 'Product ID is required' };
      }

      const sql = `DELETE FROM ${this.tableName} WHERE id = ?`;
      await powerSyncService.executeWrite(sql, [id]);

      return { success: true };
    } catch (error) {
      console.error('[ProductsService] Error hard deleting product:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to delete product'
      };
    }
  }

  // --------------------------------------------------------------------------
  // Real-time Subscriptions
  // --------------------------------------------------------------------------

  /**
   * Watch for real-time product updates
   * Returns an observable that emits product arrays on changes
   * @param filters - Optional filters to apply to the watch query
   * @returns Object with unsubscribe method and async iterator
   */
  watchProducts(filters?: ProductFilters): {
    subscribe: (callback: (products: Product[]) => void) => WatchResult;
  } {
    const conditions: string[] = [];
    const params: any[] = [];

    if (filters?.category) {
      conditions.push('category = ?');
      params.push(filters.category);
    }

    if (filters?.merchantId) {
      conditions.push('merchant_id = ?');
      params.push(filters.merchantId);
    }

    if (filters?.isActive !== undefined) {
      conditions.push('is_active = ?');
      params.push(filters.isActive ? 1 : 0);
    }

    const whereClause = conditions.length > 0
      ? `WHERE ${conditions.join(' AND ')}`
      : '';

    const sql = `
      SELECT * FROM ${this.tableName}
      ${whereClause}
      ORDER BY created_at DESC
    `;

    return {
      subscribe: (callback: (products: Product[]) => void): WatchResult => {
        let isActive = true;

        const runWatch = async () => {
          try {
            const watchIterator = powerSyncService.watchQuery(sql, params);

            for await (const result of watchIterator) {
              if (!isActive) break;

              // Extract products from the watch result
              const products = (result as any)?.rows?._array ||
                               (result as any)?.rows ||
                               result ||
                               [];

              callback(Array.isArray(products) ? products : []);
            }
          } catch (error) {
            if (isActive) {
              console.error('[ProductsService] Watch error:', error);
              callback([]);
            }
          }
        };

        runWatch();

        return {
          unsubscribe: () => {
            isActive = false;
          }
        };
      }
    };
  }

  // --------------------------------------------------------------------------
  // Stock Management
  // --------------------------------------------------------------------------

  /**
   * Update product stock quantity
   * @param id - The product ID
   * @param quantity - The new stock quantity or delta if relative is true
   * @param relative - If true, add quantity to current stock
   * @returns Result indicating success or error
   */
  async updateStock(
    id: string,
    quantity: number,
    relative: boolean = false
  ): Promise<MutationResult> {
    try {
      if (!id) {
        return { success: false, error: 'Product ID is required' };
      }

      let sql: string;
      let params: any[];

      if (relative) {
        // Add/subtract from current stock, but don't go below 0
        sql = `
          UPDATE ${this.tableName}
          SET stock = MAX(0, stock + ?), updated_at = ?
          WHERE id = ?
        `;
        params = [quantity, new Date().toISOString(), id];
      } else {
        // Set absolute stock value
        sql = `
          UPDATE ${this.tableName}
          SET stock = ?, updated_at = ?
          WHERE id = ?
        `;
        params = [Math.max(0, quantity), new Date().toISOString(), id];
      }

      await powerSyncService.executeWrite(sql, params);

      const updatedProduct = await this.getById(id);
      return { success: true, data: updatedProduct || undefined };
    } catch (error) {
      console.error('[ProductsService] Error updating stock:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update stock'
      };
    }
  }

  // --------------------------------------------------------------------------
  // Upvotes Management
  // --------------------------------------------------------------------------

  /**
   * Increment the upvote count for a product
   * @param id - The product ID
   * @returns Result indicating success or error
   */
  async incrementUpvotes(id: string): Promise<MutationResult> {
    try {
      if (!id) {
        return { success: false, error: 'Product ID is required' };
      }

      const sql = `
        UPDATE ${this.tableName}
        SET upvotes = upvotes + 1, updated_at = ?
        WHERE id = ?
      `;

      await powerSyncService.executeWrite(sql, [new Date().toISOString(), id]);

      const updatedProduct = await this.getById(id);
      return { success: true, data: updatedProduct || undefined };
    } catch (error) {
      console.error('[ProductsService] Error incrementing upvotes:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to increment upvotes'
      };
    }
  }

  /**
   * Decrement the upvote count for a product (minimum 0)
   * @param id - The product ID
   * @returns Result indicating success or error
   */
  async decrementUpvotes(id: string): Promise<MutationResult> {
    try {
      if (!id) {
        return { success: false, error: 'Product ID is required' };
      }

      const sql = `
        UPDATE ${this.tableName}
        SET upvotes = MAX(0, upvotes - 1), updated_at = ?
        WHERE id = ?
      `;

      await powerSyncService.executeWrite(sql, [new Date().toISOString(), id]);

      const updatedProduct = await this.getById(id);
      return { success: true, data: updatedProduct || undefined };
    } catch (error) {
      console.error('[ProductsService] Error decrementing upvotes:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to decrement upvotes'
      };
    }
  }

  // --------------------------------------------------------------------------
  // Helper Methods
  // --------------------------------------------------------------------------

  /**
   * Validate product input data
   */
  private validateProductInput(product: ProductInput): { valid: boolean; error?: string } {
    if (!product.merchant_id || product.merchant_id.trim().length === 0) {
      return { valid: false, error: 'Merchant ID is required' };
    }

    if (!product.name || product.name.trim().length < 2) {
      return { valid: false, error: 'Name must be at least 2 characters' };
    }

    if (product.name.trim().length > 200) {
      return { valid: false, error: 'Name must not exceed 200 characters' };
    }

    if (typeof product.price !== 'number' || product.price < 0) {
      return { valid: false, error: 'Price must be a non-negative number' };
    }

    if (product.discount_price !== undefined && product.discount_price < 0) {
      return { valid: false, error: 'Discount price cannot be negative' };
    }

    if (product.discount_price !== undefined && product.discount_price >= product.price) {
      return { valid: false, error: 'Discount price must be less than regular price' };
    }

    if (product.stock !== undefined && product.stock < 0) {
      return { valid: false, error: 'Stock cannot be negative' };
    }

    return { valid: true };
  }

  /**
   * Generate a unique ID for new products
   * Uses UUID v4 format for compatibility with Supabase
   */
  private generateId(): string {
    // Generate UUID v4
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  /**
   * Parse images JSON string to array
   * @param imagesJson - JSON string of images array
   * @returns Array of image URLs
   */
  parseImages(imagesJson: string): string[] {
    try {
      if (!imagesJson) return [];
      const parsed = JSON.parse(imagesJson);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  /**
   * Get the effective price (discount price if available, otherwise regular price)
   * @param product - The product to get price for
   * @returns The effective price
   */
  getEffectivePrice(product: Product): number {
    if (product.discount_price && product.discount_price > 0 && product.discount_price < product.price) {
      return product.discount_price;
    }
    return product.price;
  }

  /**
   * Check if a product is in stock
   * @param product - The product to check
   * @returns True if product has stock available
   */
  isInStock(product: Product): boolean {
    return product.stock > 0 && product.is_active === 1;
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

/**
 * Singleton instance of ProductsService
 * Use this for all product operations throughout the app
 */
export const productsService = new ProductsService();

// Default export for convenience
export default productsService;

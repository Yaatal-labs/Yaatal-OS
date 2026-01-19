/**
 * Launches Service - PowerSync Version
 * For Product Hunt-style product launches in African market
 */

import { db } from '../lib/powersync/db'
import type { Launch, LaunchFormData } from '../types/models'
import type { LaunchRecord } from '../db/schema'

export class LaunchesServicePowerSync {
  /**
   * Get all launches (sorted by upvotes)
   */
  async getAll(page: number = 1, limit: number = 20): Promise<{
    items: Launch[]
    totalItems: number
    totalPages: number
  }> {
    try {
      const offset = (page - 1) * limit
      const query = `
        SELECT * FROM launches
        ORDER BY upvotes DESC, created_at DESC
        LIMIT ? OFFSET ?
      `

      const items = await db.getAll(query, [limit, offset])

      // Get total count
      const countResult = await db.getAll('SELECT COUNT(*) as count FROM launches')
      const totalItems = (countResult[0] as any)?.count as number || 0
      const totalPages = Math.ceil(totalItems / limit)

      return {
        items: items as unknown as Launch[],
        totalItems,
        totalPages
      }
    } catch (error) {
      console.error('Get launches error:', error)
      return { items: [], totalItems: 0, totalPages: 0 }
    }
  }

  /**
   * Get trending launches (high upvotes in last week)
   */
  async getTrending(limit: number = 10): Promise<LaunchRecord[]> {
    try {
      // In SQLite, we'll get the most upvoted recent launches
      const query = `
        SELECT * FROM launches
        WHERE created_at >= datetime('now', '-7 days')
        ORDER BY upvotes DESC
        LIMIT ?
      `

      return await db.getAll(query, [limit])
    } catch (error) {
      console.error('Get trending launches error:', error)
      return []
    }
  }

  /**
   * Get launches by author
   */
  async getByAuthor(authorId: string, page: number = 1, limit: number = 20): Promise<{
    items: LaunchRecord[]
    totalItems: number
    totalPages: number
  }> {
    try {
      const offset = (page - 1) * limit
      const query = `
        SELECT * FROM launches
        WHERE author_id = ?
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?
      `

      const items = await db.getAll(query, [authorId, limit, offset])

      // Get total count
      const countResult = await db.getAll('SELECT COUNT(*) as count FROM launches WHERE author_id = ?', [authorId])
      const totalItems = (countResult[0] as any)?.count as number || 0
      const totalPages = Math.ceil(totalItems / limit)

      return {
        items: items as unknown as LaunchRecord[],
        totalItems,
        totalPages
      }
    } catch (error) {
      console.error('Get author launches error:', error)
      return { items: [], totalItems: 0, totalPages: 0 }
    }
  }

  /**
   * Get single launch by ID
   */
  async getById(launchId: string): Promise<LaunchRecord | null> {
    try {
      const query = 'SELECT * FROM launches WHERE id = ?'
      const result = await db.getAll(query, [launchId])

      return result[0] as LaunchRecord || null
    } catch (error) {
      console.error('Get launch error:', error)
      return null
    }
  }

  /**
   * Create new launch
   */
  async create(
    authorId: string,
    data: LaunchFormData
  ): Promise<{
    success: boolean
    launch?: LaunchRecord
    error?: string
  }> {
    try {
      // Validate inputs
      if (!data.title?.trim()) {
        return { success: false, error: 'Title is required' }
      }

      if (!data.tagline?.trim()) {
        return { success: false, error: 'Tagline is required' }
      }

      // Generate ID and timestamp
      const launchId = this.generateUUID()
      const now = new Date().toISOString()

      // Prepare data
      const insertQuery = `
        INSERT INTO launches (
          id, author_id, title, tagline, description, image_url, video_url,
          category, tags, website_url, upvotes, is_trending, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `

      await db.execute(insertQuery, [
        launchId,
        authorId,
        data.title.trim(),
        data.tagline.trim(),
        data.description?.trim() || null,
        data.image_uri || null,
        data.video_uri || null,
        data.category || 'tech',
        data.tags ? JSON.stringify(data.tags) : '[]',
        data.website_url || null,
        0, // upvotes
        0, // is_trending (boolean as integer)
        now, // created_at
        now  // updated_at
      ])

      // Return created launch
      const launch = await this.getById(launchId)

      return {
        success: true,
        launch: launch || undefined
      }
    } catch (error: any) {
      console.error('Create launch error:', error)
      return {
        success: false,
        error: error.message || 'Failed to create launch'
      }
    }
  }

  /**
   * Update launch
   */
  async update(
    launchId: string,
    updates: Partial<LaunchFormData>
  ): Promise<{
    success: boolean
    launch?: LaunchRecord
    error?: string
  }> {
    try {
      // Build dynamic update query
      const updateFields: string[] = []
      const updateValues: any[] = []

      if (updates.title) {
        updateFields.push('title = ?')
        updateValues.push(updates.title.trim())
      }
      if (updates.tagline) {
        updateFields.push('tagline = ?')
        updateValues.push(updates.tagline.trim())
      }
      if (updates.description !== undefined) {
        updateFields.push('description = ?')
        updateValues.push(updates.description?.trim() || null)
      }
      if (updates.image_uri !== undefined) {
        updateFields.push('image_url = ?')
        updateValues.push(updates.image_uri || null)
      }
      if (updates.video_uri !== undefined) {
        updateFields.push('video_url = ?')
        updateValues.push(updates.video_uri || null)
      }
      if (updates.category) {
        updateFields.push('category = ?')
        updateValues.push(updates.category)
      }
      if (updates.tags) {
        updateFields.push('tags = ?')
        updateValues.push(JSON.stringify(updates.tags))
      }
      if (updates.website_url !== undefined) {
        updateFields.push('website_url = ?')
        updateValues.push(updates.website_url || null)
      }

      updateFields.push('updated_at = ?')
      updateValues.push(new Date().toISOString())
      updateValues.push(launchId) // For WHERE clause

      const query = `UPDATE launches SET ${updateFields.join(', ')} WHERE id = ?`
      await db.execute(query, updateValues)

      // Return updated launch
      const updatedLaunch = await this.getById(launchId)

      return {
        success: true,
        launch: updatedLaunch || undefined
      }
    } catch (error: any) {
      console.error('Update launch error:', error)
      return {
        success: false,
        error: error.message || 'Failed to update launch'
      }
    }
  }

  /**
   * Delete launch
   */
  async delete(launchId: string): Promise<{ success: boolean; error?: string }> {
    try {
      await db.execute('DELETE FROM launches WHERE id = ?', [launchId])
      return { success: true }
    } catch (error: any) {
      console.error('Delete launch error:', error)
      return { success: false, error: error.message || 'Failed to delete launch' }
    }
  }

  /**
   * Upvote a launch
   */
  async upvote(
    launchId: string,
    userId: string
  ): Promise<{ success: boolean; newUpvotes: number; error?: string }> {
    try {
      // Check if user already upvoted this launch
      const existingVote = await db.getAll(
        'SELECT * FROM upvotes WHERE user_id = ? AND launch_id = ?',
        [userId, launchId]
      )

      if (existingVote.length > 0) {
        // Remove upvote (toggle)
        await db.execute(
          'DELETE FROM upvotes WHERE user_id = ? AND launch_id = ?',
          [userId, launchId]
        )
        await db.execute(
          'UPDATE launches SET upvotes = MAX(0, upvotes - 1) WHERE id = ?',
          [launchId]
        )
      } else {
        // Add upvote
        await db.execute(
          'INSERT INTO upvotes (user_id, launch_id, created_at) VALUES (?, ?, ?)',
          [userId, launchId, new Date().toISOString()]
        )
        await db.execute(
          'UPDATE launches SET upvotes = upvotes + 1 WHERE id = ?',
          [launchId]
        )
      }

      // Get new upvote count
      const launch = await this.getById(launchId)
      return {
        success: true,
        newUpvotes: launch?.upvotes || 0
      }
    } catch (error: any) {
      console.error('Upvote launch error:', error)
      return {
        success: false,
        newUpvotes: 0,
        error: error.message || 'Failed to upvote launch'
      }
    }
  }

  /**
   * Watch for launches (real-time updates)
   */
  watchAll() {
    return db.watch('SELECT * FROM launches ORDER BY upvotes DESC, created_at DESC')
  }

  watchByAuthor(authorId: string) {
    return db.watch('SELECT * FROM launches WHERE author_id = ? ORDER BY created_at DESC', [authorId])
  }

  watchTrending() {
    return db.watch(`
      SELECT * FROM launches
      WHERE created_at >= datetime('now', '-7 days')
      ORDER BY upvotes DESC
      LIMIT 10
    `)
  }

  /**
   * Helper to generate UUID
   */
  private generateUUID(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0
      const v = c === 'x' ? r : (r & 0x3 | 0x8)
      return v.toString(16)
    })
  }
}

// Export singleton instance
export const launchesServicePowerSync = new LaunchesServicePowerSync()
/**
 * Livestream QR Analytics Service - PowerSync Version
 * Track scans and conversions with offline capability
 */

import { powerSyncService } from '../lib/powersync/service';
import type { QRScanRecord, ScanAnalytics } from '../types/delivery'

export class LivestreamAnalyticsServicePowerSync {
  /**
   * Log a QR scan event (saves to local SQLite, queues for sync)
   */
  async logQRScan(
    productId: string,
    merchantId: string,
    options: {
      ipAddress?: string
      userAgent?: string
      referrer?: string
    } = {}
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const scanId = this.generateUUID();
      const now = new Date().toISOString();

      const insertQuery = `
        INSERT INTO livestream_qr_scans (
          id, merchant_id, product_id, scanned_at, ip_address, user_agent,
          converted, order_id, referrer, session_duration, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

      await powerSyncService.executeWrite(insertQuery, [
        scanId,
        merchantId,
        productId,
        now,
        options.ipAddress || null,
        options.userAgent || null,
        0, // converted (boolean as integer)
        null, // order_id
        options.referrer || null,
        null, // session_duration
        now
      ]);

      return { success: true };
    } catch (error) {
      console.error('Log QR scan error:', error)
      return { success: false, error: 'Failed to log QR scan' }
    }
  }

  /**
   * Mark a QR scan as converted (resulted in purchase)
   */
  async markScanAsConverted(
    scanId: string,
    orderId: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const now = new Date().toISOString();

      await powerSyncService.executeWrite(
        'UPDATE livestream_qr_scans SET converted = ?, order_id = ?, updated_at = ? WHERE id = ?',
        [1, orderId, now, scanId] // converted as integer (1 = true)
      );

      return { success: true };
    } catch (error) {
      console.error('Mark scan as converted error:', error)
      return { success: false, error: 'Failed to mark scan as converted' }
    }
  }

  /**
   * Get analytics for a merchant (from local SQLite)
   */
  async getMerchantAnalytics(
    merchantId: string,
    from?: string,
    to?: string
  ): Promise<ScanAnalytics | null> {
    try {
      // Base query for scans
      let scansQuery = 'SELECT * FROM livestream_qr_scans WHERE merchant_id = ?';
      let params: any[] = [merchantId];

      // Add date filters if provided
      if (from) {
        scansQuery += ' AND scanned_at >= ?';
        params.push(from);
      }
      if (to) {
        scansQuery += ' AND scanned_at <= ?';
        params.push(to);
      }

      const scans = await powerSyncService.executeQuery<QRScanRecord>(scansQuery, params);
      const totalScans = scans.length;

      // Get conversions
      let conversionsQuery = 'SELECT COUNT(*) as count FROM livestream_qr_scans WHERE merchant_id = ? AND converted = 1';
      let conversionParams: any[] = [merchantId];

      if (from) {
        conversionsQuery += ' AND scanned_at >= ?';
        conversionParams.push(from);
      }
      if (to) {
        conversionsQuery += ' AND scanned_at <= ?';
        conversionParams.push(to);
      }

      const conversionResults = await powerSyncService.executeQuery<{count: number}>(
        conversionsQuery,
        conversionParams
      );
      const conversions = conversionResults[0]?.count || 0;

      // Get product-level analytics
      let productQuery = `
        SELECT
          product_id,
          COUNT(*) as scans,
          SUM(CASE WHEN converted = 1 THEN 1 ELSE 0 END) as conversions
        FROM livestream_qr_scans
        WHERE merchant_id = ?
      `;
      let productParams: any[] = [merchantId];

      if (from) {
        productQuery += ' AND scanned_at >= ?';
        productParams.push(from);
      }
      if (to) {
        productQuery += ' AND scanned_at <= ?';
        productParams.push(to);
      }

      productQuery += ' GROUP BY product_id';

      const productData = await powerSyncService.executeQuery<{
        product_id: string;
        scans: number;
        conversions: number;
      }>(productQuery, productParams);

      // Get product titles for display
      const productIds = productData.map(p => p.product_id);
      let productsWithDetails: any[] = [];

      if (productIds.length > 0) {
        const placeholders = productIds.map(() => '?').join(',');
        const productDetailsQuery = `SELECT id, title FROM products WHERE id IN (${placeholders})`;
        const productDetails = await powerSyncService.executeQuery<{id: string; title: string}>(
          productDetailsQuery,
          productIds
        );

        // Get revenue data for converted scans
        const revenueQuery = `
          SELECT product_id, SUM(total_price) as revenue
          FROM orders
          WHERE product_id IN (${placeholders}) AND seller_id = ?
          GROUP BY product_id
        `;
        const revenueData = await powerSyncService.executeQuery<{product_id: string; revenue: number}>(
          revenueQuery,
          [...productIds, merchantId]
        );

        productsWithDetails = productData.map(p => {
          const productDetail = productDetails.find(pd => pd.id === p.product_id);
          const revenueItem = revenueData.find(rd => rd.product_id === p.product_id);

          return {
            id: p.product_id,
            name: productDetail?.title || 'Unknown Product',
            scans: p.scans,
            conversions: p.conversions,
            revenue: revenueItem?.revenue || 0
          };
        });
      }

      const conversionRate = totalScans && totalScans > 0
        ? conversions / totalScans
        : 0;

      return {
        total_scans: totalScans,
        converted_count: conversions,
        conversion_rate: conversionRate,
        top_products: productsWithDetails.map(p => ({
          product_id: p.product_id,
          product_name: p.title || 'Produit sans nom',
          scan_count: p.scan_count
        })),
        scans_by_date: [] // TODO: Implement date breakdown
      };
    } catch (error) {
      console.error('Get merchant analytics error:', error)
      return null;
    }
  }

  /**
   * Get platform referrer breakdown (from local SQLite)
   */
  async getReferrerAnalytics(
    merchantId: string,
    from?: string,
    to?: string
  ): Promise<Record<string, number> | null> {
    try {
      let query = 'SELECT referrer, COUNT(*) as count FROM livestream_qr_scans WHERE merchant_id = ? AND referrer IS NOT NULL';
      let params: any[] = [merchantId];

      if (from) {
        query += ' AND scanned_at >= ?';
        params.push(from);
      }
      if (to) {
        query += ' AND scanned_at <= ?';
        params.push(to);
      }

      query += ' GROUP BY referrer';

      const results = await powerSyncService.executeQuery<{referrer: string; count: number}>(
        query,
        params
      );

      const referrerMap: Record<string, number> = {};
      results.forEach(item => {
        referrerMap[item.referrer] = item.count;
      });

      return referrerMap;
    } catch (error) {
      console.error('Get referrer analytics error:', error)
      return null;
    }
  }

  /**
   * Track session duration for a scan
   */
  async updateSessionDuration(
    scanId: string,
    duration: number
  ): Promise<boolean> {
    try {
      await powerSyncService.executeWrite(
        'UPDATE livestream_qr_scans SET session_duration = ?, updated_at = ? WHERE id = ?',
        [duration, new Date().toISOString(), scanId]
      );

      return true;
    } catch (error) {
      console.error('Update session duration error:', error)
      return false;
    }
  }

  /**
   * Watch for scan analytics (real-time updates)
   */
  watchMerchantAnalytics(merchantId: string, from?: string, to?: string) {
    let query = 'SELECT * FROM livestream_qr_scans WHERE merchant_id = ?';
    let params: any[] = [merchantId];

    if (from) {
      query += ' AND scanned_at >= ?';
      params.push(from);
    }
    if (to) {
      query += ' AND scanned_at <= ?';
      params.push(to);
    }

    query += ' ORDER BY scanned_at DESC';

    return powerSyncService.watchQuery(query, params);
  }

  /**
   * Helper to generate UUID
   */
  private generateUUID(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }
}

// Export singleton instance
export const livestreamAnalyticsServicePowerSync = new LivestreamAnalyticsServicePowerSync()
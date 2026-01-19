/**
 * PowerSync Service
 * Main service to interact with the offline-first PowerSync database
 * Updated for PowerSync React Native v1.28+
 */

import { database, initDatabase } from './db';
import { initSupabaseConnector, SupabaseConnector } from './connector';
import { PowerSyncDatabase } from '@powersync/react-native';

export class PowerSyncService {
  private static instance: PowerSyncService;
  private powersync: PowerSyncDatabase | null = null;
  private connector: SupabaseConnector | null = null;
  private isConnectedFlag: boolean = false;

  private constructor() {}

  public static getInstance(): PowerSyncService {
    if (!PowerSyncService.instance) {
      PowerSyncService.instance = new PowerSyncService();
    }
    return PowerSyncService.instance;
  }

  /**
   * Initialize PowerSync service
   */
  async initialize() {
    try {
      // Initialize the local database
      await initDatabase();
      this.powersync = database as PowerSyncDatabase;

      // Initialize the Supabase connector
      this.connector = await initSupabaseConnector(this.powersync);

      // Connect to Supabase and start syncing
      await this.powersync.connect(this.connector);
      this.isConnectedFlag = true;

      console.log('✅ PowerSync service initialized successfully');
      console.log('✅ Connected to Supabase');
    } catch (error) {
      console.error('❌ Failed to initialize PowerSync service:', error);
      throw error;
    }
  }

  /**
   * Check if PowerSync is connected
   */
  isConnected(): boolean {
    return this.isConnectedFlag && this.powersync !== null;
  }

  /**
   * Get sync status
   */
  async getSyncStatus() {
    if (!this.powersync) return null;

    // In v1.28, these methods are no longer available
    // Return basic connection status instead
    return {
      isConnected: this.isConnectedFlag,
      databaseInitialized: this.powersync !== null
    };
  }

  /**
   * Execute a read query against the local database
   */
  async executeQuery<T = any>(sql: string, params?: any[]): Promise<T[]> {
    if (!this.powersync) {
      throw new Error('PowerSync not initialized');
    }

    const result = await this.powersync.getAll<T>(sql, params);
    return result;
  }

  /**
   * Execute a write operation (insert/update/delete)
   */
  async executeWrite(sql: string, params?: any[]): Promise<any> {
    if (!this.powersync) {
      throw new Error('PowerSync not initialized');
    }

    return await this.powersync.execute(sql, params);
  }

  /**
   * Watch for changes in the database
   */
  watchQuery(sql: string, params?: any[]) {
    if (!this.powersync) {
      throw new Error('PowerSync not initialized');
    }

    return this.powersync.watch(sql, params);
  }

  /**
   * Get the PowerSync database instance
   */
  getDatabase(): PowerSyncDatabase | null {
    return this.powersync;
  }

  /**
   * Get the Supabase connector
   */
  getConnector(): SupabaseConnector | null {
    return this.connector;
  }

  /**
   * Close the PowerSync connection
   */
  async close() {
    if (this.powersync) {
      await this.powersync.disconnect();
      this.powersync = null;
      this.connector = null;
      this.isConnectedFlag = false;
    }
  }

  /**
   * Trigger a manual sync
   */
  async sync() {
    if (!this.powersync || !this.connector) {
      throw new Error('PowerSync not initialized');
    }

    // In v1.28, sync is automatic. This is a placeholder for manual sync if needed.
    console.log('Sync is automatic in v1.28+');
  }
}

// Create singleton instance
export const powerSyncService = PowerSyncService.getInstance();
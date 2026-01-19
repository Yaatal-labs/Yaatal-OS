/**
 * PowerSync Test Utilities
 * Provides utilities for testing offline sync behavior in the BOBO app
 * Compatible with PowerSync React Native v1.28+
 */

import { AbstractPowerSyncDatabase, PowerSyncCredentials } from '@powersync/react-native';
import { CrudEntry } from '@powersync/common';
import { SupabaseConnector } from './connector';

// ============================================================================
// Types
// ============================================================================

/**
 * Network state for simulation
 */
export interface NetworkState {
  isOnline: boolean;
  latencyMs: number;
}

/**
 * Sync status information
 */
export interface SyncStatus {
  pendingChanges: number;
  isConnected: boolean;
  lastSyncTime: Date | null;
}

/**
 * Hook function types for MockSupabaseConnector
 */
export type UploadHook = (entries: CrudEntry[]) => Promise<void> | void;
export type FetchCredentialsHook = () => Promise<PowerSyncCredentials | null> | PowerSyncCredentials | null;

/**
 * Configuration for MockSupabaseConnector
 */
export interface MockConnectorConfig {
  /** Whether to simulate credential fetch failures */
  failCredentials: boolean;
  /** Whether to simulate upload failures */
  failUpload: boolean;
  /** Error message for simulated failures */
  errorMessage: string;
  /** Simulated latency in milliseconds */
  latencyMs: number;
}

/**
 * Test data record type
 */
export type TestRecord = Record<string, unknown>;

// ============================================================================
// NetworkSimulator
// ============================================================================

/**
 * Simulates network conditions for offline testing
 * @example
 * ```typescript
 * const network = new NetworkSimulator();
 * network.goOffline();
 * // Test offline behavior
 * network.goOnline();
 * ```
 */
export class NetworkSimulator {
  private state: NetworkState = {
    isOnline: true,
    latencyMs: 0,
  };

  private listeners: Set<(state: NetworkState) => void> = new Set();

  /**
   * Simulate going offline
   */
  goOffline(): void {
    this.state.isOnline = false;
    this.notifyListeners();
  }

  /**
   * Restore online mode
   */
  goOnline(): void {
    this.state.isOnline = true;
    this.notifyListeners();
  }

  /**
   * Check if currently online
   * @returns Current online state
   */
  isOnline(): boolean {
    return this.state.isOnline;
  }

  /**
   * Set artificial latency for network operations
   * @param ms - Latency in milliseconds
   */
  simulateLatency(ms: number): void {
    if (ms < 0) {
      throw new Error('Latency cannot be negative');
    }
    this.state.latencyMs = ms;
    this.notifyListeners();
  }

  /**
   * Get current latency setting
   * @returns Current latency in milliseconds
   */
  getLatency(): number {
    return this.state.latencyMs;
  }

  /**
   * Get current network state
   * @returns Current network state
   */
  getState(): NetworkState {
    return { ...this.state };
  }

  /**
   * Apply simulated latency delay
   * @returns Promise that resolves after the configured latency
   */
  async applyLatency(): Promise<void> {
    if (this.state.latencyMs > 0) {
      await this.delay(this.state.latencyMs);
    }
  }

  /**
   * Register a listener for network state changes
   * @param listener - Callback function for state changes
   * @returns Unsubscribe function
   */
  onStateChange(listener: (state: NetworkState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Reset to default state (online, no latency)
   */
  reset(): void {
    this.state = {
      isOnline: true,
      latencyMs: 0,
    };
    this.notifyListeners();
  }

  /**
   * Helper to create a delay
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Notify all listeners of state change
   */
  private notifyListeners(): void {
    const stateCopy = this.getState();
    this.listeners.forEach((listener) => {
      try {
        listener(stateCopy);
      } catch (error) {
        console.error('NetworkSimulator listener error:', error);
      }
    });
  }
}

// ============================================================================
// SyncTestHelper
// ============================================================================

/**
 * Helper class for testing PowerSync synchronization
 * @example
 * ```typescript
 * const helper = new SyncTestHelper(database);
 * await helper.seedLocalData('products', [{ id: '1', name: 'Test' }]);
 * const pending = await helper.getPendingChanges();
 * await helper.waitForSync(5000);
 * ```
 */
export class SyncTestHelper {
  private database: AbstractPowerSyncDatabase;
  private defaultTimeout: number = 10000;

  /**
   * Create a new SyncTestHelper
   * @param database - PowerSync database instance
   */
  constructor(database: AbstractPowerSyncDatabase) {
    this.database = database;
  }

  /**
   * Wait for sync operations to complete
   * @param timeout - Maximum time to wait in milliseconds (default: 10000)
   * @returns Promise that resolves when sync is complete or rejects on timeout
   */
  async waitForSync(timeout: number = this.defaultTimeout): Promise<void> {
    const startTime = Date.now();

    return new Promise((resolve, reject) => {
      const checkSync = async () => {
        try {
          const pending = await this.getPendingChanges();

          if (pending === 0) {
            resolve();
            return;
          }

          if (Date.now() - startTime >= timeout) {
            reject(new Error(`Sync timeout after ${timeout}ms. ${pending} changes still pending.`));
            return;
          }

          // Check again after a short delay
          setTimeout(checkSync, 100);
        } catch (error) {
          reject(error);
        }
      };

      checkSync();
    });
  }

  /**
   * Get the count of unsynced local changes
   * @returns Number of pending changes
   */
  async getPendingChanges(): Promise<number> {
    try {
      // Query the internal PowerSync CRUD queue
      const result = await this.database.getAll<{ count: number }>(
        'SELECT COUNT(*) as count FROM ps_crud'
      );
      return result[0]?.count ?? 0;
    } catch (error) {
      // If ps_crud table doesn't exist or other error, return 0
      console.warn('Could not get pending changes:', error);
      return 0;
    }
  }

  /**
   * Clear all data from the local database for clean tests
   * WARNING: This will delete all local data!
   */
  async clearLocalDatabase(): Promise<void> {
    try {
      // Get all table names from the database
      const tables = await this.database.getAll<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'ps_%' AND name NOT LIKE 'sqlite_%'"
      );

      // Clear each table
      for (const table of tables) {
        await this.database.execute(`DELETE FROM ${table.name}`);
      }

      // Clear the internal CRUD queue
      try {
        await this.database.execute('DELETE FROM ps_crud');
      } catch {
        // ps_crud might not exist in all versions
      }

      // Clear the internal buckets data
      try {
        await this.database.execute('DELETE FROM ps_buckets');
      } catch {
        // ps_buckets might not exist in all versions
      }
    } catch (error) {
      console.error('Failed to clear local database:', error);
      throw error;
    }
  }

  /**
   * Seed local data for testing
   * @param table - Table name to insert data into
   * @param data - Array of records to insert
   */
  async seedLocalData(table: string, data: TestRecord[]): Promise<void> {
    if (!data || data.length === 0) {
      return;
    }

    try {
      for (const record of data) {
        const keys = Object.keys(record);
        const values = Object.values(record);
        const placeholders = keys.map(() => '?').join(', ');
        const columns = keys.join(', ');

        await this.database.execute(
          `INSERT OR REPLACE INTO ${table} (${columns}) VALUES (${placeholders})`,
          values
        );
      }
    } catch (error) {
      console.error(`Failed to seed data into ${table}:`, error);
      throw error;
    }
  }

  /**
   * Get all records from a table
   * @param table - Table name to query
   * @returns Array of records
   */
  async getTableData<T = TestRecord>(table: string): Promise<T[]> {
    try {
      return await this.database.getAll<T>(`SELECT * FROM ${table}`);
    } catch (error) {
      console.error(`Failed to get data from ${table}:`, error);
      throw error;
    }
  }

  /**
   * Get a single record by ID
   * @param table - Table name
   * @param id - Record ID
   * @returns Record or null if not found
   */
  async getRecordById<T = TestRecord>(table: string, id: string): Promise<T | null> {
    try {
      const results = await this.database.getAll<T>(
        `SELECT * FROM ${table} WHERE id = ?`,
        [id]
      );
      return results[0] ?? null;
    } catch (error) {
      console.error(`Failed to get record from ${table}:`, error);
      throw error;
    }
  }

  /**
   * Get sync status information
   * @returns Current sync status
   */
  async getSyncStatus(): Promise<SyncStatus> {
    const pendingChanges = await this.getPendingChanges();

    return {
      pendingChanges,
      isConnected: true, // Would need connector reference for accurate status
      lastSyncTime: null, // PowerSync v1.28+ handles this internally
    };
  }

  /**
   * Execute a raw SQL query for testing
   * @param sql - SQL query string
   * @param params - Query parameters
   * @returns Query results
   */
  async executeQuery<T = TestRecord>(sql: string, params?: unknown[]): Promise<T[]> {
    return await this.database.getAll<T>(sql, params);
  }

  /**
   * Execute a write operation for testing
   * @param sql - SQL statement
   * @param params - Query parameters
   */
  async executeWrite(sql: string, params?: unknown[]): Promise<void> {
    await this.database.execute(sql, params);
  }
}

// ============================================================================
// MockSupabaseConnector
// ============================================================================

/**
 * Mock implementation of SupabaseConnector for testing
 * Allows configuration of failure scenarios and hooks for assertions
 * @example
 * ```typescript
 * const mock = new MockSupabaseConnector(database);
 * mock.setConfig({ failUpload: true, errorMessage: 'Network error' });
 * mock.onUpload = (entries) => console.log('Upload attempted:', entries);
 * ```
 */
export class MockSupabaseConnector extends SupabaseConnector {
  private config: MockConnectorConfig = {
    failCredentials: false,
    failUpload: false,
    errorMessage: 'Mock error',
    latencyMs: 0,
  };

  private networkSimulator: NetworkSimulator | null = null;

  /** Hook called when uploadData is invoked */
  public onUpload: UploadHook | null = null;

  /** Hook called when fetchCredentials is invoked */
  public onFetchCredentials: FetchCredentialsHook | null = null;

  /** Track upload attempts for assertions */
  public uploadAttempts: CrudEntry[][] = [];

  /** Track credential fetch attempts */
  public credentialFetchAttempts: number = 0;

  /**
   * Set configuration for the mock connector
   * @param config - Partial configuration to apply
   */
  setConfig(config: Partial<MockConnectorConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration
   * @returns Current mock configuration
   */
  getConfig(): MockConnectorConfig {
    return { ...this.config };
  }

  /**
   * Attach a network simulator for coordinated testing
   * @param simulator - NetworkSimulator instance
   */
  setNetworkSimulator(simulator: NetworkSimulator): void {
    this.networkSimulator = simulator;
  }

  /**
   * Reset mock state for clean tests
   */
  reset(): void {
    this.config = {
      failCredentials: false,
      failUpload: false,
      errorMessage: 'Mock error',
      latencyMs: 0,
    };
    this.onUpload = null;
    this.onFetchCredentials = null;
    this.uploadAttempts = [];
    this.credentialFetchAttempts = 0;
    this.networkSimulator = null;
  }

  /**
   * Override fetchCredentials for testing
   */
  override async fetchCredentials(): Promise<PowerSyncCredentials | null> {
    this.credentialFetchAttempts++;

    // Apply latency simulation
    await this.applyLatency();

    // Check network simulator
    if (this.networkSimulator && !this.networkSimulator.isOnline()) {
      throw new Error('Network offline');
    }

    // Call hook if provided
    if (this.onFetchCredentials) {
      const hookResult = await this.onFetchCredentials();
      if (hookResult !== undefined) {
        return hookResult;
      }
    }

    // Simulate failure if configured
    if (this.config.failCredentials) {
      throw new Error(this.config.errorMessage);
    }

    // Return mock credentials
    return {
      endpoint: 'https://mock-powersync.example.com',
      token: 'mock-token-' + Date.now(),
      expiresAt: new Date(Date.now() + 3600000), // 1 hour from now
    };
  }

  /**
   * Override uploadData for testing
   */
  override async uploadData(database: AbstractPowerSyncDatabase): Promise<void> {
    // Get the batch to track what would be uploaded
    const batch = await database.getCrudBatch();

    if (!batch || batch.crud.length === 0) {
      return;
    }

    // Track the upload attempt
    this.uploadAttempts.push([...batch.crud]);

    // Apply latency simulation
    await this.applyLatency();

    // Check network simulator
    if (this.networkSimulator && !this.networkSimulator.isOnline()) {
      throw new Error('Network offline');
    }

    // Call hook if provided
    if (this.onUpload) {
      await this.onUpload(batch.crud);
    }

    // Simulate failure if configured
    if (this.config.failUpload) {
      throw new Error(this.config.errorMessage);
    }

    // Mark batch as complete on success
    await batch.complete();
  }

  /**
   * Override ready check for testing
   */
  override async ready(): Promise<boolean> {
    if (this.networkSimulator && !this.networkSimulator.isOnline()) {
      return false;
    }

    if (this.config.failCredentials) {
      return false;
    }

    return true;
  }

  /**
   * Helper to apply configured latency
   */
  private async applyLatency(): Promise<void> {
    // Use network simulator latency if available, otherwise use config
    const latency = this.networkSimulator
      ? this.networkSimulator.getLatency()
      : this.config.latencyMs;

    if (latency > 0) {
      await new Promise((resolve) => setTimeout(resolve, latency));
    }
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a NetworkSimulator instance
 * @returns New NetworkSimulator
 */
export function createNetworkSimulator(): NetworkSimulator {
  return new NetworkSimulator();
}

/**
 * Create a SyncTestHelper instance
 * @param database - PowerSync database instance
 * @returns New SyncTestHelper
 */
export function createSyncTestHelper(database: AbstractPowerSyncDatabase): SyncTestHelper {
  return new SyncTestHelper(database);
}

/**
 * Create a fully configured test environment
 * @param database - PowerSync database instance
 * @returns Object containing all test utilities
 */
export function createTestEnvironment(database: AbstractPowerSyncDatabase): {
  networkSimulator: NetworkSimulator;
  syncHelper: SyncTestHelper;
  resetAll: () => Promise<void>;
} {
  const networkSimulator = new NetworkSimulator();
  const syncHelper = new SyncTestHelper(database);

  return {
    networkSimulator,
    syncHelper,
    resetAll: async () => {
      networkSimulator.reset();
      await syncHelper.clearLocalDatabase();
    },
  };
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Generate a UUID for test records
 * @returns UUID string
 */
export function generateTestId(): string {
  return 'test-' + Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
}

/**
 * Create a delay promise for test timing
 * @param ms - Milliseconds to delay
 * @returns Promise that resolves after delay
 */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry a function until it succeeds or timeout
 * @param fn - Function to retry
 * @param options - Retry options
 * @returns Result of the function
 */
export async function retryUntil<T>(
  fn: () => Promise<T>,
  options: {
    timeout?: number;
    interval?: number;
    predicate?: (result: T) => boolean;
  } = {}
): Promise<T> {
  const { timeout = 5000, interval = 100, predicate = () => true } = options;
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    try {
      const result = await fn();
      if (predicate(result)) {
        return result;
      }
    } catch {
      // Continue retrying
    }
    await delay(interval);
  }

  throw new Error(`Retry timeout after ${timeout}ms`);
}

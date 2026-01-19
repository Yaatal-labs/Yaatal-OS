/**
 * PowerSync Supabase Connector
 * Handles the connection between local SQLite and Supabase backend
 * Updated for PowerSync React Native v1.28+
 */

import { PowerSyncDatabase, AbstractPowerSyncDatabase, PowerSyncCredentials } from '@powersync/react-native';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { CrudEntry, UpdateType } from '@powersync/common';
import { database } from './db';

// Initialize Supabase client
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Supabase URL and ANON key are required');
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

/**
 * Custom Supabase connector implementation for PowerSync v1.28+
 */
export class SupabaseConnector {
  constructor(
    private powersync: AbstractPowerSyncDatabase,
    private supabaseClient: SupabaseClient
  ) {}

  /**
   * Fetch credentials for PowerSync authentication
   */
  async fetchCredentials(): Promise<PowerSyncCredentials | null> {
    try {
      const { data: { session } } = await this.supabaseClient.auth.getSession();

      if (!session) {
        return null;
      }

      // For Supabase, we use the access token
      // The endpoint is the PowerSync sync endpoint (not Supabase directly)
      // You'll need to configure this separately
      return {
        endpoint: supabaseUrl, // This should be your PowerSync instance URL
        token: session.access_token,
        expiresAt: session.expires_at ? new Date(session.expires_at * 1000) : undefined
      };
    } catch (error) {
      console.error('Failed to fetch credentials:', error);
      return null;
    }
  }

  /**
   * Upload local changes to Supabase
   */
  async uploadData(database: AbstractPowerSyncDatabase): Promise<void> {
    // Get the next batch of operations to upload
    const batch = await database.getCrudBatch();

    if (!batch || batch.crud.length === 0) {
      return;
    }

    try {
      // Process each operation
      for (const entry of batch.crud) {
        await this.applyCrudEntry(entry);
      }

      // Mark batch as complete after successful upload
      await batch.complete();
    } catch (error) {
      console.error('Failed to upload batch:', error);
      throw error;
    }
  }

  /**
   * Apply a single CRUD entry to Supabase
   */
  private async applyCrudEntry(entry: CrudEntry): Promise<void> {
    const { table, op, id, opData } = entry;

    switch (op) {
      case UpdateType.PUT:
        // Insert or replace
        if (opData) {
          const { error } = await this.supabaseClient
            .from(table)
            .upsert({ id, ...opData });

          if (error) throw error;
        }
        break;

      case UpdateType.PATCH:
        // Update existing row
        if (opData) {
          const { error } = await this.supabaseClient
            .from(table)
            .update(opData)
            .eq('id', id);

          if (error) throw error;
        }
        break;

      case UpdateType.DELETE:
        // Delete row
        const { error: deleteError } = await this.supabaseClient
          .from(table)
          .delete()
          .eq('id', id);

        if (deleteError) throw deleteError;
        break;
    }
  }

  /**
   * Check if the connector is ready
   */
  async ready(): Promise<boolean> {
    const { data: { session } } = await this.supabaseClient.auth.getSession();
    return !!session;
  }

  /**
   * Invalidate stored credentials (optional)
   */
  invalidateCredentials(): void {
    // Supabase client handles this automatically
  }
}

/**
 * Create the Supabase connector
 */
export const createSupabaseConnector = (powersync: PowerSyncDatabase) => {
  return new SupabaseConnector(powersync, supabase);
};

/**
 * Initialize the connector
 */
export const initSupabaseConnector = async (powersync: PowerSyncDatabase) => {
  const connector = createSupabaseConnector(powersync);
  return connector;
};
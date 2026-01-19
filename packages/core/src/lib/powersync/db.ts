/**
 * PowerSync Client Configuration for React Native
 * Sets up the local SQLite database and connection to Supabase
 * Updated for PowerSync React Native v1.28+
 */

import { PowerSyncDatabase } from '@powersync/react-native';
import { AppSchema } from '../../db/schema';

// Create PowerSync database instance
export const database = new PowerSyncDatabase({
  schema: AppSchema,
  database: {
    dbFilename: 'powersync.db'
  }
});

// Initialize the database
export const initDatabase = async () => {
  await database.init();
  return database;
};

// Alias for backward compatibility
export { database as db };

// Export types
export type { PowerSyncDatabase };
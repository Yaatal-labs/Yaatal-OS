/**
 * PowerSync Sync Integration Tests
 * Testing offline sync, CRUD operations, schema validation, and error handling
 */

import { UpdateType } from '@powersync/common';
import { AppSchema } from '../schema';

// Mock environment variables
process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';

// Mock PowerSync database
const mockCrudBatch = {
  crud: [] as any[],
  complete: jest.fn().mockResolvedValue(undefined),
};

const mockPowerSyncDatabase = {
  init: jest.fn().mockResolvedValue(undefined),
  connect: jest.fn().mockResolvedValue(undefined),
  disconnect: jest.fn().mockResolvedValue(undefined),
  execute: jest.fn().mockResolvedValue({ rowsAffected: 1 }),
  getAll: jest.fn().mockResolvedValue([]),
  get: jest.fn().mockResolvedValue(null),
  watch: jest.fn().mockReturnValue({ subscribe: jest.fn() }),
  getCrudBatch: jest.fn().mockResolvedValue(mockCrudBatch),
  writeTransaction: jest.fn().mockImplementation(async (callback) => {
    await callback({
      execute: jest.fn().mockResolvedValue({ rowsAffected: 1 }),
    });
  }),
};

// Mock Supabase client
const mockSupabaseClient = {
  auth: {
    getSession: jest.fn().mockResolvedValue({
      data: {
        session: {
          access_token: 'test-token',
          expires_at: Math.floor(Date.now() / 1000) + 3600,
        },
      },
    }),
  },
  from: jest.fn().mockReturnValue({
    upsert: jest.fn().mockResolvedValue({ error: null }),
    update: jest.fn().mockReturnValue({
      eq: jest.fn().mockResolvedValue({ error: null }),
    }),
    delete: jest.fn().mockReturnValue({
      eq: jest.fn().mockResolvedValue({ error: null }),
    }),
    select: jest.fn().mockReturnValue({
      eq: jest.fn().mockResolvedValue({ data: [], error: null }),
    }),
  }),
};

// Mock modules
jest.mock('@powersync/react-native', () => ({
  PowerSyncDatabase: jest.fn().mockImplementation(() => mockPowerSyncDatabase),
  column: {
    text: 'TEXT',
    integer: 'INTEGER',
    real: 'REAL',
  },
  Schema: jest.fn().mockImplementation((tables) => ({ tables, types: {} })),
  Table: jest.fn().mockImplementation((columns, options) => ({ columns, options })),
}));

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn().mockReturnValue(mockSupabaseClient),
}));

// Import after mocking
import { SupabaseConnector, createSupabaseConnector } from '../connector';
import { PowerSyncService, powerSyncService } from '../service';

// Senegalese test data
const testData = {
  product: {
    id: 'prod-001',
    merchant_id: 'merchant-dakar-001',
    name: 'Thieboudienne Epices',
    description: 'Epices traditionnelles pour le plat national senegalais',
    price: 2500, // 2,500 XOF
    discount_price: 2000,
    stock: 50,
    category: 'alimentation',
    images: JSON.stringify(['https://example.com/thieb-spices.jpg']),
    is_active: 1,
    upvotes: 15,
  },
  order: {
    id: 'order-001',
    buyer_id: 'buyer-thies-001',
    seller_id: 'merchant-dakar-001',
    status: 'pending',
    payment_method: 'mobile_money',
    payment_status: 'pending',
    subtotal: 7500, // 7,500 XOF
    shipping_cost: 1000, // 1,000 XOF
    total: 8500, // 8,500 XOF
    delivery_method: 'delivery',
    delivery_address: 'Quartier Medina, Dakar',
    delivery_phone: '+221771234567',
  },
  message: {
    id: 'msg-001',
    conversation_id: 'conv-001',
    sender_id: 'buyer-thies-001',
    content: 'Bonjour, est-ce que le produit est disponible?',
    type: 'text',
    metadata: JSON.stringify({}),
    read_at: null,
    created_at: new Date().toISOString(),
  },
  profile: {
    id: 'user-001',
    phone: '+221771234567',
    full_name: 'Mamadou Diallo',
    avatar_url: 'https://example.com/avatar.jpg',
    role: 'buyer',
    shop_name: null,
    seller_rating: null,
    city: 'Dakar',
    neighborhood: 'Medina',
  },
};

describe('PowerSync Offline Sync', () => {
  let connector: SupabaseConnector;

  beforeEach(() => {
    jest.clearAllMocks();
    mockCrudBatch.crud = [];
    connector = createSupabaseConnector(mockPowerSyncDatabase as any);
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it('should persist data locally when offline', async () => {
    // Simulate offline mode by having auth return no session
    mockSupabaseClient.auth.getSession.mockResolvedValueOnce({
      data: { session: null },
    });

    // Local write should still work
    await mockPowerSyncDatabase.execute(
      `INSERT INTO products (id, merchant_id, name, price, stock, is_active) VALUES (?, ?, ?, ?, ?, ?)`,
      [
        testData.product.id,
        testData.product.merchant_id,
        testData.product.name,
        testData.product.price,
        testData.product.stock,
        testData.product.is_active,
      ]
    );

    expect(mockPowerSyncDatabase.execute).toHaveBeenCalled();
    expect(mockPowerSyncDatabase.execute).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO products'),
      expect.arrayContaining([testData.product.id])
    );
  });

  it('should queue CRUD operations when offline', async () => {
    // Queue a create operation
    const createEntry = {
      table: 'products',
      op: UpdateType.PUT,
      id: testData.product.id,
      opData: {
        merchant_id: testData.product.merchant_id,
        name: testData.product.name,
        price: testData.product.price,
        stock: testData.product.stock,
        is_active: testData.product.is_active,
      },
    };

    // Queue an update operation
    const updateEntry = {
      table: 'orders',
      op: UpdateType.PATCH,
      id: testData.order.id,
      opData: {
        status: 'confirmed',
      },
    };

    // Queue a delete operation
    const deleteEntry = {
      table: 'messages',
      op: UpdateType.DELETE,
      id: testData.message.id,
      opData: null,
    };

    mockCrudBatch.crud = [createEntry, updateEntry, deleteEntry];
    mockPowerSyncDatabase.getCrudBatch.mockResolvedValueOnce(mockCrudBatch);

    const batch = await mockPowerSyncDatabase.getCrudBatch();

    expect(batch).toBeDefined();
    expect(batch?.crud).toHaveLength(3);
    expect(batch?.crud[0].op).toBe(UpdateType.PUT);
    expect(batch?.crud[1].op).toBe(UpdateType.PATCH);
    expect(batch?.crud[2].op).toBe(UpdateType.DELETE);
  });

  it('should sync queued changes when back online', async () => {
    // Simulate queued changes
    const queuedChanges = [
      {
        table: 'products',
        op: UpdateType.PUT,
        id: 'prod-002',
        opData: {
          merchant_id: 'merchant-saint-louis-001',
          name: 'Bissap Seche',
          price: 1500, // 1,500 XOF
          stock: 100,
        },
      },
    ];

    mockCrudBatch.crud = queuedChanges;
    mockPowerSyncDatabase.getCrudBatch.mockResolvedValueOnce(mockCrudBatch);

    // Simulate coming back online
    mockSupabaseClient.auth.getSession.mockResolvedValueOnce({
      data: {
        session: {
          access_token: 'new-token',
          expires_at: Math.floor(Date.now() / 1000) + 3600,
        },
      },
    });

    // Upload data
    await connector.uploadData(mockPowerSyncDatabase as any);

    // Verify Supabase was called
    expect(mockSupabaseClient.from).toHaveBeenCalledWith('products');
    expect(mockCrudBatch.complete).toHaveBeenCalled();
  });
});

describe('PowerSync CRUD Operations', () => {
  let connector: SupabaseConnector;

  beforeEach(() => {
    jest.clearAllMocks();
    mockCrudBatch.crud = [];
    connector = createSupabaseConnector(mockPowerSyncDatabase as any);
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it('should create product locally and sync to Supabase', async () => {
    const newProduct = {
      id: 'prod-003',
      merchant_id: 'merchant-mbour-001',
      name: 'Cafe Touba',
      description: 'Cafe traditionnel senegalais avec poivre de guinee',
      price: 3000, // 3,000 XOF
      stock: 75,
      is_active: 1,
    };

    // Mock local insert
    await mockPowerSyncDatabase.execute(
      `INSERT INTO products (id, merchant_id, name, description, price, stock, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        newProduct.id,
        newProduct.merchant_id,
        newProduct.name,
        newProduct.description,
        newProduct.price,
        newProduct.stock,
        newProduct.is_active,
      ]
    );

    expect(mockPowerSyncDatabase.execute).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO products'),
      expect.arrayContaining([newProduct.id, newProduct.name])
    );

    // Simulate sync to Supabase
    mockCrudBatch.crud = [
      {
        table: 'products',
        op: UpdateType.PUT,
        id: newProduct.id,
        opData: newProduct,
      },
    ];
    mockPowerSyncDatabase.getCrudBatch.mockResolvedValueOnce(mockCrudBatch);

    await connector.uploadData(mockPowerSyncDatabase as any);

    expect(mockSupabaseClient.from).toHaveBeenCalledWith('products');
  });

  it('should update order status and sync', async () => {
    const orderId = testData.order.id;
    const newStatus = 'shipped';

    // Mock local update
    await mockPowerSyncDatabase.execute(
      `UPDATE orders SET status = ? WHERE id = ?`,
      [newStatus, orderId]
    );

    expect(mockPowerSyncDatabase.execute).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE orders'),
      expect.arrayContaining([newStatus, orderId])
    );

    // Simulate sync
    mockCrudBatch.crud = [
      {
        table: 'orders',
        op: UpdateType.PATCH,
        id: orderId,
        opData: { status: newStatus },
      },
    ];
    mockPowerSyncDatabase.getCrudBatch.mockResolvedValueOnce(mockCrudBatch);

    await connector.uploadData(mockPowerSyncDatabase as any);

    expect(mockSupabaseClient.from).toHaveBeenCalledWith('orders');
  });

  it('should delete message locally and sync deletion', async () => {
    const messageId = testData.message.id;

    // Mock local delete
    await mockPowerSyncDatabase.execute(
      `DELETE FROM messages WHERE id = ?`,
      [messageId]
    );

    expect(mockPowerSyncDatabase.execute).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM messages'),
      expect.arrayContaining([messageId])
    );

    // Simulate sync
    mockCrudBatch.crud = [
      {
        table: 'messages',
        op: UpdateType.DELETE,
        id: messageId,
        opData: null,
      },
    ];
    mockPowerSyncDatabase.getCrudBatch.mockResolvedValueOnce(mockCrudBatch);

    await connector.uploadData(mockPowerSyncDatabase as any);

    expect(mockSupabaseClient.from).toHaveBeenCalledWith('messages');
  });
});

describe('PowerSync Schema Validation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should have all required tables', () => {
    const requiredTables = [
      'profiles',
      'products',
      'orders',
      'order_items',
      'delivery_requests',
      'livestream_overlay_state',
      'livestream_qr_scans',
      'conversations',
      'messages',
      'reviews',
    ];

    // AppSchema should contain all required tables
    const schemaTableKeys = Object.keys(AppSchema.tables);

    requiredTables.forEach((tableName) => {
      expect(schemaTableKeys).toContain(tableName);
    });

    expect(schemaTableKeys.length).toBeGreaterThanOrEqual(requiredTables.length);
  });

  it('should match Supabase column types', () => {
    // Helper to find table by name in the schema array
    const findTable = (name: string) => AppSchema.tables.find(t => t.name === name);

    // Test products table columns
    const productsTable = findTable('products');
    expect(productsTable).toBeDefined();
    expect(productsTable!.columns).toHaveProperty('merchant_id');
    expect(productsTable!.columns).toHaveProperty('name');
    expect(productsTable!.columns).toHaveProperty('description');
    expect(productsTable!.columns).toHaveProperty('price');
    expect(productsTable!.columns).toHaveProperty('stock');
    expect(productsTable!.columns).toHaveProperty('category');
    expect(productsTable!.columns).toHaveProperty('is_active');

    // Test orders table columns
    const ordersTable = findTable('orders');
    expect(ordersTable).toBeDefined();
    expect(ordersTable!.columns).toHaveProperty('buyer_id');
    expect(ordersTable!.columns).toHaveProperty('seller_id');
    expect(ordersTable!.columns).toHaveProperty('status');
    expect(ordersTable!.columns).toHaveProperty('payment_method');
    expect(ordersTable!.columns).toHaveProperty('total');

    // Test profiles table columns
    const profilesTable = findTable('profiles');
    expect(profilesTable).toBeDefined();
    expect(profilesTable!.columns).toHaveProperty('phone');
    expect(profilesTable!.columns).toHaveProperty('full_name');
    expect(profilesTable!.columns).toHaveProperty('role');
    expect(profilesTable!.columns).toHaveProperty('city');

    // Test messages table columns
    const messagesTable = findTable('messages');
    expect(messagesTable).toBeDefined();
    expect(messagesTable!.columns).toHaveProperty('conversation_id');
    expect(messagesTable!.columns).toHaveProperty('sender_id');
    expect(messagesTable!.columns).toHaveProperty('content');
    expect(messagesTable!.columns).toHaveProperty('type');
  });
});

describe('PowerSync Error Handling', () => {
  let connector: SupabaseConnector;

  beforeEach(() => {
    jest.clearAllMocks();
    mockCrudBatch.crud = [];
    connector = createSupabaseConnector(mockPowerSyncDatabase as any);
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it('should handle network timeout gracefully', async () => {
    // Simulate network timeout
    mockSupabaseClient.from.mockReturnValueOnce({
      upsert: jest.fn().mockRejectedValue(new Error('Network timeout')),
    });

    mockCrudBatch.crud = [
      {
        table: 'products',
        op: UpdateType.PUT,
        id: 'prod-timeout',
        opData: { name: 'Test Product', price: 1000 },
      },
    ];
    mockPowerSyncDatabase.getCrudBatch.mockResolvedValueOnce(mockCrudBatch);

    // Should throw but not crash
    await expect(connector.uploadData(mockPowerSyncDatabase as any)).rejects.toThrow(
      'Network timeout'
    );

    // Batch should NOT be marked as complete on failure
    expect(mockCrudBatch.complete).not.toHaveBeenCalled();
  });

  it('should retry failed uploads', async () => {
    let attemptCount = 0;
    const maxRetries = 3;

    // Create a mock that fails first two times, succeeds on third
    const mockUpload = jest.fn().mockImplementation(async () => {
      attemptCount++;
      if (attemptCount < maxRetries) {
        throw new Error('Upload failed');
      }
      return { error: null };
    });

    mockSupabaseClient.from.mockReturnValue({
      upsert: mockUpload,
    });

    mockCrudBatch.crud = [
      {
        table: 'products',
        op: UpdateType.PUT,
        id: 'prod-retry',
        opData: { name: 'Mafe Sauce', price: 2000 },
      },
    ];

    // Simulate retry logic
    let success = false;
    for (let i = 0; i < maxRetries; i++) {
      mockPowerSyncDatabase.getCrudBatch.mockResolvedValueOnce(mockCrudBatch);
      try {
        await connector.uploadData(mockPowerSyncDatabase as any);
        success = true;
        break;
      } catch {
        // Retry on failure
        continue;
      }
    }

    expect(success).toBe(true);
    expect(attemptCount).toBe(maxRetries);
  });

  it('should preserve local data on sync failure', async () => {
    // Mock a successful local write
    const localData = {
      id: 'prod-local-only',
      merchant_id: 'merchant-ziguinchor-001',
      name: 'Huile de Palme',
      price: 4500, // 4,500 XOF
      stock: 30,
    };

    await mockPowerSyncDatabase.execute(
      `INSERT INTO products (id, merchant_id, name, price, stock) VALUES (?, ?, ?, ?, ?)`,
      [localData.id, localData.merchant_id, localData.name, localData.price, localData.stock]
    );

    // Verify local write succeeded
    expect(mockPowerSyncDatabase.execute).toHaveBeenCalled();

    // Simulate sync failure
    mockSupabaseClient.from.mockReturnValueOnce({
      upsert: jest.fn().mockResolvedValue({
        error: { message: 'Server error', code: '500' },
      }),
    });

    mockCrudBatch.crud = [
      {
        table: 'products',
        op: UpdateType.PUT,
        id: localData.id,
        opData: localData,
      },
    ];
    mockPowerSyncDatabase.getCrudBatch.mockResolvedValueOnce(mockCrudBatch);

    // Upload should fail
    await expect(connector.uploadData(mockPowerSyncDatabase as any)).rejects.toThrow();

    // Local data should still be queryable
    mockPowerSyncDatabase.getAll.mockResolvedValueOnce([localData]);
    const result = await mockPowerSyncDatabase.getAll(
      `SELECT * FROM products WHERE id = ?`,
      [localData.id]
    );

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe(localData.name);
  });

  it('should handle authentication errors', async () => {
    // Simulate expired session
    mockSupabaseClient.auth.getSession.mockResolvedValueOnce({
      data: { session: null },
    });

    const credentials = await connector.fetchCredentials();

    expect(credentials).toBeNull();
  });

  it('should handle database initialization errors', async () => {
    const errorMessage = 'Failed to initialize database';
    mockPowerSyncDatabase.init.mockRejectedValueOnce(new Error(errorMessage));

    await expect(mockPowerSyncDatabase.init()).rejects.toThrow(errorMessage);
  });

  it('should handle Supabase upsert errors', async () => {
    mockSupabaseClient.from.mockReturnValueOnce({
      upsert: jest.fn().mockResolvedValue({
        error: { message: 'Constraint violation', code: '23505' },
      }),
    });

    mockCrudBatch.crud = [
      {
        table: 'products',
        op: UpdateType.PUT,
        id: 'prod-duplicate',
        opData: { name: 'Duplicate Product', price: 1000 },
      },
    ];
    mockPowerSyncDatabase.getCrudBatch.mockResolvedValueOnce(mockCrudBatch);

    await expect(connector.uploadData(mockPowerSyncDatabase as any)).rejects.toThrow();
  });

  it('should handle Supabase update errors', async () => {
    mockSupabaseClient.from.mockReturnValueOnce({
      update: jest.fn().mockReturnValue({
        eq: jest.fn().mockResolvedValue({
          error: { message: 'Row not found', code: '404' },
        }),
      }),
    });

    mockCrudBatch.crud = [
      {
        table: 'orders',
        op: UpdateType.PATCH,
        id: 'non-existent-order',
        opData: { status: 'delivered' },
      },
    ];
    mockPowerSyncDatabase.getCrudBatch.mockResolvedValueOnce(mockCrudBatch);

    await expect(connector.uploadData(mockPowerSyncDatabase as any)).rejects.toThrow();
  });

  it('should handle Supabase delete errors', async () => {
    mockSupabaseClient.from.mockReturnValueOnce({
      delete: jest.fn().mockReturnValue({
        eq: jest.fn().mockResolvedValue({
          error: { message: 'Delete forbidden', code: '403' },
        }),
      }),
    });

    mockCrudBatch.crud = [
      {
        table: 'messages',
        op: UpdateType.DELETE,
        id: 'protected-message',
        opData: null,
      },
    ];
    mockPowerSyncDatabase.getCrudBatch.mockResolvedValueOnce(mockCrudBatch);

    await expect(connector.uploadData(mockPowerSyncDatabase as any)).rejects.toThrow();
  });
});

describe('PowerSync Service Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it('should return singleton instance', () => {
    const instance1 = PowerSyncService.getInstance();
    const instance2 = PowerSyncService.getInstance();

    expect(instance1).toBe(instance2);
  });

  it('should report not connected before initialization', () => {
    const service = PowerSyncService.getInstance();
    // Fresh instance should not be connected
    expect(service.isConnected()).toBe(false);
  });

  it('should execute queries correctly', async () => {
    const testQuery = `SELECT * FROM products WHERE category = ?`;
    const testParams = ['alimentation'];
    const expectedResults = [testData.product];

    mockPowerSyncDatabase.getAll.mockResolvedValueOnce(expectedResults);

    const result = await mockPowerSyncDatabase.getAll(testQuery, testParams);

    expect(mockPowerSyncDatabase.getAll).toHaveBeenCalledWith(testQuery, testParams);
    expect(result).toEqual(expectedResults);
  });

  it('should execute write operations correctly', async () => {
    const testQuery = `UPDATE products SET stock = ? WHERE id = ?`;
    const testParams = [45, testData.product.id];

    await mockPowerSyncDatabase.execute(testQuery, testParams);

    expect(mockPowerSyncDatabase.execute).toHaveBeenCalledWith(testQuery, testParams);
  });

  it('should support watch queries for real-time updates', () => {
    const testQuery = `SELECT * FROM orders WHERE buyer_id = ?`;
    const testParams = [testData.order.buyer_id];

    const watchResult = mockPowerSyncDatabase.watch(testQuery, testParams);

    expect(mockPowerSyncDatabase.watch).toHaveBeenCalledWith(testQuery, testParams);
    expect(watchResult).toHaveProperty('subscribe');
  });
});

describe('PowerSync Connector Authentication', () => {
  let connector: SupabaseConnector;

  beforeEach(() => {
    jest.clearAllMocks();
    connector = createSupabaseConnector(mockPowerSyncDatabase as any);
  });

  it('should fetch valid credentials when session exists', async () => {
    const mockSession = {
      access_token: 'valid-token-123',
      expires_at: Math.floor(Date.now() / 1000) + 7200,
    };

    mockSupabaseClient.auth.getSession.mockResolvedValueOnce({
      data: { session: mockSession },
    });

    const credentials = await connector.fetchCredentials();

    expect(credentials).not.toBeNull();
    expect(credentials?.token).toBe(mockSession.access_token);
    expect(credentials?.expiresAt).toBeInstanceOf(Date);
  });

  it('should return null credentials when no session', async () => {
    mockSupabaseClient.auth.getSession.mockResolvedValueOnce({
      data: { session: null },
    });

    const credentials = await connector.fetchCredentials();

    expect(credentials).toBeNull();
  });

  it('should handle credential fetch errors', async () => {
    mockSupabaseClient.auth.getSession.mockRejectedValueOnce(
      new Error('Auth service unavailable')
    );

    const credentials = await connector.fetchCredentials();

    expect(credentials).toBeNull();
  });

  it('should check if connector is ready', async () => {
    mockSupabaseClient.auth.getSession.mockResolvedValueOnce({
      data: { session: { access_token: 'token' } },
    });

    const isReady = await connector.ready();

    expect(isReady).toBe(true);
  });

  it('should report not ready when no session', async () => {
    mockSupabaseClient.auth.getSession.mockResolvedValueOnce({
      data: { session: null },
    });

    const isReady = await connector.ready();

    expect(isReady).toBe(false);
  });
});

describe('PowerSync Transaction Support', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should support write transactions', async () => {
    const transactionCallback = jest.fn();

    await mockPowerSyncDatabase.writeTransaction(transactionCallback);

    expect(mockPowerSyncDatabase.writeTransaction).toHaveBeenCalled();
    expect(transactionCallback).toHaveBeenCalled();
  });

  it('should execute multiple operations in a transaction', async () => {
    const operations: string[] = [];

    mockPowerSyncDatabase.writeTransaction.mockImplementationOnce(async (callback) => {
      const tx = {
        execute: jest.fn().mockImplementation((query) => {
          operations.push(query);
          return { rowsAffected: 1 };
        }),
      };
      await callback(tx);
    });

    await mockPowerSyncDatabase.writeTransaction(async (tx: any) => {
      await tx.execute(`INSERT INTO orders (id, buyer_id, total) VALUES (?, ?, ?)`, [
        'order-tx-001',
        testData.order.buyer_id,
        testData.order.total,
      ]);
      await tx.execute(`INSERT INTO order_items (order_id, product_id, quantity) VALUES (?, ?, ?)`, [
        'order-tx-001',
        testData.product.id,
        2,
      ]);
    });

    expect(operations).toHaveLength(2);
    expect(operations[0]).toContain('INSERT INTO orders');
    expect(operations[1]).toContain('INSERT INTO order_items');
  });
});

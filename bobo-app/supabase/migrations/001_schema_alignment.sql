-- BOBO Schema Alignment Migration
-- Aligns Supabase tables with PowerSync schema expectations
-- Run this migration to sync deployed Supabase with PowerSync schema.ts
--
-- This migration is ADDITIVE and maintains backwards compatibility

BEGIN;

-- ============================================================================
-- PROFILES TABLE UPDATES
-- ============================================================================
-- PowerSync expects: 'buyer' | 'seller' | 'delivery'
-- Current SQL has: 'customer' | 'merchant' | 'delivery' | 'admin'
-- Solution: Accept both naming conventions for backwards compatibility
-- Note: Only update if role column exists (some deployments may not have it)

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'profiles' AND column_name = 'role') THEN
    ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
    ALTER TABLE profiles ADD CONSTRAINT profiles_role_check
      CHECK (role IN ('customer', 'merchant', 'delivery', 'admin', 'buyer', 'seller'));
  END IF;
END $$;

-- ============================================================================
-- PRODUCTS TABLE UPDATES
-- ============================================================================
-- PowerSync expects 'title' column - already exists in local schema.sql
-- If your deployed Supabase uses 'name' instead, uncomment below:

-- Option A: Add 'title' as computed column if 'name' exists
-- DO $$
-- BEGIN
--   IF EXISTS (SELECT 1 FROM information_schema.columns
--              WHERE table_name = 'products' AND column_name = 'name')
--   AND NOT EXISTS (SELECT 1 FROM information_schema.columns
--              WHERE table_name = 'products' AND column_name = 'title') THEN
--     ALTER TABLE products ADD COLUMN title TEXT GENERATED ALWAYS AS (name) STORED;
--   END IF;
-- END $$;

-- Option B: Rename 'name' to 'title' (breaking change)
-- ALTER TABLE products RENAME COLUMN name TO title;

-- Ensure all expected columns exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'products' AND column_name = 'discount_price') THEN
    ALTER TABLE products ADD COLUMN discount_price INTEGER;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'products' AND column_name = 'upvotes') THEN
    ALTER TABLE products ADD COLUMN upvotes INTEGER DEFAULT 0;
  END IF;
END $$;

-- ============================================================================
-- ORDER_ITEMS TABLE
-- ============================================================================
-- PowerSync expects: order_id, product_id, quantity, unit_price, total_price

CREATE TABLE IF NOT EXISTS order_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price INTEGER NOT NULL,
  total_price INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add indexes for PowerSync sync performance
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_product ON order_items(product_id);

-- Enable RLS
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;

-- RLS Policies for order_items
DROP POLICY IF EXISTS "Order items visible to order participants" ON order_items;
CREATE POLICY "Order items visible to order participants" ON order_items
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM orders
      WHERE orders.id = order_items.order_id
      AND auth.uid() IN (orders.buyer_id, orders.seller_id)
    )
  );

DROP POLICY IF EXISTS "Buyers can create order items" ON order_items;
CREATE POLICY "Buyers can create order items" ON order_items
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM orders
      WHERE orders.id = order_items.order_id
      AND auth.uid() = orders.buyer_id
    )
  );

-- ============================================================================
-- ORDERS TABLE UPDATES
-- ============================================================================
-- PowerSync expects: buyer_id, seller_id, status, payment_method, payment_status,
--                    subtotal, shipping_cost, total, delivery_method,
--                    delivery_address, delivery_phone

-- Update status check to include all PowerSync expected values
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_status_check
  CHECK (status IN (
    'pending', 'confirmed', 'preparing', 'ready', 'shipped',
    'picked_up', 'delivering', 'delivered', 'cancelled'
  ));

-- Update payment_method to include PowerSync expected values
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_payment_method_check;
ALTER TABLE orders ADD CONSTRAINT orders_payment_method_check
  CHECK (payment_method IN (
    'cash', 'mobile_money', 'card', 'orange_money', 'wave'
  ));

-- Update delivery_method to include PowerSync expected values
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_delivery_method_check;
ALTER TABLE orders ADD CONSTRAINT orders_delivery_method_check
  CHECK (delivery_method IN (
    'pickup', 'delivery', 'bobo_delivery', 'merchant_delivery'
  ));

-- Ensure all payment fields exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'orders' AND column_name = 'payment_status') THEN
    ALTER TABLE orders ADD COLUMN payment_status TEXT DEFAULT 'pending'
      CHECK (payment_status IN ('pending', 'paid', 'failed', 'refunded'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'orders' AND column_name = 'subtotal') THEN
    ALTER TABLE orders ADD COLUMN subtotal INTEGER NOT NULL DEFAULT 0;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'orders' AND column_name = 'shipping_cost') THEN
    ALTER TABLE orders ADD COLUMN shipping_cost INTEGER DEFAULT 0;
  END IF;
END $$;

-- ============================================================================
-- CONVERSATIONS TABLE
-- ============================================================================
-- PowerSync expects: buyer_id, seller_id, order_id, last_message_at

CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  buyer_id UUID NOT NULL REFERENCES profiles(id),
  seller_id UUID NOT NULL REFERENCES profiles(id),
  order_id UUID REFERENCES orders(id),
  last_message_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(buyer_id, seller_id, order_id)
);

-- Indexes for PowerSync sync performance
CREATE INDEX IF NOT EXISTS idx_conversations_buyer ON conversations(buyer_id);
CREATE INDEX IF NOT EXISTS idx_conversations_seller ON conversations(seller_id);
CREATE INDEX IF NOT EXISTS idx_conversations_order ON conversations(order_id);

-- Enable RLS
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;

-- RLS Policies for conversations
DROP POLICY IF EXISTS "Conversation participants can view" ON conversations;
CREATE POLICY "Conversation participants can view" ON conversations
  FOR SELECT USING (auth.uid() IN (buyer_id, seller_id));

DROP POLICY IF EXISTS "Users can create conversations" ON conversations;
CREATE POLICY "Users can create conversations" ON conversations
  FOR INSERT WITH CHECK (auth.uid() IN (buyer_id, seller_id));

-- ============================================================================
-- MESSAGES TABLE
-- ============================================================================
-- PowerSync expects: conversation_id, sender_id, content, type, metadata,
--                    read_at, created_at
-- Type values: 'text' | 'image' | 'audio' | 'location'

CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES profiles(id),
  content TEXT,
  type TEXT DEFAULT 'text' CHECK (type IN ('text', 'image', 'audio', 'voice', 'location', 'product', 'order')),
  metadata JSONB,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for PowerSync sync performance
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at);

-- Enable RLS
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- RLS Policies for messages
DROP POLICY IF EXISTS "Message participants can view" ON messages;
CREATE POLICY "Message participants can view" ON messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM conversations
      WHERE conversations.id = messages.conversation_id
      AND auth.uid() IN (conversations.buyer_id, conversations.seller_id)
    )
  );

DROP POLICY IF EXISTS "Conversation participants can send messages" ON messages;
CREATE POLICY "Conversation participants can send messages" ON messages
  FOR INSERT WITH CHECK (
    auth.uid() = sender_id AND
    EXISTS (
      SELECT 1 FROM conversations
      WHERE conversations.id = messages.conversation_id
      AND auth.uid() IN (conversations.buyer_id, conversations.seller_id)
    )
  );

-- ============================================================================
-- REVIEWS TABLE
-- ============================================================================
-- PowerSync expects: product_id, buyer_id, order_id, rating (1-5), comment

CREATE TABLE IF NOT EXISTS reviews (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  buyer_id UUID NOT NULL REFERENCES profiles(id),
  order_id UUID REFERENCES orders(id),
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT,
  images TEXT[],
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(buyer_id, product_id, order_id)
);

-- Indexes for PowerSync sync performance
CREATE INDEX IF NOT EXISTS idx_reviews_product ON reviews(product_id);
CREATE INDEX IF NOT EXISTS idx_reviews_buyer ON reviews(buyer_id);
CREATE INDEX IF NOT EXISTS idx_reviews_order ON reviews(order_id);

-- Enable RLS
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;

-- RLS Policies for reviews
DROP POLICY IF EXISTS "Public reviews" ON reviews;
CREATE POLICY "Public reviews" ON reviews FOR SELECT USING (true);

DROP POLICY IF EXISTS "Buyer reviews" ON reviews;
CREATE POLICY "Buyer reviews" ON reviews
  FOR INSERT WITH CHECK (
    auth.uid() = buyer_id AND
    EXISTS (
      SELECT 1 FROM orders
      WHERE orders.id = reviews.order_id
      AND orders.buyer_id = auth.uid()
      AND orders.status = 'delivered'
    )
  );

-- ============================================================================
-- LIVESTREAM_OVERLAY_STATE TABLE UPDATES
-- ============================================================================
-- PowerSync expects: merchant_id, show_qr, qr_code_data_url, current_product_id,
--                    product_title, product_price, updated_at

DO $$
BEGIN
  -- Add qr_code_data_url if not exists (PowerSync name)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'livestream_overlay_state'
                 AND column_name = 'qr_code_data_url') THEN
    ALTER TABLE livestream_overlay_state ADD COLUMN qr_code_data_url TEXT;
  END IF;

  -- Add product_title if not exists (PowerSync name)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'livestream_overlay_state'
                 AND column_name = 'product_title') THEN
    ALTER TABLE livestream_overlay_state ADD COLUMN product_title TEXT;
  END IF;

  -- Add product_price as TEXT if not exists (PowerSync expects text)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'livestream_overlay_state'
                 AND column_name = 'product_price_text') THEN
    ALTER TABLE livestream_overlay_state ADD COLUMN product_price_text TEXT;
  END IF;
END $$;

-- Create view/trigger to sync old and new column names
CREATE OR REPLACE FUNCTION sync_overlay_columns()
RETURNS TRIGGER AS $$
BEGIN
  -- Sync qr_code_url <-> qr_code_data_url
  IF NEW.qr_code_url IS NOT NULL AND NEW.qr_code_data_url IS NULL THEN
    NEW.qr_code_data_url := NEW.qr_code_url;
  ELSIF NEW.qr_code_data_url IS NOT NULL AND NEW.qr_code_url IS NULL THEN
    NEW.qr_code_url := NEW.qr_code_data_url;
  END IF;

  -- Sync product_name <-> product_title
  IF NEW.product_name IS NOT NULL AND NEW.product_title IS NULL THEN
    NEW.product_title := NEW.product_name;
  ELSIF NEW.product_title IS NOT NULL AND NEW.product_name IS NULL THEN
    NEW.product_name := NEW.product_title;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS sync_overlay_columns_trigger ON livestream_overlay_state;
CREATE TRIGGER sync_overlay_columns_trigger
  BEFORE INSERT OR UPDATE ON livestream_overlay_state
  FOR EACH ROW EXECUTE FUNCTION sync_overlay_columns();

-- ============================================================================
-- DELIVERY_REQUESTS TABLE UPDATES
-- ============================================================================
-- PowerSync expects delivery_person_id to reference profiles directly
-- Current schema references delivery_persons table
-- Solution: Add a column that references profiles for PowerSync compatibility

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'delivery_requests'
                 AND column_name = 'delivery_profile_id') THEN
    ALTER TABLE delivery_requests ADD COLUMN delivery_profile_id UUID REFERENCES profiles(id);
  END IF;

  -- Ensure estimated_time is TEXT for PowerSync compatibility
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'delivery_requests'
             AND column_name = 'estimated_time'
             AND data_type = 'integer') THEN
    ALTER TABLE delivery_requests ADD COLUMN estimated_time_text TEXT;
  END IF;
END $$;

-- Create index for new column
CREATE INDEX IF NOT EXISTS idx_delivery_requests_profile ON delivery_requests(delivery_profile_id);

-- ============================================================================
-- ENABLE REALTIME FOR NEW TABLES
-- ============================================================================
DO $$
BEGIN
  -- Enable realtime for conversations
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'conversations'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE conversations;
  END IF;

  -- Enable realtime for reviews
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'reviews'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE reviews;
  END IF;

  -- Enable realtime for order_items
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'order_items'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE order_items;
  END IF;
END $$;

-- ============================================================================
-- POWERSYNC SYNC RULES HELPER FUNCTION
-- ============================================================================
-- This function helps PowerSync determine what data to sync for each user

CREATE OR REPLACE FUNCTION get_user_sync_data(user_id UUID)
RETURNS TABLE (
  table_name TEXT,
  filter_column TEXT,
  filter_value UUID
) AS $$
BEGIN
  RETURN QUERY VALUES
    ('profiles'::TEXT, 'id'::TEXT, user_id),
    ('products'::TEXT, 'merchant_id'::TEXT, user_id),
    ('orders'::TEXT, 'buyer_id'::TEXT, user_id),
    ('orders'::TEXT, 'seller_id'::TEXT, user_id),
    ('order_items'::TEXT, 'order_id'::TEXT, user_id),
    ('conversations'::TEXT, 'buyer_id'::TEXT, user_id),
    ('conversations'::TEXT, 'seller_id'::TEXT, user_id),
    ('messages'::TEXT, 'sender_id'::TEXT, user_id),
    ('reviews'::TEXT, 'buyer_id'::TEXT, user_id),
    ('delivery_requests'::TEXT, 'delivery_profile_id'::TEXT, user_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- MIGRATION NOTES
-- ============================================================================
--
-- BACKWARDS COMPATIBILITY:
-- - All changes are additive (no columns removed)
-- - CHECK constraints expanded to include both old and new values
-- - Trigger syncs old/new column names for livestream_overlay_state
--
-- POWERSYNC EXPECTATIONS MET:
-- - products.title: Exists (if deployed with 'name', uncomment Option A or B above)
-- - order_items: Created with all expected columns
-- - conversations: Created with all expected columns
-- - messages: Created with expanded type values including 'audio' and 'location'
-- - reviews: Created with all expected columns and proper constraints
-- - orders: Payment fields ensured, constraints expanded
--
-- POST-MIGRATION:
-- 1. Update PowerSync sync rules to include new tables
-- 2. Test offline sync functionality
-- 3. Update RN app to use new table structures
--
-- ============================================================================

COMMIT;

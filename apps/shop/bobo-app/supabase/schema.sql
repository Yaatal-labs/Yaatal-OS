-- BOBO: Social Commerce for African SMBs
-- Supabase Schema - Commerce Focused

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- PROFILES
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  phone TEXT UNIQUE NOT NULL,
  full_name TEXT,
  avatar_url TEXT,
  role TEXT DEFAULT 'customer' CHECK (role IN ('customer', 'merchant', 'delivery', 'admin')),
  shop_name TEXT,
  shop_description TEXT,
  seller_rating DECIMAL(2,1) DEFAULT 0,
  total_sales INTEGER DEFAULT 0,
  city TEXT,
  neighborhood TEXT,
  coordinates JSONB,
  is_verified BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- PRODUCTS
CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  merchant_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  price INTEGER NOT NULL CHECK (price >= 0),
  discount_price INTEGER,
  stock INTEGER DEFAULT 0,
  category TEXT,
  images TEXT[],
  is_active BOOLEAN DEFAULT TRUE,
  upvotes INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ORDERS
CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  buyer_id UUID NOT NULL REFERENCES profiles(id),
  seller_id UUID NOT NULL REFERENCES profiles(id),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','confirmed','preparing','ready','picked_up','delivering','delivered','cancelled')),
  payment_method TEXT CHECK (payment_method IN ('orange_money', 'wave', 'cash')),
  payment_status TEXT DEFAULT 'pending' CHECK (payment_status IN ('pending', 'paid', 'failed', 'refunded')),
  payment_reference TEXT,
  subtotal INTEGER NOT NULL,
  shipping_cost INTEGER DEFAULT 0,
  total INTEGER NOT NULL,
  delivery_method TEXT CHECK (delivery_method IN ('bobo_delivery', 'merchant_delivery', 'pickup')),
  delivery_address TEXT,
  delivery_phone TEXT,
  delivery_notes TEXT,
  qr_scan_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ORDER ITEMS
CREATE TABLE order_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price INTEGER NOT NULL,
  total_price INTEGER NOT NULL
);

-- DELIVERY PERSONS
CREATE TABLE delivery_persons (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID UNIQUE NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  vehicle_type TEXT CHECK (vehicle_type IN ('motorcycle', 'bicycle', 'car', 'foot')),
  zones TEXT[],
  is_available BOOLEAN DEFAULT FALSE,
  current_location JSONB,
  rating DECIMAL(2,1) DEFAULT 0,
  total_deliveries INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- DELIVERY REQUESTS
CREATE TABLE delivery_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  delivery_person_id UUID REFERENCES delivery_persons(id),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','accepted','picked_up','in_transit','delivered','failed')),
  pickup_location TEXT,
  dropoff_location TEXT,
  estimated_time INTEGER,
  actual_time INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- LIVESTREAM QR SCANS
CREATE TABLE livestream_qr_scans (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  merchant_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  platform TEXT CHECK (platform IN ('tiktok', 'instagram', 'facebook', 'youtube')),
  scanned_at TIMESTAMPTZ DEFAULT NOW(),
  device_info JSONB,
  converted BOOLEAN DEFAULT FALSE,
  order_id UUID REFERENCES orders(id),
  session_duration INTEGER
);

-- LIVESTREAM OVERLAY STATE
CREATE TABLE livestream_overlay_state (
  merchant_id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  is_live BOOLEAN DEFAULT FALSE,
  current_product_id UUID REFERENCES products(id),
  qr_code_url TEXT,
  product_name TEXT,
  product_price INTEGER,
  show_qr BOOLEAN DEFAULT FALSE,
  platform TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- CONVERSATIONS
CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  buyer_id UUID NOT NULL REFERENCES profiles(id),
  seller_id UUID NOT NULL REFERENCES profiles(id),
  order_id UUID REFERENCES orders(id),
  last_message_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- MESSAGES
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES profiles(id),
  content TEXT,
  type TEXT DEFAULT 'text' CHECK (type IN ('text', 'image', 'voice', 'product', 'order')),
  metadata JSONB,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- REVIEWS
CREATE TABLE reviews (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  buyer_id UUID NOT NULL REFERENCES profiles(id),
  order_id UUID REFERENCES orders(id),
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT,
  images TEXT[],
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- INDEXES
CREATE INDEX idx_profiles_phone ON profiles(phone);
CREATE INDEX idx_profiles_role ON profiles(role);
CREATE INDEX idx_products_merchant ON products(merchant_id);
CREATE INDEX idx_orders_buyer ON orders(buyer_id);
CREATE INDEX idx_orders_seller ON orders(seller_id);
CREATE INDEX idx_qr_scans_merchant ON livestream_qr_scans(merchant_id);
CREATE INDEX idx_messages_conversation ON messages(conversation_id);

-- REALTIME
ALTER PUBLICATION supabase_realtime ADD TABLE livestream_overlay_state;
ALTER PUBLICATION supabase_realtime ADD TABLE messages;

-- RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_persons ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE livestream_qr_scans ENABLE ROW LEVEL SECURITY;
ALTER TABLE livestream_overlay_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;

-- POLICIES
CREATE POLICY "Public profiles" ON profiles FOR SELECT USING (true);
CREATE POLICY "Own profile" ON profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Public products" ON products FOR SELECT USING (true);
CREATE POLICY "Merchant products" ON products FOR ALL USING (auth.uid() = merchant_id);
CREATE POLICY "Own orders" ON orders FOR SELECT USING (auth.uid() IN (buyer_id, seller_id));
CREATE POLICY "Create orders" ON orders FOR INSERT WITH CHECK (auth.uid() = buyer_id);
CREATE POLICY "Merchant scans" ON livestream_qr_scans FOR SELECT USING (auth.uid() = merchant_id);
CREATE POLICY "Create scans" ON livestream_qr_scans FOR INSERT WITH CHECK (true);
CREATE POLICY "Merchant overlay" ON livestream_overlay_state FOR ALL USING (auth.uid() = merchant_id);
CREATE POLICY "Public reviews" ON reviews FOR SELECT USING (true);
CREATE POLICY "Buyer reviews" ON reviews FOR INSERT WITH CHECK (auth.uid() = buyer_id);

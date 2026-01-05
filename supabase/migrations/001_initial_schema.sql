-- Vilkas Analytics - ePages Data Schema
-- Based on ePages Now API structure

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- STORES (ePages shops)
-- ============================================
CREATE TABLE stores (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    epages_shop_id TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    domain TEXT,
    currency TEXT DEFAULT 'EUR',
    locale TEXT DEFAULT 'fi_FI',
    access_token TEXT, -- encrypted in production
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- CUSTOMERS
-- ============================================
CREATE TABLE customers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    store_id UUID REFERENCES stores(id) ON DELETE CASCADE,
    epages_customer_id TEXT NOT NULL,
    customer_number TEXT,

    -- Billing address
    company TEXT,
    salutation TEXT,
    first_name TEXT,
    last_name TEXT,
    street TEXT,
    street_details TEXT,
    zip_code TEXT,
    city TEXT,
    state TEXT,
    country TEXT,
    email TEXT,
    phone TEXT,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(store_id, epages_customer_id)
);

-- ============================================
-- PRODUCTS
-- ============================================
CREATE TABLE products (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    store_id UUID REFERENCES stores(id) ON DELETE CASCADE,
    epages_product_id TEXT NOT NULL,
    product_number TEXT,

    name TEXT NOT NULL,
    description TEXT,
    short_description TEXT,

    -- Pricing
    price_amount DECIMAL(10,2),
    price_currency TEXT DEFAULT 'EUR',
    tax_rate DECIMAL(5,2),

    -- Inventory
    stock_level INTEGER DEFAULT 0,
    min_stock_level INTEGER DEFAULT 0,
    for_sale BOOLEAN DEFAULT true,

    -- Attributes
    manufacturer TEXT,
    ean TEXT,

    -- Category
    category_id TEXT,
    category_name TEXT,

    -- Media
    image_url TEXT,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(store_id, epages_product_id)
);

-- ============================================
-- ORDERS
-- ============================================
CREATE TABLE orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    store_id UUID REFERENCES stores(id) ON DELETE CASCADE,
    customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,

    epages_order_id TEXT NOT NULL,
    order_number TEXT,

    -- Status & Dates
    status TEXT DEFAULT 'pending', -- pending, paid, shipped, delivered, cancelled
    creation_date TIMESTAMPTZ NOT NULL,
    paid_on TIMESTAMPTZ,
    dispatched_on TIMESTAMPTZ,
    delivered_on TIMESTAMPTZ,
    closed_on TIMESTAMPTZ,

    -- Pricing
    grand_total DECIMAL(10,2) NOT NULL,
    total_before_tax DECIMAL(10,2),
    total_tax DECIMAL(10,2),
    shipping_price DECIMAL(10,2) DEFAULT 0,
    discount_amount DECIMAL(10,2) DEFAULT 0,

    currency TEXT DEFAULT 'EUR',

    -- Billing Address
    billing_company TEXT,
    billing_first_name TEXT,
    billing_last_name TEXT,
    billing_street TEXT,
    billing_zip_code TEXT,
    billing_city TEXT,
    billing_country TEXT,
    billing_email TEXT,

    -- Shipping Address
    shipping_company TEXT,
    shipping_first_name TEXT,
    shipping_last_name TEXT,
    shipping_street TEXT,
    shipping_zip_code TEXT,
    shipping_city TEXT,
    shipping_country TEXT,

    -- Payment
    payment_method TEXT,
    payment_transaction_id TEXT,

    -- Shipping
    shipping_method TEXT,

    -- Metadata
    locale TEXT,
    note TEXT,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(store_id, epages_order_id)
);

-- ============================================
-- ORDER LINE ITEMS
-- ============================================
CREATE TABLE order_line_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
    product_id UUID REFERENCES products(id) ON DELETE SET NULL,

    epages_line_item_id TEXT,
    product_number TEXT,
    product_name TEXT NOT NULL,

    quantity INTEGER NOT NULL DEFAULT 1,
    unit_price DECIMAL(10,2) NOT NULL,
    total_price DECIMAL(10,2) NOT NULL,

    tax_rate DECIMAL(5,2),
    tax_amount DECIMAL(10,2),

    -- Discount
    discount_amount DECIMAL(10,2) DEFAULT 0,

    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- INDEXES for Performance
-- ============================================
CREATE INDEX idx_orders_store_id ON orders(store_id);
CREATE INDEX idx_orders_creation_date ON orders(creation_date);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_customer_id ON orders(customer_id);

CREATE INDEX idx_order_line_items_order_id ON order_line_items(order_id);
CREATE INDEX idx_order_line_items_product_id ON order_line_items(product_id);

CREATE INDEX idx_products_store_id ON products(store_id);
CREATE INDEX idx_products_category ON products(category_id);

CREATE INDEX idx_customers_store_id ON customers(store_id);
CREATE INDEX idx_customers_email ON customers(email);

-- ============================================
-- ANALYTICS VIEWS
-- ============================================

-- Daily sales summary
CREATE VIEW v_daily_sales AS
SELECT
    store_id,
    DATE(creation_date) as sale_date,
    COUNT(*) as order_count,
    SUM(grand_total) as total_revenue,
    AVG(grand_total) as avg_order_value,
    SUM(total_tax) as total_tax,
    COUNT(DISTINCT customer_id) as unique_customers
FROM orders
WHERE status NOT IN ('cancelled')
GROUP BY store_id, DATE(creation_date);

-- Monthly sales summary
CREATE VIEW v_monthly_sales AS
SELECT
    store_id,
    DATE_TRUNC('month', creation_date) as sale_month,
    COUNT(*) as order_count,
    SUM(grand_total) as total_revenue,
    AVG(grand_total) as avg_order_value,
    COUNT(DISTINCT customer_id) as unique_customers
FROM orders
WHERE status NOT IN ('cancelled')
GROUP BY store_id, DATE_TRUNC('month', creation_date);

-- Product sales summary
CREATE VIEW v_product_sales AS
SELECT
    p.store_id,
    p.id as product_id,
    p.name as product_name,
    p.category_name,
    COUNT(DISTINCT oli.order_id) as order_count,
    SUM(oli.quantity) as total_quantity_sold,
    SUM(oli.total_price) as total_revenue
FROM products p
LEFT JOIN order_line_items oli ON oli.product_id = p.id
LEFT JOIN orders o ON oli.order_id = o.id AND o.status NOT IN ('cancelled')
GROUP BY p.store_id, p.id, p.name, p.category_name;

-- ============================================
-- RLS POLICIES (enable later)
-- ============================================
-- ALTER TABLE stores ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE products ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE order_line_items ENABLE ROW LEVEL SECURITY;

-- ============================================
-- UPDATED_AT TRIGGER
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_stores_updated_at
    BEFORE UPDATE ON stores
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER tr_customers_updated_at
    BEFORE UPDATE ON customers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER tr_products_updated_at
    BEFORE UPDATE ON products
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER tr_orders_updated_at
    BEFORE UPDATE ON orders
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Vilkas Analytics - Analytics Views
-- Perustason raportit tilaus- ja tuotedatasta

-- ============================================
-- 1. PÄIVITTÄINEN MYYNTI
-- ============================================
DROP VIEW IF EXISTS v_daily_sales;
CREATE VIEW v_daily_sales AS
SELECT
    store_id,
    DATE(creation_date) as sale_date,
    COUNT(*) as order_count,
    SUM(grand_total) as total_revenue,
    ROUND(AVG(grand_total)::numeric, 2) as avg_order_value,
    SUM(total_tax) as total_tax,
    COUNT(DISTINCT billing_email) as unique_customers,
    currency
FROM orders
WHERE status NOT IN ('cancelled')
GROUP BY store_id, DATE(creation_date), currency
ORDER BY sale_date DESC;

-- ============================================
-- 2. VIIKOTTAINEN MYYNTI
-- ============================================
DROP VIEW IF EXISTS v_weekly_sales;
CREATE VIEW v_weekly_sales AS
SELECT
    store_id,
    DATE_TRUNC('week', creation_date)::date as week_start,
    COUNT(*) as order_count,
    SUM(grand_total) as total_revenue,
    ROUND(AVG(grand_total)::numeric, 2) as avg_order_value,
    COUNT(DISTINCT billing_email) as unique_customers,
    currency
FROM orders
WHERE status NOT IN ('cancelled')
GROUP BY store_id, DATE_TRUNC('week', creation_date), currency
ORDER BY week_start DESC;

-- ============================================
-- 3. KUUKAUSITTAINEN MYYNTI
-- ============================================
DROP VIEW IF EXISTS v_monthly_sales;
CREATE VIEW v_monthly_sales AS
SELECT
    store_id,
    DATE_TRUNC('month', creation_date)::date as sale_month,
    TO_CHAR(creation_date, 'YYYY-MM') as month_label,
    COUNT(*) as order_count,
    SUM(grand_total) as total_revenue,
    ROUND(AVG(grand_total)::numeric, 2) as avg_order_value,
    COUNT(DISTINCT billing_email) as unique_customers,
    currency
FROM orders
WHERE status NOT IN ('cancelled')
GROUP BY store_id, DATE_TRUNC('month', creation_date), TO_CHAR(creation_date, 'YYYY-MM'), currency
ORDER BY sale_month DESC;

-- ============================================
-- 4. TOP MYYDYT TUOTTEET
-- ============================================
DROP VIEW IF EXISTS v_top_products;
CREATE VIEW v_top_products AS
SELECT
    o.store_id,
    oli.product_name,
    oli.product_number,
    COUNT(DISTINCT oli.order_id) as order_count,
    SUM(oli.quantity) as total_quantity,
    SUM(oli.total_price) as total_revenue,
    ROUND(AVG(oli.unit_price)::numeric, 2) as avg_unit_price,
    o.currency
FROM order_line_items oli
JOIN orders o ON o.id = oli.order_id
WHERE o.status NOT IN ('cancelled')
GROUP BY o.store_id, oli.product_name, oli.product_number, o.currency
ORDER BY total_revenue DESC;

-- ============================================
-- 5. ASIAKKAAT MAITTAIN
-- ============================================
DROP VIEW IF EXISTS v_customer_geography;
CREATE VIEW v_customer_geography AS
SELECT
    store_id,
    COALESCE(billing_country, 'Unknown') as country,
    COALESCE(billing_city, 'Unknown') as city,
    COUNT(*) as order_count,
    COUNT(DISTINCT billing_email) as unique_customers,
    SUM(grand_total) as total_revenue,
    ROUND(AVG(grand_total)::numeric, 2) as avg_order_value,
    currency
FROM orders
WHERE status NOT IN ('cancelled')
GROUP BY store_id, billing_country, billing_city, currency
ORDER BY total_revenue DESC;

-- ============================================
-- 6. MYYNTI VIIKONPÄIVITTÄIN
-- ============================================
DROP VIEW IF EXISTS v_weekday_analysis;
CREATE VIEW v_weekday_analysis AS
SELECT
    store_id,
    EXTRACT(DOW FROM creation_date) as day_of_week,
    CASE EXTRACT(DOW FROM creation_date)
        WHEN 0 THEN 'Söndag'
        WHEN 1 THEN 'Måndag'
        WHEN 2 THEN 'Tisdag'
        WHEN 3 THEN 'Onsdag'
        WHEN 4 THEN 'Torsdag'
        WHEN 5 THEN 'Fredag'
        WHEN 6 THEN 'Lördag'
    END as weekday_name,
    COUNT(*) as order_count,
    SUM(grand_total) as total_revenue,
    ROUND(AVG(grand_total)::numeric, 2) as avg_order_value,
    currency
FROM orders
WHERE status NOT IN ('cancelled')
GROUP BY store_id, EXTRACT(DOW FROM creation_date), currency
ORDER BY day_of_week;

-- ============================================
-- 7. MYYNTI TUNNEITTAIN
-- ============================================
DROP VIEW IF EXISTS v_hourly_analysis;
CREATE VIEW v_hourly_analysis AS
SELECT
    store_id,
    EXTRACT(HOUR FROM creation_date) as hour_of_day,
    COUNT(*) as order_count,
    SUM(grand_total) as total_revenue,
    ROUND(AVG(grand_total)::numeric, 2) as avg_order_value,
    currency
FROM orders
WHERE status NOT IN ('cancelled')
GROUP BY store_id, EXTRACT(HOUR FROM creation_date), currency
ORDER BY hour_of_day;

-- ============================================
-- 8. MAKSUTAPAJAKAUMA
-- ============================================
DROP VIEW IF EXISTS v_payment_methods;
CREATE VIEW v_payment_methods AS
SELECT
    store_id,
    COALESCE(payment_method, 'Unknown') as payment_method,
    COUNT(*) as order_count,
    SUM(grand_total) as total_revenue,
    ROUND(AVG(grand_total)::numeric, 2) as avg_order_value,
    ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (PARTITION BY store_id), 1) as percentage,
    currency
FROM orders
WHERE status NOT IN ('cancelled')
GROUP BY store_id, payment_method, currency
ORDER BY order_count DESC;

-- ============================================
-- 9. TOIMITUSTAPAJAKAUMA
-- ============================================
DROP VIEW IF EXISTS v_shipping_methods;
CREATE VIEW v_shipping_methods AS
SELECT
    store_id,
    COALESCE(shipping_method, 'Unknown') as shipping_method,
    COUNT(*) as order_count,
    SUM(grand_total) as total_revenue,
    ROUND(AVG(grand_total)::numeric, 2) as avg_order_value,
    ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (PARTITION BY store_id), 1) as percentage,
    currency
FROM orders
WHERE status NOT IN ('cancelled')
GROUP BY store_id, shipping_method, currency
ORDER BY order_count DESC;

-- ============================================
-- 10. TILAUSSTATUSJAKAUMA
-- ============================================
DROP VIEW IF EXISTS v_order_status;
CREATE VIEW v_order_status AS
SELECT
    store_id,
    status,
    COUNT(*) as order_count,
    SUM(grand_total) as total_value,
    currency
FROM orders
GROUP BY store_id, status, currency
ORDER BY order_count DESC;

-- ============================================
-- 11. OSTOSKORIANALYYSI - TUOTTEET/TILAUS
-- ============================================
DROP VIEW IF EXISTS v_basket_analysis;
CREATE VIEW v_basket_analysis AS
SELECT
    o.store_id,
    o.id as order_id,
    o.order_number,
    o.grand_total,
    COUNT(oli.id) as items_count,
    SUM(oli.quantity) as total_quantity,
    o.creation_date,
    o.currency
FROM orders o
JOIN order_line_items oli ON oli.order_id = o.id
WHERE o.status NOT IN ('cancelled')
GROUP BY o.store_id, o.id, o.order_number, o.grand_total, o.creation_date, o.currency;

-- Keskimääräinen ostoskori
DROP VIEW IF EXISTS v_avg_basket;
CREATE VIEW v_avg_basket AS
SELECT
    store_id,
    ROUND(AVG(items_count)::numeric, 2) as avg_items_per_order,
    ROUND(AVG(total_quantity)::numeric, 2) as avg_quantity_per_order,
    ROUND(AVG(grand_total)::numeric, 2) as avg_order_value,
    COUNT(*) as total_orders,
    currency
FROM v_basket_analysis
GROUP BY store_id, currency;

-- ============================================
-- 12. TUOTEKATEGORIAT
-- ============================================
DROP VIEW IF EXISTS v_category_sales;
CREATE VIEW v_category_sales AS
SELECT
    p.store_id,
    COALESCE(p.category_name, 'Uncategorized') as category_name,
    COUNT(DISTINCT oli.order_id) as order_count,
    SUM(oli.quantity) as total_quantity,
    SUM(oli.total_price) as total_revenue,
    COUNT(DISTINCT p.id) as product_count,
    o.currency
FROM products p
LEFT JOIN order_line_items oli ON oli.product_number = p.product_number
LEFT JOIN orders o ON o.id = oli.order_id AND o.status NOT IN ('cancelled')
GROUP BY p.store_id, p.category_name, o.currency
ORDER BY total_revenue DESC NULLS LAST;

-- ============================================
-- 13. DASHBOARD YHTEENVETO (Executive Summary)
-- ============================================
DROP VIEW IF EXISTS v_dashboard_summary;
CREATE VIEW v_dashboard_summary AS
WITH today_stats AS (
    SELECT
        store_id,
        COUNT(*) as orders_today,
        COALESCE(SUM(grand_total), 0) as revenue_today,
        currency
    FROM orders
    WHERE DATE(creation_date) = CURRENT_DATE
    AND status NOT IN ('cancelled')
    GROUP BY store_id, currency
),
yesterday_stats AS (
    SELECT
        store_id,
        COUNT(*) as orders_yesterday,
        COALESCE(SUM(grand_total), 0) as revenue_yesterday,
        currency
    FROM orders
    WHERE DATE(creation_date) = CURRENT_DATE - 1
    AND status NOT IN ('cancelled')
    GROUP BY store_id, currency
),
this_month AS (
    SELECT
        store_id,
        COUNT(*) as orders_this_month,
        COALESCE(SUM(grand_total), 0) as revenue_this_month,
        currency
    FROM orders
    WHERE DATE_TRUNC('month', creation_date) = DATE_TRUNC('month', CURRENT_DATE)
    AND status NOT IN ('cancelled')
    GROUP BY store_id, currency
),
last_month AS (
    SELECT
        store_id,
        COUNT(*) as orders_last_month,
        COALESCE(SUM(grand_total), 0) as revenue_last_month,
        currency
    FROM orders
    WHERE DATE_TRUNC('month', creation_date) = DATE_TRUNC('month', CURRENT_DATE - INTERVAL '1 month')
    AND status NOT IN ('cancelled')
    GROUP BY store_id, currency
)
SELECT
    s.id as store_id,
    s.name as store_name,
    s.currency,
    COALESCE(t.orders_today, 0) as orders_today,
    COALESCE(t.revenue_today, 0) as revenue_today,
    COALESCE(y.orders_yesterday, 0) as orders_yesterday,
    COALESCE(y.revenue_yesterday, 0) as revenue_yesterday,
    CASE WHEN y.revenue_yesterday > 0
        THEN ROUND(((t.revenue_today - y.revenue_yesterday) / y.revenue_yesterday * 100)::numeric, 1)
        ELSE 0
    END as revenue_change_pct,
    COALESCE(tm.orders_this_month, 0) as orders_this_month,
    COALESCE(tm.revenue_this_month, 0) as revenue_this_month,
    COALESCE(lm.orders_last_month, 0) as orders_last_month,
    COALESCE(lm.revenue_last_month, 0) as revenue_last_month,
    CASE WHEN lm.revenue_last_month > 0
        THEN ROUND(((tm.revenue_this_month - lm.revenue_last_month) / lm.revenue_last_month * 100)::numeric, 1)
        ELSE 0
    END as mom_change_pct
FROM stores s
LEFT JOIN today_stats t ON t.store_id = s.id
LEFT JOIN yesterday_stats y ON y.store_id = s.id
LEFT JOIN this_month tm ON tm.store_id = s.id
LEFT JOIN last_month lm ON lm.store_id = s.id;

-- ============================================
-- 14. HIDAS VARASTO (ei myyntiä 30 päivään)
-- ============================================
DROP VIEW IF EXISTS v_slow_moving_products;
CREATE VIEW v_slow_moving_products AS
SELECT
    p.store_id,
    p.id as product_id,
    p.name as product_name,
    p.product_number,
    p.price_amount,
    p.stock_level,
    p.category_name,
    MAX(o.creation_date) as last_sale_date,
    CURRENT_DATE - MAX(o.creation_date)::date as days_since_last_sale
FROM products p
LEFT JOIN order_line_items oli ON oli.product_number = p.product_number
LEFT JOIN orders o ON o.id = oli.order_id AND o.status NOT IN ('cancelled')
WHERE p.for_sale = true
GROUP BY p.store_id, p.id, p.name, p.product_number, p.price_amount, p.stock_level, p.category_name
HAVING MAX(o.creation_date) IS NULL OR MAX(o.creation_date) < CURRENT_DATE - INTERVAL '30 days'
ORDER BY days_since_last_sale DESC NULLS FIRST;

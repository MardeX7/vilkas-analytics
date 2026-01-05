/**
 * Create Analytics Views in Supabase
 * Executes SQL statements one by one
 */

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://tlothekaphtiwvusgwzh.supabase.co'
const serviceRoleKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRsb3RoZWthcGh0aXd2dXNnd3poIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NzYxOTYwMCwiZXhwIjoyMDgzMTk1NjAwfQ.PxMeALq2SEylsXwybYAASYcxjtVBzjjiWFsiOulhQyY'

const supabase = createClient(supabaseUrl, serviceRoleKey)

// Views to create - each as a separate statement
const views = [
  // 1. Daily Sales
  `DROP VIEW IF EXISTS v_daily_sales`,
  `CREATE VIEW v_daily_sales AS
  SELECT store_id, DATE(creation_date) as sale_date, COUNT(*) as order_count,
    SUM(grand_total) as total_revenue, ROUND(AVG(grand_total)::numeric, 2) as avg_order_value,
    SUM(total_tax) as total_tax, COUNT(DISTINCT billing_email) as unique_customers, currency
  FROM orders WHERE status NOT IN ('cancelled')
  GROUP BY store_id, DATE(creation_date), currency ORDER BY sale_date DESC`,

  // 2. Weekly Sales
  `DROP VIEW IF EXISTS v_weekly_sales`,
  `CREATE VIEW v_weekly_sales AS
  SELECT store_id, DATE_TRUNC('week', creation_date)::date as week_start,
    COUNT(*) as order_count, SUM(grand_total) as total_revenue,
    ROUND(AVG(grand_total)::numeric, 2) as avg_order_value,
    COUNT(DISTINCT billing_email) as unique_customers, currency
  FROM orders WHERE status NOT IN ('cancelled')
  GROUP BY store_id, DATE_TRUNC('week', creation_date), currency ORDER BY week_start DESC`,

  // 3. Monthly Sales
  `DROP VIEW IF EXISTS v_monthly_sales`,
  `CREATE VIEW v_monthly_sales AS
  SELECT store_id, DATE_TRUNC('month', creation_date)::date as sale_month,
    TO_CHAR(creation_date, 'YYYY-MM') as month_label, COUNT(*) as order_count,
    SUM(grand_total) as total_revenue, ROUND(AVG(grand_total)::numeric, 2) as avg_order_value,
    COUNT(DISTINCT billing_email) as unique_customers, currency
  FROM orders WHERE status NOT IN ('cancelled')
  GROUP BY store_id, DATE_TRUNC('month', creation_date), TO_CHAR(creation_date, 'YYYY-MM'), currency
  ORDER BY sale_month DESC`,

  // 4. Top Products
  `DROP VIEW IF EXISTS v_top_products`,
  `CREATE VIEW v_top_products AS
  SELECT o.store_id, oli.product_name, oli.product_number,
    COUNT(DISTINCT oli.order_id) as order_count, SUM(oli.quantity) as total_quantity,
    SUM(oli.total_price) as total_revenue, ROUND(AVG(oli.unit_price)::numeric, 2) as avg_unit_price, o.currency
  FROM order_line_items oli JOIN orders o ON o.id = oli.order_id
  WHERE o.status NOT IN ('cancelled')
  GROUP BY o.store_id, oli.product_name, oli.product_number, o.currency
  ORDER BY total_revenue DESC`,

  // 5. Customer Geography
  `DROP VIEW IF EXISTS v_customer_geography`,
  `CREATE VIEW v_customer_geography AS
  SELECT store_id, COALESCE(billing_country, 'Unknown') as country,
    COALESCE(billing_city, 'Unknown') as city, COUNT(*) as order_count,
    COUNT(DISTINCT billing_email) as unique_customers, SUM(grand_total) as total_revenue,
    ROUND(AVG(grand_total)::numeric, 2) as avg_order_value, currency
  FROM orders WHERE status NOT IN ('cancelled')
  GROUP BY store_id, billing_country, billing_city, currency ORDER BY total_revenue DESC`,

  // 6. Weekday Analysis
  `DROP VIEW IF EXISTS v_weekday_analysis`,
  `CREATE VIEW v_weekday_analysis AS
  SELECT store_id, EXTRACT(DOW FROM creation_date) as day_of_week,
    CASE EXTRACT(DOW FROM creation_date)
      WHEN 0 THEN 'Söndag' WHEN 1 THEN 'Måndag' WHEN 2 THEN 'Tisdag'
      WHEN 3 THEN 'Onsdag' WHEN 4 THEN 'Torsdag' WHEN 5 THEN 'Fredag' WHEN 6 THEN 'Lördag'
    END as weekday_name,
    COUNT(*) as order_count, SUM(grand_total) as total_revenue,
    ROUND(AVG(grand_total)::numeric, 2) as avg_order_value, currency
  FROM orders WHERE status NOT IN ('cancelled')
  GROUP BY store_id, EXTRACT(DOW FROM creation_date), currency ORDER BY day_of_week`,

  // 7. Hourly Analysis
  `DROP VIEW IF EXISTS v_hourly_analysis`,
  `CREATE VIEW v_hourly_analysis AS
  SELECT store_id, EXTRACT(HOUR FROM creation_date) as hour_of_day,
    COUNT(*) as order_count, SUM(grand_total) as total_revenue,
    ROUND(AVG(grand_total)::numeric, 2) as avg_order_value, currency
  FROM orders WHERE status NOT IN ('cancelled')
  GROUP BY store_id, EXTRACT(HOUR FROM creation_date), currency ORDER BY hour_of_day`,

  // 8. Payment Methods
  `DROP VIEW IF EXISTS v_payment_methods`,
  `CREATE VIEW v_payment_methods AS
  SELECT store_id, COALESCE(payment_method, 'Unknown') as payment_method,
    COUNT(*) as order_count, SUM(grand_total) as total_revenue,
    ROUND(AVG(grand_total)::numeric, 2) as avg_order_value,
    ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (PARTITION BY store_id), 1) as percentage, currency
  FROM orders WHERE status NOT IN ('cancelled')
  GROUP BY store_id, payment_method, currency ORDER BY order_count DESC`,

  // 9. Shipping Methods
  `DROP VIEW IF EXISTS v_shipping_methods`,
  `CREATE VIEW v_shipping_methods AS
  SELECT store_id, COALESCE(shipping_method, 'Unknown') as shipping_method,
    COUNT(*) as order_count, SUM(grand_total) as total_revenue,
    ROUND(AVG(grand_total)::numeric, 2) as avg_order_value,
    ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (PARTITION BY store_id), 1) as percentage, currency
  FROM orders WHERE status NOT IN ('cancelled')
  GROUP BY store_id, shipping_method, currency ORDER BY order_count DESC`,

  // 10. Order Status
  `DROP VIEW IF EXISTS v_order_status`,
  `CREATE VIEW v_order_status AS
  SELECT store_id, status, COUNT(*) as order_count, SUM(grand_total) as total_value, currency
  FROM orders GROUP BY store_id, status, currency ORDER BY order_count DESC`
]

async function createViews() {
  console.log('📊 Creating analytics views...\n')

  // We need to use raw SQL - let's use the REST API with a function
  // First, create a helper function
  const createExecFunction = `
    CREATE OR REPLACE FUNCTION exec_sql(sql_query TEXT)
    RETURNS void AS $$
    BEGIN
      EXECUTE sql_query;
    END;
    $$ LANGUAGE plpgsql SECURITY DEFINER;
  `

  // Try to query each view directly after creation
  for (let i = 0; i < views.length; i++) {
    const sql = views[i]
    const viewName = sql.match(/v_\w+/)?.[0] || `statement_${i}`

    console.log(`${i + 1}/${views.length} ${viewName}...`)

    // Use fetch to call Supabase SQL endpoint
    try {
      const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
        method: 'POST',
        headers: {
          'apikey': serviceRoleKey,
          'Authorization': `Bearer ${serviceRoleKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ sql_query: sql })
      })

      if (!response.ok) {
        const text = await response.text()
        if (text.includes('exec_sql')) {
          console.log('   ⚠️ exec_sql function not found - need to create via Dashboard')
        } else {
          console.log(`   ❌ ${text.substring(0, 80)}`)
        }
      } else {
        console.log('   ✅')
      }
    } catch (err) {
      console.log(`   ❌ ${err.message}`)
    }
  }

  console.log('\n📋 To create views manually:')
  console.log('1. Go to Supabase Dashboard → SQL Editor')
  console.log('2. Copy contents of: supabase/migrations/002_analytics_views.sql')
  console.log('3. Run the SQL')
}

createViews()

/**
 * Aja SQL Supabasen Management API:n kautta
 */

const path = require('path')
const fs = require('fs')
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') })

const PROJECT_REF = 'tlothekaphtiwvusgwzh'

async function getAccessToken() {
  // Kokeillaan eri polkuja
  const paths = [
    path.join(process.env.HOME, '.supabase', 'access-token'),
    path.join(process.env.HOME, '.config', 'supabase', 'access-token')
  ]

  for (const p of paths) {
    if (fs.existsSync(p)) {
      return fs.readFileSync(p, 'utf-8').trim()
    }
  }
  return null
}

async function executeSql(accessToken, sql) {
  const url = `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ query: sql })
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`API error ${response.status}: ${errorText}`)
  }

  return await response.json()
}

const SQL = `
CREATE OR REPLACE FUNCTION calculate_core_metrics(
    p_store_id UUID,
    p_period_start DATE,
    p_period_end DATE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_result JSONB;
    v_revenue DECIMAL;
    v_cost DECIMAL;
    v_gross_profit DECIMAL;
    v_order_count INTEGER;
    v_aov DECIMAL;
    v_total_customers INTEGER;
    v_repeat_customers INTEGER;
    v_repeat_rate DECIMAL;
    v_out_of_stock_count INTEGER;
    v_total_products INTEGER;
    v_out_of_stock_percent DECIMAL;
BEGIN
    -- Myynti ja kate
    SELECT
        COALESCE(SUM(o.grand_total), 0),
        COUNT(*)
    INTO v_revenue, v_order_count
    FROM orders o
    WHERE o.store_id = p_store_id
      AND o.creation_date >= p_period_start
      AND o.creation_date <= p_period_end
      AND o.status NOT IN ('cancelled');

    -- Kate (order_line_items + products.cost_price)
    SELECT COALESCE(SUM(
        oli.quantity * COALESCE(p.cost_price, oli.unit_price * 0.6)
    ), 0)
    INTO v_cost
    FROM orders o
    JOIN order_line_items oli ON oli.order_id = o.id
    LEFT JOIN products p ON p.id = oli.product_id
    WHERE o.store_id = p_store_id
      AND o.creation_date >= p_period_start
      AND o.creation_date <= p_period_end
      AND o.status NOT IN ('cancelled');

    v_gross_profit := v_revenue - v_cost;

    -- AOV
    v_aov := CASE WHEN v_order_count > 0 THEN v_revenue / v_order_count ELSE 0 END;

    -- Repeat Purchase Rate
    SELECT
        COUNT(DISTINCT customer_id),
        COUNT(DISTINCT CASE WHEN order_count > 1 THEN customer_id END)
    INTO v_total_customers, v_repeat_customers
    FROM (
        SELECT customer_id, COUNT(*) as order_count
        FROM orders
        WHERE store_id = p_store_id
          AND creation_date >= p_period_start
          AND creation_date <= p_period_end
          AND status NOT IN ('cancelled')
          AND customer_id IS NOT NULL
        GROUP BY customer_id
    ) customer_orders;

    v_repeat_rate := CASE WHEN v_total_customers > 0
        THEN (v_repeat_customers::DECIMAL / v_total_customers) * 100
        ELSE 0 END;

    -- Out of Stock - KORJATTU: vain varastoseuratut tuotteet
    WITH tracked_products AS (
        SELECT DISTINCT p.id, p.stock_level
        FROM products p
        WHERE p.store_id = p_store_id
          AND p.for_sale = true
          AND (
              p.stock_level > 0
              OR
              EXISTS (
                  SELECT 1 FROM order_line_items oli
                  JOIN orders o ON o.id = oli.order_id
                  WHERE oli.product_id = p.id
                    AND o.store_id = p_store_id
                    AND o.status NOT IN ('cancelled')
              )
          )
    )
    SELECT
        COUNT(*) FILTER (WHERE stock_level = 0),
        COUNT(*)
    INTO v_out_of_stock_count, v_total_products
    FROM tracked_products;

    v_out_of_stock_percent := CASE WHEN v_total_products > 0
        THEN (v_out_of_stock_count::DECIMAL / v_total_products) * 100
        ELSE 0 END;

    -- Rakenna tulos
    v_result := jsonb_build_object(
        'revenue', ROUND(v_revenue::NUMERIC, 2),
        'cost', ROUND(v_cost::NUMERIC, 2),
        'gross_profit', ROUND(v_gross_profit::NUMERIC, 2),
        'margin_percent', CASE WHEN v_revenue > 0
            THEN ROUND(((v_gross_profit / v_revenue) * 100)::NUMERIC, 2)
            ELSE 0 END,
        'order_count', v_order_count,
        'aov', ROUND(v_aov::NUMERIC, 2),
        'total_customers', v_total_customers,
        'repeat_customers', v_repeat_customers,
        'repeat_rate', ROUND(v_repeat_rate::NUMERIC, 2),
        'out_of_stock_count', v_out_of_stock_count,
        'total_products', v_total_products,
        'out_of_stock_percent', ROUND(v_out_of_stock_percent::NUMERIC, 2)
    );

    RETURN v_result;
END;
$$;
`

async function main() {
  console.log('🟩 VilkasAnalytics - SQL Execution via Management API')
  console.log('')

  const accessToken = await getAccessToken()
  if (!accessToken) {
    console.error('❌ Supabase access token ei löydy')
    console.log('')
    console.log('Aja ensin: supabase login')
    process.exit(1)
  }

  console.log('✅ Access token löytyi')
  console.log('')

  console.log('📄 Ajetaan calculate_core_metrics päivitys...')

  try {
    const result = await executeSql(accessToken, SQL)
    console.log('✅ SQL ajettu onnistuneesti!')
    console.log('   Tulos:', JSON.stringify(result, null, 2))
  } catch (error) {
    console.error('❌ Virhe:', error.message)
  }
}

main().catch(console.error)

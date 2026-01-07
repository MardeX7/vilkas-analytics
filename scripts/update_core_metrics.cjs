/**
 * Päivitä calculate_core_metrics funktio
 * Korjaa out-of-stock laskennan (variaatiot ja paketit)
 */

const { createClient } = require('@supabase/supabase-js')
const path = require('path')
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') })

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

const NEW_FUNCTION_SQL = `
-- Päivitä calculate_core_metrics funktio - Out-of-Stock korjaus
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

    -- Out of Stock
    -- HUOM: Lasketaan vain tuotteet joilla on oikeasti varastoseuranta:
    -- 1. Tuotteet joilla stock_level > 0 (ei variaatioiden päätuotteet tai paketit)
    -- 2. TAI tuotteet jotka on myyty erikseen (order_line_items)
    -- Päätuotteet variaatioilla ja paketit eivät seuraa omaa saldoa
    WITH tracked_products AS (
        SELECT DISTINCT p.id, p.stock_level
        FROM products p
        WHERE p.store_id = p_store_id
          AND p.for_sale = true
          AND (
              -- Tuotteella on saldo = seuraa varastoa
              p.stock_level > 0
              OR
              -- TAI tuote on myyty erikseen (ei ole vain paketin osa)
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

async function updateFunction() {
  console.log('🟩 VilkasAnalytics - Päivitetään calculate_core_metrics')
  console.log(`   URL: ${SUPABASE_URL}`)
  console.log('')

  // Supabase JS ei tue suoraa SQL:ää, mutta voimme käyttää RPC:tä
  // Luodaan ensin helper-funktio joka ajaa SQL:n

  // Kokeillaan dashboardin kautta - ei toimi JS:llä
  // Käytetään sen sijaan testikutsua nähdäksemme nykyiset arvot

  console.log('📋 Testataan nykyistä calculate_core_metrics funktiota...')

  // Hae store_id
  const { data: store } = await supabase.from('stores').select('id, name').limit(1).single()

  if (!store) {
    console.log('❌ Ei löytynyt kauppaa')
    return
  }

  console.log(`   Store: ${store.name} (${store.id})`)

  const periodEnd = new Date().toISOString().split('T')[0]
  const periodStart = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

  console.log(`   Period: ${periodStart} - ${periodEnd}`)
  console.log('')

  const { data: metrics, error } = await supabase.rpc('calculate_core_metrics', {
    p_store_id: store.id,
    p_period_start: periodStart,
    p_period_end: periodEnd
  })

  if (error) {
    console.log(`❌ Virhe: ${error.message}`)
  } else {
    console.log('📊 Nykyiset metriikat:')
    console.log(`   Revenue: €${metrics.revenue}`)
    console.log(`   Orders: ${metrics.order_count}`)
    console.log(`   Out-of-stock: ${metrics.out_of_stock_count}/${metrics.total_products} (${metrics.out_of_stock_percent}%)`)
    console.log('')
    console.log('⚠️  SQL-funktio pitää päivittää Supabase Dashboardissa:')
    console.log('   https://supabase.com/dashboard/project/tlothekaphtiwvusgwzh/sql')
    console.log('')
    console.log('📄 Kopioi tämä SQL:')
    console.log('─'.repeat(60))
    console.log(NEW_FUNCTION_SQL)
    console.log('─'.repeat(60))
  }
}

updateFunction().catch(console.error)

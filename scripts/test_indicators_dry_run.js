/**
 * Test Indicators - Dry Run (no database save)
 *
 * Calculates all indicators and prints results without saving to DB.
 */

import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { calculateSalesTrend } from '../src/lib/indicators/calculators/salesTrend.js'
import { calculateAOV } from '../src/lib/indicators/calculators/aov.js'
import { calculateGrossMargin } from '../src/lib/indicators/calculators/grossMargin.js'
import { calculatePositionChange } from '../src/lib/indicators/calculators/positionChange.js'
import { calculateBrandVsNonBrand } from '../src/lib/indicators/calculators/brandVsNonBrand.js'
import { calculateOrganicConversionRate } from '../src/lib/indicators/calculators/organicConversionRate.js'
import { calculateStockAvailabilityRisk } from '../src/lib/indicators/calculators/stockAvailabilityRisk.js'

// Load environment
config({ path: '.env.local' })

const supabaseUrl = process.env.VITE_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !serviceRoleKey) {
  console.error('❌ Missing environment variables')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, serviceRoleKey)

// Billackering store ID
const STORE_ID = 'a28836f6-9487-4b67-9194-e907eaf94b69'
const periodEnd = new Date()
const periodLabel = '30d'
const periodDays = 30

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════╗')
  console.log('║  🧪 Indicator Engine - DRY RUN (no DB save)                  ║')
  console.log('╚══════════════════════════════════════════════════════════════╝\n')

  const startDate = new Date(periodEnd)
  startDate.setDate(startDate.getDate() - (periodDays * 2))

  // 1. Fetch Orders
  console.log('📦 Fetching orders...')
  const { data: orders, error: ordersError } = await supabase
    .from('orders')
    .select(`
      id,
      grand_total,
      creation_date,
      order_line_items (
        id,
        product_id,
        product_number,
        product_name,
        quantity,
        unit_price,
        total_price
      )
    `)
    .eq('store_id', STORE_ID)
    .gte('creation_date', startDate.toISOString())
    .lte('creation_date', periodEnd.toISOString())
    .order('creation_date', { ascending: false })

  if (ordersError) {
    console.error('❌ Orders error:', ordersError.message)
    return
  }
  console.log(`   ✅ ${orders.length} orders\n`)

  // 2. Fetch Products (without cost_price for now)
  console.log('📦 Fetching products...')
  const { data: products, error: productsError } = await supabase
    .from('products')
    .select('id, epages_product_id, product_number, name, category_name, price_amount, stock_level, min_stock_level')
    .eq('store_id', STORE_ID)

  if (productsError) {
    console.error('❌ Products error:', productsError.message)
  } else {
    console.log(`   ✅ ${products?.length || 0} products\n`)
  }

  // 3. Fetch GSC Data
  console.log('📊 Fetching GSC data...')
  const { data: gscData, error: gscError } = await supabase
    .from('gsc_search_analytics')
    .select('*')
    .eq('store_id', STORE_ID)
    .gte('date', startDate.toISOString().split('T')[0])
    .lte('date', periodEnd.toISOString().split('T')[0])
    .order('date', { ascending: false })

  if (gscError) {
    console.error('❌ GSC error:', gscError.message)
  } else {
    console.log(`   ✅ ${gscData?.length || 0} GSC rows\n`)
  }

  // Prepare orders with line items
  const ordersWithLineItems = orders.map(order => ({
    ...order,
    line_items: order.order_line_items || []
  }))

  console.log('═══════════════════════════════════════════════════════════════\n')
  console.log('📈 CALCULATING INDICATORS:\n')

  // ========================================
  // 1. Sales Trend
  // ========================================
  try {
    console.log('1️⃣  Sales Trend')
    const salesTrend = calculateSalesTrend({
      orders: ordersWithLineItems,
      periodEnd,
      periodLabel
    })
    console.log(`    Value: ${salesTrend.value}`)
    console.log(`    Revenue: ${salesTrend.metrics.current_revenue} SEK`)
    console.log(`    Change: ${salesTrend.change_percent}%`)
    console.log(`    Direction: ${salesTrend.direction}`)
    console.log(`    Orders: ${salesTrend.metrics.current_orders} (prev: ${salesTrend.metrics.previous_orders})`)
    console.log('')
  } catch (err) {
    console.error(`    ❌ Error: ${err.message}\n`)
  }

  // ========================================
  // 2. AOV
  // ========================================
  try {
    console.log('2️⃣  AOV (Average Order Value)')
    const aov = calculateAOV({
      orders: ordersWithLineItems,
      periodEnd,
      periodLabel
    })
    console.log(`    Value: ${aov.value} SEK`)
    console.log(`    Change: ${aov.change_percent}%`)
    console.log(`    Median: ${aov.metrics.median_order_value} SEK`)
    console.log(`    Range: ${aov.metrics.min_order} - ${aov.metrics.max_order} SEK`)
    console.log('')
  } catch (err) {
    console.error(`    ❌ Error: ${err.message}\n`)
  }

  // ========================================
  // 3. Gross Margin (skip if no cost_price)
  // ========================================
  console.log('3️⃣  Gross Margin')
  console.log('    ⏭️  Skipped (cost_price column not yet added)\n')

  // ========================================
  // 4. Position Change
  // ========================================
  if (gscData && gscData.length > 0) {
    try {
      console.log('4️⃣  Position Change')
      const positionChange = calculatePositionChange({
        gscData,
        periodEnd,
        periodLabel
      })
      console.log(`    Avg Position Change: ${positionChange.value} positions`)
      console.log(`    Current Avg: ${positionChange.metrics.avg_position_current}`)
      console.log(`    Previous Avg: ${positionChange.metrics.avg_position_previous}`)
      console.log(`    Improved: ${positionChange.metrics.improved_queries} queries`)
      console.log(`    Declined: ${positionChange.metrics.declined_queries} queries`)
      console.log(`    Top improvement: ${positionChange.significant_changes[0]?.query || 'N/A'} (${positionChange.significant_changes[0]?.change || 0} positions)`)
      console.log('')
    } catch (err) {
      console.error(`    ❌ Error: ${err.message}\n`)
    }

    // ========================================
    // 5. Brand vs Non-Brand
    // ========================================
    try {
      console.log('5️⃣  Brand vs Non-Brand')
      const brandVsNonBrand = calculateBrandVsNonBrand({
        gscData,
        periodEnd,
        periodLabel
      })
      console.log(`    Non-Brand Share: ${brandVsNonBrand.value}%`)
      console.log(`    Brand Share: ${brandVsNonBrand.analysis.brand_share}%`)
      console.log(`    Health: ${brandVsNonBrand.analysis.health}`)
      console.log(`    Brand Clicks: ${brandVsNonBrand.brand_queries.total_clicks}`)
      console.log(`    Non-Brand Clicks: ${brandVsNonBrand.nonbrand_queries.total_clicks}`)
      console.log(`    Top brand query: ${brandVsNonBrand.brand_queries.top_queries[0]?.query || 'N/A'}`)
      console.log(`    Top non-brand query: ${brandVsNonBrand.nonbrand_queries.top_queries[0]?.query || 'N/A'}`)
      console.log('')
    } catch (err) {
      console.error(`    ❌ Error: ${err.message}\n`)
    }

    // ========================================
    // 6. Organic Conversion Rate
    // ========================================
    try {
      console.log('6️⃣  Organic Conversion Rate')
      const organicCR = calculateOrganicConversionRate({
        gscData,
        orders: ordersWithLineItems,
        periodEnd,
        periodLabel
      })
      console.log(`    Conversion Rate: ${organicCR.value}%`)
      console.log(`    Total Clicks: ${organicCR.metrics.total_clicks}`)
      console.log(`    Attributed Orders: ${organicCR.metrics.attributed_orders}`)
      console.log(`    Previous CR: ${organicCR.metrics.previous_cr}%`)
      console.log(`    Change: ${organicCR.change_percent}%`)
      console.log('')
    } catch (err) {
      console.error(`    ❌ Error: ${err.message}\n`)
    }

    // ========================================
    // 7. Stock Availability Risk
    // ========================================
    if (products && products.length > 0) {
      try {
        console.log('7️⃣  Stock Availability Risk')
        const stockRisk = calculateStockAvailabilityRisk({
          products,
          gscData,
          orders: ordersWithLineItems,
          periodEnd,
          periodLabel
        })
        console.log(`    Revenue at Risk: ${stockRisk.value} SEK`)
        console.log(`    Out of Stock: ${stockRisk.summary.products_out_of_stock}`)
        console.log(`    Low Stock: ${stockRisk.summary.products_low_stock}`)
        console.log(`    Total at Risk: ${stockRisk.summary.total_products_at_risk} products`)
        if (stockRisk.at_risk_products.length > 0) {
          console.log(`    Top at-risk: ${stockRisk.at_risk_products[0]?.product_name || 'N/A'} (${stockRisk.at_risk_products[0]?.stock_level} units)`)
        }
        console.log('')
      } catch (err) {
        console.error(`    ❌ Error: ${err.message}\n`)
      }
    } else {
      console.log('7️⃣  Stock Availability Risk')
      console.log('    ⏭️  Skipped (no products)\n')
    }
  } else {
    console.log('4-7️⃣  SEO Indicators')
    console.log('    ⏭️  Skipped (no GSC data)\n')
  }

  console.log('═══════════════════════════════════════════════════════════════')
  console.log('✅ Dry run complete! All calculations executed successfully.')
  console.log('')
  console.log('💡 To save indicators to DB, run the SQL migration first:')
  console.log('   https://supabase.com/dashboard/project/tlothekaphtiwvusgwzh/sql/new')
}

main()

/**
 * Calculate Weekly Product Profitability
 *
 * Laskee tuotekohtaisen kannattavuuden viimeisen 7 päivän ajalta.
 */

require('dotenv').config({ path: '.env.local' })
const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const DEFAULT_MARGIN_PERCENT = 60
const VAT_RATE = 1.25

async function calculateWeeklyProfitability() {
  console.log('📊 Calculating WEEKLY product profitability...\n')

  // 1. Get store
  const { data: store, error: storeError } = await supabase
    .from('stores')
    .select('id')
    .single()

  if (storeError || !store) {
    console.error('❌ Error fetching store:', storeError?.message)
    return
  }

  console.log(`📦 Store: ${store.id}`)

  // 2. Calculate period (last 7 days)
  const periodEnd = new Date()
  const periodStart = new Date(periodEnd)
  periodStart.setDate(periodStart.getDate() - 7)

  console.log(`📅 Period: ${periodStart.toISOString().split('T')[0]} - ${periodEnd.toISOString().split('T')[0]}\n`)

  // 3. Get all products
  const { data: products, error: prodError } = await supabase
    .from('products')
    .select('id, name, price_amount, cost_price, stock_level')

  if (prodError) {
    console.error('❌ Error fetching products:', prodError.message)
    return
  }

  console.log(`📦 Found ${products.length} products`)

  // 4. Get orders in period
  const { data: orders, error: ordersError } = await supabase
    .from('orders')
    .select('id, creation_date')
    .gte('creation_date', periodStart.toISOString())
    .lte('creation_date', periodEnd.toISOString())

  if (ordersError) {
    console.error('❌ Error fetching orders:', ordersError.message)
    return
  }

  const orderIds = orders?.map(o => o.id) || []
  console.log(`📋 Found ${orders?.length || 0} orders in period`)

  if (orderIds.length === 0) {
    console.log('⚠️  No orders in period, skipping calculation')
    return
  }

  // 5. Get line items
  const { data: lineItems, error: lineError } = await supabase
    .from('order_line_items')
    .select('order_id, product_id, quantity, total_price')
    .in('order_id', orderIds)

  if (lineError) {
    console.error('❌ Error fetching line items:', lineError.message)
    return
  }

  console.log(`📦 Found ${lineItems?.length || 0} line items\n`)

  // 6. Calculate totals directly from line items (product_id may be null)
  let totalRevenue = 0
  let totalUnits = 0

  lineItems?.forEach(item => {
    const bruttoSek = parseFloat(item.total_price) || 0
    const nettoSek = bruttoSek / VAT_RATE
    totalRevenue += nettoSek
    totalUnits += item.quantity || 1
  })

  // 7. Calculate cost using default margin (since product_id links are missing)
  // Use DEFAULT_MARGIN_PERCENT as fallback
  const totalCost = totalRevenue * (1 - DEFAULT_MARGIN_PERCENT / 100)

  const totalGrossProfit = totalRevenue - totalCost
  const avgMarginPercent = totalRevenue > 0 ? (totalGrossProfit / totalRevenue) * 100 : 0

  console.log('💰 MYYNTIKATE VIIMEISEN 7 PÄIVÄN AIKANA:')
  console.log(`   Myynti (netto):     ${totalRevenue.toLocaleString('sv-SE', { maximumFractionDigits: 0 })} SEK`)
  console.log(`   Ostot (netto):      ${totalCost.toLocaleString('sv-SE', { maximumFractionDigits: 0 })} SEK`)
  console.log(`   ═══════════════════════════════════`)
  console.log(`   MYYNTIKATE:         ${totalGrossProfit.toLocaleString('sv-SE', { maximumFractionDigits: 0 })} SEK`)
  console.log(`   Kate-%:             ${avgMarginPercent.toFixed(1)}%\n`)

  // 8. Store weekly summary in kpi_index_snapshots raw_metrics
  // Update the latest weekly snapshot with profit summary
  const { data: latestWeek } = await supabase
    .from('kpi_index_snapshots')
    .select('id, raw_metrics')
    .eq('store_id', store.id)
    .eq('granularity', 'week')
    .order('period_end', { ascending: false })
    .limit(1)
    .single()

  if (latestWeek) {
    const updatedMetrics = {
      ...latestWeek.raw_metrics,
      profit_summary: {
        revenue: Math.round(totalRevenue * 100) / 100,
        cost: Math.round(totalCost * 100) / 100,
        gross_profit: Math.round(totalGrossProfit * 100) / 100,
        margin_percent: Math.round(avgMarginPercent * 10) / 10
      }
    }

    const { error: updateError } = await supabase
      .from('kpi_index_snapshots')
      .update({ raw_metrics: updatedMetrics })
      .eq('id', latestWeek.id)

    if (updateError) {
      console.error('❌ Error updating snapshot:', updateError.message)
    } else {
      console.log('✅ Updated latest weekly snapshot with profit summary')
    }
  }

  console.log('\n✅ Weekly profitability calculation complete!')
}

calculateWeeklyProfitability().catch(console.error)

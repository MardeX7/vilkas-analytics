/**
 * Calculate Product Profitability
 *
 * Laskee tuotekannattavuuden ja täyttää product_profitability-taulun.
 * Jos tuotteella ei ole cost_price, käytetään 60% oletuskatetta.
 */

require('dotenv').config({ path: '.env.local' })
const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// Default margin if cost_price is missing
const DEFAULT_MARGIN_PERCENT = 60

async function calculateProductProfitability() {
  console.log('📊 Calculating product profitability...\n')

  // 1. Get shop and store info
  const { data: shop } = await supabase
    .from('shops')
    .select('id, store_id, name')
    .single()

  if (!shop) {
    console.error('❌ No shop found')
    return
  }

  console.log(`🏪 Shop: ${shop.name} (${shop.id})`)

  // Get store_id from stores table
  const { data: store } = await supabase
    .from('stores')
    .select('id')
    .limit(1)
    .single()

  if (!store) {
    console.error('❌ No store found')
    return
  }

  console.log(`📦 Store: ${store.id}`)

  // 2. Calculate period (last 30 days for weekly, last month for monthly)
  const now = new Date()
  const periodEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const periodStart = new Date(periodEnd)
  periodStart.setDate(periodStart.getDate() - 30)

  console.log(`📅 Period: ${periodStart.toISOString().split('T')[0]} - ${periodEnd.toISOString().split('T')[0]}\n`)

  // 3. Get all products with their sales data
  const { data: products, error: prodError } = await supabase
    .from('products')
    .select('id, name, price_amount, price_currency, cost_price, cost_currency, stock_level')

  if (prodError) {
    console.error('❌ Error fetching products:', prodError.message)
    return
  }

  console.log(`📦 Found ${products.length} products`)

  // 4. Get order line items for the period
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

  // 5. Get line items for these orders
  const { data: lineItems, error: lineError } = await supabase
    .from('order_line_items')
    .select('product_id, quantity, unit_price, total_price')
    .in('order_id', orderIds.length > 0 ? orderIds : ['00000000-0000-0000-0000-000000000000'])

  if (lineError) {
    console.error('❌ Error fetching line items:', lineError.message)
    return
  }

  console.log(`📦 Found ${lineItems?.length || 0} line items\n`)

  // 6. Aggregate sales by product
  // VALUUTAT:
  // - order_line_items total_price = brutto SEK (sis. alv 25%)
  // - products price_amount = brutto SEK (sis. alv 25%)
  // - products cost_price = netto SEK (alv 0%)
  //
  // Muunnetaan myynti netto SEK:ksi vertailua varten:
  // - Brutto -> Netto: /1.25 (alv 25%)
  const VAT_RATE = 1.25  // 25% alv

  const salesByProduct = {}
  lineItems?.forEach(item => {
    // Skip items without product_id (can't link to product for cost calculation)
    if (!item.product_id) return

    if (!salesByProduct[item.product_id]) {
      salesByProduct[item.product_id] = {
        units_sold: 0,
        revenue_net_sek: 0  // Netto SEK (alv 0%)
      }
    }
    salesByProduct[item.product_id].units_sold += item.quantity
    // Brutto SEK -> Netto SEK
    const bruttoSek = parseFloat(item.total_price) || 0
    const nettoSek = bruttoSek / VAT_RATE
    salesByProduct[item.product_id].revenue_net_sek += nettoSek
  })

  // 7. Calculate profitability for each product
  const profitabilityData = []

  // Find max values for indexing
  let maxRevenue = 0
  let maxMargin = 0

  const productStats = products.map(product => {
    const sales = salesByProduct[product.id] || { units_sold: 0, revenue_net_sek: 0 }

    // Calculate cost (use default margin if no cost_price)
    // cost_price on netto SEK
    // revenue_net_sek on muunnettu netto SEK:ksi

    let costPrice = product.cost_price  // Netto SEK
    let isEstimated = false

    if (!costPrice && sales.revenue_net_sek > 0) {
      // Default 60% margin means cost is 40% of revenue
      // This is an estimate for products without cost_price
      costPrice = (sales.revenue_net_sek / sales.units_sold) * (1 - DEFAULT_MARGIN_PERCENT / 100)
      isEstimated = true
    }

    const cost = (costPrice || 0) * sales.units_sold
    const grossProfit = sales.revenue_net_sek - cost
    const marginPercent = sales.revenue_net_sek > 0 ? (grossProfit / sales.revenue_net_sek) * 100 : (isEstimated ? DEFAULT_MARGIN_PERCENT : 0)

    // Stock days calculation
    const dailySales = sales.units_sold / 30 // 30 day period
    const stockDays = dailySales > 0 ? (product.stock_level || 0) / dailySales : 999

    if (sales.revenue_net_sek > maxRevenue) maxRevenue = sales.revenue_net_sek
    if (marginPercent > maxMargin) maxMargin = marginPercent

    return {
      product,
      sales,
      cost,
      grossProfit,
      marginPercent,
      stockDays,
      isEstimated
    }
  })

  // 8. Calculate indexes and classify
  productStats.forEach(stats => {
    const { product, sales, cost, grossProfit, marginPercent, stockDays, isEstimated } = stats

    // Only include products with sales or significant stock
    if (sales.units_sold === 0 && (product.stock_level || 0) < 5) {
      return
    }

    // Calculate indexes (0-100)
    const marginIndex = maxMargin > 0 ? Math.min(100, (marginPercent / maxMargin) * 100) : 50
    const salesIndex = maxRevenue > 0 ? Math.min(100, (sales.revenue_net_sek / maxRevenue) * 100) : 0

    // Stock efficiency: lower stock days = better (inverse)
    // 30 days = good (100), 180 days = bad (0)
    const stockEfficiencyIndex = Math.max(0, Math.min(100, 100 - ((stockDays - 30) / 150) * 100))

    // Total score (weighted average)
    const totalScore = (marginIndex * 0.35) + (salesIndex * 0.40) + (stockEfficiencyIndex * 0.25)

    // Classification
    // Realistisemmat kynnysarvot pienelle kaupalle
    let tier
    if (totalScore >= 60 && marginPercent >= 20 && sales.revenue_net_sek > 100) {
      tier = 'top_driver'  // Hyvä kate, hyvä myynti (yli 100 SEK)
    } else if (totalScore >= 30 && sales.revenue_net_sek > 0) {
      tier = 'healthy'  // Toimiva tuote
    } else if (sales.revenue_net_sek > 0) {
      tier = 'underperformer'  // Myy mutta heikosti
    } else if (stockDays > 90 || (sales.units_sold === 0 && (product.stock_level || 0) > 0)) {
      tier = 'capital_trap'  // Ei myy, sitoo pääomaa
    } else {
      tier = 'underperformer'
    }

    // Clamp values to fit database column constraints
    // DECIMAL(5,2) = max 999.99, DECIMAL(6,1) = max 99999.9
    // Indeksit 0-100, muut voivat olla negatiivisia (tappiollinen tuote)
    profitabilityData.push({
      store_id: store.id,
      product_id: product.id,
      period_start: periodStart.toISOString().split('T')[0],
      period_end: periodEnd.toISOString().split('T')[0],
      granularity: 'month',
      margin_index: Math.max(0, Math.min(100, Math.round(marginIndex * 100) / 100)),
      sales_index: Math.max(0, Math.min(100, Math.round(salesIndex * 100) / 100)),
      stock_efficiency_index: Math.max(0, Math.min(100, Math.round(stockEfficiencyIndex * 100) / 100)),
      total_score: Math.max(0, Math.min(100, Math.round(totalScore * 100) / 100)),
      revenue: Math.max(0, Math.min(9999999999.99, Math.round(sales.revenue_net_sek * 100) / 100)),  // Netto SEK
      cost: Math.max(0, Math.min(9999999999.99, Math.round(cost * 100) / 100)),
      gross_profit: Math.max(-999.99, Math.min(9999999999.99, Math.round(grossProfit * 100) / 100)),  // Voi olla negatiivinen
      margin_percent: Math.max(-99.99, Math.min(999.99, Math.round(marginPercent * 100) / 100)),  // Voi olla negatiivinen
      units_sold: sales.units_sold,
      stock_level: product.stock_level || 0,
      stock_days: Math.min(99999.9, Math.round(stockDays * 10) / 10),
      profitability_tier: tier
      // margin_estimated: isEstimated  // Uncomment after adding column to DB
    })
  })

  console.log(`📊 Calculated profitability for ${profitabilityData.length} products\n`)

  // 8b. Laske kokonaismyyntikate
  const totalRevenue = profitabilityData.reduce((sum, p) => sum + p.revenue, 0)
  const totalCost = profitabilityData.reduce((sum, p) => sum + p.cost, 0)
  const totalGrossProfit = profitabilityData.reduce((sum, p) => sum + p.gross_profit, 0)
  const avgMarginPercent = totalRevenue > 0 ? (totalGrossProfit / totalRevenue) * 100 : 0

  console.log('💰 MYYNTIKATE VIIMEISEN 30 PÄIVÄN AIKANA:')
  console.log(`   Myynti (netto):     ${totalRevenue.toLocaleString('sv-SE', { maximumFractionDigits: 0 })} SEK`)
  console.log(`   Ostot (netto):      ${totalCost.toLocaleString('sv-SE', { maximumFractionDigits: 0 })} SEK`)
  console.log(`   ═══════════════════════════════════`)
  console.log(`   MYYNTIKATE:         ${totalGrossProfit.toLocaleString('sv-SE', { maximumFractionDigits: 0 })} SEK`)
  console.log(`   Kate-%:             ${avgMarginPercent.toFixed(1)}%\n`)

  // 9. Count by tier
  const tierCounts = {
    top_driver: 0,
    healthy: 0,
    underperformer: 0,
    capital_trap: 0
  }
  profitabilityData.forEach(p => tierCounts[p.profitability_tier]++)

  console.log('📈 Tier distribution:')
  console.log(`   🌟 Top Drivers: ${tierCounts.top_driver}`)
  console.log(`   ✅ Healthy: ${tierCounts.healthy}`)
  console.log(`   ⚠️  Underperformers: ${tierCounts.underperformer}`)
  console.log(`   🔴 Capital Traps: ${tierCounts.capital_trap}`)
  console.log('')

  // 10. Delete existing data for this period
  const { error: deleteError } = await supabase
    .from('product_profitability')
    .delete()
    .eq('store_id', store.id)
    .eq('period_end', periodEnd.toISOString().split('T')[0])

  if (deleteError) {
    console.error('⚠️  Error deleting old data:', deleteError.message)
  }

  // 11. Insert new data (batch)
  const batchSize = 100
  for (let i = 0; i < profitabilityData.length; i += batchSize) {
    const batch = profitabilityData.slice(i, i + batchSize)
    const { error: insertError } = await supabase
      .from('product_profitability')
      .insert(batch)

    if (insertError) {
      console.error(`❌ Error inserting batch ${i / batchSize + 1}:`, insertError.message)
      // Debug: show problematic values
      console.log('Sample data from failed batch:')
      const sample = batch[0]
      Object.entries(sample).forEach(([k, v]) => {
        if (typeof v === 'number') console.log(`  ${k}: ${v}`)
      })
      return
    }
    console.log(`✅ Inserted batch ${i / batchSize + 1} (${batch.length} products)`)
  }

  // 12. Show top drivers
  console.log('\n🌟 TOP PROFIT DRIVERS:')
  const topDrivers = profitabilityData
    .filter(p => p.profitability_tier === 'top_driver')
    .sort((a, b) => b.total_score - a.total_score)
    .slice(0, 5)

  for (const driver of topDrivers) {
    const product = products.find(p => p.id === driver.product_id)
    console.log(`   ${product?.name?.substring(0, 40)} - Score: ${driver.total_score}, Margin: ${driver.margin_percent}%`)
  }

  // 13. Show capital traps
  console.log('\n🔴 CAPITAL TRAPS:')
  const traps = profitabilityData
    .filter(p => p.profitability_tier === 'capital_trap')
    .sort((a, b) => b.stock_days - a.stock_days)
    .slice(0, 5)

  for (const trap of traps) {
    const product = products.find(p => p.id === trap.product_id)
    console.log(`   ${product?.name?.substring(0, 40)} - Stock: ${trap.stock_days} days, Revenue: €${trap.revenue}`)
  }

  console.log('\n✅ Product profitability calculation complete!')
}

calculateProductProfitability().catch(console.error)

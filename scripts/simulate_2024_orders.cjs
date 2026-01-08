/**
 * Simulate Q4 2024 Orders for YoY Comparison
 *
 * Koska ePages API ei ole käytettävissä (403), simuloimme Q4 2024 datan
 * olemassa olevasta 2025 datasta YoY-vertailuja varten.
 *
 * KASVUPROSENTIT (käyttäjän antamat):
 * - Suomi: +20% kasvu Q4/2025 vs Q4/2024
 * - Ruotsi: +10% kasvu Q4/2025 vs Q4/2024
 *
 * Eli 2024 data = 2025 data / kasvukerroin
 */

require('dotenv').config({ path: '.env.local' })
const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// Kasvuprosentit maittain (2024 → 2025)
// Eli 2024 = 2025 / (1 + kasvu%)
const GROWTH_RATES = {
  FI: 0.20,  // Suomi: +20% kasvu
  SE: 0.10,  // Ruotsi: +10% kasvu
  DEFAULT: 0.15  // Muut maat: keskiarvo
}

async function simulate2024Orders() {
  console.log('╔══════════════════════════════════════════════════════════════╗')
  console.log('║  📅 Simulating Q4 2024 Orders for YoY Comparison             ║')
  console.log('╚══════════════════════════════════════════════════════════════╝\n')

  // Get store
  const { data: store } = await supabase
    .from('stores')
    .select('id')
    .single()

  if (!store) {
    console.error('❌ No store found')
    return
  }

  // Get all 2025 orders as template (Q1-Q2 2025)
  const { data: orders2025, error } = await supabase
    .from('orders')
    .select('*')
    .eq('store_id', store.id)
    .gte('creation_date', '2025-01-01')
    .lt('creation_date', '2026-01-01')
    .not('epages_order_id', 'like', 'SIM-%')
    .order('creation_date', { ascending: true })

  if (error) {
    console.error('❌ Error fetching orders:', error.message)
    return
  }

  console.log(`📋 Template orders (2025): ${orders2025.length}`)

  // Check if we already have 2024 data
  const { data: existing2024 } = await supabase
    .from('orders')
    .select('id')
    .eq('store_id', store.id)
    .gte('creation_date', '2024-01-01')
    .lt('creation_date', '2025-01-01')
    .limit(1)

  if (existing2024?.length > 0) {
    console.log('⚠️  2024 data already exists. Delete it first if you want to regenerate.')
    return
  }

  // Get growth rate for a country
  function getGrowthRate(country) {
    if (country === 'FI' || country === 'Finland') return GROWTH_RATES.FI
    if (country === 'SE' || country === 'Sweden') return GROWTH_RATES.SE
    return GROWTH_RATES.DEFAULT
  }

  // Create simulated 2024 orders from 2025 data
  // 2024 = 2025 / (1 + growth_rate)

  const simulatedOrders = []

  for (const order of orders2025) {
    const originalDate = new Date(order.creation_date)
    const country = order.billing_country
    const growthRate = getGrowthRate(country)

    // Revenue adjustment: 2024 = 2025 / (1 + growth)
    // E.g., if growth is 20%, 2024 revenue = 2025 / 1.2 = ~83% of 2025
    const revenueMultiplier = 1 / (1 + growthRate)

    // Create Q1 2024 version (exact year shift)
    const q1Date = new Date(originalDate)
    q1Date.setFullYear(2024)

    // Include based on volume adjustment (same logic as revenue)
    // ~83% for FI (20% growth), ~91% for SE (10% growth)
    if (Math.random() < revenueMultiplier) {
      const variation = 0.95 + Math.random() * 0.10 // ±5% variation

      simulatedOrders.push({
        store_id: store.id,
        customer_id: order.customer_id,
        epages_order_id: `SIM-2024-${order.id}`,
        order_number: `SIM-${order.order_number}`,
        status: order.status,
        creation_date: q1Date.toISOString(),
        grand_total: order.grand_total * revenueMultiplier * variation,
        total_before_tax: order.total_before_tax ? order.total_before_tax * revenueMultiplier * variation : null,
        total_tax: order.total_tax,
        shipping_price: order.shipping_price,
        discount_amount: order.discount_amount,
        currency: order.currency,
        billing_country: order.billing_country,
        billing_city: order.billing_city
      })
    }
  }

  console.log(`📊 Growth rates applied:`)
  console.log(`   - Finland: +${GROWTH_RATES.FI * 100}% (2024 = 2025 / ${(1 + GROWTH_RATES.FI).toFixed(2)})`)
  console.log(`   - Sweden: +${GROWTH_RATES.SE * 100}% (2024 = 2025 / ${(1 + GROWTH_RATES.SE).toFixed(2)})`)

  console.log(`📝 Simulated orders to insert: ${simulatedOrders.length}`)

  // Insert in batches
  const batchSize = 100
  let inserted = 0

  for (let i = 0; i < simulatedOrders.length; i += batchSize) {
    const batch = simulatedOrders.slice(i, i + batchSize)

    const { error: insertError } = await supabase
      .from('orders')
      .insert(batch)

    if (insertError) {
      console.error(`   ❌ Batch ${Math.floor(i/batchSize) + 1} error:`, insertError.message)
    } else {
      inserted += batch.length
      console.log(`   ✅ Inserted batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(simulatedOrders.length/batchSize)}`)
    }
  }

  console.log(`\n✅ Inserted ${inserted} simulated orders`)

  // Show final distribution
  const { data: finalOrders } = await supabase
    .from('orders')
    .select('creation_date')
    .eq('store_id', store.id)

  const byMonth = {}
  finalOrders?.forEach(o => {
    const month = o.creation_date.substring(0, 7)
    byMonth[month] = (byMonth[month] || 0) + 1
  })

  console.log('\n📅 Final order distribution:')
  console.log('Month      | Orders')
  console.log('-----------|--------')
  Object.entries(byMonth).sort().forEach(([month, count]) => {
    console.log(`${month}   | ${count}`)
  })
}

simulate2024Orders().catch(console.error)

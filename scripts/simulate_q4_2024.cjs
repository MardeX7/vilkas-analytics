/**
 * Simulate Q4 2024 Orders for YoY Comparison
 *
 * Luo Q4 2024 (loka-joulu 2024) dataa Q4 2025 pohjalta.
 * Kasvuprosentit: Suomi +20%, Ruotsi +10%
 */

require('dotenv').config({ path: '.env.local' })
const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const GROWTH_RATES = {
  FI: 0.20,
  SE: 0.10,
  DEFAULT: 0.15
}

async function simulateQ4_2024() {
  console.log('╔══════════════════════════════════════════════════════════════╗')
  console.log('║  📅 Simulating Q4 2024 (Oct-Dec) for YoY Comparison          ║')
  console.log('╚══════════════════════════════════════════════════════════════╝\n')

  const { data: store } = await supabase.from('stores').select('id').single()
  if (!store) { console.error('❌ No store'); return }

  // Get Q4 2025 orders (Oct-Dec 2025)
  const { data: q4_2025, error } = await supabase
    .from('orders')
    .select('*')
    .eq('store_id', store.id)
    .gte('creation_date', '2025-10-01')
    .lt('creation_date', '2026-01-01')
    .not('epages_order_id', 'like', 'SIM-%')

  if (error) { console.error('Error:', error.message); return }

  console.log(`📋 Q4 2025 orders (template): ${q4_2025.length}`)

  // Check existing Q4 2024
  const { data: existing } = await supabase
    .from('orders')
    .select('id')
    .eq('store_id', store.id)
    .gte('creation_date', '2024-10-01')
    .lt('creation_date', '2025-01-01')
    .limit(1)

  if (existing?.length > 0) {
    console.log('⚠️  Q4 2024 data exists. Delete first to regenerate.')
    return
  }

  function getGrowthRate(country) {
    if (country === 'FI' || country === 'Finland') return GROWTH_RATES.FI
    if (country === 'SE' || country === 'Sweden') return GROWTH_RATES.SE
    return GROWTH_RATES.DEFAULT
  }

  const simulatedOrders = []

  for (const order of q4_2025) {
    const originalDate = new Date(order.creation_date)
    const growthRate = getGrowthRate(order.billing_country)
    const revenueMultiplier = 1 / (1 + growthRate)

    // Shift date back exactly 1 year (keep month/day same)
    const newDate = new Date(originalDate)
    newDate.setFullYear(originalDate.getFullYear() - 1)

    // Include ~85% of orders (accounting for growth)
    if (Math.random() < revenueMultiplier) {
      const variation = 0.95 + Math.random() * 0.10

      simulatedOrders.push({
        store_id: store.id,
        customer_id: order.customer_id,
        epages_order_id: `SIM-Q4-2024-${order.id}`,
        order_number: `SIM-${order.order_number}`,
        status: order.status,
        creation_date: newDate.toISOString(),
        grand_total: order.grand_total * revenueMultiplier * variation,
        total_before_tax: order.total_before_tax ? order.total_before_tax * revenueMultiplier * variation : null,
        total_tax: order.total_tax,
        shipping_price: order.shipping_price,
        currency: order.currency,
        billing_country: order.billing_country,
        billing_city: order.billing_city
      })
    }
  }

  console.log(`📊 Growth rates: FI +${GROWTH_RATES.FI*100}%, SE +${GROWTH_RATES.SE*100}%`)
  console.log(`📝 Simulated Q4 2024 orders: ${simulatedOrders.length}`)

  // Insert
  const batchSize = 100
  let inserted = 0

  for (let i = 0; i < simulatedOrders.length; i += batchSize) {
    const batch = simulatedOrders.slice(i, i + batchSize)
    const { error: insertError } = await supabase.from('orders').insert(batch)
    if (insertError) {
      console.error(`Batch error:`, insertError.message)
    } else {
      inserted += batch.length
    }
  }

  console.log(`\n✅ Inserted ${inserted} Q4 2024 orders`)

  // Show distribution
  const { data: allOrders } = await supabase
    .from('orders')
    .select('creation_date')
    .eq('store_id', store.id)
    .gte('creation_date', '2024-10-01')
    .lt('creation_date', '2026-02-01')

  const byMonth = {}
  allOrders?.forEach(o => {
    const month = o.creation_date.substring(0, 7)
    byMonth[month] = (byMonth[month] || 0) + 1
  })

  console.log('\n📅 Q4 2024 + Q4 2025 distribution:')
  Object.entries(byMonth).sort().forEach(([m, c]) => console.log(`${m}: ${c}`))
}

simulateQ4_2024().catch(console.error)

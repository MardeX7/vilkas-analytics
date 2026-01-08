/**
 * Check original (non-simulated) orders
 */
require('dotenv').config({ path: '.env.local' })
const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function check() {
  // Get non-simulated orders only
  const { data, error } = await supabase
    .from('orders')
    .select('creation_date, grand_total, epages_order_id')
    .not('epages_order_id', 'like', 'SIM-%')
    .order('creation_date')

  if (error) {
    console.error(error)
    return
  }

  const byMonth = {}
  data.forEach(o => {
    const month = o.creation_date.substring(0, 7)
    if (!byMonth[month]) byMonth[month] = { count: 0, revenue: 0 }
    byMonth[month].count++
    byMonth[month].revenue += parseFloat(o.grand_total) || 0
  })

  console.log('📅 ORIGINAL orders (non-simulated):')
  console.log('Month      | Orders | Revenue')
  console.log('-----------|--------|--------')
  Object.entries(byMonth).sort().forEach(([m, d]) => {
    console.log(`${m}   | ${String(d.count).padStart(6)} | ${Math.round(d.revenue).toLocaleString()}`)
  })
  console.log(`\nTotal: ${data.length}`)
}

check().catch(console.error)

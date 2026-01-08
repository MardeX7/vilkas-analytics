/**
 * Check orders by month
 */
require('dotenv').config({ path: '.env.local' })
const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function checkOrders() {
  // Get all orders grouped by month
  const { data: orders, error } = await supabase
    .from('orders')
    .select('creation_date, grand_total')
    .order('creation_date', { ascending: true })

  if (error) {
    console.error('Error:', error.message)
    return
  }

  if (!orders || orders.length === 0) {
    console.log('No orders found')
    return
  }

  // Group by year-month
  const byMonth = {}
  orders.forEach(o => {
    const month = o.creation_date.substring(0, 7)
    if (!byMonth[month]) byMonth[month] = { count: 0, revenue: 0 }
    byMonth[month].count++
    byMonth[month].revenue += parseFloat(o.grand_total) || 0
  })

  console.log('📅 Orders by month:')
  console.log('Month      | Orders | Revenue (SEK)')
  console.log('-----------|--------|---------------')
  Object.entries(byMonth).sort().forEach(([month, data]) => {
    console.log(`${month}   | ${String(data.count).padStart(6)} | ${Math.round(data.revenue).toLocaleString()}`)
  })

  console.log(`\nTotal orders: ${orders.length}`)
  console.log(`First: ${orders[0]?.creation_date}`)
  console.log(`Last: ${orders[orders.length-1]?.creation_date}`)
}

checkOrders().catch(console.error)

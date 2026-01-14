/**
 * Debug week grouping
 */
const { supabase, STORE_ID } = require('./db.cjs')

function getWeekNumber(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7)
}

async function debugWeekGrouping() {
  console.log('📊 Debugataan tilausten ryhmittelyä viikkoihin...')

  const { data: orders } = await supabase
    .from('orders')
    .select('creation_date, order_number, grand_total')
    .eq('store_id', STORE_ID)
    .gte('creation_date', '2025-12-28')
    .lte('creation_date', '2026-01-04T23:59:59')
    .neq('status', 'cancelled')
    .order('creation_date')

  const ordersByWeek = {}
  orders.forEach(order => {
    const date = new Date(order.creation_date)
    const year = date.getFullYear()
    const week = getWeekNumber(date)
    // BUG: Vuosi tulee tilauksen päivämäärästä, ei ISO-viikkovuodesta!
    const weekKey = `${year}-W${String(week).padStart(2, '0')}`

    if (!ordersByWeek[weekKey]) ordersByWeek[weekKey] = []
    ordersByWeek[weekKey].push(order)
  })

  console.log('\n📦 Tilaukset ryhmiteltynä (BUGILOGIIKALLA):')
  for (const [weekKey, weekOrders] of Object.entries(ordersByWeek).sort()) {
    let total = 0
    weekOrders.forEach(o => total += parseFloat(o.grand_total) || 0)
    console.log('\n  ', weekKey, ':', weekOrders.length, 'tilausta,', Math.round(total / 1.25), 'kr (netto)')
    weekOrders.forEach(o => {
      const date = o.creation_date.split('T')[0]
      console.log('     ', date, o.order_number, Math.round(o.grand_total), 'kr')
    })
  }

  console.log('\n\n🐛 ONGELMA: 29.12.2025-3.1.2026 pitäisi olla YKSI viikko (W01/2026)')
  console.log('   Mutta skripti jakaa sen:')
  console.log('   - 2025-W01 (29-31.12.2025) - VÄÄRIN!')
  console.log('   - 2026-W01 (1-3.1.2026)')
}

debugWeekGrouping()

/**
 * Debug: Check YoY customer counts
 */
const { supabase, printProjectInfo } = require('./db.cjs')

printProjectInfo()

async function check() {
  // Current period: 26 Oct 2025 - 23 Jan 2026
  // YoY period: 26 Oct 2024 - 23 Jan 2025

  // Count current period orders
  const { count: currentCount } = await supabase
    .from('orders')
    .select('id', { count: 'exact', head: true })
    .gte('creation_date', '2025-10-26')
    .lte('creation_date', '2026-01-23T23:59:59')

  // Count YoY period orders
  const { count: yoyCount } = await supabase
    .from('orders')
    .select('id', { count: 'exact', head: true })
    .gte('creation_date', '2024-10-26')
    .lte('creation_date', '2025-01-23T23:59:59')

  console.log('Orders count:')
  console.log('  Current (26 Oct 2025 - 23 Jan 2026):', currentCount)
  console.log('  YoY     (26 Oct 2024 - 23 Jan 2025):', yoyCount)

  // Get unique customers for both periods
  const { data: currentOrders } = await supabase
    .from('orders')
    .select('billing_email')
    .gte('creation_date', '2025-10-26')
    .lte('creation_date', '2026-01-23T23:59:59')

  const { data: yoyOrders } = await supabase
    .from('orders')
    .select('billing_email')
    .gte('creation_date', '2024-10-26')
    .lte('creation_date', '2025-01-23T23:59:59')

  const currentEmails = new Set(currentOrders?.map(o => (o.billing_email || '').toLowerCase()).filter(e => e))
  const yoyEmails = new Set(yoyOrders?.map(o => (o.billing_email || '').toLowerCase()).filter(e => e))

  console.log('\nUnique customers:')
  console.log('  Current:', currentEmails.size)
  console.log('  YoY:', yoyEmails.size)

  if (yoyEmails.size > 0) {
    const change = ((currentEmails.size - yoyEmails.size) / yoyEmails.size * 100).toFixed(1)
    console.log('  Change:', change + '%')
  } else {
    console.log('  Change: N/A (no YoY data)')
  }
}

check().catch(console.error)

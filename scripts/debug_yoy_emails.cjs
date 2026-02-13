/**
 * Debug: Check email data quality in YoY period
 */
const { supabase, printProjectInfo } = require('./db.cjs')

printProjectInfo()

async function check() {
  // Get YoY orders with email status
  const { data: yoyOrders } = await supabase
    .from('orders')
    .select('id, billing_email, customer_id, creation_date')
    .gte('creation_date', '2024-10-26')
    .lte('creation_date', '2025-01-23T23:59:59')
    .order('creation_date', { ascending: true })

  const { data: currentOrders } = await supabase
    .from('orders')
    .select('id, billing_email, customer_id')
    .gte('creation_date', '2025-10-26')
    .lte('creation_date', '2026-01-23T23:59:59')

  console.log('YoY period (Oct 2024 - Jan 2025):')
  console.log('  Total orders:', yoyOrders?.length || 0)

  const yoyWithEmail = yoyOrders?.filter(o => o.billing_email && o.billing_email.trim()) || []
  const yoyWithoutEmail = yoyOrders?.filter(o => !o.billing_email || !o.billing_email.trim()) || []

  console.log('  Orders WITH email:', yoyWithEmail.length)
  console.log('  Orders WITHOUT email:', yoyWithoutEmail.length)

  if (yoyWithoutEmail.length > 0) {
    console.log('\n  Sample orders without email:')
    yoyWithoutEmail.slice(0, 5).forEach(o => {
      console.log(`    - ${o.id} (${o.creation_date}) customer_id: ${o.customer_id || 'null'}`)
    })
  }

  console.log('\nCurrent period (Oct 2025 - Jan 2026):')
  console.log('  Total orders:', currentOrders?.length || 0)

  const currentWithEmail = currentOrders?.filter(o => o.billing_email && o.billing_email.trim()) || []
  const currentWithoutEmail = currentOrders?.filter(o => !o.billing_email || !o.billing_email.trim()) || []

  console.log('  Orders WITH email:', currentWithEmail.length)
  console.log('  Orders WITHOUT email:', currentWithoutEmail.length)

  // Check if YoY has many orders with same email (repeat customers)
  const yoyEmailCounts = {}
  yoyWithEmail.forEach(o => {
    const email = o.billing_email.toLowerCase()
    yoyEmailCounts[email] = (yoyEmailCounts[email] || 0) + 1
  })

  const repeatCustomers = Object.entries(yoyEmailCounts).filter(([, count]) => count > 1)
  console.log('\n  YoY repeat customers (2+ orders):', repeatCustomers.length)
  console.log('  YoY single-order customers:', Object.keys(yoyEmailCounts).length - repeatCustomers.length)

  // Top repeat customers
  const topRepeat = repeatCustomers.sort((a, b) => b[1] - a[1]).slice(0, 5)
  if (topRepeat.length > 0) {
    console.log('\n  Top repeat customers (YoY):')
    topRepeat.forEach(([email, count]) => {
      const masked = email.slice(0, 3) + '***' + email.slice(-4)
      console.log(`    - ${masked}: ${count} orders`)
    })
  }
}

check().catch(console.error)

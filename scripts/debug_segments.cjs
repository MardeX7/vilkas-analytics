const { supabase, STORE_ID, printProjectInfo } = require('./db.cjs')

async function check() {
  printProjectInfo()

  const { data: orders } = await supabase
    .from('orders')
    .select('grand_total, creation_date, is_b2b, is_b2b_soft')
    .eq('store_id', STORE_ID)
    .gte('creation_date', '2026-01-06')
    .lte('creation_date', '2026-01-13')

  console.log('Orders 1/6-1/12 count:', orders?.length)
  console.log('Sum of grand_total:', orders?.reduce((sum, o) => sum + (o.grand_total || 0), 0).toFixed(2))

  const b2c = orders?.filter(o => !o.is_b2b && !o.is_b2b_soft)
  const b2b = orders?.filter(o => o.is_b2b === true)
  const b2bSoft = orders?.filter(o => o.is_b2b_soft === true)

  console.log('')
  console.log('B2C:', b2c?.length, 'orders, sum:', b2c?.reduce((s,o) => s + o.grand_total, 0).toFixed(2))
  console.log('B2B:', b2b?.length, 'orders, sum:', b2b?.reduce((s,o) => s + o.grand_total, 0).toFixed(2))
  console.log('B2B soft:', b2bSoft?.length, 'orders, sum:', b2bSoft?.reduce((s,o) => s + o.grand_total, 0).toFixed(2))

  // Now check what useOrders hook uses
  console.log('\n--- Checking how Dashboard calculates sales ---')

  // Check order_line_items if that's what's used
  const { data: lineItems } = await supabase
    .from('order_line_items')
    .select(`
      quantity,
      unit_price,
      total_price,
      orders!inner(creation_date, store_id)
    `)
    .eq('orders.store_id', STORE_ID)
    .gte('orders.creation_date', '2026-01-06')
    .lte('orders.creation_date', '2026-01-13')

  console.log('Line items count:', lineItems?.length)
  const lineItemTotal = lineItems?.reduce((sum, li) => sum + (li.total_price || 0), 0) || 0
  console.log('Sum of line item total_price:', lineItemTotal.toFixed(2))
}
check()

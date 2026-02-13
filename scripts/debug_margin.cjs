const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: '/Users/markkukorkiakoski/Desktop/VilkasAnalytics/.env.local' })

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function debugProductMatching() {
  const storeId = 'a28836f6-9487-4b67-9194-e907eaf94b69'

  const { data: orders } = await supabase
    .from('orders')
    .select('id')
    .eq('store_id', storeId)
    .gte('creation_date', '2026-01-18')
    .lte('creation_date', '2026-01-24T23:59:59')
    .limit(1)

  if (orders === null || orders.length === 0) {
    console.log('No orders found')
    return
  }

  const orderId = orders[0].id
  console.log('Order ID:', orderId)

  const { data: lineItems } = await supabase
    .from('order_line_items')
    .select('*')
    .eq('order_id', orderId)

  console.log('Line items:', lineItems ? lineItems.length : 0)

  let totalRevenue = 0
  let totalCost = 0
  let matchedItems = 0

  for (const item of (lineItems || [])) {
    totalRevenue += parseFloat(item.total_price) || 0

    const { data: byNumber } = await supabase
      .from('products')
      .select('id, product_number, sku, cost_price')
      .eq('product_number', item.product_number)
      .eq('store_id', storeId)

    if (byNumber && byNumber.length > 0) {
      const cost = parseFloat(byNumber[0].cost_price) || 0
      totalCost += cost * (item.quantity || 1)
      matchedItems++
      console.log('Item:', item.product_number, 'Match: YES cost=' + byNumber[0].cost_price)
    } else {
      console.log('Item:', item.product_number, 'Match: NO')
    }
  }

  const margin = totalRevenue > 0 ? ((totalRevenue - totalCost) / totalRevenue * 100) : 0
  console.log('\n=== Summary ===')
  console.log('Items:', lineItems ? lineItems.length : 0, 'Matched:', matchedItems)
  console.log('Revenue:', totalRevenue, 'Cost:', totalCost)
  console.log('Gross margin:', margin.toFixed(1) + '%')
}

debugProductMatching().catch(console.error)

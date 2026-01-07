/**
 * Debug margin calculation
 */
require('dotenv').config({ path: '.env.local' })
const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const VAT_RATE = 1.25

async function debug() {
  // Get orders
  const { data: orders } = await supabase
    .from('orders')
    .select('id, creation_date, grand_total')
    .order('creation_date', { ascending: false })
    .limit(5)

  console.log('📋 Recent orders:', orders?.length)

  // Get all line items
  const { data: lineItems } = await supabase
    .from('order_line_items')
    .select('order_id, product_id, quantity, total_price')

  console.log('📦 Total line items:', lineItems?.length)

  // Group by order
  const byOrder = {}
  for (const li of lineItems || []) {
    if (!byOrder[li.order_id]) {
      byOrder[li.order_id] = []
    }
    byOrder[li.order_id].push(li)
  }

  console.log('📊 Unique orders with line items:', Object.keys(byOrder).length)

  // Check if orders match
  for (const order of orders || []) {
    const items = byOrder[order.id] || []
    console.log('  Order', order.id.substring(0, 8), '→', items.length, 'items')
  }

  // Get all products with cost_price
  const { data: products } = await supabase
    .from('products')
    .select('id, cost_price')

  const productMap = {}
  for (const p of products || []) {
    productMap[p.id] = p
  }

  console.log('\n📦 Products in map:', Object.keys(productMap).length)
  console.log('💰 Products with cost_price:', products?.filter(p => p.cost_price).length)

  // Calculate margin for first month
  const { data: janOrders } = await supabase
    .from('orders')
    .select('id, creation_date, grand_total')
    .gte('creation_date', '2025-01-01')
    .lt('creation_date', '2025-02-01')

  console.log('\n📅 January 2025 orders:', janOrders?.length)

  let totalSalesNetto = 0
  let totalCost = 0
  let itemsFound = 0
  let itemsWithCost = 0

  for (const order of janOrders || []) {
    const items = byOrder[order.id] || []
    for (const item of items) {
      itemsFound++
      const salesNetto = (parseFloat(item.total_price) || 0) / VAT_RATE
      totalSalesNetto += salesNetto

      const product = productMap[item.product_id]
      if (product?.cost_price) {
        totalCost += product.cost_price * item.quantity
        itemsWithCost++
      } else {
        // Default 40% cost
        totalCost += salesNetto * 0.4
      }
    }
  }

  const grossProfit = totalSalesNetto - totalCost
  const marginPercent = totalSalesNetto > 0 ? (grossProfit / totalSalesNetto) * 100 : 0

  console.log('\n📊 January 2025 margin calculation:')
  console.log('   Line items found:', itemsFound)
  console.log('   Items with cost_price:', itemsWithCost)
  console.log('   Sales (netto):', Math.round(totalSalesNetto), 'SEK')
  console.log('   Cost:', Math.round(totalCost), 'SEK')
  console.log('   Gross profit:', Math.round(grossProfit), 'SEK')
  console.log('   Margin:', marginPercent.toFixed(1), '%')
}

debug().catch(console.error)

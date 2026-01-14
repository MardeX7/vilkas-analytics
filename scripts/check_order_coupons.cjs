const { supabase } = require('./db.cjs')

const EPAGES_API = 'https://www.billackering.eu/rs/shops/billackering'

async function checkOrderCoupons() {
  const { data: store } = await supabase
    .from('stores')
    .select('access_token')
    .single()

  // Get recent orders
  const res = await fetch(`${EPAGES_API}/orders?resultsPerPage=50&sortBy=creationDate`, {
    headers: { 'Authorization': `Bearer ${store.access_token}` }
  })

  const data = await res.json()

  console.log('Checking', data.items?.length || 0, 'orders for coupons...\n')

  let ordersWithCoupons = 0

  if (data.items) {
    for (const order of data.items) {
      const container = order.lineItemContainer
      if (container) {
        const hasCoupons = container.couponLineItems && container.couponLineItems.length > 0

        if (hasCoupons) {
          ordersWithCoupons++
          console.log('Order:', order.orderNumber, '- Date:', order.creationDate?.split('T')[0])
          console.log('  Coupon items:', JSON.stringify(container.couponLineItems, null, 2))
        }
      }
    }
  }

  console.log('\n---')
  console.log('Orders with coupons:', ordersWithCoupons, '/', data.items?.length || 0)

  // Also check one full order structure
  if (data.items?.[0]) {
    console.log('\n--- Sample order keys ---')
    console.log('Order keys:', Object.keys(data.items[0]))
    console.log('lineItemContainer keys:', Object.keys(data.items[0].lineItemContainer || {}))
  }
}

checkOrderCoupons()

const { supabase } = require('./db.cjs')

const EPAGES_API = 'https://www.billackering.eu/rs/shops/billackering'

async function checkSingleOrder() {
  const { data: store } = await supabase
    .from('stores')
    .select('access_token')
    .single()

  // Get order list first
  const listRes = await fetch(`${EPAGES_API}/orders?resultsPerPage=5`, {
    headers: { 'Authorization': `Bearer ${store.access_token}` }
  })
  const listData = await listRes.json()

  if (!listData.items?.[0]) {
    console.log('No orders found')
    return
  }

  const orderId = listData.items[0].orderId
  console.log('Fetching full order:', orderId)

  // Get full order details
  const orderRes = await fetch(`${EPAGES_API}/orders/${orderId}`, {
    headers: { 'Authorization': `Bearer ${store.access_token}` }
  })
  const order = await orderRes.json()

  console.log('\n--- Full Order Structure ---')
  console.log('Order Number:', order.orderNumber)
  console.log('Grand Total:', order.grandTotal)

  console.log('\nlineItemContainer keys:', Object.keys(order.lineItemContainer || {}))

  if (order.lineItemContainer) {
    const lic = order.lineItemContainer
    console.log('\nproductLineItems:', lic.productLineItems?.length || 0)
    console.log('couponLineItem:', lic.couponLineItem ? 'yes' : 'no')
    console.log('basketDiscount:', lic.basketDiscount ? JSON.stringify(lic.basketDiscount) : 'no')

    if (lic.couponLineItem) {
      console.log('\n--- Coupon Line Item ---')
      console.log(JSON.stringify(lic.couponLineItem, null, 2))
    }
  }

  // Now search for orders with coupons - check more orders
  console.log('\n\n--- Searching for orders with coupons (checking 200 orders) ---')

  let page = 1
  let foundCoupons = []

  while (page <= 4) {
    const pageRes = await fetch(`${EPAGES_API}/orders?resultsPerPage=50&page=${page}`, {
      headers: { 'Authorization': `Bearer ${store.access_token}` }
    })
    const pageData = await pageRes.json()

    if (!pageData.items?.length) break

    for (const orderSummary of pageData.items) {
      // Fetch full order
      const fullRes = await fetch(`${EPAGES_API}/orders/${orderSummary.orderId}`, {
        headers: { 'Authorization': `Bearer ${store.access_token}` }
      })
      const fullOrder = await fullRes.json()

      const coupon = fullOrder.lineItemContainer?.couponLineItem
      const basketDiscount = fullOrder.lineItemContainer?.basketDiscount

      if (coupon || (basketDiscount && basketDiscount.amount && basketDiscount.amount !== '0')) {
        foundCoupons.push({
          orderNumber: fullOrder.orderNumber,
          date: fullOrder.creationDate?.split('T')[0],
          coupon: coupon,
          basketDiscount: basketDiscount
        })
        const couponCode = coupon?.couponCode || coupon?.name || 'basket discount'
        console.log(`Found coupon in order ${fullOrder.orderNumber}:`, couponCode)
      }
    }

    page++
  }

  console.log('\n--- Summary ---')
  console.log('Orders with coupons found:', foundCoupons.length)

  if (foundCoupons.length > 0) {
    console.log('\nSample coupon structure:')
    console.log(JSON.stringify(foundCoupons[0], null, 2))
  }
}

checkSingleOrder()

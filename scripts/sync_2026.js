/**
 * ePages API Sync - 2026 orders only
 * Syncs data from Billackering.eu to Supabase
 */

import { createClient } from '@supabase/supabase-js'

// Supabase
const supabaseUrl = 'https://tlothekaphtiwvusgwzh.supabase.co'
const serviceRoleKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRsb3RoZWthcGh0aXd2dXNnd3poIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NzYxOTYwMCwiZXhwIjoyMDgzMTk1NjAwfQ.PxMeALq2SEylsXwybYAASYcxjtVBzjjiWFsiOulhQyY'
const supabase = createClient(supabaseUrl, serviceRoleKey)

// ePages config
const API_URL = 'https://www.billackering.eu/rs/shops/billackering'
let ACCESS_TOKEN = null

async function getAccessToken() {
  const { data: store } = await supabase
    .from('stores')
    .select('access_token')
    .eq('epages_shop_id', 'billackering')
    .single()

  return store?.access_token
}

async function fetchFromEpages(endpoint, params = {}) {
  const url = new URL(`${API_URL}${endpoint}`)
  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.append(key, value)
  })

  const response = await fetch(url.toString(), {
    headers: {
      'Authorization': `Bearer ${ACCESS_TOKEN}`,
      'Accept': 'application/vnd.epages.v1+json'
    }
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`API error ${response.status}: ${text}`)
  }

  return response.json()
}

async function syncProducts(storeId) {
  console.log('\n📦 Syncing products...')

  let allItems = []
  let page = 1

  while (true) {
    const response = await fetchFromEpages('/products', { resultsPerPage: 100, page })
    const items = response.items || []
    if (items.length === 0) break
    allItems = allItems.concat(items)
    console.log(`   Page ${page}: ${items.length} products (total: ${allItems.length})`)
    if (items.length < 100) break
    page++
  }

  const items = allItems
  console.log(`   Found ${items.length} products total`)

  const products = items.map(p => ({
    store_id: storeId,
    epages_product_id: p.productId,
    product_number: p.productNumber || p.sku,
    name: p.name || 'Unknown',
    description: p.description,
    short_description: p.shortDescription,
    price_amount: p.priceInfo?.price?.amount || 0,
    price_currency: p.priceInfo?.price?.currency || 'SEK',
    stock_level: p.stocklevel ?? 0,
    for_sale: p.forSale !== false,
    category_name: p.categoryName,
    image_url: p.images?.[0]?.url
  }))

  const { error } = await supabase
    .from('products')
    .upsert(products, { onConflict: 'store_id,epages_product_id' })

  if (error) console.error('   ❌', error.message)
  else console.log(`   ✅ ${products.length} products synced`)

  return products.length
}

// ePages returns prices as strings or objects - handle both
function parsePrice(val) {
  if (typeof val === 'object' && val?.amount) return parseFloat(val.amount)
  if (typeof val === 'string') return parseFloat(val)
  if (typeof val === 'number') return val
  return 0
}

async function syncOrders2026(storeId) {
  console.log('\n🛒 Syncing 2026 orders...')

  // Filter: orders from 2025-12-01 (December 2025 + January 2026)
  const createdAfter = '2025-12-01T00:00:00Z'

  let allOrders = []
  let page = 1

  while (true) {
    const response = await fetchFromEpages('/orders', {
      resultsPerPage: 100,
      createdAfter,
      page
    })
    const items = response.items || []
    if (items.length === 0) break
    allOrders = allOrders.concat(items)
    console.log(`   Page ${page}: ${items.length} orders (total: ${allOrders.length})`)
    if (items.length < 100) break
    page++
  }

  const orders = allOrders
  console.log(`   Found ${orders.length} orders total since ${createdAfter}`)

  let insertedOrders = 0
  let insertedLineItems = 0

  for (const order of orders) {
    // Fetch full order details to get line items
    console.log(`   📄 Fetching details for order ${order.orderNumber}...`)
    let orderDetails
    try {
      orderDetails = await fetchFromEpages(`/orders/${order.orderId}`)
    } catch (err) {
      console.error(`   ❌ Could not fetch order details:`, err.message)
      orderDetails = order
    }

    // Map status
    const statusMap = {
      'InProgress': 'pending',
      'Pending': 'pending',
      'ReadyForDispatch': 'paid',
      'Dispatched': 'shipped',
      'Delivered': 'delivered',
      'Cancelled': 'cancelled',
      'Closed': 'delivered'
    }

    const { data: insertedOrder, error: orderError } = await supabase
      .from('orders')
      .upsert({
        store_id: storeId,
        epages_order_id: orderDetails.orderId,
        order_number: orderDetails.orderNumber,
        status: statusMap[orderDetails.status] || 'pending',
        creation_date: orderDetails.creationDate,
        grand_total: parsePrice(orderDetails.grandTotal),
        total_before_tax: parsePrice(orderDetails.totalBeforeTax),
        total_tax: parsePrice(orderDetails.totalTax),
        currency: 'SEK',
        billing_first_name: orderDetails.billingAddress?.firstName,
        billing_last_name: orderDetails.billingAddress?.lastName,
        billing_email: orderDetails.billingAddress?.emailAddress,
        billing_city: orderDetails.billingAddress?.city,
        billing_country: orderDetails.billingAddress?.country,
        payment_method: orderDetails.paymentData?.paymentMethod?.name,
        shipping_method: orderDetails.shippingData?.shippingMethod?.name
      }, { onConflict: 'store_id,epages_order_id' })
      .select()
      .single()

    if (orderError) {
      console.error(`   ❌ Order ${orderDetails.orderNumber}:`, orderError.message)
      continue
    }

    insertedOrders++

    // Line items from detailed order
    const lineItems = orderDetails.lineItemContainer?.productLineItems || []
    console.log(`      Found ${lineItems.length} line items`)

    // Delete existing line items for this order first
    await supabase.from('order_line_items').delete().eq('order_id', insertedOrder.id)

    for (const item of lineItems) {
      // quantity can be object like {amount: 1, unit: "styck"} or just a number
      const qty = typeof item.quantity === 'object' ? item.quantity.amount : (item.quantity || 1)

      const { error: liError } = await supabase
        .from('order_line_items')
        .insert({
          order_id: insertedOrder.id,
          epages_line_item_id: item.lineItemId,
          product_number: item.productNumber || item.sku,
          product_name: item.name || 'Unknown',
          quantity: Math.round(qty),
          unit_price: parsePrice(item.unitPrice),
          total_price: parsePrice(item.lineItemPrice)
        })

      if (liError) {
        console.error(`      ❌ Line item error:`, liError.message)
      } else {
        insertedLineItems++
      }
    }
  }

  console.log(`   ✅ ${insertedOrders} orders synced`)
  console.log(`   ✅ ${insertedLineItems} line items synced`)

  return insertedOrders
}

async function sync() {
  console.log('╔════════════════════════════════════════════╗')
  console.log('║  🔄 VilkasAnalytics - 2026 Sync            ║')
  console.log('╚════════════════════════════════════════════╝')

  // Get token from DB
  ACCESS_TOKEN = await getAccessToken()
  if (!ACCESS_TOKEN) {
    console.error('❌ No access token found!')
    return
  }
  console.log('✅ Token loaded from database')

  // Get store
  const { data: store } = await supabase
    .from('stores')
    .select('id, name')
    .eq('epages_shop_id', 'billackering')
    .single()

  if (!store) {
    console.error('❌ Store not found!')
    return
  }

  console.log(`🏪 Store: ${store.name}`)

  // Sync
  const productCount = await syncProducts(store.id)
  const orderCount = await syncOrders2026(store.id)

  console.log('\n╔════════════════════════════════════════════╗')
  console.log('║  ✅ SYNC COMPLETE                          ║')
  console.log(`║  📦 Products: ${String(productCount).padEnd(28)}║`)
  console.log(`║  🛒 Orders (2026): ${String(orderCount).padEnd(23)}║`)
  console.log('╚════════════════════════════════════════════╝')
}

sync().catch(console.error)

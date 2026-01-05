/**
 * Import ePages Historical Data - Full Year 2025
 *
 * Hakee kaikki tilaukset 1.1.2025 alkaen YoY-vertailua varten
 */

import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'

// Load .env.local
config({ path: '.env.local' })

// ============================================
// CONFIGURATION
// ============================================

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://tlothekaphtiwvusgwzh.supabase.co'
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRsb3RoZWthcGh0aXd2dXNnd3poIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NzYxOTYwMCwiZXhwIjoyMDgzMTk1NjAwfQ.PxMeALq2SEylsXwybYAASYcxjtVBzjjiWFsiOulhQyY'

const supabase = createClient(supabaseUrl, serviceRoleKey)

// Will be fetched from DB
let EPAGES_CONFIG = {
  apiUrl: 'https://www.billackering.eu/rs/shops/billackering',
  accessToken: null,
  shopId: 'billackering'
}

// Date range for import
const START_DATE = '2025-01-01'
const END_DATE = '2025-11-30'  // Until November (December already imported)

// ============================================
// ePages API Helper
// ============================================

async function fetchFromEpages(endpoint, params = {}) {
  const url = new URL(`${EPAGES_CONFIG.apiUrl}${endpoint}`)
  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.append(key, value)
  })

  const response = await fetch(url.toString(), {
    headers: {
      'Authorization': `Bearer ${EPAGES_CONFIG.accessToken}`,
      'Accept': 'application/vnd.epages.v1+json'
    }
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`ePages API error ${response.status}: ${text}`)
  }

  return response.json()
}

// ============================================
// Get Store ID and Token from DB
// ============================================

async function getStoreConfig() {
  const { data: store, error } = await supabase
    .from('stores')
    .select('id, access_token')
    .eq('epages_shop_id', EPAGES_CONFIG.shopId)
    .single()

  if (error || !store) {
    throw new Error('Store not found. Run sync_epages.js first.')
  }

  if (!store.access_token) {
    throw new Error('No ePages access token found in database.')
  }

  // Update config with token from DB
  EPAGES_CONFIG.accessToken = store.access_token

  return store.id
}

// ============================================
// Sync Historical Orders
// ============================================

async function syncHistoricalOrders(storeId) {
  console.log('\n🛒 Fetching historical orders...')
  console.log(`   📅 Period: ${START_DATE} → ${END_DATE}`)

  let allOrders = []
  let page = 1
  const resultsPerPage = 100

  // Fetch all orders with date filter
  while (true) {
    try {
      const response = await fetchFromEpages('/orders', {
        page,
        resultsPerPage,
        createdAfter: START_DATE,
        createdBefore: END_DATE
      })

      const items = response.items || []
      if (items.length === 0) break

      // Filter by date (extra safety)
      const filteredItems = items.filter(order => {
        const orderDate = order.creationDate?.split('T')[0]
        return orderDate >= START_DATE && orderDate <= END_DATE
      })

      allOrders = allOrders.concat(filteredItems)
      console.log(`   📝 Page ${page}: ${filteredItems.length} orders (total: ${allOrders.length})`)

      if (items.length < resultsPerPage) break
      page++

      // Rate limiting
      await new Promise(r => setTimeout(r, 200))
    } catch (err) {
      console.error(`   ⚠️ Page ${page} error:`, err.message)
      break
    }
  }

  console.log(`\n   📦 Total historical orders: ${allOrders.length}`)

  // Status mapping
  const statusMap = {
    'InProgress': 'pending',
    'Pending': 'pending',
    'ReadyForDispatch': 'paid',
    'Dispatched': 'shipped',
    'Delivered': 'delivered',
    'Cancelled': 'cancelled',
    'Returned': 'cancelled',
    'Closed': 'delivered'
  }

  // Process orders
  let insertedOrders = 0
  let insertedLineItems = 0
  let skippedOrders = 0

  for (const order of allOrders) {
    try {
      // Check if order already exists
      const { data: existing } = await supabase
        .from('orders')
        .select('id')
        .eq('store_id', storeId)
        .eq('epages_order_id', order.orderId)
        .single()

      if (existing) {
        skippedOrders++
        continue
      }

      // Find customer
      let customerId = null
      if (order.customerId) {
        const { data: customer } = await supabase
          .from('customers')
          .select('id')
          .eq('store_id', storeId)
          .eq('epages_customer_id', order.customerId)
          .single()
        customerId = customer?.id
      }

      // Insert order
      const { data: insertedOrder, error: orderError } = await supabase
        .from('orders')
        .insert({
          store_id: storeId,
          customer_id: customerId,
          epages_order_id: order.orderId,
          order_number: order.orderNumber,
          status: statusMap[order.status] || 'pending',
          creation_date: order.creationDate,
          paid_on: order.paymentData?.paidOn,
          dispatched_on: order.shippingData?.dispatchedOn,
          delivered_on: order.shippingData?.deliveredOn,
          closed_on: order.closedOn,
          grand_total: order.grandTotal?.amount || 0,
          total_before_tax: order.totalBeforeTax?.amount,
          total_tax: order.totalTax?.amount,
          shipping_price: order.shippingPrice?.amount || 0,
          discount_amount: order.discountAmount?.amount || 0,
          currency: order.grandTotal?.currency || 'EUR',
          billing_company: order.billingAddress?.company,
          billing_first_name: order.billingAddress?.firstName,
          billing_last_name: order.billingAddress?.lastName,
          billing_street: order.billingAddress?.street,
          billing_zip_code: order.billingAddress?.zipCode,
          billing_city: order.billingAddress?.city,
          billing_country: order.billingAddress?.country,
          billing_email: order.billingAddress?.emailAddress,
          shipping_company: order.shippingAddress?.company,
          shipping_first_name: order.shippingAddress?.firstName,
          shipping_last_name: order.shippingAddress?.lastName,
          shipping_street: order.shippingAddress?.street,
          shipping_zip_code: order.shippingAddress?.zipCode,
          shipping_city: order.shippingAddress?.city,
          shipping_country: order.shippingAddress?.country,
          payment_method: order.paymentData?.paymentMethod?.name,
          payment_transaction_id: order.paymentData?.transactionId,
          shipping_method: order.shippingData?.shippingMethod?.name,
          locale: order.locale,
          note: order.customerComment
        })
        .select()
        .single()

      if (orderError) {
        console.error(`   ❌ Order ${order.orderNumber}:`, orderError.message)
        continue
      }

      insertedOrders++

      // Insert line items
      if (order.lineItemContainer?.productLineItems) {
        for (const item of order.lineItemContainer.productLineItems) {
          let productId = null
          if (item.productId) {
            const { data: product } = await supabase
              .from('products')
              .select('id')
              .eq('store_id', storeId)
              .eq('epages_product_id', item.productId)
              .single()
            productId = product?.id
          }

          const { error: lineError } = await supabase
            .from('order_line_items')
            .insert({
              order_id: insertedOrder.id,
              product_id: productId,
              epages_line_item_id: item.lineItemId,
              product_number: item.productNumber || item.sku,
              product_name: item.name || 'Unknown',
              quantity: item.quantity || 1,
              unit_price: item.unitPrice?.amount || 0,
              total_price: item.lineItemPrice?.amount || 0,
              tax_rate: item.taxRate || 0,
              tax_amount: item.taxAmount?.amount || 0,
              discount_amount: item.discountAmount?.amount || 0
            })

          if (!lineError) insertedLineItems++
        }
      }

      // Progress
      if (insertedOrders % 50 === 0) {
        console.log(`   📝 Inserted ${insertedOrders} orders...`)
      }

    } catch (err) {
      console.error(`   ⚠️ Order error:`, err.message)
    }
  }

  return { insertedOrders, insertedLineItems, skippedOrders }
}

// ============================================
// Main
// ============================================

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════╗')
  console.log('║  📚 VilkasAnalytics - ePages Historical Import               ║')
  console.log('║  📅 Period: 2025-01-01 → 2025-11-30                          ║')
  console.log('╚══════════════════════════════════════════════════════════════╝')

  const startTime = Date.now()

  try {
    // Get store
    const storeId = await getStoreConfig()
    console.log(`\n✅ Store ID: ${storeId}`)

    // Import orders
    const result = await syncHistoricalOrders(storeId)

    const duration = ((Date.now() - startTime) / 1000).toFixed(1)

    console.log('\n╔══════════════════════════════════════════════════════════════╗')
    console.log('║  ✅ IMPORT COMPLETE                                          ║')
    console.log('╠══════════════════════════════════════════════════════════════╣')
    console.log(`║  🛒 New orders: ${String(result.insertedOrders).padEnd(43)}║`)
    console.log(`║  📦 Line items: ${String(result.insertedLineItems).padEnd(43)}║`)
    console.log(`║  ⏭️  Skipped (existing): ${String(result.skippedOrders).padEnd(34)}║`)
    console.log(`║  ⏱️  Duration: ${duration}s${' '.repeat(44 - duration.length)}║`)
    console.log('╚══════════════════════════════════════════════════════════════╝')

  } catch (err) {
    console.error('\n❌ IMPORT FAILED:', err.message)
    process.exit(1)
  }
}

main()

/**
 * Fetch Historical Orders from ePages API
 *
 * Hakee vanhat tilaukset (Q4 2024 ja varhaisemmat) ePages API:sta
 * mahdollistaakseen YoY-vertailut.
 */

require('dotenv').config({ path: '.env.local' })
const { createClient } = require('@supabase/supabase-js')

// ePages API credentials
const EPAGES_CONFIG = {
  apiUrl: 'https://www.billackering.eu/rs/shops/billackering',
  accessToken: 'XH5IrE6QIY3PLL6pX5bUr7n1jcmgeuYq'
}

// Supabase
const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function fetchFromEpages(endpoint, params = {}) {
  const url = new URL(`${EPAGES_CONFIG.apiUrl}${endpoint}`)
  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.append(key, value)
  })

  console.log(`📡 Fetching: ${url.toString()}`)

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

async function fetchHistoricalOrders() {
  console.log('╔══════════════════════════════════════════════════════════════╗')
  console.log('║  📅 Fetching Historical Orders from ePages API               ║')
  console.log('╚══════════════════════════════════════════════════════════════╝\n')

  // Get store
  const { data: store } = await supabase
    .from('stores')
    .select('id')
    .single()

  if (!store) {
    console.error('❌ No store found')
    return
  }

  console.log(`📦 Store ID: ${store.id}\n`)

  // First, check what orders we already have
  const { data: existingOrders } = await supabase
    .from('orders')
    .select('epages_order_id')
    .eq('store_id', store.id)

  const existingOrderIds = new Set(existingOrders?.map(o => o.epages_order_id) || [])
  console.log(`📋 Existing orders in DB: ${existingOrderIds.size}\n`)

  // Fetch ALL orders from ePages (the API will return all available orders)
  let allOrders = []
  let page = 1
  const resultsPerPage = 100

  try {
    while (true) {
      const response = await fetchFromEpages('/orders', {
        page,
        resultsPerPage,
        sort: 'creationDate'  // oldest first
      })

      const items = response.items || []
      if (items.length === 0) break

      allOrders = allOrders.concat(items)
      console.log(`   📝 Fetched ${allOrders.length} orders (page ${page})...`)

      if (items.length < resultsPerPage) break
      page++

      // Rate limiting - wait 100ms between requests
      await new Promise(resolve => setTimeout(resolve, 100))
    }

    console.log(`\n📊 Total orders from ePages API: ${allOrders.length}`)

    // Filter to only new orders (not already in DB)
    const newOrders = allOrders.filter(o => !existingOrderIds.has(o.orderId))
    console.log(`🆕 New orders to import: ${newOrders.length}`)

    if (newOrders.length === 0) {
      console.log('\n✅ No new orders to import!')
      return
    }

    // Show date range of new orders
    const dates = newOrders.map(o => o.creationDate).sort()
    console.log(`📅 Date range: ${dates[0]} → ${dates[dates.length - 1]}\n`)

    // Get product map for line items
    const { data: products } = await supabase
      .from('products')
      .select('id, epages_product_id')
      .eq('store_id', store.id)

    const productMap = {}
    products?.forEach(p => { productMap[p.epages_product_id] = p.id })

    // Get customer map
    const { data: customers } = await supabase
      .from('customers')
      .select('id, epages_customer_id')
      .eq('store_id', store.id)

    const customerMap = {}
    customers?.forEach(c => { customerMap[c.epages_customer_id] = c.id })

    // Map order status
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

    for (const order of newOrders) {
      try {
        // Insert order
        const { data: insertedOrder, error: orderError } = await supabase
          .from('orders')
          .upsert({
            store_id: store.id,
            customer_id: customerMap[order.customerId] || null,
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
          }, {
            onConflict: 'store_id,epages_order_id'
          })
          .select()
          .single()

        if (orderError) {
          console.error(`   ❌ Order ${order.orderNumber} error:`, orderError.message)
          continue
        }

        insertedOrders++

        // Sync line items
        if (order.lineItemContainer?.productLineItems) {
          for (const item of order.lineItemContainer.productLineItems) {
            const { error: lineItemError } = await supabase
              .from('order_line_items')
              .upsert({
                order_id: insertedOrder.id,
                product_id: productMap[item.productId] || null,
                epages_line_item_id: item.lineItemId,
                product_number: item.productNumber || item.sku,
                product_name: item.name || 'Unknown',
                quantity: item.quantity || 1,
                unit_price: item.unitPrice?.amount || 0,
                total_price: item.lineItemPrice?.amount || 0,
                tax_rate: item.taxRate || 0,
                tax_amount: item.taxAmount?.amount || 0,
                discount_amount: item.discountAmount?.amount || 0
              }, {
                onConflict: 'order_id,epages_line_item_id',
                ignoreDuplicates: false
              })

            if (!lineItemError) {
              insertedLineItems++
            }
          }
        }

        // Progress indicator
        if (insertedOrders % 50 === 0) {
          console.log(`   📝 Processed ${insertedOrders}/${newOrders.length} orders...`)
        }
      } catch (err) {
        console.error(`   ❌ Order processing error:`, err.message)
      }
    }

    console.log('\n╔══════════════════════════════════════════════════════════════╗')
    console.log('║  ✅ IMPORT COMPLETE                                          ║')
    console.log('╠══════════════════════════════════════════════════════════════╣')
    console.log(`║  🛒 New Orders Imported: ${String(insertedOrders).padEnd(34)}║`)
    console.log(`║  📦 Line Items Imported: ${String(insertedLineItems).padEnd(34)}║`)
    console.log('╚══════════════════════════════════════════════════════════════╝')

    // Show final date range in DB
    const { data: finalRange } = await supabase
      .from('orders')
      .select('creation_date')
      .eq('store_id', store.id)
      .order('creation_date', { ascending: true })
      .limit(1)

    const { data: lastOrder } = await supabase
      .from('orders')
      .select('creation_date')
      .eq('store_id', store.id)
      .order('creation_date', { ascending: false })
      .limit(1)

    if (finalRange?.[0] && lastOrder?.[0]) {
      console.log(`\n📅 Final order date range: ${finalRange[0].creation_date.substring(0, 10)} → ${lastOrder[0].creation_date.substring(0, 10)}`)
    }

  } catch (err) {
    console.error('❌ Error:', err.message)
  }
}

fetchHistoricalOrders().catch(console.error)

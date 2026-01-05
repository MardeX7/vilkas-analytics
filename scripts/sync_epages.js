/**
 * ePages API Sync Script
 * Syncs real data from Billackering.eu to Supabase
 */

import { createClient } from '@supabase/supabase-js'

// ============================================
// CONFIGURATION
// ============================================

// ePages API credentials for Billackering.eu
const EPAGES_CONFIG = {
  apiUrl: 'https://www.billackering.eu/rs/shops/billackering',
  accessToken: 'XH5IrE6QIY3PLL6pX5bUr7n1jcmgeuYq',
  shopId: 'billackering'
}

// Supabase credentials
const supabaseUrl = 'https://tlothekaphtiwvusgwzh.supabase.co'
const serviceRoleKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRsb3RoZWthcGh0aXd2dXNnd3poIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NzYxOTYwMCwiZXhwIjoyMDgzMTk1NjAwfQ.PxMeALq2SEylsXwybYAASYcxjtVBzjjiWFsiOulhQyY'

const supabase = createClient(supabaseUrl, serviceRoleKey)

// ============================================
// ePages API Helper
// ============================================

async function fetchFromEpages(endpoint, params = {}) {
  const url = new URL(`${EPAGES_CONFIG.apiUrl}${endpoint}`)
  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.append(key, value)
  })

  console.log(`📡 Fetching: ${url.pathname}`)

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
// STORE
// ============================================

async function syncStore() {
  console.log('\n🏪 Syncing store info...')

  try {
    // Fetch shop info from ePages
    const shopInfo = await fetchFromEpages('')

    // Upsert store in Supabase
    const { data: store, error } = await supabase
      .from('stores')
      .upsert({
        epages_shop_id: EPAGES_CONFIG.shopId,
        name: shopInfo.name || 'Billackering.eu',
        domain: 'billackering.eu',
        currency: shopInfo.currency || 'EUR',
        locale: shopInfo.locale || 'sv_SE',
        access_token: EPAGES_CONFIG.accessToken
      }, {
        onConflict: 'epages_shop_id'
      })
      .select()
      .single()

    if (error) throw error

    console.log(`✅ Store synced: ${store.name}`)
    return store
  } catch (err) {
    console.error('❌ Store sync error:', err.message)

    // Fallback: create store without API data
    const { data: store, error } = await supabase
      .from('stores')
      .upsert({
        epages_shop_id: EPAGES_CONFIG.shopId,
        name: 'Billackering.eu',
        domain: 'billackering.eu',
        currency: 'EUR',
        locale: 'sv_SE',
        access_token: EPAGES_CONFIG.accessToken
      }, {
        onConflict: 'epages_shop_id'
      })
      .select()
      .single()

    if (error) throw error
    return store
  }
}

// ============================================
// PRODUCTS
// ============================================

async function syncProducts(storeId) {
  console.log('\n📦 Syncing products...')

  let allProducts = []
  let page = 1
  const resultsPerPage = 100

  try {
    while (true) {
      const response = await fetchFromEpages('/products', {
        page,
        resultsPerPage
      })

      const items = response.items || []
      if (items.length === 0) break

      allProducts = allProducts.concat(items)
      console.log(`   📝 Fetched ${allProducts.length} products...`)

      if (items.length < resultsPerPage) break
      page++
    }

    console.log(`   📦 Total products from API: ${allProducts.length}`)

    // Map and insert products
    const products = allProducts.map(p => ({
      store_id: storeId,
      epages_product_id: p.productId,
      product_number: p.productNumber || p.sku,
      name: p.name || 'Unknown Product',
      description: p.description,
      short_description: p.shortDescription,
      price_amount: p.priceInfo?.price?.amount || 0,
      price_currency: p.priceInfo?.price?.currency || 'EUR',
      tax_rate: p.priceInfo?.taxRate || 0,
      stock_level: p.stockLevel ?? 0,
      min_stock_level: p.minStockLevel ?? 0,
      for_sale: p.forSale !== false,
      manufacturer: p.manufacturer,
      ean: p.ean,
      category_id: p.categoryId,
      category_name: p.categoryName,
      image_url: p.images?.[0]?.url
    }))

    // Upsert in batches
    const batchSize = 100
    let inserted = 0

    for (let i = 0; i < products.length; i += batchSize) {
      const batch = products.slice(i, i + batchSize)

      const { error } = await supabase
        .from('products')
        .upsert(batch, {
          onConflict: 'store_id,epages_product_id'
        })

      if (error) {
        console.error(`   ❌ Batch ${i / batchSize + 1} error:`, error.message)
      } else {
        inserted += batch.length
      }
    }

    console.log(`✅ Products synced: ${inserted}`)
    return inserted
  } catch (err) {
    console.error('❌ Products sync error:', err.message)
    return 0
  }
}

// ============================================
// CUSTOMERS
// ============================================

async function syncCustomers(storeId) {
  console.log('\n👥 Syncing customers...')

  let allCustomers = []
  let page = 1
  const resultsPerPage = 100

  try {
    while (true) {
      const response = await fetchFromEpages('/customers', {
        page,
        resultsPerPage
      })

      const items = response.items || []
      if (items.length === 0) break

      allCustomers = allCustomers.concat(items)
      console.log(`   📝 Fetched ${allCustomers.length} customers...`)

      if (items.length < resultsPerPage) break
      page++
    }

    console.log(`   👥 Total customers from API: ${allCustomers.length}`)

    // Map and insert customers
    const customers = allCustomers.map(c => ({
      store_id: storeId,
      epages_customer_id: c.customerId,
      customer_number: c.customerNumber,
      company: c.billingAddress?.company,
      salutation: c.billingAddress?.salutation,
      first_name: c.billingAddress?.firstName,
      last_name: c.billingAddress?.lastName,
      street: c.billingAddress?.street,
      street_details: c.billingAddress?.streetDetails,
      zip_code: c.billingAddress?.zipCode,
      city: c.billingAddress?.city,
      state: c.billingAddress?.state,
      country: c.billingAddress?.country,
      email: c.billingAddress?.emailAddress,
      phone: c.billingAddress?.phone
    }))

    // Upsert in batches
    const batchSize = 100
    let inserted = 0

    for (let i = 0; i < customers.length; i += batchSize) {
      const batch = customers.slice(i, i + batchSize)

      const { error } = await supabase
        .from('customers')
        .upsert(batch, {
          onConflict: 'store_id,epages_customer_id'
        })

      if (error) {
        console.error(`   ❌ Batch ${i / batchSize + 1} error:`, error.message)
      } else {
        inserted += batch.length
      }
    }

    console.log(`✅ Customers synced: ${inserted}`)
    return inserted
  } catch (err) {
    console.error('❌ Customers sync error:', err.message)
    return 0
  }
}

// ============================================
// ORDERS
// ============================================

async function syncOrders(storeId) {
  console.log('\n🛒 Syncing orders...')

  let allOrders = []
  let page = 1
  const resultsPerPage = 100

  try {
    while (true) {
      const response = await fetchFromEpages('/orders', {
        page,
        resultsPerPage
      })

      const items = response.items || []
      if (items.length === 0) break

      allOrders = allOrders.concat(items)
      console.log(`   📝 Fetched ${allOrders.length} orders...`)

      if (items.length < resultsPerPage) break
      page++
    }

    console.log(`   🛒 Total orders from API: ${allOrders.length}`)

    // Process orders one by one to handle line items
    let insertedOrders = 0
    let insertedLineItems = 0

    for (const order of allOrders) {
      try {
        // Find or create customer reference
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

        // Insert order
        const { data: insertedOrder, error: orderError } = await supabase
          .from('orders')
          .upsert({
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
            // Find product reference
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

            const { error: lineItemError } = await supabase
              .from('order_line_items')
              .upsert({
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
          console.log(`   📝 Processed ${insertedOrders}/${allOrders.length} orders...`)
        }
      } catch (err) {
        console.error(`   ❌ Order processing error:`, err.message)
      }
    }

    console.log(`✅ Orders synced: ${insertedOrders}`)
    console.log(`✅ Line items synced: ${insertedLineItems}`)
    return insertedOrders
  } catch (err) {
    console.error('❌ Orders sync error:', err.message)
    return 0
  }
}

// ============================================
// MAIN SYNC FUNCTION
// ============================================

async function sync() {
  console.log('╔══════════════════════════════════════════════════════════════╗')
  console.log('║  🔄 VilkasAnalytics - ePages Data Sync                       ║')
  console.log('║  📦 Source: Billackering.eu                                  ║')
  console.log('╚══════════════════════════════════════════════════════════════╝')

  const startTime = Date.now()

  try {
    // 1. Sync store
    const store = await syncStore()
    if (!store) {
      throw new Error('Failed to sync store')
    }

    // 2. Sync products
    const productCount = await syncProducts(store.id)

    // 3. Sync customers
    const customerCount = await syncCustomers(store.id)

    // 4. Sync orders (includes line items)
    const orderCount = await syncOrders(store.id)

    // Summary
    const duration = ((Date.now() - startTime) / 1000).toFixed(1)

    console.log('\n╔══════════════════════════════════════════════════════════════╗')
    console.log('║  ✅ SYNC COMPLETE                                            ║')
    console.log('╠══════════════════════════════════════════════════════════════╣')
    console.log(`║  🏪 Store: ${store.name.padEnd(48)}║`)
    console.log(`║  📦 Products: ${String(productCount).padEnd(45)}║`)
    console.log(`║  👥 Customers: ${String(customerCount).padEnd(44)}║`)
    console.log(`║  🛒 Orders: ${String(orderCount).padEnd(47)}║`)
    console.log(`║  ⏱️  Duration: ${duration}s${' '.repeat(43 - duration.length)}║`)
    console.log('╚══════════════════════════════════════════════════════════════╝')

  } catch (err) {
    console.error('\n❌ SYNC FAILED:', err.message)
    process.exit(1)
  }
}

// Run sync
sync()

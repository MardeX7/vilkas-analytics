/**
 * ePages Sync API Endpoint
 * Syncs orders from ePages API for a specific store
 * Called by daily cron job or manually
 */

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

export const config = {
  maxDuration: 300, // 5 minutes max
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { store_id, days_back = 7 } = req.body

  if (!store_id) {
    return res.status(400).json({ error: 'store_id required' })
  }

  if (!supabaseUrl || !supabaseServiceKey) {
    return res.status(500).json({ error: 'Missing Supabase credentials' })
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  try {
    console.log(`📡 Starting ePages sync for store ${store_id}`)

    // Get store with ePages credentials (from 'stores' table, not 'shops')
    const { data: store, error: storeError } = await supabase
      .from('stores')
      .select('id, name, domain, epages_shop_id, access_token')
      .eq('id', store_id)
      .single()

    if (storeError || !store) {
      return res.status(404).json({ error: 'Store not found' })
    }

    if (!store.access_token || !store.epages_shop_id) {
      return res.status(400).json({ error: 'Store has no ePages connection' })
    }

    // Calculate date range
    const endDate = new Date()
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - days_back)

    // Fetch orders from ePages API
    const apiUrl = `https://www.${store.domain}/rs/shops/${store.epages_shop_id}`

    let allOrders = []
    let page = 1
    const resultsPerPage = 100

    while (true) {
      const url = new URL(`${apiUrl}/orders`)
      url.searchParams.append('page', page)
      url.searchParams.append('resultsPerPage', resultsPerPage)
      url.searchParams.append('createdAfter', startDate.toISOString())

      const response = await fetch(url.toString(), {
        headers: {
          'Authorization': `Bearer ${store.access_token}`,
          'Accept': 'application/vnd.epages.v1+json'
        }
      })

      if (!response.ok) {
        const errorText = await response.text()
        console.error(`ePages API error: ${response.status} - ${errorText}`)
        break
      }

      const data = await response.json()
      const items = data.items || []

      if (items.length === 0) break

      allOrders = allOrders.concat(items)
      console.log(`   📝 Fetched ${allOrders.length} orders...`)

      if (items.length < resultsPerPage) break
      page++
    }

    console.log(`   🛒 Total orders from API: ${allOrders.length}`)

    // Process and upsert orders
    let insertedOrders = 0
    let insertedLineItems = 0

    for (const order of allOrders) {
      try {
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

        // Upsert order
        const { data: insertedOrder, error: orderError } = await supabase
          .from('orders')
          .upsert({
            store_id: store.id,
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
            currency: order.grandTotal?.currency || 'SEK',
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
          console.error(`Order ${order.orderNumber} error:`, orderError.message)
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
                onConflict: 'order_id,epages_line_item_id'
              })

            if (!lineItemError) {
              insertedLineItems++
            }
          }
        }
      } catch (err) {
        console.error(`Order processing error:`, err.message)
      }
    }

    console.log(`✅ ePages sync complete: ${insertedOrders} orders, ${insertedLineItems} line items`)

    return res.json({
      success: true,
      store_id: store.id,
      store_name: store.name,
      orders_synced: insertedOrders,
      line_items_synced: insertedLineItems,
      period: {
        start: startDate.toISOString(),
        end: endDate.toISOString()
      }
    })

  } catch (err) {
    console.error('ePages sync error:', err)
    return res.status(500).json({ error: err.message })
  }
}

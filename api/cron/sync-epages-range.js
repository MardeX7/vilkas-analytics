/**
 * ePages Sync API - Date Range Version
 * Syncs orders from ePages API for a specific store and date range
 * Used for historical backfill (month by month)
 *
 * POST /api/cron/sync-epages-range
 * Body: { store_id, start_date, end_date }
 */

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

export const config = {
  maxDuration: 300,
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { store_id, start_date, end_date } = req.body

  if (!store_id || !start_date || !end_date) {
    return res.status(400).json({ error: 'store_id, start_date, end_date required' })
  }

  if (!supabaseUrl || !supabaseServiceKey) {
    return res.status(500).json({ error: 'Missing Supabase credentials' })
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  try {
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

    const startDate = new Date(start_date)
    const endDate = new Date(end_date)

    console.log(`📡 Sync ${store.name}: ${start_date} → ${end_date}`)

    const domainWithoutWww = store.domain.replace(/^www\./, '')
    const apiUrl = `https://www.${domainWithoutWww}/rs/shops/${store.epages_shop_id}`

    let allOrders = []
    let page = 1
    const resultsPerPage = 100

    while (true) {
      const url = new URL(`${apiUrl}/orders`)
      url.searchParams.append('page', page)
      url.searchParams.append('resultsPerPage', resultsPerPage)
      url.searchParams.append('createdAfter', startDate.toISOString())
      url.searchParams.append('createdBefore', endDate.toISOString())

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

      // Fetch order details individually (needed for line items)
      for (const orderSummary of items) {
        try {
          const orderDetailRes = await fetch(`${apiUrl}/orders/${orderSummary.orderId}`, {
            headers: {
              'Authorization': `Bearer ${store.access_token}`,
              'Accept': 'application/vnd.epages.v1+json'
            }
          })

          if (orderDetailRes.ok) {
            allOrders.push(await orderDetailRes.json())
          } else {
            allOrders.push(orderSummary)
          }
        } catch (err) {
          allOrders.push(orderSummary)
        }
      }

      console.log(`   📝 Page ${page}: ${allOrders.length} orders fetched`)

      if (items.length < resultsPerPage) break
      page++
    }

    console.log(`   🛒 Total orders: ${allOrders.length}`)

    // Process and upsert orders
    let insertedOrders = 0
    let insertedLineItems = 0

    for (const order of allOrders) {
      try {
        const statusMap = {
          'InProgress': 'pending', 'Pending': 'pending',
          'ReadyForDispatch': 'paid', 'Dispatched': 'shipped',
          'Delivered': 'delivered', 'Cancelled': 'cancelled',
          'Returned': 'cancelled', 'Closed': 'delivered'
        }

        const hasVatId = order.billingAddress?.vatId && order.billingAddress.vatId.trim() !== ''
        const hasCompany = order.billingAddress?.company && order.billingAddress.company.trim() !== ''

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
            grand_total: typeof order.grandTotal === 'object' ? (order.grandTotal?.amount || 0) : parseFloat(order.grandTotal) || 0,
            total_before_tax: typeof order.totalBeforeTax === 'object' ? order.totalBeforeTax?.amount : parseFloat(order.totalBeforeTax) || null,
            total_tax: typeof order.totalTax === 'object' ? order.totalTax?.amount : parseFloat(order.totalTax) || null,
            shipping_price: typeof order.shippingPrice === 'object' ? (order.shippingPrice?.amount || 0) : parseFloat(order.shippingPrice) || 0,
            discount_amount: typeof order.discountAmount === 'object' ? (order.discountAmount?.amount || 0) : parseFloat(order.discountAmount) || 0,
            currency: typeof order.grandTotal === 'object' ? (order.grandTotal?.currency || 'EUR') : 'EUR',
            billing_company: order.billingAddress?.company,
            billing_first_name: order.billingAddress?.firstName,
            billing_last_name: order.billingAddress?.lastName,
            billing_street: order.billingAddress?.street,
            billing_zip_code: order.billingAddress?.zipCode,
            billing_city: order.billingAddress?.city,
            billing_country: order.billingAddress?.country,
            billing_email: order.billingAddress?.emailAddress,
            billing_vat_id: order.billingAddress?.vatId,
            is_b2b: hasVatId,
            is_b2b_soft: !hasVatId && hasCompany,
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

        if (orderError) continue

        insertedOrders++

        // Customer sync
        if (order.billingAddress?.emailAddress || order.customerId) {
          try {
            const { data: customerResult } = await supabase.rpc('upsert_customer_from_order', {
              p_store_id: store.id,
              p_epages_customer_id: order.customerId || `order-${order.orderId}`,
              p_customer_number: order.customerNumber || null,
              p_email: order.billingAddress?.emailAddress,
              p_company: order.billingAddress?.company,
              p_city: order.billingAddress?.city,
              p_country: order.billingAddress?.country,
              p_postal_code: order.billingAddress?.zipCode,
              p_order_total: typeof order.grandTotal === 'object' ? (order.grandTotal?.amount || 0) : parseFloat(order.grandTotal) || 0,
              p_order_date: order.creationDate?.split('T')[0]
            })

            if (customerResult) {
              await supabase.from('orders').update({ customer_id: customerResult }).eq('id', insertedOrder.id)
            }
          } catch (custErr) {
            // skip
          }
        }

        // Line items
        if (order.lineItemContainer?.productLineItems) {
          const { count: existingCount } = await supabase
            .from('order_line_items')
            .select('*', { count: 'exact', head: true })
            .eq('order_id', insertedOrder.id)

          if (existingCount > 0) {
            insertedLineItems += existingCount
          } else {
            for (const item of order.lineItemContainer.productLineItems) {
              const qty = typeof item.quantity === 'object' ? (item.quantity?.amount || 1) : (item.quantity || 1)
              const { error: lineItemError } = await supabase
                .from('order_line_items')
                .insert({
                  order_id: insertedOrder.id,
                  epages_line_item_id: item.lineItemId,
                  product_number: item.productNumber || item.sku,
                  product_name: item.name || 'Unknown',
                  quantity: Math.round(qty),
                  unit_price: item.unitPrice?.amount || item.singleItemPrice?.amount || 0,
                  total_price: item.lineItemPrice?.amount || 0,
                  tax_rate: item.taxClass?.percentage || item.taxRate || 0,
                  tax_amount: item.taxAmount?.amount || 0,
                  discount_amount: item.discountAmount?.amount || item.lineItemCouponDiscount?.amount || 0
                })
              if (!lineItemError) insertedLineItems++
            }
          }
        }
      } catch (err) {
        console.error(`Order processing error:`, err.message)
      }
    }

    return res.json({
      success: true,
      store_name: store.name,
      orders_synced: insertedOrders,
      line_items_synced: insertedLineItems,
      period: { start: start_date, end: end_date }
    })

  } catch (err) {
    console.error('Sync error:', err)
    return res.status(500).json({ error: err.message })
  }
}

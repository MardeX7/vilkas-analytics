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
    // KORJAUS: Älä lisää www. jos domain jo sisältää sen
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

      // ePages API ei palauta lineItemContainer orders-listauksessa,
      // joten haetaan jokaisen tilauksen tiedot erikseen
      for (const orderSummary of items) {
        try {
          const orderDetailUrl = `${apiUrl}/orders/${orderSummary.orderId}`
          const orderDetailRes = await fetch(orderDetailUrl, {
            headers: {
              'Authorization': `Bearer ${store.access_token}`,
              'Accept': 'application/vnd.epages.v1+json'
            }
          })

          if (orderDetailRes.ok) {
            const fullOrder = await orderDetailRes.json()
            allOrders.push(fullOrder)
          } else {
            // Fallback to summary if detail fetch fails
            allOrders.push(orderSummary)
          }
        } catch (err) {
          console.error(`   ⚠️ Failed to fetch order ${orderSummary.orderId} details:`, err.message)
          allOrders.push(orderSummary)
        }
      }

      console.log(`   📝 Fetched ${allOrders.length} orders with details...`)

      if (items.length < resultsPerPage) break
      page++
    }

    console.log(`   🛒 Total orders from API: ${allOrders.length}`)

    // Process and upsert orders
    let insertedOrders = 0
    let insertedLineItems = 0
    let b2bOrders = 0
    let b2bSoftOrders = 0
    let customersCreated = 0

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

        // B2B detection: vatId = confirmed B2B, company only = soft B2B
        const hasVatId = order.billingAddress?.vatId && order.billingAddress.vatId.trim() !== ''
        const hasCompany = order.billingAddress?.company && order.billingAddress.company.trim() !== ''
        const isB2B = hasVatId
        const isB2BSoft = !hasVatId && hasCompany

        // Upsert order with B2B flags
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
            currency: typeof order.grandTotal === 'object' ? (order.grandTotal?.currency || 'SEK') : 'SEK',
            billing_company: order.billingAddress?.company,
            billing_first_name: order.billingAddress?.firstName,
            billing_last_name: order.billingAddress?.lastName,
            billing_street: order.billingAddress?.street,
            billing_zip_code: order.billingAddress?.zipCode,
            billing_city: order.billingAddress?.city,
            billing_country: order.billingAddress?.country,
            billing_email: order.billingAddress?.emailAddress,
            billing_vat_id: order.billingAddress?.vatId,
            is_b2b: isB2B,
            is_b2b_soft: isB2BSoft,
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
        if (isB2B) b2bOrders++
        if (isB2BSoft) b2bSoftOrders++

        // Create/update customer and link to order
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

            // Link order to customer
            if (customerResult) {
              await supabase
                .from('orders')
                .update({ customer_id: customerResult })
                .eq('id', insertedOrder.id)
              customersCreated++
            }
          } catch (custErr) {
            console.log(`   ⚠️ Customer sync skipped: ${custErr.message}`)
          }
        }

        // Sync line items
        if (order.lineItemContainer?.productLineItems) {
          // Check if line items already exist for this order
          const { count: existingCount } = await supabase
            .from('order_line_items')
            .select('*', { count: 'exact', head: true })
            .eq('order_id', insertedOrder.id)

          if (existingCount > 0) {
            // Line items already synced, skip
            insertedLineItems += existingCount
          } else {
            for (const item of order.lineItemContainer.productLineItems) {
              // quantity voi olla numero tai objekti {amount, unit}
              const qty = typeof item.quantity === 'object' ? (item.quantity?.amount || 1) : (item.quantity || 1)
              // Round qty to handle decimal quantities (DB expects integer)
              const roundedQty = Math.round(qty)

              const { error: lineItemError } = await supabase
                .from('order_line_items')
                .insert({
                  order_id: insertedOrder.id,
                  epages_line_item_id: item.lineItemId,
                  product_number: item.productNumber || item.sku,
                  product_name: item.name || 'Unknown',
                  quantity: roundedQty,
                  unit_price: item.unitPrice?.amount || item.singleItemPrice?.amount || 0,
                  total_price: item.lineItemPrice?.amount || 0,
                  tax_rate: item.taxClass?.percentage || item.taxRate || 0,
                  tax_amount: item.taxAmount?.amount || 0,
                  discount_amount: item.discountAmount?.amount || item.lineItemCouponDiscount?.amount || 0
                })

              if (!lineItemError) {
                insertedLineItems++
              }
            }
          }
        }
      } catch (err) {
        console.error(`Order processing error:`, err.message)
      }
    }

    console.log(`✅ ePages sync complete: ${insertedOrders} orders, ${insertedLineItems} line items`)
    console.log(`   B2B: ${b2bOrders} confirmed, ${b2bSoftOrders} soft | Customers: ${customersCreated}`)

    return res.json({
      success: true,
      store_id: store.id,
      store_name: store.name,
      orders_synced: insertedOrders,
      line_items_synced: insertedLineItems,
      b2b_orders: b2bOrders,
      b2b_soft_orders: b2bSoftOrders,
      customers_synced: customersCreated,
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

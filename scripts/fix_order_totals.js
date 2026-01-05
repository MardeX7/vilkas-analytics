/**
 * Fix Order Totals - Fetch missing grand_total from ePages API
 *
 * ePages /orders endpoint ei palauta grand_total listanäkymässä.
 * Tämä skripti hakee jokaisen tilauksen erikseen ja päivittää summat.
 */

import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'

config({ path: '.env.local' })

const supabaseUrl = process.env.VITE_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const supabase = createClient(supabaseUrl, serviceRoleKey)

const STORE_ID = 'a28836f6-9487-4b67-9194-e907eaf94b69'
const EPAGES_API = 'https://www.billackering.eu/rs/shops/billackering'

let accessToken = null

async function getAccessToken() {
  const { data: store } = await supabase
    .from('stores')
    .select('access_token')
    .eq('id', STORE_ID)
    .single()

  return store?.access_token
}

async function fetchOrderDetails(orderId) {
  const response = await fetch(`${EPAGES_API}/orders/${orderId}`, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/vnd.epages.v1+json'
    }
  })

  if (!response.ok) {
    throw new Error(`API error ${response.status}`)
  }

  return response.json()
}

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════╗')
  console.log('║  🔧 Fix Order Totals - Fetch from ePages API                 ║')
  console.log('╚══════════════════════════════════════════════════════════════╝')

  accessToken = await getAccessToken()
  if (!accessToken) {
    console.error('❌ No access token found')
    process.exit(1)
  }

  // Get orders with grand_total = 0 (fetch ALL, not just 1000)
  let zeroOrders = []
  let offset = 0
  const batchSize = 1000

  while (true) {
    const { data: batch } = await supabase
      .from('orders')
      .select('id, epages_order_id, order_number')
      .eq('store_id', STORE_ID)
      .eq('grand_total', 0)
      .order('creation_date', { ascending: true })
      .range(offset, offset + batchSize - 1)

    if (!batch || batch.length === 0) break
    zeroOrders = zeroOrders.concat(batch)
    offset += batchSize
    if (batch.length < batchSize) break
  }

  const count = zeroOrders.length

  console.log(`\n📦 Found ${count} orders with grand_total = 0`)
  console.log('   Fetching details from ePages API...\n')

  let updated = 0
  let errors = 0

  for (let i = 0; i < zeroOrders.length; i++) {
    const order = zeroOrders[i]

    try {
      // Fetch full order details
      const details = await fetchOrderDetails(order.epages_order_id)

      // ePages returns values as strings or numbers, not objects with .amount
      const grandTotal = parseFloat(details.grandTotal) || parseFloat(details.grandTotal?.amount) || 0
      const totalBeforeTax = parseFloat(details.totalBeforeTax) || parseFloat(details.totalBeforeTax?.amount) || 0
      const totalTax = parseFloat(details.totalTax) || parseFloat(details.totalTax?.amount) || 0
      const shippingPrice = parseFloat(details.shippingPrice) || parseFloat(details.shippingPrice?.amount) || 0

      // Update order in DB
      const { error: updateError, data: updateData } = await supabase
        .from('orders')
        .update({
          grand_total: grandTotal,
          total_before_tax: totalBeforeTax,
          total_tax: totalTax,
          shipping_price: shippingPrice
        })
        .eq('id', order.id)
        .select()

      if (updateError) {
        console.error(`   ❌ Order ${order.order_number}: ${updateError.message}`)
        errors++
      } else if (!updateData || updateData.length === 0) {
        console.error(`   ⚠️ Order ${order.order_number}: No rows updated`)
        errors++
      } else {
        updated++
      }

      // Insert line items if missing
      if (details.lineItemContainer?.productLineItems) {
        for (const item of details.lineItemContainer.productLineItems) {
          await supabase
            .from('order_line_items')
            .upsert({
              order_id: order.id,
              epages_line_item_id: item.lineItemId,
              product_number: item.productNumber || item.sku,
              product_name: item.name || 'Unknown',
              quantity: item.quantity || 1,
              unit_price: item.unitPrice?.amount || 0,
              total_price: item.lineItemPrice?.amount || 0,
              tax_rate: item.taxRate || 0,
              tax_amount: item.taxAmount?.amount || 0
            }, {
              onConflict: 'order_id,epages_line_item_id'
            })
        }
      }

      // Progress
      if ((i + 1) % 100 === 0) {
        console.log(`   📝 Processed ${i + 1}/${zeroOrders.length} orders...`)
      }

      // Rate limiting (don't hammer the API)
      await new Promise(r => setTimeout(r, 100))

    } catch (err) {
      console.error(`   ⚠️ Order ${order.order_number}: ${err.message}`)
      errors++
    }
  }

  console.log('\n╔══════════════════════════════════════════════════════════════╗')
  console.log('║  ✅ COMPLETE                                                  ║')
  console.log('╠══════════════════════════════════════════════════════════════╣')
  console.log(`║  Updated: ${String(updated).padEnd(49)}║`)
  console.log(`║  Errors: ${String(errors).padEnd(50)}║`)
  console.log('╚══════════════════════════════════════════════════════════════╝')
}

main()

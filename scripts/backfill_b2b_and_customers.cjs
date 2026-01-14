/**
 * Backfill B2B status and customers from existing orders
 *
 * This script:
 * 1. Updates is_b2b and is_b2b_soft on all orders based on billing_company
 * 2. Creates customer records from order data
 * 3. Links orders to customers
 *
 * Run: node scripts/backfill_b2b_and_customers.cjs
 */

const { supabase, printProjectInfo, STORE_ID } = require('./db.cjs')
const crypto = require('crypto')

// Calculate SHA256 hash of email
function hashEmail(email) {
  if (!email) return null
  const normalized = email.toLowerCase().trim()
  return crypto.createHash('sha256').update(normalized).digest('hex')
}

async function backfill() {
  printProjectInfo()
  console.log('🔄 Starting B2B and customer backfill...\n')

  // Step 1: Update B2B status on orders
  console.log('📊 Step 1: Updating B2B status on orders...')

  // Get all orders with billing info (paginated to avoid 1000 limit)
  let allOrders = []
  let offset = 0
  const pageSize = 1000

  while (true) {
    const { data: batch, error: batchErr } = await supabase
      .from('orders')
      .select('id, billing_company, billing_email, billing_city, billing_country, billing_zip_code, billing_first_name, billing_last_name, grand_total, creation_date, customer_id')
      .eq('store_id', STORE_ID)
      .order('creation_date', { ascending: true })
      .range(offset, offset + pageSize - 1)

    if (batchErr) {
      console.error('❌ Error fetching orders:', batchErr.message)
      return
    }

    if (!batch || batch.length === 0) break
    allOrders = allOrders.concat(batch)
    offset += pageSize
    console.log(`   Fetched ${allOrders.length} orders...`)
    if (batch.length < pageSize) break
  }

  const orders = allOrders
  console.log(`   Found ${orders.length} orders to process`)

  // Update B2B status
  let b2bCount = 0
  let b2bSoftCount = 0

  for (const order of orders) {
    const hasCompany = order.billing_company && order.billing_company.trim() !== ''
    // Note: We don't have VAT ID in existing data, so all are "soft" B2B
    const isB2BSoft = hasCompany

    if (isB2BSoft) {
      const { error } = await supabase
        .from('orders')
        .update({
          is_b2b: false,  // No VAT ID in existing data
          is_b2b_soft: true
        })
        .eq('id', order.id)

      if (!error) b2bSoftCount++
    }
  }

  console.log(`   ✅ Updated ${b2bSoftCount} orders as B2B (soft)`)
  console.log(`   ✅ ${orders.length - b2bSoftCount} orders remain B2C`)

  // Step 2: Create customer records
  console.log('\n📊 Step 2: Creating customer records...')

  // Group orders by email hash to find unique customers
  const customerMap = new Map()

  for (const order of orders) {
    const emailHash = hashEmail(order.billing_email)
    const key = emailHash || `no-email-${order.id}`

    if (!customerMap.has(key)) {
      customerMap.set(key, {
        email_hash: emailHash,
        billing_email: order.billing_email,
        orders: [],
        company: order.billing_company,
        city: order.billing_city,
        country: order.billing_country,
        postal_code: order.billing_zip_code,
        first_name: order.billing_first_name,
        last_name: order.billing_last_name
      })
    }

    customerMap.get(key).orders.push(order)

    // Update company if newer order has it
    if (order.billing_company && !customerMap.get(key).company) {
      customerMap.get(key).company = order.billing_company
    }
  }

  console.log(`   Found ${customerMap.size} unique customers (by email)`)

  // Insert customers and link orders
  let customersCreated = 0
  let ordersLinked = 0

  for (const [key, customerData] of customerMap) {
    // Skip entries without email (can't reliably track)
    if (!customerData.email_hash) {
      continue
    }

    // Calculate aggregates
    const totalOrders = customerData.orders.length
    const totalSpent = customerData.orders.reduce((sum, o) => sum + (parseFloat(o.grand_total) || 0), 0)
    const firstOrderDate = customerData.orders[0].creation_date?.split('T')[0]
    const lastOrderDate = customerData.orders[customerData.orders.length - 1].creation_date?.split('T')[0]

    // Generate a synthetic epages_customer_id based on email hash
    const syntheticCustomerId = `backfill-${customerData.email_hash.substring(0, 16)}`

    // Check if customer already exists
    const { data: existing } = await supabase
      .from('customers')
      .select('id')
      .eq('store_id', STORE_ID)
      .eq('email_hash', customerData.email_hash)
      .maybeSingle()

    let customerId

    if (existing) {
      customerId = existing.id
      // Update existing customer stats
      await supabase
        .from('customers')
        .update({
          total_orders: totalOrders,
          total_spent: totalSpent,
          first_order_date: firstOrderDate,
          last_order_date: lastOrderDate,
          company: customerData.company || null,
          city: customerData.city,
          country: customerData.country,
          postal_code: customerData.postal_code
        })
        .eq('id', customerId)
    } else {
      // Insert new customer
      const { data: newCustomer, error: insertErr } = await supabase
        .from('customers')
        .insert({
          store_id: STORE_ID,
          epages_customer_id: syntheticCustomerId,
          email_hash: customerData.email_hash,
          company: customerData.company || null,
          city: customerData.city,
          country: customerData.country,
          postal_code: customerData.postal_code,
          first_order_date: firstOrderDate,
          last_order_date: lastOrderDate,
          total_orders: totalOrders,
          total_spent: totalSpent
        })
        .select('id')
        .single()

      if (insertErr) {
        console.error(`   ⚠️ Error inserting customer:`, insertErr.message)
        continue
      }

      customerId = newCustomer.id
      customersCreated++
    }

    // Link orders to customer
    for (const order of customerData.orders) {
      if (!order.customer_id) {
        const { error: linkErr } = await supabase
          .from('orders')
          .update({ customer_id: customerId })
          .eq('id', order.id)

        if (!linkErr) ordersLinked++
      }
    }
  }

  console.log(`   ✅ Created ${customersCreated} new customers`)
  console.log(`   ✅ Linked ${ordersLinked} orders to customers`)

  // Step 3: Summary statistics
  console.log('\n📊 Step 3: Verification...')

  const { count: totalOrders } = await supabase
    .from('orders')
    .select('*', { count: 'exact', head: true })
    .eq('store_id', STORE_ID)

  const { count: b2bOrders } = await supabase
    .from('orders')
    .select('*', { count: 'exact', head: true })
    .eq('store_id', STORE_ID)
    .eq('is_b2b_soft', true)

  const { count: linkedOrders } = await supabase
    .from('orders')
    .select('*', { count: 'exact', head: true })
    .eq('store_id', STORE_ID)
    .not('customer_id', 'is', null)

  const { count: totalCustomers } = await supabase
    .from('customers')
    .select('*', { count: 'exact', head: true })
    .eq('store_id', STORE_ID)

  console.log(`   Total orders: ${totalOrders}`)
  console.log(`   B2B orders (soft): ${b2bOrders} (${((b2bOrders/totalOrders)*100).toFixed(1)}%)`)
  console.log(`   Orders linked to customers: ${linkedOrders} (${((linkedOrders/totalOrders)*100).toFixed(1)}%)`)
  console.log(`   Total customers: ${totalCustomers}`)

  // Test RPC functions
  console.log('\n📊 Step 4: Testing RPC functions...')

  const { data: segments } = await supabase
    .rpc('get_customer_segment_summary', {
      p_store_id: STORE_ID
    })

  console.log('\n   Customer Segments (last 30 days):')
  if (segments) {
    segments.forEach(s => {
      console.log(`   - ${s.segment}: ${s.order_count} orders, ${Math.round(s.total_revenue)} kr (${s.revenue_share}%)`)
    })
  }

  console.log('\n✅ Backfill complete!')
}

backfill().catch(console.error)

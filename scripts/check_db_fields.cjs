/**
 * Check what data fields exist in VilkasAnalytics Supabase
 * Since ePages API token is expired, let's see what we already have
 */

const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: '.env.local' })

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function checkFields() {
  console.log('╔══════════════════════════════════════════════════════════════╗')
  console.log('║  🔍 VilkasAnalytics - Database Fields Check                  ║')
  console.log('╚══════════════════════════════════════════════════════════════╝')

  // 1. Check products table columns
  console.log('\n=== PRODUCTS TABLE ===')
  const { data: product, error: pErr } = await supabase
    .from('products')
    .select('*')
    .limit(1)
    .single()

  if (product) {
    console.log('Columns:', Object.keys(product).join(', '))
    console.log('\nSample product:')
    for (const [key, value] of Object.entries(product)) {
      if (value !== null && value !== undefined) {
        console.log(`  ${key}: ${typeof value === 'string' ? value.substring(0, 80) : value}`)
      }
    }
  }

  // 2. Check orders table columns
  console.log('\n\n=== ORDERS TABLE ===')
  const { data: order, error: oErr } = await supabase
    .from('orders')
    .select('*')
    .limit(1)
    .single()

  if (order) {
    console.log('Columns:', Object.keys(order).join(', '))
    console.log('\nSample order keys with values:')
    for (const [key, value] of Object.entries(order)) {
      if (value !== null && value !== undefined) {
        console.log(`  ${key}: (${typeof value})`)
      }
    }
  }

  // 3. Check customers table columns
  console.log('\n\n=== CUSTOMERS TABLE ===')
  const { data: customer, error: cErr } = await supabase
    .from('customers')
    .select('*')
    .limit(1)
    .single()

  if (customer) {
    console.log('Columns:', Object.keys(customer).join(', '))
  }

  // 4. Check order_line_items table
  console.log('\n\n=== ORDER_LINE_ITEMS TABLE ===')
  const { data: lineItem } = await supabase
    .from('order_line_items')
    .select('*')
    .limit(1)
    .single()

  if (lineItem) {
    console.log('Columns:', Object.keys(lineItem).join(', '))
  }

  // 5. List ALL tables in the database
  console.log('\n\n=== ALL TABLES ===')
  const { data: tables } = await supabase
    .rpc('get_tables_info')
    .catch(() => ({ data: null }))

  if (!tables) {
    // Fallback: query each known table to see if it exists
    const knownTables = [
      'products', 'orders', 'customers', 'order_line_items',
      'shops', 'stores', 'gsc_search_analytics', 'ga4_tokens',
      'ga4_ecommerce', 'inventory_snapshots', 'indicators',
      'indicator_history', 'alerts', 'categories', 'product_reviews'
    ]

    for (const table of knownTables) {
      const { count, error } = await supabase
        .from(table)
        .select('*', { count: 'exact', head: true })

      if (!error) {
        console.log(`  ✅ ${table}: ${count} rows`)
      }
    }
  }

  // 6. Check what order fields might have useful data
  console.log('\n\n=== ORDERS - CHECKING FOR USEFUL DATA ===')

  // Check is_b2b fields
  const { data: b2bOrders } = await supabase
    .from('orders')
    .select('is_b2b, is_b2b_soft')
    .not('is_b2b', 'is', null)
    .limit(5)
  console.log('B2B data:', b2bOrders)

  // Check payment methods
  const { data: paymentMethods } = await supabase
    .from('orders')
    .select('payment_method')
    .not('payment_method', 'is', null)
    .limit(10)
  const uniquePayments = [...new Set(paymentMethods?.map(p => p.payment_method))]
  console.log('Payment methods:', uniquePayments)

  // Check shipping methods
  const { data: shippingMethods } = await supabase
    .from('orders')
    .select('shipping_method')
    .not('shipping_method', 'is', null)
    .limit(10)
  const uniqueShipping = [...new Set(shippingMethods?.map(s => s.shipping_method))]
  console.log('Shipping methods:', uniqueShipping)

  // Check locales
  const { data: locales } = await supabase
    .from('orders')
    .select('locale')
    .not('locale', 'is', null)
    .limit(10)
  const uniqueLocales = [...new Set(locales?.map(l => l.locale))]
  console.log('Locales:', uniqueLocales)

  // Check notes/comments
  const { data: notes } = await supabase
    .from('orders')
    .select('note')
    .not('note', 'is', null)
    .limit(5)
  console.log('Orders with notes:', notes?.length || 0)

  // 7. Check products for any interesting fields
  console.log('\n\n=== PRODUCTS - INTERESTING FIELDS ===')

  // Check manufacturers
  const { data: manufacturers } = await supabase
    .from('products')
    .select('manufacturer')
    .not('manufacturer', 'is', null)
    .limit(20)
  const uniqueManufacturers = [...new Set(manufacturers?.map(m => m.manufacturer))]
  console.log('Manufacturers:', uniqueManufacturers.slice(0, 10))

  // Check EAN codes
  const { data: eans } = await supabase
    .from('products')
    .select('ean')
    .not('ean', 'is', null)
    .limit(5)
  console.log('Products with EAN:', eans?.length || 0)

  // Check cost_price
  const { data: costPrices } = await supabase
    .from('products')
    .select('cost_price')
    .not('cost_price', 'is', null)
    .limit(5)
  console.log('Products with cost_price:', costPrices?.length || 0)

  // Check categories
  const { data: cats } = await supabase
    .from('products')
    .select('category_id, category_name')
    .not('category_name', 'is', null)
    .limit(20)
  const uniqueCats = [...new Set(cats?.map(c => c.category_name))]
  console.log('Categories:', uniqueCats.slice(0, 10))
}

checkFields().catch(console.error)

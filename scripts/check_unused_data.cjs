/**
 * Check unused/underutilized data in VilkasAnalytics
 */

const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: '.env.local' })

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function check() {
  console.log('╔══════════════════════════════════════════════════════════════╗')
  console.log('║  🔍 Unused/Underutilized Data in VilkasAnalytics             ║')
  console.log('╚══════════════════════════════════════════════════════════════╝')

  // List all known tables and their row counts
  console.log('\n=== ALL TABLES ===')
  const tables = [
    'products', 'orders', 'customers', 'order_line_items',
    'shops', 'stores', 'gsc_search_analytics', 'ga4_tokens',
    'ga4_ecommerce', 'inventory_snapshots', 'indicators',
    'indicator_history', 'alerts'
  ]

  for (const table of tables) {
    const { count, error } = await supabase
      .from(table)
      .select('*', { count: 'exact', head: true })

    if (!error) {
      console.log(`  ✅ ${table.padEnd(25)} ${count} rows`)
    } else {
      console.log(`  ❌ ${table.padEnd(25)} (error: ${error.message})`)
    }
  }

  // Check orders for useful underutilized data
  console.log('\n\n=== ORDERS - UNDERUTILIZED FIELDS ===')

  // Payment methods distribution
  const { data: payments } = await supabase
    .from('orders')
    .select('payment_method')
  const paymentCounts = {}
  payments?.forEach(p => {
    const method = p.payment_method || 'unknown'
    paymentCounts[method] = (paymentCounts[method] || 0) + 1
  })
  console.log('\n📊 Payment methods:')
  Object.entries(paymentCounts).sort((a,b) => b[1] - a[1]).forEach(([method, count]) => {
    console.log(`   ${method}: ${count} orders`)
  })

  // Shipping methods distribution
  const { data: shipping } = await supabase
    .from('orders')
    .select('shipping_method')
  const shippingCounts = {}
  shipping?.forEach(s => {
    const method = s.shipping_method || 'unknown'
    shippingCounts[method] = (shippingCounts[method] || 0) + 1
  })
  console.log('\n📦 Shipping methods:')
  Object.entries(shippingCounts).sort((a,b) => b[1] - a[1]).forEach(([method, count]) => {
    console.log(`   ${method}: ${count} orders`)
  })

  // Locale distribution
  const { data: localeData } = await supabase
    .from('orders')
    .select('locale')
  const localeCounts = {}
  localeData?.forEach(l => {
    const locale = l.locale || 'unknown'
    localeCounts[locale] = (localeCounts[locale] || 0) + 1
  })
  console.log('\n🌍 Locales (language/market):')
  Object.entries(localeCounts).sort((a,b) => b[1] - a[1]).forEach(([locale, count]) => {
    console.log(`   ${locale}: ${count} orders`)
  })

  // Orders with notes
  const { data: notes, count: notesCount } = await supabase
    .from('orders')
    .select('note', { count: 'exact' })
    .not('note', 'is', null)
    .neq('note', '')
  console.log(`\n💬 Orders with customer notes: ${notesCount}`)
  if (notes?.length > 0) {
    console.log('   Sample notes:')
    notes.slice(0, 3).forEach(n => {
      console.log(`   - "${n.note?.substring(0, 60)}..."`)
    })
  }

  // Discount usage
  const { data: discounts, count: discountCount } = await supabase
    .from('orders')
    .select('discount_amount, grand_total', { count: 'exact' })
    .gt('discount_amount', 0)
  const totalDiscount = discounts?.reduce((sum, d) => sum + (d.discount_amount || 0), 0) || 0
  console.log(`\n💰 Orders with discounts: ${discountCount}`)
  console.log(`   Total discount given: ${totalDiscount.toFixed(2)} SEK`)

  // Check products for useful data
  console.log('\n\n=== PRODUCTS - UNDERUTILIZED FIELDS ===')

  // Manufacturers
  const { data: mfrs } = await supabase
    .from('products')
    .select('manufacturer')
    .not('manufacturer', 'is', null)
    .neq('manufacturer', '')
  const mfrCounts = {}
  mfrs?.forEach(m => {
    mfrCounts[m.manufacturer] = (mfrCounts[m.manufacturer] || 0) + 1
  })
  console.log('\n🏭 Manufacturers/brands:')
  Object.entries(mfrCounts).sort((a,b) => b[1] - a[1]).slice(0, 10).forEach(([mfr, count]) => {
    console.log(`   ${mfr}: ${count} products`)
  })

  // Products with EAN
  const { count: eanCount } = await supabase
    .from('products')
    .select('*', { count: 'exact', head: true })
    .not('ean', 'is', null)
    .neq('ean', '')
  console.log(`\n📊 Products with EAN code: ${eanCount}`)

  // Products with cost price
  const { count: costCount } = await supabase
    .from('products')
    .select('*', { count: 'exact', head: true })
    .not('cost_price', 'is', null)
  console.log(`💵 Products with cost_price: ${costCount}`)

  // Check customers for useful data
  console.log('\n\n=== CUSTOMERS - UNDERUTILIZED FIELDS ===')

  // Customers with phone
  const { count: phoneCount } = await supabase
    .from('customers')
    .select('*', { count: 'exact', head: true })
    .not('phone', 'is', null)
    .neq('phone', '')
  console.log(`📱 Customers with phone: ${phoneCount}`)

  // Customers by country
  const { data: custCountries } = await supabase
    .from('customers')
    .select('country')
    .not('country', 'is', null)
  const countryCounts = {}
  custCountries?.forEach(c => {
    countryCounts[c.country] = (countryCounts[c.country] || 0) + 1
  })
  console.log('\n🌍 Customers by country:')
  Object.entries(countryCounts).sort((a,b) => b[1] - a[1]).forEach(([country, count]) => {
    console.log(`   ${country}: ${count} customers`)
  })

  // Customers with company (B2B potential)
  const { count: companyCount } = await supabase
    .from('customers')
    .select('*', { count: 'exact', head: true })
    .not('company', 'is', null)
    .neq('company', '')
  console.log(`\n🏢 Customers with company name (B2B): ${companyCount}`)

  // Check line items for analysis potential
  console.log('\n\n=== ORDER LINE ITEMS - ANALYSIS POTENTIAL ===')

  // Most sold products
  const { data: topProducts } = await supabase
    .from('order_line_items')
    .select('product_name, quantity')
    .limit(10000)
  const productSales = {}
  topProducts?.forEach(item => {
    const name = item.product_name || 'unknown'
    productSales[name] = (productSales[name] || 0) + (item.quantity || 1)
  })
  console.log('\n📊 Top 10 most sold products:')
  Object.entries(productSales).sort((a,b) => b[1] - a[1]).slice(0, 10).forEach(([name, qty], i) => {
    console.log(`   ${i+1}. ${name.substring(0, 50)}: ${qty} units`)
  })

  // Summary
  console.log('\n\n╔══════════════════════════════════════════════════════════════╗')
  console.log('║  📋 SUMMARY: UNUSED/UNDERUTILIZED DATA                       ║')
  console.log('╚══════════════════════════════════════════════════════════════╝')
  console.log(`
🔴 NOT AVAILABLE (ePages API does not provide):
   - Product reviews/ratings (not in ePages REST API)
   - Product views/analytics (would need external tracking)
   - Cart abandonment data (would need real-time tracking)
   - Customer lifetime value history
   - Product bundles/relationships (no API field - detected by name)

🟡 AVAILABLE BUT NOT FULLY UTILIZED:
   - Payment methods → Could show payment method breakdown
   - Shipping methods → Could analyze shipping preferences
   - Locale/language → Could segment by market
   - Customer notes → Could analyze customer feedback
   - Discount usage → Could show discount impact
   - Manufacturer/brand → Could add brand analytics
   - EAN codes → Could be used for external integrations
   - Customer phone → Available for B2B outreach

🟢 ALREADY USED:
   - Sales data (orders, line items)
   - Customer data (B2B/B2C, countries)
   - Product data (stock, prices, categories)
   - GSC search data
   - GA4 ecommerce data
   - Inventory snapshots
`)
}

check().catch(console.error)

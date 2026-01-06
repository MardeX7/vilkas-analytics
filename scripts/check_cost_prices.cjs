/**
 * Check cost_price coverage in products
 */

const { supabase, printProjectInfo } = require('./db.cjs')

async function checkCostPrices() {
  printProjectInfo()

  const storeId = 'a28836f6-9487-4b67-9194-e907eaf94b69'

  // Get all products with cost_price info
  const { data: products, error } = await supabase
    .from('products')
    .select('id, name, price_amount, cost_price, product_number')
    .eq('store_id', storeId)

  if (error) {
    console.log('Error:', error.message)
    return
  }

  const total = products.length
  const withCost = products.filter(p => p.cost_price && parseFloat(p.cost_price) > 0)
  const withZeroCost = products.filter(p => p.cost_price !== null && parseFloat(p.cost_price) === 0)
  const withNullCost = products.filter(p => p.cost_price === null)

  console.log('\n📦 Cost Price Analysis:')
  console.log('='.repeat(50))
  console.log(`   Total products:        ${total}`)
  console.log(`   With cost_price > 0:   ${withCost.length} (${(withCost.length/total*100).toFixed(1)}%)`)
  console.log(`   With cost_price = 0:   ${withZeroCost.length}`)
  console.log(`   With cost_price = NULL: ${withNullCost.length}`)

  if (withCost.length > 0) {
    console.log('\n✅ Products WITH cost_price (sample):')
    for (const p of withCost.slice(0, 5)) {
      const name = p.name ? p.name.substring(0, 40) : 'N/A'
      console.log(`   ${p.product_number}: ${name} - Price: ${p.price_amount}, Cost: ${p.cost_price}`)
    }
  }

  if (withNullCost.length > 0) {
    console.log('\n❌ Products WITHOUT cost_price (sample):')
    for (const p of withNullCost.slice(0, 5)) {
      const name = p.name ? p.name.substring(0, 40) : 'N/A'
      console.log(`   ${p.product_number}: ${name} - Price: ${p.price_amount}`)
    }
  }

  // Check raw data
  console.log('\n📊 Sample raw data (first 3):')
  for (const p of products.slice(0, 3)) {
    console.log(`   cost_price value: "${p.cost_price}" (type: ${typeof p.cost_price})`)
  }
}

checkCostPrices().catch(console.error)

/**
 * Fix order_line_items product_id references
 *
 * Links order_line_items to products table using product_number
 *
 * Usage: node scripts/fix_order_line_items_product_id.cjs
 */

const { supabase, printProjectInfo } = require('./db.cjs')

async function fixProductIds() {
  printProjectInfo()

  // Get all products with their IDs
  console.log('🔄 Fetching products...')
  const { data: products, error: prodError } = await supabase
    .from('products')
    .select('id, product_number')

  if (prodError) {
    console.error('❌ Error fetching products:', prodError.message)
    return
  }

  // Create lookup map (lowercase for case-insensitive matching)
  const productMap = new Map()
  for (const p of products) {
    if (p.product_number) {
      productMap.set(p.product_number.toLowerCase(), p.id)
    }
  }
  console.log(`   Found ${productMap.size} products`)

  // Get order_line_items with NULL product_id
  console.log('\n🔄 Fetching order line items with NULL product_id...')
  const { data: items, error: itemsError } = await supabase
    .from('order_line_items')
    .select('id, product_number')
    .is('product_id', null)

  if (itemsError) {
    console.error('❌ Error fetching items:', itemsError.message)
    return
  }

  console.log(`   Found ${items.length} items to fix`)

  // Update in batches
  let updated = 0
  let notFound = 0
  const notFoundNumbers = new Set()

  for (const item of items) {
    if (!item.product_number) {
      notFound++
      continue
    }

    const productId = productMap.get(item.product_number.toLowerCase())

    if (productId) {
      const { error } = await supabase
        .from('order_line_items')
        .update({ product_id: productId })
        .eq('id', item.id)

      if (error) {
        console.error(`❌ Error updating item ${item.id}:`, error.message)
      } else {
        updated++
      }
    } else {
      notFound++
      notFoundNumbers.add(item.product_number)
    }
  }

  console.log(`\n✅ Updated ${updated} items`)
  console.log(`⚠️  ${notFound} items not matched (product not in products table)`)

  if (notFoundNumbers.size > 0 && notFoundNumbers.size <= 20) {
    console.log('\n   Products not found:')
    for (const num of notFoundNumbers) {
      console.log(`   - ${num}`)
    }
  } else if (notFoundNumbers.size > 20) {
    console.log(`\n   (${notFoundNumbers.size} unique product numbers not found)`)
  }

  // Verify
  const { count: stillNull } = await supabase
    .from('order_line_items')
    .select('*', { count: 'exact', head: true })
    .is('product_id', null)

  console.log(`\n📊 Final check: ${stillNull} items still have NULL product_id`)
}

fixProductIds()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('❌ Error:', err)
    process.exit(1)
  })

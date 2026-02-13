const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: '.env.local' })

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function checkCategories() {
  // Check category_id and category_name values
  const { data: cats } = await supabase
    .from('products')
    .select('category_id, category_name')
    .not('category_id', 'is', null)
    .limit(100)

  const uniqueCats = {}
  cats?.forEach(c => {
    const key = c.category_id
    if (!uniqueCats[key]) {
      uniqueCats[key] = c.category_name
    }
  })

  console.log('=== UNIQUE CATEGORIES ===')
  Object.entries(uniqueCats).forEach(([id, name]) => {
    console.log(`  ${id}: ${name}`)
  })

  // Find paket products
  const { data: pakets } = await supabase
    .from('products')
    .select('name, category_id, category_name')
    .ilike('name', '%paket%')
    .limit(10)

  console.log('\n=== PRODUCTS WITH PAKET IN NAME ===')
  pakets?.forEach(p => {
    console.log(`  ${p.name} | cat: ${p.category_name} (${p.category_id})`)
  })

  // Check if there's a specific category for bundles/packages
  const { data: paketCat } = await supabase
    .from('products')
    .select('category_id, category_name')
    .or('category_name.ilike.%paket%,category_name.ilike.%bundle%,category_name.ilike.%kit%')
    .limit(20)

  console.log('\n=== BUNDLE/PAKET CATEGORIES ===')
  const bundleCats = {}
  paketCat?.forEach(p => {
    if (!bundleCats[p.category_id]) {
      bundleCats[p.category_id] = p.category_name
    }
  })
  Object.entries(bundleCats).forEach(([id, name]) => {
    console.log(`  ${id}: ${name}`)
  })
}

checkCategories()

/**
 * Import Categories from CSV
 *
 * Reads Kategori-produkttilldelning.csv and imports:
 * 1. Categories (unique paths with hierarchy)
 * 2. Product-Category relationships (many-to-many)
 *
 * Usage: node scripts/import_categories.cjs
 */

const fs = require('fs')
const path = require('path')
const { supabase, printProjectInfo } = require('./db.cjs')

const CSV_FILE = path.join(__dirname, '..', 'Kategori-produkttilldelning.csv')

/**
 * Parse CSV line handling quoted values
 */
function parseCSVLine(line) {
  const values = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const char = line[i]

    if (char === '"') {
      inQuotes = !inQuotes
    } else if (char === ';' && !inQuotes) {
      values.push(current.trim())
      current = ''
    } else {
      current += char
    }
  }
  values.push(current.trim())

  return values
}

/**
 * Parse category path into levels
 * "Categories/Billack/Akrylfärg" → { level1: "Categories", level2: "Billack", level3: "Akrylfärg" }
 */
function parseCategoryPath(categoryPath) {
  const parts = categoryPath.split('/')

  return {
    category_path: categoryPath,
    level1: parts[0] || null,
    level2: parts[1] || null,
    level3: parts[2] || null,
    display_name: parts[parts.length - 1] // Last part as display name
  }
}

async function importCategories() {
  printProjectInfo()
  console.log('📂 Reading CSV file:', CSV_FILE)

  // Check if file exists
  if (!fs.existsSync(CSV_FILE)) {
    console.error('❌ CSV file not found!')
    process.exit(1)
  }

  // Read and parse CSV
  const content = fs.readFileSync(CSV_FILE, 'utf-8')
  const lines = content.split('\n').filter(line => line.trim())

  console.log(`📊 Found ${lines.length - 1} rows (excluding header)`)

  // Skip header row
  const dataRows = lines.slice(1)

  // Get store_id (assuming single store for now)
  const { data: stores, error: storeError } = await supabase
    .from('stores')
    .select('id, name')
    .limit(1)

  if (storeError || !stores?.length) {
    console.error('❌ No store found:', storeError?.message)
    process.exit(1)
  }

  const storeId = stores[0].id
  console.log(`🏪 Using store: ${stores[0].name} (${storeId})`)

  // Collect unique categories
  const categoryMap = new Map() // path → category data
  const productCategoryLinks = [] // { product_number, category_path, position, position_category }

  for (const line of dataRows) {
    const values = parseCSVLine(line)
    if (values.length < 2) continue

    const [categoryPath, productNumber, position, positionCategory] = values

    if (!categoryPath || !productNumber) continue

    // Clean product number (remove quotes)
    const cleanProductNumber = productNumber.replace(/"/g, '').trim()

    // Add category if not seen
    if (!categoryMap.has(categoryPath)) {
      categoryMap.set(categoryPath, parseCategoryPath(categoryPath))
    }

    // Add product-category link
    productCategoryLinks.push({
      product_number: cleanProductNumber,
      category_path: categoryPath,
      position: parseInt(position) || 0,
      position_category: parseInt(positionCategory) || 0
    })
  }

  console.log(`📁 Found ${categoryMap.size} unique categories`)
  console.log(`🔗 Found ${productCategoryLinks.length} product-category links`)

  // Step 1: Insert categories
  console.log('\n🔄 Inserting categories...')

  const categoryInserts = Array.from(categoryMap.values()).map(cat => ({
    store_id: storeId,
    category_path: cat.category_path,
    level1: cat.level1,
    level2: cat.level2,
    level3: cat.level3,
    display_name: cat.display_name
  }))

  // Insert in batches of 100
  let insertedCategories = 0
  for (let i = 0; i < categoryInserts.length; i += 100) {
    const batch = categoryInserts.slice(i, i + 100)
    const { error } = await supabase
      .from('categories')
      .upsert(batch, { onConflict: 'store_id,category_path' })

    if (error) {
      console.error(`❌ Error inserting categories batch ${i}:`, error.message)
    } else {
      insertedCategories += batch.length
    }
  }
  console.log(`✅ Inserted/updated ${insertedCategories} categories`)

  // Step 2: Get category IDs
  console.log('\n🔄 Fetching category IDs...')
  const { data: categories, error: catError } = await supabase
    .from('categories')
    .select('id, category_path')
    .eq('store_id', storeId)

  if (catError) {
    console.error('❌ Error fetching categories:', catError.message)
    process.exit(1)
  }

  const categoryIdMap = new Map()
  for (const cat of categories) {
    categoryIdMap.set(cat.category_path, cat.id)
  }

  // Step 3: Get product IDs
  console.log('🔄 Fetching product IDs...')
  const { data: products, error: prodError } = await supabase
    .from('products')
    .select('id, product_number')
    .eq('store_id', storeId)

  if (prodError) {
    console.error('❌ Error fetching products:', prodError.message)
    process.exit(1)
  }

  const productIdMap = new Map()
  for (const prod of products) {
    if (prod.product_number) {
      productIdMap.set(prod.product_number.toLowerCase(), prod.id)
    }
  }

  console.log(`   Found ${productIdMap.size} products in database`)

  // Step 4: Create product-category links
  console.log('\n🔄 Creating product-category links...')

  let linkedCount = 0
  let notFoundProducts = new Set()
  const productCategoryInserts = []

  for (const link of productCategoryLinks) {
    const productId = productIdMap.get(link.product_number.toLowerCase())
    const categoryId = categoryIdMap.get(link.category_path)

    if (!productId) {
      notFoundProducts.add(link.product_number)
      continue
    }

    if (!categoryId) {
      console.warn(`⚠️ Category not found: ${link.category_path}`)
      continue
    }

    productCategoryInserts.push({
      product_id: productId,
      category_id: categoryId,
      position: link.position,
      position_category: link.position_category
    })
  }

  // Insert in batches of 100
  for (let i = 0; i < productCategoryInserts.length; i += 100) {
    const batch = productCategoryInserts.slice(i, i + 100)
    const { error } = await supabase
      .from('product_categories')
      .upsert(batch, { onConflict: 'product_id,category_id' })

    if (error) {
      console.error(`❌ Error inserting links batch ${i}:`, error.message)
    } else {
      linkedCount += batch.length
    }
  }

  console.log(`✅ Created ${linkedCount} product-category links`)

  if (notFoundProducts.size > 0) {
    console.log(`\n⚠️ ${notFoundProducts.size} products not found in database:`)
    const examples = Array.from(notFoundProducts).slice(0, 10)
    console.log(`   Examples: ${examples.join(', ')}${notFoundProducts.size > 10 ? '...' : ''}`)
  }

  // Summary
  console.log('\n📊 Import Summary:')
  console.log(`   Categories: ${insertedCategories}`)
  console.log(`   Product-Category Links: ${linkedCount}`)
  console.log(`   Products not found: ${notFoundProducts.size}`)

  // Show sample of level 2 categories
  console.log('\n📁 Level 2 Categories (main groups):')
  const level2Counts = {}
  for (const cat of categoryMap.values()) {
    if (cat.level2) {
      level2Counts[cat.level2] = (level2Counts[cat.level2] || 0) + 1
    }
  }
  const sortedLevel2 = Object.entries(level2Counts).sort((a, b) => b[1] - a[1]).slice(0, 10)
  for (const [name, count] of sortedLevel2) {
    console.log(`   ${name}: ${count} subcategories`)
  }
}

importCategories()
  .then(() => {
    console.log('\n✅ Import completed!')
    process.exit(0)
  })
  .catch(err => {
    console.error('❌ Import failed:', err)
    process.exit(1)
  })

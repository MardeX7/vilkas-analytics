/**
 * Import cost prices from ePages CSV export
 *
 * Supports both stores:
 *   node scripts/import_cost_prices.cjs automaalit
 *   node scripts/import_cost_prices.cjs billackering
 *
 * CSV columns (auto-detected via bracketed names):
 * - [Alias] = product_number
 * - [GBasePurchasePrice] = cost_price
 * - [ListPrices/EUR/gross] or [ListPrices/SEK/gross] = sale price
 */

const { supabase, printProjectInfo } = require('./db.cjs')
const fs = require('fs')
const path = require('path')

const STORES = {
  automaalit: {
    store_id: '9a0ba934-bd6c-428c-8729-791d5c7ac7c2',
    csv: 'Automaalit_products_3_2026.csv',
    name: 'Automaalit.net'
  },
  billackering: {
    store_id: 'a28836f6-9487-4b67-9194-e907eaf94b69',
    csv: 'Billackering_products_1_2026.csv',
    name: 'Billackering.eu'
  }
}

const DEFAULT_MARGIN = 0.50 // 50% margin for products without cost_price

async function importCostPrices() {
  printProjectInfo()

  // Parse store argument
  const storeArg = (process.argv[2] || '').toLowerCase()
  const storeConfig = STORES[storeArg]

  if (!storeConfig) {
    console.log('Usage: node scripts/import_cost_prices.cjs <store>')
    console.log('  Stores: automaalit, billackering')
    process.exit(1)
  }

  const CSV_FILE = path.join(__dirname, '..', storeConfig.csv)
  const STORE_ID = storeConfig.store_id

  console.log(`\n📥 Importing cost prices for ${storeConfig.name}`)
  console.log('='.repeat(50))
  console.log(`   File: ${storeConfig.csv}`)
  console.log(`   Store ID: ${STORE_ID}`)

  if (!fs.existsSync(CSV_FILE)) {
    console.error(`❌ CSV file not found: ${CSV_FILE}`)
    process.exit(1)
  }

  // Read CSV
  const csvContent = fs.readFileSync(CSV_FILE, 'utf-8')
  const lines = csvContent.split('\n')

  // Parse header - use bracketed names for language-independent matching
  const header = parseCSVLine(lines[0])
  const idIndex = header.findIndex(h => h.includes('[Alias]'))
  const costIndex = header.findIndex(h => h.includes('[GBasePurchasePrice]'))
  const priceIndex = header.findIndex(h => h.includes('[ListPrices/'))

  console.log(`   ID column [Alias]: ${idIndex}`)
  console.log(`   Cost price column [GBasePurchasePrice]: ${costIndex}`)
  console.log(`   Price column [ListPrices/]: ${priceIndex}`)

  if (idIndex === -1 || costIndex === -1) {
    console.error('❌ Could not find required columns ([Alias] or [GBasePurchasePrice])')
    return
  }

  // Parse products from CSV
  const csvProducts = []
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue

    const cols = parseCSVLine(line)
    const productNumber = cols[idIndex]?.trim()
    const costPriceStr = cols[costIndex]?.trim()
    const priceStr = priceIndex >= 0 ? cols[priceIndex]?.trim() : null

    if (!productNumber) continue

    // Parse cost price (European format: 32,45 -> 32.45)
    let costPrice = null
    if (costPriceStr && costPriceStr !== '') {
      costPrice = parseFloat(costPriceStr.replace(',', '.'))
      if (isNaN(costPrice)) costPrice = null
    }

    // Parse sale price for default margin calculation
    let salePrice = null
    if (priceStr && priceStr !== '') {
      salePrice = parseFloat(priceStr.replace(',', '.'))
      if (isNaN(salePrice)) salePrice = null
    }

    csvProducts.push({
      productNumber,
      costPrice,
      salePrice
    })
  }

  const withActualCost = csvProducts.filter(p => p.costPrice !== null && p.costPrice > 0).length
  console.log(`   Parsed ${csvProducts.length} products from CSV (${withActualCost} with cost price)`)

  // Get products from database
  const { data: dbProducts, error } = await supabase
    .from('products')
    .select('id, product_number, price_amount')
    .eq('store_id', STORE_ID)

  if (error) {
    console.error('❌ Failed to fetch products:', error.message)
    return
  }

  console.log(`   Found ${dbProducts.length} products in database`)

  // Create lookup map from CSV
  const csvMap = new Map()
  for (const p of csvProducts) {
    csvMap.set(p.productNumber, p)
  }

  // Update products in batches
  let updated = 0
  let withCost = 0
  let withDefault = 0
  let notFound = 0
  const updates = []

  for (const dbProduct of dbProducts) {
    const csvProduct = csvMap.get(dbProduct.product_number)

    let costPrice = null

    if (csvProduct && csvProduct.costPrice !== null && csvProduct.costPrice > 0) {
      // Use CSV cost price
      costPrice = csvProduct.costPrice
      withCost++
    } else {
      // Calculate default cost price (50% of sale price)
      const salePrice = csvProduct?.salePrice || dbProduct.price_amount
      if (salePrice && salePrice > 0) {
        costPrice = Math.round(salePrice * (1 - DEFAULT_MARGIN) * 100) / 100
        withDefault++
      }
    }

    if (costPrice !== null) {
      updates.push({ id: dbProduct.id, product_number: dbProduct.product_number, cost_price: costPrice })
    } else {
      notFound++
    }
  }

  // Execute updates in batches of 50
  const batchSize = 50
  for (let i = 0; i < updates.length; i += batchSize) {
    const batch = updates.slice(i, i + batchSize)
    const promises = batch.map(u =>
      supabase
        .from('products')
        .update({ cost_price: u.cost_price })
        .eq('id', u.id)
    )
    const results = await Promise.all(promises)
    const errors = results.filter(r => r.error)
    if (errors.length > 0) {
      console.error(`   ❌ Batch ${Math.floor(i / batchSize) + 1}: ${errors.length} errors`)
    }
    updated += batch.length - errors.length
  }

  console.log('\n' + '='.repeat(50))
  console.log('📊 Results:')
  console.log(`   ✅ Updated: ${updated} products`)
  console.log(`   💰 With actual cost price: ${withCost}`)
  console.log(`   📏 With default 50% margin: ${withDefault}`)
  console.log(`   ⚠️ Not updated: ${notFound}`)

  // Show sample of updated products with actual cost
  if (withCost > 0) {
    const samples = updates.filter((_, i) => i < 5)
    console.log('\n📋 Sample updates:')
    for (const s of samples) {
      console.log(`   ${s.product_number}: cost_price = ${s.cost_price}`)
    }
  }

  // Verify
  const { data: verify } = await supabase
    .from('products')
    .select('id, cost_price')
    .eq('store_id', STORE_ID)
    .not('cost_price', 'is', null)

  console.log(`\n✅ Verification: ${verify?.length || 0} products now have cost_price in database`)
}

/**
 * Parse CSV line (handles semicolon separator and quoted fields)
 */
function parseCSVLine(line) {
  const result = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const char = line[i]

    if (char === '"') {
      inQuotes = !inQuotes
    } else if (char === ';' && !inQuotes) {
      result.push(current)
      current = ''
    } else {
      current += char
    }
  }
  result.push(current)

  return result
}

importCostPrices().catch(console.error)

/**
 * Import cost prices from ePages CSV export
 *
 * CSV columns:
 * - B: ID [Alias] = product_number
 * - K: Inköpspris [GBasePurchasePrice] = cost_price
 *
 * Run: node scripts/import_cost_prices.cjs
 */

const { supabase, printProjectInfo } = require('./db.cjs')
const fs = require('fs')
const path = require('path')

const CSV_FILE = path.join(__dirname, '..', 'Billackering_products_1_2026.csv')
const STORE_ID = 'a28836f6-9487-4b67-9194-e907eaf94b69'
const DEFAULT_MARGIN = 0.50 // 50% margin for products without cost_price

async function importCostPrices() {
  printProjectInfo()

  console.log('\n📥 Importing cost prices from CSV')
  console.log('='.repeat(50))
  console.log(`   File: ${CSV_FILE}`)

  // Read CSV
  const csvContent = fs.readFileSync(CSV_FILE, 'utf-8')
  const lines = csvContent.split('\n')

  // Parse header to find column indices
  const header = parseCSVLine(lines[0])
  const idIndex = header.findIndex(h => h.includes('ID [Alias]'))
  const costIndex = header.findIndex(h => h.includes('Inköpspris [GBasePurchasePrice]'))
  const priceIndex = header.findIndex(h => h.includes('Listpris/SEK/gross'))

  console.log(`   ID column: ${idIndex}`)
  console.log(`   Cost price column: ${costIndex}`)
  console.log(`   Price column: ${priceIndex}`)

  if (idIndex === -1 || costIndex === -1) {
    console.error('❌ Could not find required columns')
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
    const priceStr = cols[priceIndex]?.trim()

    if (!productNumber) continue

    // Parse cost price (Swedish format: 32,45 -> 32.45)
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

  console.log(`   Parsed ${csvProducts.length} products from CSV`)

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

  // Update products
  let updated = 0
  let withCost = 0
  let withDefault = 0
  let notFound = 0

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
        costPrice = salePrice * (1 - DEFAULT_MARGIN)
        withDefault++
      }
    }

    if (costPrice !== null) {
      const { error: updateError } = await supabase
        .from('products')
        .update({ cost_price: costPrice })
        .eq('id', dbProduct.id)

      if (updateError) {
        console.error(`   ❌ Failed to update ${dbProduct.product_number}:`, updateError.message)
      } else {
        updated++
      }
    } else {
      notFound++
    }
  }

  console.log('\n' + '='.repeat(50))
  console.log('📊 Results:')
  console.log(`   ✅ Updated: ${updated} products`)
  console.log(`   💰 With actual cost price: ${withCost}`)
  console.log(`   📏 With default 50% margin: ${withDefault}`)
  console.log(`   ⚠️ Not updated: ${notFound}`)

  // Verify
  const { data: verify } = await supabase
    .from('products')
    .select('id, cost_price')
    .eq('store_id', STORE_ID)
    .not('cost_price', 'is', null)

  console.log(`\n✅ Verification: ${verify?.length || 0} products now have cost_price`)

  console.log('\n💡 Run "node scripts/run_engine.cjs" to recalculate gross_margin')
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

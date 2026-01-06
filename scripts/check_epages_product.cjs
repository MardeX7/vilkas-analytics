/**
 * Check what ePages API returns for products
 * Looking for cost_price / purchase price field
 */

const { supabase, printProjectInfo } = require('./db.cjs')

const API_URL = 'https://www.billackering.eu/rs/shops/billackering'

async function checkEpagesProduct() {
  printProjectInfo()

  // Get access token
  const { data: store } = await supabase
    .from('stores')
    .select('access_token')
    .eq('epages_shop_id', 'billackering')
    .single()

  if (!store?.access_token) {
    console.log('❌ No access token found')
    return
  }

  console.log('✅ Token loaded\n')

  // Fetch one product with all fields
  const response = await fetch(`${API_URL}/products?resultsPerPage=1`, {
    headers: {
      'Authorization': `Bearer ${store.access_token}`,
      'Accept': 'application/vnd.epages.v1+json'
    }
  })

  if (!response.ok) {
    console.log('❌ API error:', response.status)
    return
  }

  const data = await response.json()
  const product = data.items?.[0]

  if (!product) {
    console.log('❌ No products found')
    return
  }

  console.log('📦 Sample Product from ePages API:')
  console.log('='.repeat(60))
  console.log(JSON.stringify(product, null, 2))
  console.log('='.repeat(60))

  // Look for price-related fields
  console.log('\n💰 Price-related fields:')
  console.log('   priceInfo:', JSON.stringify(product.priceInfo, null, 2))

  // Check for common purchase price field names
  const possibleFields = [
    'purchasePrice',
    'costPrice',
    'depositPrice',
    'manufacturerPrice',
    'basePrice',
    'wholesalePrice',
    'supplierPrice'
  ]

  console.log('\n🔍 Checking for purchase price fields:')
  for (const field of possibleFields) {
    const value = product[field] || product.priceInfo?.[field]
    if (value !== undefined) {
      console.log(`   ✅ ${field}: ${JSON.stringify(value)}`)
    }
  }

  // List all top-level keys
  console.log('\n📋 All product fields:')
  Object.keys(product).forEach(key => {
    const val = product[key]
    const type = typeof val === 'object' ? (Array.isArray(val) ? 'array' : 'object') : typeof val
    console.log(`   ${key}: ${type}`)
  })
}

checkEpagesProduct().catch(console.error)

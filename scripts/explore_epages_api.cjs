/**
 * ePages API Explorer
 * Finds available endpoints and unused data fields
 */

const EPAGES_CONFIG = {
  apiUrl: 'https://www.billackering.eu/rs/shops/billackering',
  accessToken: 'XH5IrE6QIY3PLL6pX5bUr7n1jcmgeuYq'
}

async function fetchFromEpages(endpoint) {
  const url = `${EPAGES_CONFIG.apiUrl}${endpoint}`
  console.log(`\n📡 Fetching: ${endpoint || '/'}`)

  try {
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${EPAGES_CONFIG.accessToken}`,
        'Accept': 'application/vnd.epages.v1+json'
      }
    })

    if (!response.ok) {
      console.log(`   ❌ ${response.status} ${response.statusText}`)
      return null
    }

    return response.json()
  } catch (err) {
    console.log(`   ❌ Error: ${err.message}`)
    return null
  }
}

async function explore() {
  console.log('╔══════════════════════════════════════════════════════════════╗')
  console.log('║  🔍 ePages API Explorer - Billackering.eu                    ║')
  console.log('╚══════════════════════════════════════════════════════════════╝')

  // 1. Test common ePages endpoints
  const endpoints = [
    '',              // Shop root info
    '/products',     // Products (already used)
    '/customers',    // Customers (already used)
    '/orders',       // Orders (already used)
    '/categories',   // Categories
    '/legal',        // Legal info
    '/tax-classes',  // Tax classes
    '/shipping-zones', // Shipping
    '/payment-methods', // Payment methods
    '/carts',        // Shopping carts
    '/sales',        // Sales data
    '/reviews',      // Product reviews?
    '/blog',         // Blog posts?
    '/content',      // Content pages?
    '/slides',       // Slider/banners?
    '/scripts',      // Custom scripts?
    '/newsletter-campaigns', // Newsletter?
    '/currencies',   // Currencies
    '/statistics',   // Statistics?
    '/reports',      // Reports?
    '/inventory',    // Inventory?
    '/watched-products', // Watched products
    '/product-slideshows', // Product slideshows
  ]

  console.log('\n=== ENDPOINT AVAILABILITY ===')
  const available = []

  for (const ep of endpoints) {
    const data = await fetchFromEpages(ep)
    if (data) {
      available.push({ endpoint: ep || '/', hasItems: data.items?.length || 0, keys: Object.keys(data).slice(0, 10) })
      console.log(`   ✅ ${ep || '/'} - Keys: ${Object.keys(data).slice(0, 5).join(', ')}`)
    }
  }

  // 2. Get sample product to see ALL fields
  console.log('\n\n=== PRODUCT DATA FIELDS (sample) ===')
  const productsData = await fetchFromEpages('/products?resultsPerPage=1')
  if (productsData?.items?.[0]) {
    const product = productsData.items[0]
    console.log('\nAll product keys:', Object.keys(product).join(', '))
    console.log('\nProduct sample:')
    console.log(JSON.stringify(product, null, 2))
  }

  // 3. Get sample order to see ALL fields
  console.log('\n\n=== ORDER DATA FIELDS (sample) ===')
  const ordersData = await fetchFromEpages('/orders?resultsPerPage=1')
  if (ordersData?.items?.[0]) {
    const order = ordersData.items[0]
    console.log('\nAll order keys:', Object.keys(order).join(', '))
    // Don't print full order for privacy
    console.log('\nOrder structure (keys only):')
    for (const [key, value] of Object.entries(order)) {
      if (typeof value === 'object' && value !== null) {
        console.log(`  ${key}: {${Object.keys(value).join(', ')}}`)
      } else {
        console.log(`  ${key}: (${typeof value})`)
      }
    }
  }

  // 4. Get sample customer to see ALL fields
  console.log('\n\n=== CUSTOMER DATA FIELDS (sample) ===')
  const customersData = await fetchFromEpages('/customers?resultsPerPage=1')
  if (customersData?.items?.[0]) {
    const customer = customersData.items[0]
    console.log('\nAll customer keys:', Object.keys(customer).join(', '))
    console.log('\nCustomer structure:')
    for (const [key, value] of Object.entries(customer)) {
      if (typeof value === 'object' && value !== null) {
        console.log(`  ${key}: {${Object.keys(value).join(', ')}}`)
      } else {
        console.log(`  ${key}: (${typeof value})`)
      }
    }
  }

  // 5. Check single product endpoint for reviews
  console.log('\n\n=== CHECKING FOR PRODUCT REVIEWS ===')
  if (productsData?.items?.[0]?.productId) {
    const productId = productsData.items[0].productId

    // Try reviews sub-endpoint
    await fetchFromEpages(`/products/${productId}/reviews`)

    // Try slideshow sub-endpoint
    await fetchFromEpages(`/products/${productId}/slideshow`)

    // Try custom attributes
    await fetchFromEpages(`/products/${productId}/custom-attributes`)

    // Try variations
    await fetchFromEpages(`/products/${productId}/variations`)

    // Try stock levels
    await fetchFromEpages(`/products/${productId}/stock-level`)

    // Try lowest price
    await fetchFromEpages(`/products/${productId}/lowest-price`)
  }

  // 6. Check categories structure
  console.log('\n\n=== CATEGORIES ===')
  const categories = await fetchFromEpages('/categories')
  if (categories?.items) {
    console.log(`Found ${categories.items.length} categories`)
    console.log('Sample:', categories.items[0])
  }

  console.log('\n\n=== SUMMARY ===')
  console.log('✅ Available endpoints:', available.map(a => a.endpoint).join(', '))
}

explore().catch(console.error)

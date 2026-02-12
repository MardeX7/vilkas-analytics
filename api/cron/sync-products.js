/**
 * Product Stock Sync API Endpoint
 *
 * Syncs product stock levels from ePages API to Supabase
 * Called by daily cron job (sync-data.js) or manually
 *
 * Updates:
 * - stock_level (current inventory)
 * - for_sale (availability status)
 * - price_amount (in case prices changed)
 *
 * ID: STORE_ID = a28836f6-9487-4b67-9194-e907eaf94b69
 */

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

export const config = {
  maxDuration: 120, // 2 minutes max (products can be many)
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { store_id } = req.body

  if (!store_id) {
    return res.status(400).json({ error: 'store_id required' })
  }

  if (!supabaseUrl || !supabaseServiceKey) {
    return res.status(500).json({ error: 'Missing Supabase credentials' })
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  try {
    console.log(`📦 Starting product sync for store ${store_id}`)

    // Get store with ePages credentials
    const { data: store, error: storeError } = await supabase
      .from('stores')
      .select('id, name, domain, epages_shop_id, access_token')
      .eq('id', store_id)
      .single()

    if (storeError || !store) {
      return res.status(404).json({ error: 'Store not found' })
    }

    if (!store.access_token || !store.epages_shop_id) {
      return res.status(400).json({ error: 'Store has no ePages connection' })
    }

    // Build API URL
    const domainWithoutWww = store.domain.replace(/^www\./, '')
    const apiUrl = `https://www.${domainWithoutWww}/rs/shops/${store.epages_shop_id}`

    // Fetch all products from ePages API
    let allProducts = []
    let page = 1
    const resultsPerPage = 100

    while (true) {
      const url = new URL(`${apiUrl}/products`)
      url.searchParams.append('page', page)
      url.searchParams.append('resultsPerPage', resultsPerPage)

      console.log(`   📝 Fetching page ${page}...`)

      const response = await fetch(url.toString(), {
        headers: {
          'Authorization': `Bearer ${store.access_token}`,
          'Accept': 'application/vnd.epages.v1+json'
        }
      })

      if (!response.ok) {
        const errorText = await response.text()
        console.error(`ePages API error: ${response.status} - ${errorText}`)
        break
      }

      const data = await response.json()
      const items = data.items || []

      if (items.length === 0) break

      allProducts = allProducts.concat(items)
      console.log(`   📦 Total fetched: ${allProducts.length}`)

      if (items.length < resultsPerPage) break
      page++
    }

    console.log(`   📦 Total products from API: ${allProducts.length}`)

    // Calculate stock for master products by summing children's stock
    // ePages variant structure:
    //   productVariationType: "master"    → stocklevel is null, children have stock
    //   productVariationType: "variation" → child variant, has own stocklevel
    //   productVariationType: "regular"   → normal product, has own stocklevel
    const masterStockMap = {}
    const childVariants = allProducts.filter(p => p.productVariationMasterId)
    const masterProducts = allProducts.filter(p => p.productVariationType === 'master')

    if (masterProducts.length > 0) {
      // Group children by master ID and sum their stock
      for (const child of childVariants) {
        const masterId = child.productVariationMasterId
        if (!masterStockMap[masterId]) masterStockMap[masterId] = 0
        masterStockMap[masterId] += Math.round(child.stocklevel ?? 0)
      }

      console.log(`   🔀 Found ${masterProducts.length} master products, ${childVariants.length} child variants`)
      for (const mp of masterProducts) {
        const stock = masterStockMap[mp.productId]
        if (stock !== undefined) {
          console.log(`     ${mp.name?.substring(0, 40)}: ${stock} (summed from children)`)
        }
      }
    }

    // Map products for upsert
    const products = allProducts.map(p => ({
      store_id: store.id,
      epages_product_id: p.productId,
      product_number: p.productNumber || p.sku,
      name: p.name || 'Unknown Product',
      description: p.description,
      short_description: p.shortDescription,
      price_amount: p.priceInfo?.price?.amount || 0,
      price_currency: p.priceInfo?.price?.currency || 'SEK',
      tax_rate: Math.round((p.priceInfo?.taxRate || 0) * 100),
      stock_level: p.productVariationType === 'master'
        ? Math.round(masterStockMap[p.productId] ?? 0)
        : Math.round(p.stocklevel ?? 0),
      min_stock_level: Math.round(p.minStocklevel ?? 0),
      for_sale: p.forSale !== false,
      manufacturer: p.manufacturer,
      ean: p.ean,
      category_id: p.categoryId,
      category_name: p.categoryName,
      image_url: p.images?.[0]?.url,
      stock_tracked: p.stocklevel !== null && p.stocklevel !== undefined
    }))

    // Upsert products in batches
    const batchSize = 100
    let updated = 0
    let errors = 0

    for (let i = 0; i < products.length; i += batchSize) {
      const batch = products.slice(i, i + batchSize)

      const { error } = await supabase
        .from('products')
        .upsert(batch, {
          onConflict: 'store_id,epages_product_id'
        })

      if (error) {
        console.error(`   ❌ Batch ${Math.floor(i / batchSize) + 1} error:`, error.message)
        errors++
      } else {
        updated += batch.length
      }
    }

    console.log(`✅ Product sync complete: ${updated} products updated`)

    return res.json({
      success: true,
      store_id: store.id,
      store_name: store.name,
      products_synced: updated,
      products_total: allProducts.length,
      batch_errors: errors,
      synced_at: new Date().toISOString()
    })

  } catch (err) {
    console.error('Product sync error:', err)
    return res.status(500).json({ error: err.message })
  }
}

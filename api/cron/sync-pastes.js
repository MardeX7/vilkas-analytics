/**
 * Paste Inventory CSV Sync
 *
 * Fetches paste product data from external ePages CSV export and syncs to Supabase.
 * Can be triggered manually via button on PasteInventoryPage or optionally via cron.
 *
 * CSV URL is fixed: https://automaalit-intra.vilkas.shop/WebRoot/VilkasStoreFI/UniversalUnity/69D8A791-5C34-541B-2C84-0A0C07129D76.txt
 * CSV format: semicolon-separated, single-quoted values
 * 'ID';'Nimi';'Varastosaldo';'Hinta (alv0)';'Listahinta';'Valmistaja'
 */

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

const PASTE_CSV_URL = 'https://automaalit-intra.vilkas.shop/WebRoot/VilkasStoreFI/UniversalUnity/69D8A791-5C34-541B-2C84-0A0C07129D76.txt'

// Automaalit.net shop_id
const AUTOMAALIT_SHOP_ID = '9355ace7-3548-4023-91c8-5e9c14003c31'

export const config = {
  maxDuration: 60,
}

/**
 * Extract category prefix from product name
 * PUR-HS-T10 → PUR-HS, WBC-T970 → WBC, BC-W61 → BC, CP88 100 → CP88
 */
function extractCategoryPrefix(name) {
  if (!name) return null
  // Handle space-separated names like "CP88 100" or "100 White"
  if (!name.includes('-')) {
    return name.split(/\s+/)[0]
  }
  // Handle dash-separated: take all parts except the last
  const parts = name.split('-')
  if (parts.length <= 1) return name
  return parts.slice(0, -1).join('-')
}

/**
 * Parse the ePages CSV export
 * Format: semicolon-separated, single-quoted values
 */
function parsePasteCSV(text) {
  const lines = text.trim().split('\n')
  if (lines.length < 2) return []

  // Skip header row
  return lines.slice(1)
    .filter(line => line.trim())
    .map(line => {
      // Split by semicolon, strip single quotes
      const cols = line.split(';').map(c => c.replace(/^'|'$/g, '').trim())
      const name = cols[1] || ''
      return {
        external_id: cols[0] || '',
        name,
        stock_level: parseInt(cols[2]) || 0,
        cost_price: cols[3] ? parseFloat(cols[3].replace(',', '.')) : null,
        list_price: cols[4] ? parseFloat(cols[4].replace(',', '.')) : null,
        manufacturer: cols[5] || null,
        category_prefix: extractCategoryPrefix(name),
      }
    })
    .filter(p => p.external_id && p.name)
}

export default async function handler(req, res) {
  // Auth: CRON_SECRET or Supabase JWT
  const authHeader = req.headers.authorization
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    // Check if it's a valid Supabase JWT instead
    const supabase = createClient(supabaseUrl, supabaseServiceKey)
    const token = authHeader?.replace('Bearer ', '')
    if (token) {
      const { data: { user }, error } = await supabase.auth.getUser(token)
      if (error || !user) {
        return res.status(401).json({ error: 'Unauthorized' })
      }
    } else {
      return res.status(401).json({ error: 'Unauthorized' })
    }
  }

  console.log('🎨 Starting paste inventory CSV sync:', new Date().toISOString())

  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  const results = {
    started_at: new Date().toISOString(),
    products_synced: 0,
    snapshot_saved: false,
    errors: [],
  }

  try {
    // 1. Fetch CSV
    console.log('📥 Fetching paste CSV from:', PASTE_CSV_URL)
    const response = await fetch(PASTE_CSV_URL, {
      headers: { 'User-Agent': 'Vilkas-Analytics/1.0' },
    })

    if (!response.ok) {
      throw new Error(`CSV fetch failed: ${response.status} ${response.statusText}`)
    }

    const csvText = await response.text()
    const products = parsePasteCSV(csvText)
    console.log(`📊 Parsed ${products.length} paste products from CSV`)

    if (products.length === 0) {
      throw new Error('No products parsed from CSV')
    }

    // 2. Upsert paste_products
    const records = products.map(p => ({
      shop_id: AUTOMAALIT_SHOP_ID,
      external_id: p.external_id,
      name: p.name,
      stock_level: p.stock_level,
      cost_price: p.cost_price,
      list_price: p.list_price,
      manufacturer: p.manufacturer,
      category_prefix: p.category_prefix,
      last_synced_at: new Date().toISOString(),
    }))

    const batchSize = 200
    for (let i = 0; i < records.length; i += batchSize) {
      const batch = records.slice(i, i + batchSize)
      const { error } = await supabase
        .from('paste_products')
        .upsert(batch, { onConflict: 'shop_id,external_id' })

      if (error) {
        console.error(`Upsert error at batch ${i}:`, error.message)
        results.errors.push(`Upsert batch ${i}: ${error.message}`)
      } else {
        results.products_synced += batch.length
      }
    }

    // 3. Save daily snapshot (aggregated)
    const totalValue = products.reduce((sum, p) => {
      const price = p.cost_price || p.list_price || 0
      return sum + Math.max(p.stock_level, 0) * price
    }, 0)
    const totalStock = products.reduce((sum, p) => sum + Math.max(p.stock_level, 0), 0)
    const inStockCount = products.filter(p => p.stock_level > 0).length

    const { error: snapError } = await supabase
      .from('paste_snapshots')
      .upsert({
        shop_id: AUTOMAALIT_SHOP_ID,
        snapshot_date: new Date().toISOString().split('T')[0],
        total_value: Math.round(totalValue * 100) / 100,
        product_count: inStockCount,
        total_stock: totalStock,
      }, { onConflict: 'shop_id,snapshot_date' })

    if (snapError) {
      console.error('Snapshot error:', snapError.message)
      results.errors.push(`Snapshot: ${snapError.message}`)
    } else {
      results.snapshot_saved = true
    }

    results.completed_at = new Date().toISOString()
    console.log(`✅ Paste sync complete: ${results.products_synced} products, value ${totalValue.toFixed(2)}€`)

    return res.status(200).json(results)

  } catch (error) {
    console.error('❌ Paste sync failed:', error.message)
    results.errors.push(error.message)
    results.completed_at = new Date().toISOString()
    return res.status(500).json(results)
  }
}

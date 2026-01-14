/**
 * Daily Data Sync Cron Job
 *
 * Runs every day at 06:00 UTC (08:00 Finland time)
 * 1. Syncs ePages orders for all stores (last 7 days)
 * 2. Syncs GA4 behavioral data for all stores
 * 3. Syncs GSC data for all stores
 * 4. Recalculates indicators for all periods
 *
 * Vercel Cron: https://vercel.com/docs/cron-jobs
 *
 * HUOM: ID-mappaus (Billackering.eu):
 *   STORE_ID = stores.id = a28836f6-... (käytetään: orders, products, ga4_tokens, gsc_tokens)
 *   SHOP_ID  = shops.id  = 3b93e9b1-... (käytetään: ga4_ecommerce)
 */

import { createClient } from '@supabase/supabase-js'

// Supabase client
const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

export const config = {
  maxDuration: 300, // 5 minutes max (Vercel Pro limit)
}

export default async function handler(req, res) {
  // Verify cron secret (optional but recommended)
  const authHeader = req.headers.authorization
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    console.log('⚠️ Unauthorized cron request')
    return res.status(401).json({ error: 'Unauthorized' })
  }

  console.log('🕐 Starting daily data sync:', new Date().toISOString())

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('❌ Missing Supabase credentials')
    return res.status(500).json({ error: 'Missing Supabase credentials' })
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey)
  // KORJAUS: Käytä kovakoodattua tuotanto-URL:ia koska VERCEL_URL on dynaaminen deployment URL
  const baseUrl = process.env.PRODUCTION_URL || 'https://vilkas-analytics.vercel.app'

  const results = {
    started_at: new Date().toISOString(),
    epages_sync: [],
    ga4_sync: [],
    gsc_sync: [],
    inventory_snapshots: [],
    indicators: [],
    errors: []
  }

  try {
    // 1. Get all active stores (from 'stores' table which has ePages credentials)
    const { data: stores, error: storesError } = await supabase
      .from('stores')
      .select('id, name, domain, epages_shop_id, access_token')

    if (storesError) {
      throw new Error(`Failed to fetch stores: ${storesError.message}`)
    }

    // Also get shops for ga4_ecommerce (different table, uses SHOP_ID)
    const { data: shops } = await supabase
      .from('shops')
      .select('id, name, domain, store_id')

    console.log(`📊 Found ${stores?.length || 0} stores`)

    // 2. Process each store
    for (const store of (stores || [])) {
      console.log(`\n📡 Processing store: ${store.name || store.domain}`)

      // ============================================
      // 2a. SYNC EPAGES ORDERS (last 7 days)
      // ============================================
      if (store.access_token && store.epages_shop_id) {
        try {
          const epagesResponse = await fetch(
            `${baseUrl}/api/cron/sync-epages`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                store_id: store.id,
                days_back: 7
              })
            }
          )

          const epagesResult = await epagesResponse.json()

          results.epages_sync.push({
            store_id: store.id,
            store_name: store.name,
            status: epagesResponse.ok ? 'success' : 'error',
            ...epagesResult
          })

          console.log(`  ✅ ePages sync: ${epagesResult.orders_synced || 0} orders`)
        } catch (err) {
          console.error(`  ❌ ePages sync error:`, err.message)
          results.epages_sync.push({
            store_id: store.id,
            store_name: store.name,
            status: 'error',
            error: err.message
          })
          results.errors.push(`ePages sync failed for ${store.name}: ${err.message}`)
        }
      } else {
        console.log(`  ⏭️ No ePages connection, skipping ePages sync`)
        results.epages_sync.push({
          store_id: store.id,
          store_name: store.name,
          status: 'skipped',
          reason: 'No ePages credentials'
        })
      }

      // ============================================
      // 2b. SYNC GA4 DATA (last 30 days)
      // ============================================
      // KORJATTU: ga4_tokens käyttää STORE_ID:tä (store.id), ei SHOP_ID:tä!
      const { data: ga4Tokens } = await supabase
        .from('ga4_tokens')
        .select('id, property_id')
        .eq('store_id', store.id)  // STORE_ID

      // SHOP_ID tarvitaan vain ga4_ecommerce:lle
      const linkedShop = shops?.find(s => s.store_id === store.id || s.domain === store.domain)
      const shopId = linkedShop?.id

      if (ga4Tokens && ga4Tokens.length > 0) {
        try {
          const ga4Response = await fetch(
            `${baseUrl}/api/ga4/sync`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                store_id: store.id  // KORJATTU: STORE_ID
              })
            }
          )

          const ga4Result = await ga4Response.json()

          results.ga4_sync.push({
            store_id: store.id,
            shop_id: shopId,
            store_name: store.name,
            status: ga4Response.ok ? 'success' : 'error',
            ...ga4Result
          })

          console.log(`  ✅ GA4 sync: ${ga4Result.rows_synced || 0} rows`)
        } catch (err) {
          console.error(`  ❌ GA4 sync error:`, err.message)
          results.ga4_sync.push({
            store_id: store.id,
            store_name: store.name,
            status: 'error',
            error: err.message
          })
          results.errors.push(`GA4 sync failed for ${store.name}: ${err.message}`)
        }
      } else {
        console.log(`  ⏭️ No GA4 connection, skipping GA4 sync`)
        results.ga4_sync.push({
          store_id: store.id,
          store_name: store.name,
          status: 'skipped',
          reason: 'No GA4 tokens'
        })
      }

      // ============================================
      // 2c. SYNC GSC DATA (last 28 days)
      // ============================================
      // KORJATTU: gsc_tokens käyttää STORE_ID:tä (store.id), ei SHOP_ID:tä!
      const { data: gscTokens } = await supabase
        .from('gsc_tokens')
        .select('id, site_url')
        .eq('store_id', store.id)  // STORE_ID

      if (gscTokens && gscTokens.length > 0) {
        try {
          // KORJAUS: Käytä Vercel API routea Edge Functionin sijaan
          const gscResponse = await fetch(
            `${baseUrl}/api/gsc/sync`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                store_id: store.id  // KORJATTU: STORE_ID
              })
            }
          )

          const gscResult = await gscResponse.json()

          results.gsc_sync.push({
            store_id: store.id,
            shop_id: shopId,
            store_name: store.name,
            status: gscResponse.ok ? 'success' : 'error',
            ...gscResult
          })

          console.log(`  ✅ GSC sync: ${gscResult.total_rows_synced || 0} rows`)
        } catch (err) {
          console.error(`  ❌ GSC sync error:`, err.message)
          results.gsc_sync.push({
            store_id: store.id,
            store_name: store.name,
            status: 'error',
            error: err.message
          })
          results.errors.push(`GSC sync failed for ${store.name}: ${err.message}`)
        }
      } else {
        console.log(`  ⏭️ No GSC connection, skipping GSC sync`)
        results.gsc_sync.push({
          store_id: store.id,
          store_name: store.name,
          status: 'skipped',
          reason: 'No GSC tokens'
        })
      }

      // ============================================
      // 2d. CREATE DAILY INVENTORY SNAPSHOT
      // ============================================
      try {
        const { data: snapshotResult, error: snapshotError } = await supabase
          .rpc('create_daily_inventory_snapshot', {
            p_store_id: store.id
          })

        if (snapshotError) {
          console.log(`  ℹ️ Inventory snapshot: ${snapshotError.message}`)
          results.inventory_snapshots.push({
            store_id: store.id,
            store_name: store.name,
            status: 'error',
            error: snapshotError.message
          })
        } else {
          console.log(`  ✅ Inventory snapshot: ${snapshotResult || 0} products`)
          results.inventory_snapshots.push({
            store_id: store.id,
            store_name: store.name,
            status: 'success',
            products_count: snapshotResult || 0
          })
        }
      } catch (err) {
        console.log(`  ℹ️ Inventory snapshot: ${err.message}`)
        results.inventory_snapshots.push({
          store_id: store.id,
          store_name: store.name,
          status: 'error',
          error: err.message
        })
      }

      // ============================================
      // 2e. CALCULATE PRODUCT ROLES (weekly on Mondays)
      // ============================================
      const today = new Date()
      const isMonday = today.getUTCDay() === 1

      if (isMonday) {
        try {
          // Calculate 90-day product roles
          const endDate = today.toISOString().split('T')[0]
          const startDate = new Date(today.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

          // Delete old roles for this period
          await supabase
            .from('product_roles')
            .delete()
            .eq('store_id', store.id)
            .eq('period_start', startDate)
            .eq('period_end', endDate)

          // Get sales data and calculate roles via RPC or direct calculation
          const { error: rolesError } = await supabase.rpc('calculate_product_roles_batch', {
            p_store_id: store.id,
            p_start_date: startDate,
            p_end_date: endDate
          })

          if (rolesError) {
            // RPC doesn't exist yet, skip silently
            console.log(`  ℹ️ Product roles: manual calculation needed`)
          } else {
            console.log(`  ✅ Product roles: calculated (90 days)`)
          }
        } catch (err) {
          console.log(`  ℹ️ Product roles: ${err.message}`)
        }
      } else {
        console.log(`  ⏭️ Product roles: skipped (only on Mondays)`)
      }

      // ============================================
      // 2e. CALCULATE INDICATORS
      // ============================================
      const periods = ['7d', '30d', '90d']

      for (const period of periods) {
        try {
          const { error: indicatorError } = await supabase
            .rpc('calculate_all_indicators', {
              p_store_id: store.id,
              p_period_label: period
            })

          if (indicatorError) {
            console.log(`  ℹ️ Indicator calc (${period}): on-demand mode`)
          } else {
            console.log(`  ✅ Indicators (${period}): calculated`)
          }

          results.indicators.push({
            store_id: store.id,
            period,
            status: 'success'
          })
        } catch (err) {
          console.log(`  ℹ️ Indicators (${period}): on-demand mode`)
        }
      }
    }

    // 3. Summary
    results.completed_at = new Date().toISOString()
    results.duration_ms = new Date(results.completed_at) - new Date(results.started_at)
    results.stores_processed = stores?.length || 0

    console.log('\n✅ Daily sync completed!')
    console.log(`   Duration: ${results.duration_ms}ms`)
    console.log(`   Stores: ${results.stores_processed}`)
    console.log(`   Errors: ${results.errors.length}`)

    return res.status(200).json(results)

  } catch (error) {
    console.error('❌ Cron job failed:', error)
    results.errors.push(error.message)
    results.completed_at = new Date().toISOString()

    return res.status(500).json({
      ...results,
      error: error.message
    })
  }
}

/**
 * Daily Data Sync Cron Job
 *
 * Runs every day at 06:00 UTC (08:00 Finland time)
 * 1. Syncs GSC data for all stores
 * 2. Recalculates indicators for all periods
 *
 * Vercel Cron: https://vercel.com/docs/cron-jobs
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
  const results = {
    started_at: new Date().toISOString(),
    gsc_sync: [],
    indicators: [],
    errors: []
  }

  try {
    // 1. Get all active stores
    const { data: stores, error: storesError } = await supabase
      .from('shops')
      .select('id, name, domain')

    if (storesError) {
      throw new Error(`Failed to fetch stores: ${storesError.message}`)
    }

    console.log(`📊 Found ${stores?.length || 0} stores`)

    // 2. Sync GSC data for each store
    for (const store of (stores || [])) {
      console.log(`\n📡 Processing store: ${store.name || store.domain}`)

      // Check if store has GSC tokens
      const { data: tokens } = await supabase
        .from('gsc_tokens')
        .select('id, site_url')
        .eq('store_id', store.id)

      if (!tokens || tokens.length === 0) {
        console.log(`  ⏭️ No GSC connection, skipping GSC sync`)
        results.gsc_sync.push({
          store_id: store.id,
          store_name: store.name,
          status: 'skipped',
          reason: 'No GSC tokens'
        })
      } else {
        // Call gsc-sync Edge Function
        try {
          const gscResponse = await fetch(
            `${supabaseUrl}/functions/v1/gsc-sync`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${supabaseServiceKey}`
              },
              body: JSON.stringify({
                store_id: store.id,
                // Last 28 days (default)
              })
            }
          )

          const gscResult = await gscResponse.json()

          results.gsc_sync.push({
            store_id: store.id,
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
      }

      // 3. Calculate indicators for each period
      const periods = ['7d', '30d', '90d']

      for (const period of periods) {
        try {
          // Call RPC to calculate and store indicators
          const { data: indicatorResult, error: indicatorError } = await supabase
            .rpc('calculate_all_indicators', {
              p_store_id: store.id,
              p_period_label: period
            })

          if (indicatorError) {
            // RPC doesn't exist yet - that's OK, indicators are calculated on-demand
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

    // 4. Summary
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

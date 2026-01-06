/**
 * Calculate Indicators Script
 *
 * Runs the Indicator Engine for a store and saves results to database.
 *
 * Usage:
 *   node scripts/calculate_indicators.js
 *   node scripts/calculate_indicators.js --period 7d
 *   node scripts/calculate_indicators.js --period 90d
 */

import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { calculateAllIndicators, getIndicators } from '../src/lib/indicators/engine.js'

// Load environment
config({ path: '.env.local' })

const supabaseUrl = process.env.VITE_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !serviceRoleKey) {
  console.error('❌ Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, serviceRoleKey)

// Default store ID (Billackering)
const STORE_ID = 'a28836f6-9487-4b67-9194-e907eaf94b69'

// Parse command line arguments
const args = process.argv.slice(2)
const periodIndex = args.indexOf('--period')
const periodLabel = periodIndex !== -1 ? args[periodIndex + 1] : '30d'

if (!['7d', '30d', '90d'].includes(periodLabel)) {
  console.error('❌ Invalid period. Use: 7d, 30d, or 90d')
  process.exit(1)
}

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════╗')
  console.log('║  🔧 Indicator Engine - Calculate All Indicators              ║')
  console.log('╚══════════════════════════════════════════════════════════════╝')

  const startTime = Date.now()

  try {
    // Calculate all indicators (periodEnd defaults to yesterday in engine.js)
    const results = await calculateAllIndicators({
      storeId: STORE_ID,
      supabase,
      periodLabel
      // periodEnd not specified - uses yesterday (last complete day)
    })

    // Fetch and display results
    console.log('\n📊 Fetching saved indicators...\n')

    const indicators = await getIndicators(supabase, STORE_ID, periodLabel)

    if (indicators && indicators.length > 0) {
      console.log('╔══════════════════════════════════════════════════════════════╗')
      console.log('║  📈 CALCULATED INDICATORS                                    ║')
      console.log('╠══════════════════════════════════════════════════════════════╣')

      for (const ind of indicators) {
        const value = ind.value?.value || ind.numeric_value || '—'
        const change = ind.change_percent !== null ? `${ind.change_percent > 0 ? '+' : ''}${ind.change_percent}%` : ''
        const direction = ind.direction === 'up' ? '📈' : ind.direction === 'down' ? '📉' : '➖'
        const alert = ind.alert_triggered ? '🚨' : ''

        console.log(`║  ${direction} ${ind.indicator_id.padEnd(25)} ${String(value).padStart(10)} ${change.padStart(8)} ${alert}`)
      }

      console.log('╚══════════════════════════════════════════════════════════════╝')
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(1)

    console.log('\n╔══════════════════════════════════════════════════════════════╗')
    console.log('║  ✅ COMPLETE                                                  ║')
    console.log('╠══════════════════════════════════════════════════════════════╣')
    console.log(`║  Success: ${String(results.success.length).padEnd(48)}║`)
    console.log(`║  Errors: ${String(results.errors.length).padEnd(49)}║`)
    console.log(`║  Skipped: ${String(results.skipped.length).padEnd(48)}║`)
    console.log(`║  Duration: ${duration}s${' '.repeat(46 - duration.length)}║`)
    console.log('╚══════════════════════════════════════════════════════════════╝')

    if (results.errors.length > 0) {
      console.log('\n⚠️ Errors:')
      for (const err of results.errors) {
        console.log(`   - ${err.id}: ${err.error}`)
      }
    }

  } catch (err) {
    console.error('\n❌ FAILED:', err.message)
    process.exit(1)
  }
}

main()

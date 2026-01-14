/**
 * Check GSC Daily Totals - verify the new table has correct data
 */

const { supabase, printProjectInfo, STORE_ID } = require('./db.cjs')

async function check() {
  printProjectInfo()

  console.log('📊 Checking gsc_daily_totals (new table with accurate data):\n')

  // Check daily totals for last 2 weeks
  const { data: totals, error } = await supabase
    .from('gsc_daily_totals')
    .select('date, clicks, impressions, ctr, position')
    .eq('store_id', STORE_ID)
    .gte('date', '2025-12-28')
    .order('date', { ascending: true })

  if (error) {
    console.error('❌ Error:', error.message)
    return
  }

  console.log('Date         | Clicks | Impressions | CTR    | Position')
  console.log('-'.repeat(60))

  totals?.forEach(d => {
    const ctr = (d.ctr * 100).toFixed(2)
    const pos = d.position.toFixed(1)
    console.log(`${d.date} | ${String(d.clicks).padStart(6)} | ${String(d.impressions).padStart(11)} | ${ctr.padStart(5)}% | ${pos.padStart(6)}`)
  })

  // Summary
  const totalClicks = totals?.reduce((sum, d) => sum + d.clicks, 0) || 0
  const totalImpressions = totals?.reduce((sum, d) => sum + d.impressions, 0) || 0

  console.log('-'.repeat(60))
  console.log(`Total        | ${String(totalClicks).padStart(6)} | ${String(totalImpressions).padStart(11)}`)
}

check()

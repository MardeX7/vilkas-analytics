/**
 * Re-sync GSC data via API
 */

const { printProjectInfo, STORE_ID } = require('./db.cjs')

async function resync() {
  printProjectInfo()

  // Sync last 90 days to get good historical data
  const endDate = new Date().toISOString().split('T')[0]
  const startDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

  console.log(`📊 Syncing GSC data: ${startDate} to ${endDate}`)
  console.log(`   Store ID: ${STORE_ID}`)
  console.log('')

  try {
    const response = await fetch('https://vilkas-analytics.vercel.app/api/gsc/sync', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        store_id: STORE_ID,
        start_date: startDate,
        end_date: endDate
      })
    })

    const result = await response.json()

    if (result.success) {
      console.log('✅ GSC Sync completed!')
      console.log(`   Daily totals synced: ${result.daily_totals_synced}`)
      console.log(`   Detailed rows synced: ${result.detailed_rows_synced}`)
      console.log(`   Period: ${result.period.startDate} - ${result.period.endDate}`)
    } else {
      console.log('❌ Sync failed:', result.error)
    }
  } catch (err) {
    console.error('❌ Error:', err.message)
  }
}

resync()

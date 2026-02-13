/**
 * Sync GA4 data via Vercel API (handles token refresh)
 */
const { STORE_ID, printProjectInfo } = require('./db.cjs')

async function syncGA4ViaAPI() {
  printProjectInfo()

  // Sync 90 days back
  const endDate = new Date().toISOString().split('T')[0]
  const startDate = new Date()
  startDate.setDate(startDate.getDate() - 90)
  const startStr = startDate.toISOString().split('T')[0]

  console.log('📊 Syncing GA4 via Vercel API')
  console.log(`   Period: ${startStr} to ${endDate}`)
  console.log(`   Store ID: ${STORE_ID}`)
  console.log('')

  try {
    const response = await fetch('https://vilkas-analytics.vercel.app/api/ga4/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        store_id: STORE_ID,
        start_date: startStr,
        end_date: endDate
      })
    })

    const result = await response.json()

    if (result.success) {
      console.log('✅ GA4 Sync completed!')
      console.log(`   Rows synced: ${result.rows_synced}`)
      console.log(`   Period: ${result.period.startDate} - ${result.period.endDate}`)
      console.log(`   Property: ${result.property}`)
    } else {
      console.log('❌ Sync failed:', result.error)
    }
  } catch (err) {
    console.error('❌ Error:', err.message)
  }
}

syncGA4ViaAPI()

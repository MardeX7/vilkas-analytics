/**
 * Sync full GSC history (16 months back)
 * GSC API allows data up to 16 months in the past
 */

const { printProjectInfo, STORE_ID } = require('./db.cjs')

async function syncFullHistory() {
  printProjectInfo()

  // GSC allows up to 16 months back
  const endDate = new Date().toISOString().split('T')[0]
  const startDate = new Date()
  startDate.setMonth(startDate.getMonth() - 16)
  const startStr = startDate.toISOString().split('T')[0]

  console.log(`📊 Syncing FULL GSC history`)
  console.log(`   Period: ${startStr} to ${endDate}`)
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
        start_date: startStr,
        end_date: endDate
      })
    })

    const result = await response.json()

    if (result.success) {
      console.log('✅ Full GSC Sync completed!')
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

syncFullHistory()

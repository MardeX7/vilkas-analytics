/**
 * Debug: Check inventory snapshots for last 10 days
 */
const { supabase, printProjectInfo } = require('./db.cjs')

printProjectInfo()

async function check() {
  const tenDaysAgo = new Date()
  tenDaysAgo.setDate(tenDaysAgo.getDate() - 10)

  const { data, error } = await supabase
    .from('inventory_snapshots')
    .select('snapshot_date, stock_value')
    .gte('snapshot_date', tenDaysAgo.toISOString().split('T')[0])
    .order('snapshot_date', { ascending: false })

  if (error) {
    console.error('Error:', error.message)
    return
  }

  // Aggregate by date
  const byDate = {}
  data.forEach(row => {
    const d = row.snapshot_date
    if (byDate[d] === undefined) {
      byDate[d] = { total: 0, count: 0 }
    }
    byDate[d].total += row.stock_value || 0
    byDate[d].count++
  })

  console.log('Inventory snapshots (last 10 days):')
  console.log('Date        | Total Value     | Products')
  console.log('------------|-----------------|----------')

  const entries = Object.entries(byDate).sort((a, b) => b[0].localeCompare(a[0]))
  entries.forEach(([date, d]) => {
    console.log(`${date} | ${Math.round(d.total).toLocaleString().padStart(15)} | ${d.count}`)
  })

  // Show today's date for reference
  console.log('')
  console.log('Today:', new Date().toISOString().split('T')[0])
}

check().catch(console.error)

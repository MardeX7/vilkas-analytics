/**
 * Check GSC and GA4 data coverage
 */
const { supabase, STORE_ID, printProjectInfo } = require('./db.cjs')

async function detailedCheck() {
  printProjectInfo()
  console.log('📊 DATA COVERAGE ANALYYSI\n')
  console.log('Aikaväli: 17.12.2025 - 15.1.2026 (30 päivää)\n')

  // GSC - päiväkohtaiset summat
  console.log('🔍 GSC päiväkohtainen data:')
  const { data: gscDaily } = await supabase
    .from('gsc_search_analytics')
    .select('date, clicks, impressions')
    .eq('store_id', STORE_ID)
    .gte('date', '2025-12-17')
    .lte('date', '2026-01-15')

  // Aggregoi päivittäin
  const gscByDate = {}
  gscDaily?.forEach(row => {
    if (!gscByDate[row.date]) {
      gscByDate[row.date] = { clicks: 0, impressions: 0 }
    }
    gscByDate[row.date].clicks += row.clicks || 0
    gscByDate[row.date].impressions += row.impressions || 0
  })

  const sortedDates = Object.keys(gscByDate).sort()
  let totalClicks = 0
  let totalImpressions = 0

  console.log('   Löydetyt päivät:')
  sortedDates.forEach(date => {
    totalClicks += gscByDate[date].clicks
    totalImpressions += gscByDate[date].impressions
    console.log(`   ${date}: ${gscByDate[date].clicks} klikkauksia, ${gscByDate[date].impressions} näyttöä`)
  })

  console.log(`\n   YHTEENSÄ: ${totalClicks} klikkauksia, ${totalImpressions} näyttöä`)
  console.log(`   Päiviä: ${sortedDates.length}/30`)

  // Viimeisimmät GSC-päivämäärät
  console.log('\n📅 Viimeisimmät GSC-päivämäärät (koko kannasta):')
  const { data: recentGsc } = await supabase
    .from('gsc_search_analytics')
    .select('date')
    .eq('store_id', STORE_ID)
    .order('date', { ascending: false })
    .limit(100)

  const uniqueRecentDates = [...new Set(recentGsc?.map(d => d.date))].slice(0, 10)
  uniqueRecentDates.forEach(d => console.log('   ' + d))

  // GA4 päiväkohtainen
  console.log('\n📈 GA4 päiväkohtainen data:')
  const { data: ga4Daily } = await supabase
    .from('ga4_analytics')
    .select('date, sessions')
    .eq('store_id', STORE_ID)
    .gte('date', '2025-12-17')
    .lte('date', '2026-01-15')

  const ga4ByDate = {}
  ga4Daily?.forEach(row => {
    if (!ga4ByDate[row.date]) {
      ga4ByDate[row.date] = { sessions: 0 }
    }
    ga4ByDate[row.date].sessions += row.sessions || 0
  })

  const sortedGa4Dates = Object.keys(ga4ByDate).sort()
  let totalSessions = 0

  console.log('   Löydetyt päivät:')
  sortedGa4Dates.forEach(date => {
    totalSessions += ga4ByDate[date].sessions
    console.log(`   ${date}: ${ga4ByDate[date].sessions} sessiota`)
  })

  console.log(`\n   YHTEENSÄ: ${totalSessions} sessiota`)
  console.log(`   Päiviä: ${sortedGa4Dates.length}/30`)

  // Viimeisimmät GA4-päivämäärät
  console.log('\n📅 Viimeisimmät GA4-päivämäärät (koko kannasta):')
  const { data: recentGa4 } = await supabase
    .from('ga4_analytics')
    .select('date')
    .eq('store_id', STORE_ID)
    .order('date', { ascending: false })
    .limit(100)

  const uniqueRecentGa4Dates = [...new Set(recentGa4?.map(d => d.date))].slice(0, 10)
  uniqueRecentGa4Dates.forEach(d => console.log('   ' + d))

  // Puuttuvat päivät
  console.log('\n⚠️  PUUTTUVAT PÄIVÄT:')
  const expectedDates = []
  for (let d = new Date('2025-12-17'); d <= new Date('2026-01-15'); d.setDate(d.getDate() + 1)) {
    expectedDates.push(d.toISOString().split('T')[0])
  }

  const missingGsc = expectedDates.filter(d => !sortedDates.includes(d))
  const missingGa4 = expectedDates.filter(d => !sortedGa4Dates.includes(d))

  console.log(`\n   GSC puuttuu ${missingGsc.length} päivää:`)
  console.log('   ' + missingGsc.join(', '))

  console.log(`\n   GA4 puuttuu ${missingGa4.length} päivää:`)
  console.log('   ' + missingGa4.join(', '))
}

detailedCheck()

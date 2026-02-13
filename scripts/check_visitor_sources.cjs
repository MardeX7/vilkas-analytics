/**
 * Tarkista mistä voidaan hakea vierailijoiden määrä konversioon
 */

const { supabase, printProjectInfo, STORE_ID, SHOP_ID } = require('./db.cjs')

async function checkVisitorSources() {
  printProjectInfo()

  console.log('🔍 Etsitään vierailijoiden dataa...\n')
  console.log(`STORE_ID: ${STORE_ID}`)
  console.log(`SHOP_ID: ${SHOP_ID}\n`)

  const period = {
    startDate: '2025-12-18',
    endDate: '2026-01-16T23:59:59'
  }

  console.log(`📅 Ajanjakso: ${period.startDate} - ${period.endDate}\n`)

  // 1. Tarkista GSC data
  console.log('=' .repeat(80))
  console.log('📊 Google Search Console (gsc_search_analytics)')
  console.log('=' .repeat(80))

  const { data: gscData, error: gscError } = await supabase
    .from('gsc_search_analytics')
    .select('date, clicks, impressions, position')
    .eq('store_id', STORE_ID)
    .gte('date', period.startDate)
    .lte('date', period.endDate)
    .order('date', { ascending: true })

  if (gscError) {
    console.log('❌ Virhe:', gscError.message)
  } else if (gscData && gscData.length > 0) {
    const totalClicks = gscData.reduce((sum, row) => sum + (row.clicks || 0), 0)
    const totalImpressions = gscData.reduce((sum, row) => sum + (row.impressions || 0), 0)

    console.log(`✅ GSC data löytyi: ${gscData.length} riviä`)
    console.log(`   Yhteensä klikkauksia: ${totalClicks}`)
    console.log(`   Yhteensä näyttökertoja: ${totalImpressions}`)
    console.log(`   Ensimmäinen päivä: ${gscData[0].date}`)
    console.log(`   Viimeinen päivä: ${gscData[gscData.length - 1].date}`)
    console.log('\n   💡 GSC clicks voisi olla "vierailijat" (orgaaninen liikenne)')
  } else {
    console.log('⚠️ Ei GSC dataa tälle ajanjaksolle')
  }
  console.log('')

  // 2. Tarkista GA4 data
  console.log('=' .repeat(80))
  console.log('📊 Google Analytics 4 (ga4_ecommerce)')
  console.log('=' .repeat(80))

  const { data: ga4Data, error: ga4Error } = await supabase
    .from('ga4_ecommerce')
    .select('date, item_name, item_revenue, item_quantity')
    .eq('shop_id', SHOP_ID)
    .gte('date', period.startDate)
    .lte('date', period.endDate)
    .limit(5)

  if (ga4Error) {
    console.log('❌ Virhe:', ga4Error.message)
  } else if (ga4Data && ga4Data.length > 0) {
    console.log(`✅ GA4 ecommerce data löytyi`)
    console.log('   Esimerkki:')
    console.log(JSON.stringify(ga4Data[0], null, 2))
    console.log('\n   💡 GA4:stä puuttuu sessions/users data (vain ecommerce)')
  } else {
    console.log('⚠️ Ei GA4 dataa tälle ajanjaksolle')
  }
  console.log('')

  // 3. Tarkista indicators-taulu
  console.log('=' .repeat(80))
  console.log('📊 Indicators-taulu')
  console.log('=' .repeat(80))

  const { data: indicators, error: indError } = await supabase
    .from('indicators')
    .select('*')
    .eq('store_id', STORE_ID)
    .eq('period_label', '30d')
    .order('calculated_at', { ascending: false })
    .limit(5)

  if (indError) {
    console.log('❌ Virhe:', indError.message)
  } else if (indicators && indicators.length > 0) {
    console.log(`✅ Indicators löytyi: ${indicators.length}`)
    console.log('\n   Viimeisin indikaattori:')
    const latest = indicators[0]
    console.log(`   ID: ${latest.indicator_id}`)
    console.log(`   Value: ${latest.value}`)
    console.log(`   Display: ${latest.display_value}`)
    console.log(`   Context:`)
    console.log(JSON.stringify(latest.context_data, null, 2))
  } else {
    console.log('⚠️ Ei indikaattoreita')
  }
  console.log('')

  // 4. Listaa kaikki taulut
  console.log('=' .repeat(80))
  console.log('📋 Kaikki saatavilla olevat taulut')
  console.log('=' .repeat(80))

  const { data: tables, error: tablesError } = await supabase
    .rpc('get_table_names')
    .limit(50)

  if (!tablesError && tables) {
    console.log('Taulut:')
    tables.forEach(t => console.log(`   - ${t}`))
  } else {
    console.log('Yleisimmät taulut:')
    console.log('   - orders')
    console.log('   - products')
    console.log('   - gsc_search_analytics')
    console.log('   - ga4_ecommerce')
    console.log('   - indicators')
    console.log('   - indicator_history')
  }
  console.log('')

  console.log('=' .repeat(80))
  console.log('📝 YHTEENVETO')
  console.log('=' .repeat(80))
  console.log('')
  console.log('💡 Konversion laskenta tarvitsee:')
  console.log('   1. Uniikit ostaneet asiakkaat (✅ orders.billing_email)')
  console.log('   2. Vierailijat/sessiot (❓ Ei suoraa dataa)')
  console.log('')
  console.log('🔧 Mahdolliset ratkaisut:')
  console.log('   A) GSC clicks = orgaaniset vierailijat')
  console.log('   B) Lisää GA4 sessions/users data')
  console.log('   C) Käytä ulkoista analytiikkapalvelua')
  console.log('')
}

checkVisitorSources()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('❌ Virhe:', err)
    process.exit(1)
  })

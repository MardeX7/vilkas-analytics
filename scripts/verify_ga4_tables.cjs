/**
 * Verify GA4 tables were created successfully
 */

const { supabase, printProjectInfo } = require('./db.cjs')

async function verify() {
  printProjectInfo()

  console.log('🔍 Verifying GA4 tables...\n')

  // Check ga4_tokens table
  const { data: tokens, error: tokensError } = await supabase
    .from('ga4_tokens')
    .select('*')
    .limit(1)

  if (tokensError) {
    console.log('❌ ga4_tokens:', tokensError.message)
  } else {
    console.log('✅ ga4_tokens: OK')
  }

  // Check ga4_analytics table
  const { data: analytics, error: analyticsError } = await supabase
    .from('ga4_analytics')
    .select('*')
    .limit(1)

  if (analyticsError) {
    console.log('❌ ga4_analytics:', analyticsError.message)
  } else {
    console.log('✅ ga4_analytics: OK')
  }

  // Check views
  const { data: dailySummary, error: dailyError } = await supabase
    .from('v_ga4_daily_summary')
    .select('*')
    .limit(1)

  if (dailyError) {
    console.log('❌ v_ga4_daily_summary:', dailyError.message)
  } else {
    console.log('✅ v_ga4_daily_summary: OK')
  }

  const { data: trafficSources, error: trafficError } = await supabase
    .from('v_ga4_traffic_sources')
    .select('*')
    .limit(1)

  if (trafficError) {
    console.log('❌ v_ga4_traffic_sources:', trafficError.message)
  } else {
    console.log('✅ v_ga4_traffic_sources: OK')
  }

  const { data: landingPages, error: landingError } = await supabase
    .from('v_ga4_landing_pages')
    .select('*')
    .limit(1)

  if (landingError) {
    console.log('❌ v_ga4_landing_pages:', landingError.message)
  } else {
    console.log('✅ v_ga4_landing_pages: OK')
  }

  // Check shops.ga4_property_id column
  const { data: shops, error: shopsError } = await supabase
    .from('shops')
    .select('ga4_property_id')
    .limit(1)

  if (shopsError) {
    console.log('❌ shops.ga4_property_id:', shopsError.message)
  } else {
    console.log('✅ shops.ga4_property_id: OK')
  }

  console.log('\n✅ GA4 migraatio valmis!')
}

verify().catch(console.error)

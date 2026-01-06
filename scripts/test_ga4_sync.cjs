/**
 * Test GA4 Sync
 * Tarkistaa tokenin ja syncaa datan
 */

const { supabase, printProjectInfo } = require('./db.cjs')

async function testGA4() {
  printProjectInfo()

  // 1. Check token
  console.log('1. Checking ga4_tokens...')
  const { data: tokens, error: tokensError } = await supabase
    .from('ga4_tokens')
    .select('*')
    .eq('store_id', 'a28836f6-9487-4b67-9194-e907eaf94b69')

  if (tokensError) {
    console.log('❌ Error:', tokensError.message)
    return
  }

  if (!tokens || tokens.length === 0) {
    console.log('❌ No GA4 token found')
    return
  }

  const token = tokens[0]
  console.log('✅ Token found:')
  console.log(`   Property: ${token.property_name}`)
  console.log(`   Property ID: ${token.property_id}`)
  console.log(`   Expires: ${token.expires_at}`)
  console.log('')

  // 2. Check if we need to sync
  console.log('2. Checking existing GA4 data...')
  const { data: existingData, error: dataError } = await supabase
    .from('ga4_analytics')
    .select('date')
    .eq('store_id', 'a28836f6-9487-4b67-9194-e907eaf94b69')
    .order('date', { ascending: false })
    .limit(5)

  if (existingData && existingData.length > 0) {
    console.log(`✅ Found ${existingData.length} rows, latest: ${existingData[0].date}`)
  } else {
    console.log('⚠️ No GA4 data yet - need to sync')
  }

  console.log('')
  console.log('3. To sync GA4 data, run:')
  console.log('   curl -X POST http://localhost:3000/api/ga4/sync \\')
  console.log('     -H "Content-Type: application/json" \\')
  console.log('     -d \'{"store_id": "a28836f6-9487-4b67-9194-e907eaf94b69"}\'')
  console.log('')
  console.log('   Or deploy to Vercel and call the API there.')
}

testGA4().catch(console.error)

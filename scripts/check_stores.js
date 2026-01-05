/**
 * Check stores table for new tokens
 */

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://tlothekaphtiwvusgwzh.supabase.co'
const serviceRoleKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRsb3RoZWthcGh0aXd2dXNnd3poIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NzYxOTYwMCwiZXhwIjoyMDgzMTk1NjAwfQ.PxMeALq2SEylsXwybYAASYcxjtVBzjjiWFsiOulhQyY'

const supabase = createClient(supabaseUrl, serviceRoleKey)

async function checkStores() {
  console.log('🔍 Checking stores table...\n')

  const { data: stores, error } = await supabase
    .from('stores')
    .select('*')
    .order('updated_at', { ascending: false })

  if (error) {
    console.error('❌ Error:', error.message)
    return
  }

  if (!stores || stores.length === 0) {
    console.log('📭 No stores found in database')
    return
  }

  console.log(`📦 Found ${stores.length} store(s):\n`)

  for (const store of stores) {
    console.log('─'.repeat(50))
    console.log(`🏪 Shop ID: ${store.epages_shop_id}`)
    console.log(`   Name: ${store.name}`)
    console.log(`   Domain: ${store.domain}`)
    console.log(`   Token: ${store.access_token ? store.access_token.substring(0, 15) + '...' : 'NOT SET'}`)
    console.log(`   Updated: ${store.updated_at}`)
  }

  // Test the token if exists
  const billackering = stores.find(s => s.epages_shop_id === 'billackering')
  if (billackering?.access_token) {
    console.log('\n🧪 Testing token...')

    const response = await fetch('https://www.billackering.eu/rs/shops/billackering/products', {
      headers: {
        'Authorization': `Bearer ${billackering.access_token}`,
        'Accept': 'application/vnd.epages.v1+json'
      }
    })

    if (response.ok) {
      const data = await response.json()
      console.log(`✅ TOKEN WORKS! Found ${data.items?.length || 0} products`)
    } else {
      const text = await response.text()
      console.log(`❌ Token test failed: ${response.status} - ${text.substring(0, 100)}`)
    }
  }
}

checkStores()

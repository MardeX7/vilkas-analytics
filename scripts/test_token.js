/**
 * Test ePages API Token
 *
 * Tests if the current access token works
 */

const API_URL = 'https://www.billackering.eu/rs/shops/billackering'
const ACCESS_TOKEN = 'XH5IrE6QIY3PLL6pX5bUr7n1jcmgeuYq'

async function testToken() {
  console.log('🔑 Testing ePages API access...\n')
  console.log(`API URL: ${API_URL}`)
  console.log(`Token: ${ACCESS_TOKEN.substring(0, 10)}...`)
  console.log('')

  // Test endpoints
  const endpoints = [
    '/products',
    '/orders',
    '/customers',
    '/legal'
  ]

  for (const endpoint of endpoints) {
    try {
      console.log(`📡 Testing ${endpoint}...`)

      const response = await fetch(`${API_URL}${endpoint}`, {
        headers: {
          'Authorization': `Bearer ${ACCESS_TOKEN}`,
          'Accept': 'application/vnd.epages.v1+json'
        }
      })

      if (response.ok) {
        const data = await response.json()
        const itemCount = data.items?.length || data.length || 'N/A'
        console.log(`   ✅ ${response.status} - Items: ${itemCount}`)
      } else {
        const text = await response.text()
        console.log(`   ❌ ${response.status} - ${text.substring(0, 100)}`)
      }
    } catch (err) {
      console.log(`   ❌ Error: ${err.message}`)
    }
  }

  console.log('\n' + '='.repeat(50))
  console.log('Jos kaikki palauttaa 403, token ei ole voimassa.')
  console.log('')
  console.log('Ratkaisu: Asenna app kauppaan OAuth-flowlla:')
  console.log('')
  console.log('1. Mene ePages-hallintaan')
  console.log('2. Apps -> VilkasAnalytics -> "Install"')
  console.log('3. Hyväksy oikeudet')
  console.log('4. Callback käsittelee uuden tokenin')
  console.log('='.repeat(50))
}

testToken()

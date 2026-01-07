/**
 * Ajaa SQL Supabase Management API:n kautta
 *
 * Käyttö: node scripts/execute_sql_via_mgmt_api.cjs
 *
 * HUOM: Vaatii Supabase access token:in
 */

const fs = require('fs')
const path = require('path')

const PROJECT_REF = 'tlothekaphtiwvusgwzh'

async function getAccessToken() {
  // Supabase CLI tallentaa tokenin
  const configPath = path.join(process.env.HOME, '.supabase', 'access-token')
  if (fs.existsSync(configPath)) {
    return fs.readFileSync(configPath, 'utf-8').trim()
  }

  // Vaihtoehtoinen polku
  const configPath2 = path.join(process.env.HOME, '.config', 'supabase', 'access-token')
  if (fs.existsSync(configPath2)) {
    return fs.readFileSync(configPath2, 'utf-8').trim()
  }

  return null
}

async function executeSql(accessToken, sql) {
  const url = `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ query: sql })
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`API error ${response.status}: ${errorText}`)
  }

  return await response.json()
}

async function main() {
  console.log('🟩 VilkasAnalytics - SQL Execution via Management API')
  console.log('')

  const accessToken = await getAccessToken()
  if (!accessToken) {
    console.error('❌ Supabase access token ei löydy')
    console.log('')
    console.log('Aja ensin: supabase login')
    process.exit(1)
  }

  console.log('✅ Access token löytyi')
  console.log('')

  // Tarkistetaan yhteys
  console.log('🔌 Testataan yhteys...')
  try {
    const result = await executeSql(accessToken, 'SELECT current_database()')
    console.log('✅ Yhteys OK:', result)
  } catch (error) {
    console.error('❌ Yhteysvirhe:', error.message)
    process.exit(1)
  }

  // Aja migraatiot
  const migrationsDir = path.join(__dirname, '..', 'supabase', 'migrations')

  const migrations = [
    '020_create_kpi_index_tables.sql',
    '021_create_kpi_helper_functions.sql'
  ]

  for (const migration of migrations) {
    const filePath = path.join(migrationsDir, migration)
    const sql = fs.readFileSync(filePath, 'utf-8')

    console.log('')
    console.log(`📄 Ajetaan: ${migration}`)
    console.log(`   (${sql.length} merkkiä)`)

    try {
      const result = await executeSql(accessToken, sql)
      console.log('✅ OK')
    } catch (error) {
      console.error('❌ Virhe:', error.message)
    }
  }

  console.log('')
  console.log('🎉 Valmis!')
}

main().catch(console.error)

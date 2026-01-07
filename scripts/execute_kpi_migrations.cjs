/**
 * Ajaa KPI Index Engine migraatiot Supabase REST API:lla
 *
 * Käyttö: node scripts/execute_kpi_migrations.cjs
 */

const { createClient } = require('@supabase/supabase-js')
const fs = require('fs')
const path = require('path')
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') })

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

async function executeSql(sql) {
  // Supabase REST API ei tue suoraa SQL:ää
  // Käytetään pg_stat_statements tai rpc-kutsuja
  // Tässä käytetään exec_sql -funktiota (pitää luoda ensin)

  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
      'Prefer': 'return=representation'
    },
    body: JSON.stringify({ sql_query: sql })
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`SQL execution failed: ${error}`)
  }

  return await response.json()
}

async function runMigrations() {
  console.log('🟩 VilkasAnalytics KPI Migrations')
  console.log(`   URL: ${SUPABASE_URL}`)
  console.log('')

  // Ensin luodaan exec_sql -funktio jos ei ole
  console.log('📦 Tarkistetaan exec_sql helper...')

  try {
    const createExecSql = `
      CREATE OR REPLACE FUNCTION exec_sql(sql_query TEXT)
      RETURNS JSON
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = public, pg_temp
      AS $$
      BEGIN
        EXECUTE sql_query;
        RETURN json_build_object('success', true);
      EXCEPTION WHEN OTHERS THEN
        RETURN json_build_object('success', false, 'error', SQLERRM);
      END;
      $$;
    `

    // Tämä ei toimi ilman exec_sql:ää...
    // Pitää käyttää Supabase Dashboard SQL Editoria

    console.log('')
    console.log('⚠️  Supabase JS ei tue suoraa SQL-ajoa.')
    console.log('   Aja migraatiot manuaalisesti:')
    console.log('')
    console.log('   1. Avaa: https://supabase.com/dashboard/project/tlothekaphtiwvusgwzh/sql')
    console.log('   2. Kopioi tiedosto: supabase/migrations/020_create_kpi_index_tables.sql')
    console.log('   3. Aja SQL')
    console.log('   4. Kopioi tiedosto: supabase/migrations/021_create_kpi_helper_functions.sql')
    console.log('   5. Aja SQL')
    console.log('')

    // Alternatiivisesti: käytä PostgreSQL clientia suoraan
    console.log('📌 TAI käytä psql-komentoa:')
    console.log('')
    console.log('   psql "postgresql://postgres.[ref]:[password]@aws-0-eu-central-1.pooler.supabase.com:6543/postgres" -f supabase/migrations/020_create_kpi_index_tables.sql')

  } catch (error) {
    console.error('❌ Virhe:', error.message)
  }
}

runMigrations()

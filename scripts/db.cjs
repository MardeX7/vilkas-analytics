/**
 * VilkasAnalytics Database Helper
 *
 * KÄYTÄ AINA TÄTÄ - ei kovakoodattuja URL:ja tai avaimia!
 *
 * Käyttö:
 *   const { supabase, getProjectInfo } = require('./db.cjs')
 *   const { data } = await supabase.from('orders').select('*')
 */

const { createClient } = require('@supabase/supabase-js')
const path = require('path')

// Lataa .env.local projektin juuresta
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') })

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY

// Validoi että tunnisteet löytyvät
if (!SUPABASE_URL) {
  console.error('❌ VITE_SUPABASE_URL puuttuu .env.local tiedostosta!')
  process.exit(1)
}

if (!SERVICE_ROLE_KEY && !ANON_KEY) {
  console.error('❌ SUPABASE_SERVICE_ROLE_KEY tai VITE_SUPABASE_ANON_KEY puuttuu!')
  process.exit(1)
}

// Käytä Service Role Key:tä jos saatavilla (skripteille), muuten Anon Key
const supabase = createClient(
  SUPABASE_URL,
  SERVICE_ROLE_KEY || ANON_KEY
)

/**
 * Palauttaa projektin tiedot debuggausta varten
 */
function getProjectInfo() {
  const projectRef = SUPABASE_URL.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1] || 'unknown'
  return {
    project: 'VilkasAnalytics',
    supabaseRef: projectRef,
    url: SUPABASE_URL,
    hasServiceRole: !!SERVICE_ROLE_KEY
  }
}

/**
 * Tulostaa projektin tiedot konsoliin
 */
function printProjectInfo() {
  const info = getProjectInfo()
  console.log('🟩 VilkasAnalytics Database')
  console.log(`   Supabase: ${info.supabaseRef}`)
  console.log(`   Service Role: ${info.hasServiceRole ? '✅' : '❌ (using anon key)'}`)
  console.log('')
}

module.exports = {
  supabase,
  getProjectInfo,
  printProjectInfo,
  SUPABASE_URL,
  SERVICE_ROLE_KEY,
  ANON_KEY
}

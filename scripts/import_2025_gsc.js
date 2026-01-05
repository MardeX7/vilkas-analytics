/**
 * Import GSC Historical Data - Full Year 2025
 *
 * Hakee Search Console datan 16kk taaksepäin (GSC:n max historia)
 * YoY-vertailua varten.
 *
 * HUOM: GSC API palauttaa max 16kk dataa!
 */

import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'

// Load .env.local
config({ path: '.env.local' })

// ============================================
// CONFIGURATION
// ============================================

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://tlothekaphtiwvusgwzh.supabase.co'
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRsb3RoZWthcGh0aXd2dXNnd3poIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NzYxOTYwMCwiZXhwIjoyMDgzMTk1NjAwfQ.PxMeALq2SEylsXwybYAASYcxjtVBzjjiWFsiOulhQyY'

// Google OAuth credentials
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET

const supabase = createClient(supabaseUrl, serviceRoleKey)

const STORE_ID = 'a28836f6-9487-4b67-9194-e907eaf94b69'

// GSC allows max 16 months of data, we'll import in monthly chunks
// to avoid hitting row limits (25000 per request)
const MONTHS_TO_IMPORT = [
  // 2025
  { start: '2025-01-01', end: '2025-01-31', label: 'Jan 2025' },
  { start: '2025-02-01', end: '2025-02-28', label: 'Feb 2025' },
  { start: '2025-03-01', end: '2025-03-31', label: 'Mar 2025' },
  { start: '2025-04-01', end: '2025-04-30', label: 'Apr 2025' },
  { start: '2025-05-01', end: '2025-05-31', label: 'May 2025' },
  { start: '2025-06-01', end: '2025-06-30', label: 'Jun 2025' },
  { start: '2025-07-01', end: '2025-07-31', label: 'Jul 2025' },
  { start: '2025-08-01', end: '2025-08-31', label: 'Aug 2025' },
  { start: '2025-09-01', end: '2025-09-30', label: 'Sep 2025' },
  { start: '2025-10-01', end: '2025-10-31', label: 'Oct 2025' },
  { start: '2025-11-01', end: '2025-11-30', label: 'Nov 2025' },
  // December 2025 is already imported
]

// ============================================
// Get GSC Token (with auto-refresh)
// ============================================

async function getGscToken() {
  const { data: tokenData, error } = await supabase
    .from('gsc_tokens')
    .select('*')
    .eq('store_id', STORE_ID)
    .single()

  if (error || !tokenData) {
    throw new Error('GSC not connected to this store')
  }

  let accessToken = tokenData.access_token

  // Check if token expired
  if (new Date(tokenData.expires_at) < new Date()) {
    console.log('   🔄 Token expired, refreshing...')

    if (!tokenData.refresh_token) {
      throw new Error('No refresh token available. Please re-connect GSC.')
    }

    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
      throw new Error('Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET in .env.local')
    }

    // Refresh the token
    const refreshResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        refresh_token: tokenData.refresh_token,
        grant_type: 'refresh_token'
      })
    })

    const refreshData = await refreshResponse.json()

    if (refreshData.error) {
      console.error('   ❌ Token refresh error:', refreshData.error_description || refreshData.error)
      throw new Error(`Token refresh failed: ${refreshData.error}`)
    }

    accessToken = refreshData.access_token

    // Update token in DB
    const newExpiresAt = new Date(Date.now() + refreshData.expires_in * 1000).toISOString()

    await supabase
      .from('gsc_tokens')
      .update({
        access_token: accessToken,
        expires_at: newExpiresAt,
        updated_at: new Date().toISOString()
      })
      .eq('store_id', STORE_ID)

    console.log('   ✅ Token refreshed, expires:', newExpiresAt)
  }

  return { accessToken, siteUrl: tokenData.site_url }
}

// ============================================
// Fetch GSC Data for Period
// ============================================

async function fetchGscPeriod(accessToken, siteUrl, startDate, endDate) {
  const response = await fetch(
    `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        startDate,
        endDate,
        dimensions: ['date', 'query', 'page', 'device', 'country'],
        rowLimit: 25000
      })
    }
  )

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`GSC API error ${response.status}: ${text}`)
  }

  const data = await response.json()
  return data.rows || []
}

// ============================================
// Import Month
// ============================================

async function importMonth(accessToken, siteUrl, month) {
  console.log(`\n📅 ${month.label}: ${month.start} → ${month.end}`)

  try {
    // Check existing data
    const { count: existingCount } = await supabase
      .from('gsc_search_analytics')
      .select('*', { count: 'exact', head: true })
      .eq('store_id', STORE_ID)
      .gte('date', month.start)
      .lte('date', month.end)

    if (existingCount && existingCount > 0) {
      console.log(`   ⏭️  Already has ${existingCount} rows - skipping`)
      return { imported: 0, skipped: existingCount }
    }

    // Fetch from GSC
    const rows = await fetchGscPeriod(accessToken, siteUrl, month.start, month.end)

    if (rows.length === 0) {
      console.log('   ℹ️  No data available')
      return { imported: 0, skipped: 0 }
    }

    // Transform data
    const records = rows.map(row => ({
      store_id: STORE_ID,
      date: row.keys[0],
      query: row.keys[1] || null,
      page: row.keys[2] || null,
      device: row.keys[3] || null,
      country: row.keys[4] || null,
      clicks: row.clicks || 0,
      impressions: row.impressions || 0,
      ctr: row.ctr || 0,
      position: row.position || 0
    }))

    // Insert in batches
    const batchSize = 1000
    let inserted = 0

    for (let i = 0; i < records.length; i += batchSize) {
      const batch = records.slice(i, i + batchSize)

      const { error } = await supabase
        .from('gsc_search_analytics')
        .insert(batch)

      if (error) {
        console.error(`   ❌ Batch error:`, error.message)
      } else {
        inserted += batch.length
      }
    }

    console.log(`   ✅ Imported ${inserted} rows`)
    return { imported: inserted, skipped: 0 }

  } catch (err) {
    console.error(`   ❌ Error: ${err.message}`)
    return { imported: 0, skipped: 0, error: err.message }
  }
}

// ============================================
// Main
// ============================================

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════╗')
  console.log('║  📊 VilkasAnalytics - GSC Historical Import                  ║')
  console.log('║  📅 Period: Jan-Nov 2025                                     ║')
  console.log('╚══════════════════════════════════════════════════════════════╝')

  const startTime = Date.now()

  try {
    // Get token
    const { accessToken, siteUrl } = await getGscToken()
    console.log(`\n✅ GSC connected: ${siteUrl}`)

    // Import each month
    let totalImported = 0
    let totalSkipped = 0
    const errors = []

    for (const month of MONTHS_TO_IMPORT) {
      const result = await importMonth(accessToken, siteUrl, month)
      totalImported += result.imported
      totalSkipped += result.skipped
      if (result.error) errors.push(`${month.label}: ${result.error}`)

      // Rate limiting between months
      await new Promise(r => setTimeout(r, 1000))
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(1)

    console.log('\n╔══════════════════════════════════════════════════════════════╗')
    console.log('║  ✅ IMPORT COMPLETE                                          ║')
    console.log('╠══════════════════════════════════════════════════════════════╣')
    console.log(`║  📊 New rows: ${String(totalImported).padEnd(45)}║`)
    console.log(`║  ⏭️  Skipped (existing): ${String(totalSkipped).padEnd(34)}║`)
    console.log(`║  ⏱️  Duration: ${duration}s${' '.repeat(44 - duration.length)}║`)

    if (errors.length > 0) {
      console.log('╠══════════════════════════════════════════════════════════════╣')
      console.log('║  ⚠️  ERRORS:                                                 ║')
      errors.forEach(e => {
        console.log(`║  - ${e.substring(0, 55).padEnd(55)}║`)
      })
    }

    console.log('╚══════════════════════════════════════════════════════════════╝')

  } catch (err) {
    console.error('\n❌ IMPORT FAILED:', err.message)
    process.exit(1)
  }
}

main()

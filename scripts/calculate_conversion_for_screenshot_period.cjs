/**
 * Laske orgaaninen konversio kuvakaappauksen ajanjaksolle
 *
 * Kuvakaappaus näyttää:
 * - Nyt (2025-12-18 - 2026-01-16): 4.98% konversio, 112 tilausta
 * - Vuosi sitten (2024-12-18 - 2025-01-16): 2.87% konversio, 123 tilausta
 */

const { supabase, printProjectInfo, STORE_ID } = require('./db.cjs')

async function calculateConversion() {
  printProjectInfo()

  console.log('📊 Lasketaan orgaaninen konversio kuvakaappauksen ajanjaksolle...\n')
  console.log(`Store ID: ${STORE_ID}\n`)

  const periods = [
    {
      label: 'Nyt (2025-12-18 - 2026-01-16)',
      startDate: '2025-12-18',
      endDate: '2026-01-16',
      expectedConversion: 4.98,
      expectedOrders: 112
    },
    {
      label: 'Vuosi sitten (2024-12-18 - 2025-01-16)',
      startDate: '2024-12-18',
      endDate: '2025-01-16',
      expectedConversion: 2.87,
      expectedOrders: 123
    }
  ]

  for (const period of periods) {
    console.log('='.repeat(80))
    console.log(`📅 ${period.label}`)
    console.log('='.repeat(80))
    console.log('')

    // 1. Hae tilaukset
    const { data: orders, error: ordersError } = await supabase
      .from('orders')
      .select('id, order_number, creation_date')
      .eq('store_id', STORE_ID)
      .gte('creation_date', period.startDate)
      .lte('creation_date', period.endDate + 'T23:59:59')

    if (ordersError) {
      console.error('❌ Virhe tilausten haussa:', ordersError)
      continue
    }

    const totalOrders = orders.length
    console.log(`📦 Tilaukset yhteensä: ${totalOrders}`)

    // 2. Hae GSC klikkaukset
    const { data: gscData, error: gscError } = await supabase
      .from('gsc_search_analytics')
      .select('date, clicks, impressions')
      .eq('store_id', STORE_ID)
      .gte('date', period.startDate)
      .lte('date', period.endDate)

    if (gscError) {
      console.error('❌ Virhe GSC:n haussa:', gscError)
      continue
    }

    const totalClicks = gscData.reduce((sum, row) => sum + (row.clicks || 0), 0)
    const totalImpressions = gscData.reduce((sum, row) => sum + (row.impressions || 0), 0)

    console.log(`🔍 GSC orgaaniset klikkaukset: ${totalClicks}`)
    console.log(`👁️ GSC näyttökerrat: ${totalImpressions}`)
    console.log('')

    // 3. Attribuoi tilaukset (oletetaan 35% orgaanisiksi)
    const attributionRate = 0.35
    const attributedOrders = Math.round(totalOrders * attributionRate)

    console.log('📊 ATTRIBUUTIO:')
    console.log(`   Attribution rate: ${(attributionRate * 100).toFixed(0)}% (35% tilauksista arvioitu orgaanisiksi)`)
    console.log(`   Attributed orders: ${attributedOrders} (${totalOrders} × ${attributionRate})`)
    console.log('')

    // 4. Laske konversio
    if (totalClicks === 0) {
      console.log('⚠️ Ei GSC-klikkauksia, konversiota ei voida laskea')
      console.log('')
      continue
    }

    const conversionRate = (attributedOrders / totalClicks) * 100

    console.log('🧮 KONVERSION LASKENTA:')
    console.log(`   Kaava: (attributed_orders / total_clicks) × 100`)
    console.log(`   = (${attributedOrders} / ${totalClicks}) × 100`)
    console.log(`   = ${conversionRate.toFixed(2)}%`)
    console.log('')

    console.log('🎯 VERTAILU KUVAKAAPPAUKSEEN:')
    console.log(`   Laskettu: ${conversionRate.toFixed(2)}%`)
    console.log(`   Odotettu: ${period.expectedConversion}%`)
    const diff = conversionRate - period.expectedConversion
    console.log(`   Erotus: ${diff >= 0 ? '+' : ''}${diff.toFixed(2)}%`)
    console.log('')

    // 5. Tarkista miksi eroaa
    if (Math.abs(diff) > 0.5) {
      console.log('⚠️ HUOMIOITA:')

      // Tarkista GSC:n ajankohta
      const gscDays = new Set(gscData.map(d => d.date)).size
      const expectedDays = Math.round((new Date(period.endDate) - new Date(period.startDate)) / (1000 * 60 * 60 * 24)) + 1
      console.log(`   GSC päivien määrä: ${gscDays} / ${expectedDays}`)

      if (gscDays < expectedDays) {
        console.log(`   → GSC-data ei kata koko ajanjaksoa (puuttuu ${expectedDays - gscDays} päivää)`)
      }

      // Tarkista attribution rate
      const requiredAttributedOrders = Math.round((period.expectedConversion / 100) * totalClicks)
      const requiredAttributionRate = requiredAttributedOrders / totalOrders
      console.log(`   Vaadittu attribution rate ${period.expectedConversion}%:lle: ${(requiredAttributionRate * 100).toFixed(1)}%`)
      console.log('')
    }

    // 6. Vaihtoehtoinen laskenta (jos attribution rate olisi eri)
    console.log('🔄 VAIHTOEHTOISET SKENAARIOT:')
    const alternativeRates = [0.30, 0.35, 0.40, 0.50]
    alternativeRates.forEach(rate => {
      const altAttributed = Math.round(totalOrders * rate)
      const altConversion = (altAttributed / totalClicks) * 100
      const match = Math.abs(altConversion - period.expectedConversion) < 0.3 ? '✅' : ''
      console.log(`   ${(rate * 100).toFixed(0)}% attribution → ${altConversion.toFixed(2)}% konversio ${match}`)
    })
    console.log('')
  }

  console.log('='.repeat(80))
  console.log('✅ Laskenta valmis!')
  console.log('='.repeat(80))
}

calculateConversion()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('❌ Virhe:', err)
    process.exit(1)
  })

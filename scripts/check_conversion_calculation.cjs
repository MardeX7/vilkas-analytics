/**
 * Tarkista konversiolaskelma
 *
 * Vertaa tietokannan dataa kuvakaappauksen arvoihin:
 * - Nyt (2025-12-18 - 2026-01-16): 4.98% konversio, 112 tilausta, 110 uniikkia asiakasta
 * - Vuosi sitten (2024-12-18 - 2025-01-16): 2.87% konversio, 123 tilausta, 70 uniikkia asiakasta
 */

const { supabase, printProjectInfo, STORE_ID } = require('./db.cjs')

async function checkConversionCalculation() {
  printProjectInfo()

  console.log('📊 Tarkistetaan konversiolaskelma...\n')
  console.log(`Store ID: ${STORE_ID}\n`)

  // Määritä ajanjaksot
  const periods = [
    {
      label: 'Nyt (2025-12-18 - 2026-01-16)',
      startDate: '2025-12-18',
      endDate: '2026-01-16T23:59:59',
      expectedConversion: 4.98,
      expectedOrders: 112,
      expectedCustomers: 110
    },
    {
      label: 'Vuosi sitten (2024-12-18 - 2025-01-16)',
      startDate: '2024-12-18',
      endDate: '2025-01-16T23:59:59',
      expectedConversion: 2.87,
      expectedOrders: 123,
      expectedCustomers: 70
    }
  ]

  for (const period of periods) {
    console.log(`\n${'='.repeat(80)}`)
    console.log(`📅 ${period.label}`)
    console.log(`${'='.repeat(80)}\n`)

    // Hae tilaukset (käytä creation_date eikä created_at)
    const { data: orders, error: ordersError } = await supabase
      .from('orders')
      .select('id, order_number, billing_email, creation_date, grand_total, status')
      .eq('store_id', STORE_ID)
      .gte('creation_date', period.startDate)
      .lte('creation_date', period.endDate)
      .order('creation_date', { ascending: true })

    if (ordersError) {
      console.error('❌ Virhe tilausten haussa:', ordersError)
      continue
    }

    // Laske uniikit asiakkaat
    const uniqueCustomers = new Set()
    orders.forEach(order => {
      if (order.billing_email) {
        uniqueCustomers.add(order.billing_email.toLowerCase())
      }
    })

    const orderCount = orders.length
    const customerCount = uniqueCustomers.size
    const conversion = customerCount > 0 ? (orderCount / customerCount * 100) : 0

    console.log('📊 TIETOKANNASTA:')
    console.log(`   Tilaukset: ${orderCount}`)
    console.log(`   Uniikit asiakkaat: ${customerCount}`)
    console.log(`   Konversio: ${conversion.toFixed(2)}%`)
    console.log('')

    console.log('🎯 ODOTETTU (kuvakaappaus):')
    console.log(`   Tilaukset: ${period.expectedOrders}`)
    console.log(`   Uniikit asiakkaat: ${period.expectedCustomers}`)
    console.log(`   Konversio: ${period.expectedConversion}%`)
    console.log('')

    console.log('✅ VERTAILU:')
    const ordersDiff = orderCount - period.expectedOrders
    const customersDiff = customerCount - period.expectedCustomers
    const conversionDiff = conversion - period.expectedConversion

    console.log(`   Tilaukset: ${ordersDiff >= 0 ? '+' : ''}${ordersDiff} ${Math.abs(ordersDiff) < 5 ? '✅' : '⚠️'}`)
    console.log(`   Uniikit asiakkaat: ${customersDiff >= 0 ? '+' : ''}${customersDiff} ${Math.abs(customersDiff) < 5 ? '✅' : '⚠️'}`)
    console.log(`   Konversio: ${conversionDiff >= 0 ? '+' : ''}${conversionDiff.toFixed(2)}% ${Math.abs(conversionDiff) < 0.5 ? '✅' : '⚠️'}`)
    console.log('')

    // Näytä muutama esimerkki tilauksista
    console.log('📋 Esimerkkejä tilauksista:')
    orders.slice(0, 5).forEach((order, i) => {
      const date = order.creation_date ? order.creation_date.substring(0, 10) : 'N/A'
      console.log(`   ${i + 1}. ${date} | ${order.order_number} | ${order.billing_email} | ${order.grand_total} ${order.status}`)
    })
    if (orders.length > 5) {
      console.log(`   ... ja ${orders.length - 5} muuta tilausta`)
    }
    console.log('')

    // Tarkista onko duplikaatti-asiakkaita
    const customerOrderCounts = {}
    orders.forEach(order => {
      if (order.billing_email) {
        const email = order.billing_email.toLowerCase()
        customerOrderCounts[email] = (customerOrderCounts[email] || 0) + 1
      }
    })

    const repeatCustomers = Object.entries(customerOrderCounts)
      .filter(([_, count]) => count > 1)
      .sort((a, b) => b[1] - a[1])

    if (repeatCustomers.length > 0) {
      console.log('🔁 Toistuvat asiakkaat (>1 tilaus):')
      repeatCustomers.slice(0, 10).forEach(([email, count]) => {
        console.log(`   ${email}: ${count} tilausta`)
      })
      if (repeatCustomers.length > 10) {
        console.log(`   ... ja ${repeatCustomers.length - 10} muuta toistuvaa asiakasta`)
      }
      console.log(`   Yhteensä ${repeatCustomers.length} toistuvaa asiakasta`)
      console.log('')
    }

    // Laske konversion kaava
    console.log('🧮 KONVERSION LASKENTA:')
    console.log(`   Kaava: tilaukset / uniikit_asiakkaat * 100`)
    console.log(`   = ${orderCount} / ${customerCount} * 100`)
    console.log(`   = ${conversion.toFixed(2)}%`)
    console.log('')

    // Tarkista NULL-arvot
    const ordersWithoutEmail = orders.filter(o => !o.billing_email).length
    if (ordersWithoutEmail > 0) {
      console.log(`⚠️ HUOM: ${ordersWithoutEmail} tilausta ilman billing_email -arvoa!`)
      console.log('')
    }

    // Jaottelu statuksittain
    const statusCounts = {}
    orders.forEach(order => {
      statusCounts[order.status] = (statusCounts[order.status] || 0) + 1
    })
    console.log('📊 Tilaukset statuksittain:')
    Object.entries(statusCounts)
      .sort((a, b) => b[1] - a[1])
      .forEach(([status, count]) => {
        console.log(`   ${status}: ${count}`)
      })
    console.log('')
  }

  console.log('\n' + '='.repeat(80))
  console.log('✅ Tarkistus valmis!')
  console.log('='.repeat(80))
}

// Aja tarkistus
checkConversionCalculation()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('❌ Virhe:', err)
    process.exit(1)
  })

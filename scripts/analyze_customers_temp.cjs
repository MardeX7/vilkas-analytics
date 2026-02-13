const { supabase, STORE_ID } = require('./db.cjs')

async function analyze() {
  const { data: orders } = await supabase
    .from('orders')
    .select('is_b2b, is_b2b_soft, grand_total, billing_email, billing_country')
    .eq('store_id', STORE_ID)

  // AOV B2B vs B2C
  let b2bTotal = 0, b2bCount = 0, b2cTotal = 0, b2cCount = 0
  orders.forEach(o => {
    if (o.is_b2b || o.is_b2b_soft) {
      b2bTotal += o.grand_total || 0
      b2bCount++
    } else {
      b2cTotal += o.grand_total || 0
      b2cCount++
    }
  })

  console.log('💰 AOV vertailu:')
  console.log('   B2B AOV:', Math.round(b2bTotal / b2bCount), 'kr (' + b2bCount + ' tilausta)')
  console.log('   B2C AOV:', Math.round(b2cTotal / b2cCount), 'kr (' + b2cCount + ' tilausta)')

  // Email aggregation
  const stats = {}
  orders.forEach(o => {
    const email = (o.billing_email || '').toLowerCase()
    if (!email) return
    if (!stats[email]) {
      stats[email] = { orders: 0, total: 0, isB2B: o.is_b2b || o.is_b2b_soft }
    }
    stats[email].orders++
    stats[email].total += o.grand_total || 0
  })

  // Top 10 customers
  const top = Object.entries(stats)
    .sort((a, b) => b[1].total - a[1].total)
    .slice(0, 10)

  console.log('')
  console.log('🏆 Top 10 asiakasta (LTV):')
  top.forEach(([email, s], i) => {
    console.log('   ' + (i+1) + '. ' + Math.round(s.total) + ' kr | ' + s.orders + ' tilausta | ' + (s.isB2B ? 'B2B' : 'B2C'))
  })

  // Countries
  const countries = {}
  orders.forEach(o => {
    const c = o.billing_country || '?'
    countries[c] = (countries[c] || 0) + 1
  })

  console.log('')
  console.log('🌍 Maat:')
  Object.entries(countries)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .forEach(([c, n]) => console.log('   ' + c + ': ' + n + ' (' + Math.round(n/orders.length*100) + '%)'))

  // New vs returning
  let newRev = 0, newCount = 0, retRev = 0, retCount = 0
  Object.values(stats).forEach(s => {
    if (s.orders === 1) {
      newRev += s.total
      newCount++
    } else {
      retRev += s.total
      retCount++
    }
  })

  console.log('')
  console.log('📊 Uudet vs Palaavat asiakkaat:')
  console.log('   Uudet: ' + newCount + ' asiakasta, ' + Math.round(newRev) + ' kr (' + Math.round(newRev/(newRev+retRev)*100) + '% liikevaihdosta)')
  console.log('   Palaavat: ' + retCount + ' asiakasta, ' + Math.round(retRev) + ' kr (' + Math.round(retRev/(newRev+retRev)*100) + '% liikevaihdosta)')
  console.log('')
  console.log('   Palaavan asiakkaan LTV: ' + Math.round(retRev/retCount) + ' kr')
  console.log('   Uuden asiakkaan arvo: ' + Math.round(newRev/newCount) + ' kr')
  console.log('   Palaava asiakas on ' + ((retRev/retCount) / (newRev/newCount)).toFixed(1) + 'x arvokkaampi')
}

analyze().catch(console.error)

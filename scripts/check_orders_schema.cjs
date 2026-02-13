/**
 * Tarkista orders-taulun rakenne
 */

const { supabase, printProjectInfo, STORE_ID } = require('./db.cjs')

async function checkOrdersSchema() {
  printProjectInfo()

  console.log('📋 Haetaan orders-taulun rakenne...\n')

  // Hae muutama tilaus nähdäksemme sarakkeet
  const { data: orders, error } = await supabase
    .from('orders')
    .select('*')
    .eq('store_id', STORE_ID)
    .limit(3)

  if (error) {
    console.error('❌ Virhe:', error)
    return
  }

  if (orders && orders.length > 0) {
    console.log('✅ Esimerkkitilaus:')
    console.log(JSON.stringify(orders[0], null, 2))
    console.log('')
    console.log('📊 Saatavilla olevat sarakkeet:')
    Object.keys(orders[0]).forEach(key => {
      console.log(`   - ${key}`)
    })
  } else {
    console.log('⚠️ Ei tilauksia löytynyt')
  }
}

checkOrdersSchema()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('❌ Virhe:', err)
    process.exit(1)
  })

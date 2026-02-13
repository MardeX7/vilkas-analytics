/**
 * Tarkista indicators-taulun rakenne
 */

const { supabase, printProjectInfo } = require('./db.cjs')

async function checkIndicatorsSchema() {
  printProjectInfo()

  console.log('📋 Haetaan indicators-taulun rakenne...\n')

  // Hae muutama indikaattori nähdäksemme sarakkeet
  const { data: indicators, error } = await supabase
    .from('indicators')
    .select('*')
    .limit(5)

  if (error) {
    console.error('❌ Virhe:', error)
    return
  }

  if (indicators && indicators.length > 0) {
    console.log('✅ Esimerkkiindikaattori:')
    console.log(JSON.stringify(indicators[0], null, 2))
    console.log('')
    console.log('📊 Saatavilla olevat sarakkeet:')
    Object.keys(indicators[0]).forEach(key => {
      console.log(`   - ${key}`)
    })
    console.log('')
    console.log('📋 Kaikki indikaattorit:')
    indicators.forEach(ind => {
      console.log(`   ${ind.indicator_id}: ${ind.display_value} (${ind.period_label})`)
    })
  } else {
    console.log('⚠️ Ei indikaattoreita löytynyt')
  }
}

checkIndicatorsSchema()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('❌ Virhe:', err)
    process.exit(1)
  })

/**
 * Tarkista organic_conversion_rate indikaattori
 */

const { supabase, printProjectInfo, SHOP_ID } = require('./db.cjs')

async function checkConversionIndicator() {
  printProjectInfo()

  console.log('🔍 Haetaan organic_conversion_rate indikaattori...\n')
  console.log(`SHOP_ID: ${SHOP_ID}\n`)

  // Hae konversio-indikaattori
  const { data: indicators, error } = await supabase
    .from('indicators')
    .select('*')
    .eq('shop_id', SHOP_ID)
    .eq('indicator_id', 'organic_conversion_rate')
    .order('calculated_at', { ascending: false })
    .limit(5)

  if (error) {
    console.error('❌ Virhe:', error)
    return
  }

  if (!indicators || indicators.length === 0) {
    console.log('⚠️ organic_conversion_rate indikaattoria ei löytynyt!')
    console.log('')
    console.log('Haetaan kaikki saatavilla olevat indikaattorit:')

    const { data: allIndicators } = await supabase
      .from('indicators')
      .select('indicator_id, period_label, calculated_at')
      .eq('shop_id', SHOP_ID)
      .order('calculated_at', { ascending: false })
      .limit(10)

    if (allIndicators && allIndicators.length > 0) {
      console.log('\n📋 Viimeisimmät indikaattorit:')
      allIndicators.forEach(ind => {
        console.log(`   - ${ind.indicator_id} (${ind.period_label}) - ${ind.calculated_at}`)
      })
    }
    return
  }

  console.log(`✅ Löytyi ${indicators.length} konversio-indikaattoria\n`)

  indicators.forEach((ind, i) => {
    console.log('='.repeat(80))
    console.log(`📊 Indikaattori ${i + 1}/${indicators.length}`)
    console.log('='.repeat(80))
    console.log(`Period: ${ind.period_label} (${ind.period_start} - ${ind.period_end})`)
    console.log(`Calculated: ${ind.calculated_at}`)
    console.log('')

    const val = ind.value
    if (val) {
      console.log(`Numeric Value: ${ind.numeric_value}`)
      console.log(`Direction: ${ind.direction}`)
      console.log(`Change: ${ind.change_percent}%`)
      console.log('')

      if (val.metrics) {
        console.log('📈 Metrics:')
        Object.entries(val.metrics).forEach(([key, value]) => {
          console.log(`   ${key}: ${JSON.stringify(value)}`)
        })
        console.log('')
      }

      if (val.context) {
        console.log('📝 Context:')
        Object.entries(val.context).forEach(([key, value]) => {
          console.log(`   ${key}: ${JSON.stringify(value)}`)
        })
        console.log('')
      }
    }

    console.log('🔍 Full value object:')
    console.log(JSON.stringify(val, null, 2))
    console.log('')
  })

  console.log('='.repeat(80))
  console.log('✅ Tarkistus valmis!')
  console.log('='.repeat(80))
}

checkConversionIndicator()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('❌ Virhe:', err)
    process.exit(1)
  })

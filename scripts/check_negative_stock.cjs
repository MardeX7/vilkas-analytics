/**
 * Tutkii tuotteita joilla stock_level < 0 (negatiivinen varasto)
 * ja tuotteita joilla cost_price on ongelma
 *
 * Käyttö: node scripts/check_negative_stock.cjs
 */

const { supabase, printProjectInfo, STORE_ID } = require('./db.cjs')

async function main() {
  printProjectInfo()

  // 1. Tuotteet joilla stock_level < 0
  console.log('=== TUOTTEET JOILLA stock_level < 0 ===\n')
  const { data: negative, error: err1 } = await supabase
    .from('products')
    .select('id, name, product_number, stock_level, cost_price, price_amount, stock_tracked, for_sale')
    .eq('store_id', STORE_ID)
    .lt('stock_level', 0)
    .order('stock_level', { ascending: true })

  if (err1) {
    console.error('Virhe:', err1.message)
  } else if (negative.length === 0) {
    console.log('Ei negatiivisia stock_level arvoja.\n')
  } else {
    console.log(`Löytyi ${negative.length} tuotetta:\n`)
    let totalNegativeValue = 0
    negative.forEach(p => {
      const unitCost = p.cost_price || (p.price_amount ? p.price_amount * 0.6 : 0)
      const stockValue = p.stock_level * unitCost
      totalNegativeValue += stockValue
      console.log(`  ${p.product_number || '?'} | ${p.name}`)
      console.log(`    stock: ${p.stock_level} | cost: ${p.cost_price || 'NULL'} | price: ${p.price_amount} | value: ${Math.round(stockValue)} kr`)
      console.log(`    tracked: ${p.stock_tracked} | for_sale: ${p.for_sale}`)
      console.log('')
    })
    console.log(`  YHTEENSÄ negatiivinen arvo: ${Math.round(totalNegativeValue)} kr\n`)
  }

  // 2. Tuotteet joilla cost_price on NULL (for_sale + stock_tracked)
  console.log('=== TUOTTEET JOILLA cost_price = NULL (aktiiviset) ===\n')
  const { data: noCost, error: err2 } = await supabase
    .from('products')
    .select('id, name, product_number, stock_level, price_amount, stock_tracked')
    .eq('store_id', STORE_ID)
    .eq('for_sale', true)
    .is('cost_price', null)
    .gt('stock_level', 0)
    .order('stock_level', { ascending: false })
    .limit(20)

  if (err2) {
    console.error('Virhe:', err2.message)
  } else {
    console.log(`Löytyi ${noCost.length} tuotetta (max 20 näytetään):\n`)
    noCost.forEach(p => {
      const fallbackCost = p.price_amount ? Math.round(p.price_amount * 0.6) : 0
      console.log(`  ${p.product_number || '?'} | ${p.name}`)
      console.log(`    stock: ${p.stock_level} | price: ${p.price_amount} | fallback cost: ${fallbackCost}`)
      console.log('')
    })
  }

  // 3. Yhteenveto varastoarvosta
  console.log('=== VARASTOARVON YHTEENVETO ===\n')
  const { data: allProducts, error: err3 } = await supabase
    .from('products')
    .select('stock_level, cost_price, price_amount, stock_tracked, for_sale')
    .eq('store_id', STORE_ID)
    .eq('for_sale', true)

  if (err3) {
    console.error('Virhe:', err3.message)
  } else {
    let totalWithTracked = 0
    let totalWithoutFilter = 0
    let totalCorrected = 0

    allProducts.forEach(p => {
      const unitCost = p.cost_price || (p.price_amount ? p.price_amount * 0.6 : 0)
      const rawValue = (p.stock_level || 0) * unitCost
      const correctedValue = Math.max(p.stock_level || 0, 0) * unitCost

      totalWithoutFilter += rawValue

      if (p.stock_tracked !== false) {
        totalWithTracked += rawValue
        totalCorrected += correctedValue
      }
    })

    console.log(`  Kaikki for_sale tuotteet:     ${Math.round(totalWithoutFilter)} kr`)
    console.log(`  + stock_tracked != false:      ${Math.round(totalWithTracked)} kr`)
    console.log(`  + negatiiviset korjattu (≥0):  ${Math.round(totalCorrected)} kr`)
    console.log('')
    console.log(`  Ero (negat. vaikutus):         ${Math.round(totalWithTracked - totalCorrected)} kr`)
  }
}

main().catch(console.error)

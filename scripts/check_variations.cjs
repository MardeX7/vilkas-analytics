/**
 * Tarkista tuotevariaatiot ja varastosaldot
 */

const { createClient } = require('@supabase/supabase-js')
const path = require('path')
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') })

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

async function checkVariations() {
  console.log('🔍 Tuotevariaatioiden ja varastosaldojen analyysi\n')

  // 1. Products-taulun sarakkeet
  const { data: sample } = await supabase.from('products').select('*').limit(1)
  console.log('Products sarakkeet:', Object.keys(sample?.[0] || {}).join(', '))
  console.log('')

  // 2. Tarkista onko product_variations taulu
  const { data: varTable, error: varError } = await supabase.from('product_variations').select('*').limit(1)
  if (!varError) {
    console.log('✅ product_variations taulu löytyy')
    console.log('   Sarakkeet:', Object.keys(varTable?.[0] || {}).join(', '))
  } else {
    console.log('❌ product_variations taulua ei ole')
  }
  console.log('')

  // 3. Varastotilanne
  const { count: totalCount } = await supabase.from('products').select('*', { count: 'exact', head: true })
  const { count: stockCount } = await supabase.from('products').select('*', { count: 'exact', head: true }).gt('stock_level', 0)
  const { count: zeroCount } = await supabase.from('products').select('*', { count: 'exact', head: true }).eq('stock_level', 0)

  console.log('📦 Varastotilanne:')
  console.log(`   Total: ${totalCount}`)
  console.log(`   Stock > 0: ${stockCount}`)
  console.log(`   Stock = 0: ${zeroCount}`)
  console.log(`   Stock NULL: ${totalCount - stockCount - zeroCount}`)
  console.log('')

  // 4. Top tuotteet varastosaldolla
  const { data: topStock } = await supabase
    .from('products')
    .select('product_number, name, stock_level')
    .gt('stock_level', 0)
    .order('stock_level', { ascending: false })
    .limit(10)

  console.log('📈 Top 10 tuotteet (stock > 0):')
  topStock?.forEach(p => {
    console.log(`   ${p.stock_level} kpl - ${p.product_number} - ${p.name?.substring(0, 50)}`)
  })
  console.log('')

  // 5. Etsi mahdolliset variaatiot nimestä/tuotenumerosta
  const { data: possibleVariants } = await supabase
    .from('products')
    .select('product_number, name, stock_level')
    .or('name.ilike.%P80%,name.ilike.%P120%,name.ilike.%P180%,name.ilike.%P240%')
    .limit(20)

  console.log('🔧 Mahdolliset variaatiot (hiomapaperit P80/P120/etc):')
  possibleVariants?.forEach(p => {
    console.log(`   ${p.stock_level ?? 'NULL'} kpl - ${p.product_number} - ${p.name?.substring(0, 60)}`)
  })
}

checkVariations().catch(console.error)

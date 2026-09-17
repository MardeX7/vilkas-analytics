/**
 * One-off: inspect products table schema + sample rows for both stores,
 * and spot-check a few product_numbers the neighbouring analysis flagged.
 */
const { supabase, printProjectInfo } = require('./db.cjs')

const STORES = {
  automaalit: '9a0ba934-bd6c-428c-8729-791d5c7ac7c2',
  billackering: 'a28836f6-9487-4b67-9194-e907eaf94b69',
}

async function main() {
  printProjectInfo()

  for (const [name, storeId] of Object.entries(STORES)) {
    const { data: sample } = await supabase
      .from('products')
      .select('*')
      .eq('store_id', storeId)
      .limit(1)
    const { count } = await supabase
      .from('products')
      .select('id', { count: 'exact', head: true })
      .eq('store_id', storeId)
    console.log(`\n=== ${name} (${count} products) ===`)
    if (sample && sample[0]) {
      console.log('Columns:', Object.keys(sample[0]).join(', '))
      console.log('Sample row:', JSON.stringify(sample[0], null, 2))
    }
  }

  // Spot-check products the neighbouring chat referenced
  const checks = ['830320', '12167', '9001', '300005446']
  console.log('\n=== Spot-check flagged product_numbers (any store) ===')
  for (const pn of checks) {
    const { data } = await supabase
      .from('products')
      .select('store_id, product_number, price_amount, cost_price, name, updated_at')
      .eq('product_number', pn)
    console.log(pn, '→', JSON.stringify(data))
  }
}

main().catch(console.error)

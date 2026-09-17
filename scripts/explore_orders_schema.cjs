/**
 * One-off: inspect orders + order_line_items schema and date range for Billackering.
 */
const { supabase, printProjectInfo } = require('./db.cjs')
const BILL = 'a28836f6-9487-4b67-9194-e907eaf94b69'

async function main() {
  printProjectInfo()

  for (const t of ['orders', 'order_line_items']) {
    const { data } = await supabase.from(t).select('*').limit(1)
    console.log(`\n=== ${t} columns ===`)
    if (data && data[0]) console.log(Object.keys(data[0]).join(', '))
    console.log('sample:', JSON.stringify(data && data[0], null, 2))
  }

  // date range of orders for billackering
  const { data: minRow } = await supabase.from('orders')
    .select('created_at, order_date, store_id').eq('store_id', BILL)
    .order('created_at', { ascending: true }).limit(1)
  const { data: maxRow } = await supabase.from('orders')
    .select('created_at, order_date, store_id').eq('store_id', BILL)
    .order('created_at', { ascending: false }).limit(1)
  console.log('\nBillackering orders earliest:', JSON.stringify(minRow))
  console.log('Billackering orders latest:', JSON.stringify(maxRow))
}
main().catch(e => { console.error(e); process.exit(1) })

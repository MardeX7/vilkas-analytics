const { supabase, printProjectInfo } = require('./db.cjs')

async function test() {
  printProjectInfo()

  const { data, error } = await supabase.rpc('get_category_summary', {
    p_store_id: 'a28836f6-9487-4b67-9194-e907eaf94b69',
    p_days: 365
  })

  if (error) {
    console.log('Error:', error.message)
    return
  }

  console.log('Category sales summary (last 365 days):')
  console.log('─'.repeat(60))

  if (!data || data.length === 0) {
    console.log('No data found')
    return
  }

  data.slice(0, 15).forEach(c => {
    const rev = parseFloat(c.revenue || 0).toFixed(2)
    console.log(`${c.display_name} - €${rev} (${c.revenue_share}%)`)
  })
}

test()

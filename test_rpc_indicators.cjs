const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  'https://abbwfjishojcbifbruia.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFiYndmamlzaG9qY2JpZmJydWlhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NTU4NzU4MywiZXhwIjoyMDcxMTYzNTgzfQ.hZRj4pYufii02bm6mLYCjULKgbMlaj6uIYQ7ZUiPIfo'
)

const STORE_ID = 'a28836f6-9487-4b67-9194-e907eaf94b69'

async function test() {
  console.log('Testing get_indicators RPC...\n')
  
  const { data, error } = await supabase.rpc('get_indicators', {
    p_store_id: STORE_ID,
    p_period_label: '30d'
  })
  
  if (error) {
    console.error('❌ Error:', error.message)
    return
  }
  
  console.log('✅ Found', data.length, 'indicators:\n')
  
  for (const ind of data) {
    console.log('  ' + ind.indicator_id + ':')
    console.log('    Value:', ind.numeric_value)
    console.log('    Direction:', ind.direction)
    console.log('    Change:', ind.change_percent + '%')
    console.log('    Alert:', ind.alert_triggered)
    console.log('')
  }
}

test()

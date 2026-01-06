const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  'https://abbwfjishojcbifbruia.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFiYndmamlzaG9qY2JpZmJydWlhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NTU4NzU4MywiZXhwIjoyMDcxMTYzNTgzfQ.hZRj4pYufii02bm6mLYCjULKgbMlaj6uIYQ7ZUiPIfo'
)

async function test() {
  // Check if indicator_results table exists and has data
  const { data: indicators, error: indError } = await supabase
    .from('indicator_results')
    .select('*')
    .eq('store_id', 'a28836f6-9487-4b67-9194-e907eaf94b69')
    .limit(10)
  
  if (indError) {
    console.log('indicator_results error:', indError.message)
  } else {
    console.log('indicator_results has', indicators.length, 'rows')
    if (indicators.length > 0) {
      console.log('Sample:', JSON.stringify(indicators[0], null, 2))
    }
  }
}

test()

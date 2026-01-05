import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'

config({ path: '.env.local' })

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function test() {
  const STORE_ID = 'a28836f6-9487-4b67-9194-e907eaf94b69'

  // Get one order to test
  const { data: orders, error: fetchError } = await supabase
    .from('orders')
    .select('id, order_number, grand_total')
    .eq('store_id', STORE_ID)
    .eq('grand_total', 0)
    .limit(1)

  if (fetchError) {
    console.log('Fetch error:', fetchError.message)
    return
  }

  if (!orders || orders.length === 0) {
    console.log('No zero-total orders found')
    return
  }

  const order = orders[0]
  console.log('Testing update for order:', order.order_number, 'id:', order.id)

  // Try update
  const { data, error } = await supabase
    .from('orders')
    .update({ grand_total: 999.99 })
    .eq('id', order.id)
    .select()

  if (error) {
    console.log('UPDATE ERROR:', error.message)
    console.log('Full error:', error)
  } else {
    console.log('Updated rows:', data?.length)
    console.log('New grand_total:', data?.[0]?.grand_total)
  }

  // Verify
  const { data: check } = await supabase
    .from('orders')
    .select('grand_total')
    .eq('id', order.id)
    .single()

  console.log('Verified value:', check?.grand_total)
}

test()

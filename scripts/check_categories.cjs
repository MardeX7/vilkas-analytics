const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const STORE_ID = 'a28836f6-9487-4b67-9194-e907eaf94b69';
const SHOP_ID = '3b93e9b1-d64c-4686-a14a-bec535495f71';

async function check() {
  // Get products columns
  const { data: prod } = await supabase
    .from('products')
    .select('*')
    .eq('store_id', STORE_ID)
    .limit(1);

  console.log('Products columns:', Object.keys(prod?.[0] || {}));

  // Check order_items with join
  const { data: orderItems, error: oiErr } = await supabase
    .from('order_items')
    .select('line_total, product_name, product_number')
    .limit(5);

  console.log('\nOrder items sample:', orderItems);
  if (oiErr) console.log('Order items error:', oiErr);

  // Check ga4_ecommerce
  const { data: ga4 } = await supabase
    .from('ga4_ecommerce')
    .select('item_category, item_revenue, items_purchased')
    .eq('store_id', SHOP_ID)
    .gte('date', '2025-12-10');

  const catTotals = {};
  ga4?.forEach(row => {
    const cat = row.item_category || 'Uncategorized';
    if (!catTotals[cat]) {
      catTotals[cat] = { revenue: 0, purchased: 0 };
    }
    catTotals[cat].revenue += parseFloat(row.item_revenue) || 0;
    catTotals[cat].purchased += row.items_purchased || 0;
  });

  console.log('\nGA4 categories (30 days):');
  Object.entries(catTotals)
    .sort((a, b) => b[1].revenue - a[1].revenue)
    .forEach(([cat, data]) => {
      console.log('-', cat, '| Revenue:', Math.round(data.revenue), '| Purchased:', data.purchased);
    });

  // Check orders total for comparison
  const { data: orders } = await supabase
    .from('orders')
    .select('grand_total')
    .eq('store_id', STORE_ID)
    .gte('creation_date', '2025-12-10')
    .neq('status', 'cancelled');

  const total = orders?.reduce((sum, o) => sum + (o.grand_total || 0), 0) || 0;
  console.log('\nOrders total (30 days):', Math.round(total), 'SEK');
  console.log('GA4 total:', Math.round(Object.values(catTotals).reduce((s, c) => s + c.revenue, 0)), 'SEK');
}

check();

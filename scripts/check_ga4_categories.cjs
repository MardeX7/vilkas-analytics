const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SHOP_ID = '3b93e9b1-d64c-4686-a14a-bec535495f71';

async function check() {
  // Get GA4 ecommerce with categories - ALL data
  const { data: ga4 } = await supabase
    .from('ga4_ecommerce')
    .select('item_id, item_name, item_category, item_revenue, items_purchased, date')
    .eq('store_id', SHOP_ID);

  console.log('Total GA4 rows:', ga4?.length);

  // Aggregate by category
  const catTotals = {};
  ga4?.forEach(row => {
    const cat = row.item_category || 'Uncategorized';
    if (!catTotals[cat]) {
      catTotals[cat] = { revenue: 0, purchased: 0 };
    }
    catTotals[cat].revenue += parseFloat(row.item_revenue) || 0;
    catTotals[cat].purchased += row.items_purchased || 0;
  });

  console.log('\nGA4 categories (all time):');
  Object.entries(catTotals)
    .sort((a, b) => b[1].revenue - a[1].revenue)
    .slice(0, 20)
    .forEach(([cat, data]) => {
      console.log('-', cat, '| Revenue:', Math.round(data.revenue), 'kr | Purchased:', data.purchased);
    });

  // Check date range
  const dates = ga4?.map(r => r.date).sort();
  console.log('\nDate range:', dates?.[0], 'to', dates?.[dates.length - 1]);

  // Total revenue
  const totalRev = Object.values(catTotals).reduce((s, c) => s + c.revenue, 0);
  console.log('\nTotal GA4 revenue:', Math.round(totalRev), 'kr');
}

check();

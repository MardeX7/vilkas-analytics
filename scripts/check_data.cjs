const { supabase, STORE_ID, SHOP_ID } = require('./db.cjs');

async function checkData() {
  // Check products with cost_price
  const { data: withCost, count: costCount } = await supabase
    .from('products')
    .select('name, price_amount, cost_price', { count: 'exact' })
    .eq('store_id', STORE_ID)
    .not('cost_price', 'is', null)
    .limit(5);

  console.log('=== PRODUCTS WITH COST_PRICE (' + costCount + ' of 383) ===');
  console.log(withCost);

  // GA4 Ecommerce has item_category - use that!
  const { data: ga4Cats } = await supabase
    .from('ga4_ecommerce')
    .select('item_category')
    .eq('store_id', SHOP_ID);

  const uniqueGa4Cats = [...new Set(ga4Cats?.map(r => r.item_category).filter(Boolean))];
  console.log('\n=== GA4 ECOMMERCE CATEGORIES (' + uniqueGa4Cats.length + ') ===');
  console.log(uniqueGa4Cats);

  // Order analysis with shipping/payment
  const { data: orderAnalysis } = await supabase
    .from('orders')
    .select('grand_total, shipping_method, payment_method')
    .eq('store_id', STORE_ID)
    .order('creation_date', { ascending: false })
    .limit(100);

  // Group by shipping
  const byShipping = {};
  orderAnalysis?.forEach(o => {
    const key = o.shipping_method || 'Unknown';
    if (!byShipping[key]) byShipping[key] = { count: 0, total: 0 };
    byShipping[key].count++;
    byShipping[key].total += o.grand_total || 0;
  });

  console.log('\n=== ORDERS BY SHIPPING (last 100) ===');
  Object.entries(byShipping).forEach(([k, v]) => {
    console.log(k + ': ' + v.count + ' orders, avg ' + Math.round(v.total/v.count) + ' SEK');
  });

  // Group by payment
  const byPayment = {};
  orderAnalysis?.forEach(o => {
    const key = o.payment_method || 'Unknown';
    if (!byPayment[key]) byPayment[key] = { count: 0, total: 0 };
    byPayment[key].count++;
    byPayment[key].total += o.grand_total || 0;
  });

  console.log('\n=== ORDERS BY PAYMENT (last 100) ===');
  Object.entries(byPayment).forEach(([k, v]) => {
    console.log(k + ': ' + v.count + ' orders, avg ' + Math.round(v.total/v.count) + ' SEK');
  });

  // Order items sample
  const { data: items } = await supabase
    .from('order_items')
    .select('name, quantity, unit_price, line_total, sku')
    .limit(10);

  console.log('\n=== ORDER ITEMS SAMPLE ===');
  console.log(items);
}

checkData().catch(console.error);

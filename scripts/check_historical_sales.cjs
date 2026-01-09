/**
 * Check historical sales totals
 */
const { supabase, STORE_ID } = require('./db.cjs');

async function checkHistoricalSales() {
  console.log('📊 Checking historical sales data...\n');

  // Get daily sales from orders table
  const { data: orders, error } = await supabase
    .from('orders')
    .select('creation_date, grand_total, order_number')
    .eq('store_id', STORE_ID)
    .order('creation_date', { ascending: false });

  if (error) {
    console.log('❌ Error:', error.message);
    return;
  }

  // Group by date
  const dailySales = {};
  for (const order of orders) {
    const date = order.creation_date?.split('T')[0] || 'unknown';
    if (!dailySales[date]) {
      dailySales[date] = { count: 0, total: 0, orders: [] };
    }
    dailySales[date].count++;
    dailySales[date].total += parseFloat(order.grand_total) || 0;
    dailySales[date].orders.push({
      number: order.order_number,
      total: order.grand_total
    });
  }

  // Print daily summary
  console.log('📅 Daily Sales Summary:');
  console.log('═══════════════════════════════════════════════════');

  const dates = Object.keys(dailySales).sort().reverse();
  for (const date of dates) {
    const day = dailySales[date];
    const totalFormatted = day.total.toLocaleString('sv-SE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    console.log(`${date}: ${day.count} orders | ${totalFormatted} SEK`);

    // Show orders with 0 grand_total
    const zeroOrders = day.orders.filter(o => parseFloat(o.total) === 0);
    if (zeroOrders.length > 0) {
      console.log(`  ⚠️ Orders with 0 total: ${zeroOrders.map(o => '#' + o.number).join(', ')}`);
    }
  }

  // Check for orders with 0 grand_total
  const zeroTotalOrders = orders.filter(o => parseFloat(o.grand_total) === 0);
  console.log('\n');
  console.log('═══════════════════════════════════════════════════');
  console.log(`📊 Total orders: ${orders.length}`);
  console.log(`⚠️ Orders with 0 grand_total: ${zeroTotalOrders.length}`);

  if (zeroTotalOrders.length > 0) {
    console.log('\nOrders needing fix:');
    for (const o of zeroTotalOrders.slice(0, 20)) {
      console.log(`  #${o.order_number} | ${o.creation_date?.split('T')[0]}`);
    }
    if (zeroTotalOrders.length > 20) {
      console.log(`  ... and ${zeroTotalOrders.length - 20} more`);
    }
  }
}

checkHistoricalSales();

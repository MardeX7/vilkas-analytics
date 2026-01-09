/**
 * Sync historical line items from ePages
 * Fetches order details for all orders missing line items
 */
const { supabase, STORE_ID } = require('./db.cjs');

async function syncHistoricalLineItems() {
  console.log('🔄 Syncing historical line items...\n');

  // Get store credentials
  const { data: store } = await supabase
    .from('stores')
    .select('id, name, domain, epages_shop_id, access_token')
    .eq('id', STORE_ID)
    .single();

  if (!store) {
    console.log('❌ Store not found');
    return;
  }

  const apiUrl = 'https://' + store.domain + '/rs/shops/' + store.epages_shop_id;

  // Get all orders without line items
  const { data: orders, error } = await supabase
    .from('orders')
    .select('id, epages_order_id, order_number, creation_date')
    .eq('store_id', STORE_ID)
    .order('creation_date', { ascending: false });

  if (error) {
    console.log('❌ Error fetching orders:', error.message);
    return;
  }

  console.log(`📦 Found ${orders.length} total orders`);

  // Check which orders have line items
  let ordersNeedingSync = [];
  for (const order of orders) {
    const { count } = await supabase
      .from('order_line_items')
      .select('id', { count: 'exact', head: true })
      .eq('order_id', order.id);

    if (count === 0) {
      ordersNeedingSync.push(order);
    }
  }

  console.log(`🔧 Orders needing line items: ${ordersNeedingSync.length}\n`);

  let synced = 0;
  let lineItemsSynced = 0;
  let failed = 0;

  for (const order of ordersNeedingSync) {
    try {
      // Fetch order details from ePages
      const detailUrl = apiUrl + '/orders/' + order.epages_order_id;
      const detailResp = await fetch(detailUrl, {
        headers: {
          'Authorization': 'Bearer ' + store.access_token,
          'Accept': 'application/vnd.epages.v1+json'
        }
      });

      if (!detailResp.ok) {
        console.log(`❌ #${order.order_number}: API error ${detailResp.status}`);
        failed++;
        continue;
      }

      const orderDetail = await detailResp.json();
      const lineItems = orderDetail.lineItemContainer?.productLineItems || [];

      if (lineItems.length === 0) {
        console.log(`⚠️ #${order.order_number}: No line items in API`);
        continue;
      }

      // Insert line items
      for (const item of lineItems) {
        const { error: insertError } = await supabase
          .from('order_line_items')
          .insert({
            order_id: order.id,
            epages_line_item_id: item.lineItemId,
            product_number: item.sku,
            product_name: item.name || 'Unknown',
            quantity: Math.round(item.quantity?.amount || 1),
            unit_price: item.singleItemPrice?.amount || 0,
            total_price: item.lineItemPrice?.amount || 0,
            tax_rate: item.taxClass?.percentage || 0
          });

        if (insertError) {
          console.log(`  Line item error: ${insertError.message}`);
        } else {
          lineItemsSynced++;
        }
      }

      synced++;
      console.log(`✅ #${order.order_number} (${order.creation_date?.split('T')[0]}): ${lineItems.length} items`);

      // Rate limiting - small delay between API calls
      await new Promise(r => setTimeout(r, 100));

    } catch (err) {
      console.log(`❌ #${order.order_number}: ${err.message}`);
      failed++;
    }
  }

  console.log('\n════════════════════════════════════════');
  console.log(`✅ Synced: ${synced} orders, ${lineItemsSynced} line items`);
  console.log(`❌ Failed: ${failed}`);
}

syncHistoricalLineItems();

/**
 * Test ePages API sync
 */
const { supabase, STORE_ID } = require('./db.cjs');

async function syncEpages() {
  console.log('🔄 Starting ePages sync test...');

  const { data: store } = await supabase
    .from('stores')
    .select('id, name, domain, epages_shop_id, access_token')
    .eq('id', STORE_ID)
    .single();

  if (!store) {
    console.log('❌ Store not found');
    return;
  }

  console.log('📦 Store:', store.name, '(' + store.domain + ')');

  // Calculate date range (last 3 days)
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 3);

  // Build API URL
  const apiUrl = 'https://' + store.domain + '/rs/shops/' + store.epages_shop_id;
  const url = apiUrl + '/orders?resultsPerPage=100&createdAfter=' + startDate.toISOString();
  console.log('📡 Fetching:', url);

  try {
    const response = await fetch(url, {
      headers: {
        'Authorization': 'Bearer ' + store.access_token,
        'Accept': 'application/vnd.epages.v1+json'
      }
    });

    console.log('📡 Response status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.log('❌ Error:', errorText.substring(0, 500));
      return;
    }

    const data = await response.json();
    console.log('✅ Orders from ePages API:', data.items?.length || 0);
    console.log('---');

    // List orders
    for (const o of data.items || []) {
      console.log('  #' + o.orderNumber + ' | ' + (o.creationDate?.split('T')[0] || '?') + ' | ' + o.status);
    }

    // Now sync to database
    if (data.items && data.items.length > 0) {
      console.log('\n🔄 Syncing to database...');

      const statusMap = {
        'InProgress': 'pending',
        'Pending': 'pending',
        'ReadyForDispatch': 'paid',
        'Dispatched': 'shipped',
        'Delivered': 'delivered',
        'Cancelled': 'cancelled',
        'Returned': 'cancelled',
        'Closed': 'delivered'
      };

      let synced = 0;
      let lineItemsSynced = 0;

      for (const orderFromList of data.items) {
        // Fetch order details to get line items (not included in list response)
        const detailUrl = apiUrl + '/orders/' + orderFromList.orderId;
        const detailResp = await fetch(detailUrl, {
          headers: {
            'Authorization': 'Bearer ' + store.access_token,
            'Accept': 'application/vnd.epages.v1+json'
          }
        });

        let order = orderFromList;
        if (detailResp.ok) {
          order = await detailResp.json();
          console.log('  Detail for #' + order.orderNumber + ': ' + (order.lineItemContainer?.productLineItems?.length || 0) + ' items');
        } else {
          console.log('  Detail fetch failed for #' + orderFromList.orderNumber + ': ' + detailResp.status);
        }

        const { data: insertedOrder, error } = await supabase
          .from('orders')
          .upsert({
            store_id: store.id,
            epages_order_id: order.orderId,
            order_number: order.orderNumber,
            status: statusMap[order.status] || 'pending',
            creation_date: order.creationDate,
            paid_on: order.paymentData?.paidOn,
            dispatched_on: order.shippingData?.dispatchedOn,
            delivered_on: order.shippingData?.deliveredOn,
            closed_on: order.closedOn,
            grand_total: typeof order.grandTotal === 'object' ? (order.grandTotal?.amount || 0) : parseFloat(order.grandTotal) || 0,
            total_before_tax: typeof order.totalBeforeTax === 'object' ? order.totalBeforeTax?.amount : parseFloat(order.totalBeforeTax) || null,
            total_tax: typeof order.totalTax === 'object' ? order.totalTax?.amount : parseFloat(order.totalTax) || null,
            shipping_price: typeof order.shippingPrice === 'object' ? (order.shippingPrice?.amount || 0) : parseFloat(order.shippingPrice) || 0,
            discount_amount: typeof order.discountAmount === 'object' ? (order.discountAmount?.amount || 0) : parseFloat(order.discountAmount) || 0,
            currency: typeof order.grandTotal === 'object' ? (order.grandTotal?.currency || 'SEK') : 'SEK',
            billing_company: order.billingAddress?.company,
            billing_first_name: order.billingAddress?.firstName,
            billing_last_name: order.billingAddress?.lastName,
            billing_street: order.billingAddress?.street,
            billing_zip_code: order.billingAddress?.zipCode,
            billing_city: order.billingAddress?.city,
            billing_country: order.billingAddress?.country,
            billing_email: order.billingAddress?.emailAddress,
            shipping_company: order.shippingAddress?.company,
            shipping_first_name: order.shippingAddress?.firstName,
            shipping_last_name: order.shippingAddress?.lastName,
            shipping_street: order.shippingAddress?.street,
            shipping_zip_code: order.shippingAddress?.zipCode,
            shipping_city: order.shippingAddress?.city,
            shipping_country: order.shippingAddress?.country,
            payment_method: order.paymentData?.paymentMethod?.name,
            payment_transaction_id: order.paymentData?.transactionId,
            shipping_method: order.shippingData?.shippingMethod?.name,
            locale: order.locale,
            note: order.customerComment
          }, {
            onConflict: 'store_id,epages_order_id'
          })
          .select()
          .single();

        if (error) {
          console.log('  Order upsert error:', error.message);
        }
        if (!insertedOrder) {
          // If upsert didnt return data, fetch the order
          const { data: existingOrder } = await supabase
            .from('orders')
            .select('id')
            .eq('store_id', store.id)
            .eq('epages_order_id', order.orderId)
            .single();
          if (existingOrder) {
            insertedOrder = existingOrder;
          }
        }
        if (insertedOrder) {
          synced++;

          // Sync line items from detail response
          const lineItems = order.lineItemContainer?.productLineItems || [];
          for (const item of lineItems) {
            // Check if line item exists
            const { data: existing } = await supabase
              .from('order_line_items')
              .select('id')
              .eq('order_id', insertedOrder.id)
              .eq('epages_line_item_id', item.lineItemId)
              .single();

            // Don't include product_id - it references products table which may not have this product
            const lineItemData = {
              product_number: item.sku,
              product_name: item.name || 'Unknown',
              quantity: Math.round(item.quantity?.amount || 1), // Round to integer
              unit_price: item.singleItemPrice?.amount || 0,
              total_price: item.lineItemPrice?.amount || 0,
              tax_rate: item.taxClass?.percentage || 0
            };

            if (existing) {
              // Update existing
              const { error: updateError } = await supabase
                .from('order_line_items')
                .update(lineItemData)
                .eq('id', existing.id);
              if (!updateError) lineItemsSynced++;
            } else {
              // Insert new
              const { error: insertError } = await supabase
                .from('order_line_items')
                .insert({
                  order_id: insertedOrder.id,
                  epages_line_item_id: item.lineItemId,
                  ...lineItemData
                });
              if (insertError) {
                console.log('  Line item insert error:', insertError.message);
              } else {
                lineItemsSynced++;
              }
            }
          }
        }
      }

      console.log('✅ Synced', synced, 'orders and', lineItemsSynced, 'line items');
    }

  } catch (err) {
    console.log('❌ Fetch error:', err.message);
  }
}

syncEpages();

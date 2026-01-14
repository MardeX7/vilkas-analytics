const { createClient } = require("@supabase/supabase-js");
const supabase = createClient(
  "https://tlothekaphtiwvusgwzh.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRsb3RoZWthcGh0aXd2dXNnd3poIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NzYxOTYwMCwiZXhwIjoyMDgzMTk1NjAwfQ.PxMeALq2SEylsXwybYAASYcxjtVBzjjiWFsiOulhQyY"
);

async function syncRecentOrders() {
  const { data: store } = await supabase
    .from("stores")
    .select("id, domain, epages_shop_id, access_token")
    .eq("id", "a28836f6-9487-4b67-9194-e907eaf94b69")
    .single();

  if (!store) {
    console.log("Store not found");
    return;
  }

  const domainWithoutWww = store.domain.replace(/^www\./, "");
  const apiUrl = "https://www." + domainWithoutWww + "/rs/shops/" + store.epages_shop_id;

  // Get recent orders that are missing line items
  const { data: ordersWithoutItems } = await supabase
    .from("orders")
    .select("id, epages_order_id, creation_date")
    .eq("store_id", store.id)
    .gte("creation_date", "2026-01-09")
    .order("creation_date", { ascending: true });

  console.log("Orders to check:", ordersWithoutItems?.length || 0);

  let synced = 0;
  for (const dbOrder of ordersWithoutItems || []) {
    // Check if order already has line items
    const { count } = await supabase
      .from("order_line_items")
      .select("*", { count: "exact", head: true })
      .eq("order_id", dbOrder.id);

    if (count > 0) {
      console.log("Order", dbOrder.epages_order_id, "already has", count, "items");
      continue;
    }

    // Fetch order details from ePages
    const detailUrl = apiUrl + "/orders/" + dbOrder.epages_order_id;
    const detailRes = await fetch(detailUrl, {
      headers: {
        "Authorization": "Bearer " + store.access_token,
        "Accept": "application/vnd.epages.v1+json"
      }
    });

    if (!detailRes.ok) {
      console.log("Failed to fetch order", dbOrder.epages_order_id);
      continue;
    }

    const order = await detailRes.json();

    // Insert line items
    if (order.lineItemContainer?.productLineItems) {
      for (const item of order.lineItemContainer.productLineItems) {
        const qty = typeof item.quantity === "object" ? (item.quantity?.amount || 1) : (item.quantity || 1);

        const { error } = await supabase
          .from("order_line_items")
          .insert({
            order_id: dbOrder.id,
            epages_line_item_id: item.lineItemId,
            product_number: item.productNumber || item.sku,
            product_name: item.name || "Unknown",
            quantity: qty,
            unit_price: item.unitPrice?.amount || item.singleItemPrice?.amount || 0,
            total_price: item.lineItemPrice?.amount || 0,
            tax_rate: item.taxClass?.percentage || item.taxRate || 0,
            tax_amount: item.taxAmount?.amount || 0,
            discount_amount: item.discountAmount?.amount || item.lineItemCouponDiscount?.amount || 0
          });

        if (error) {
          console.log("Error inserting item:", error.message);
        } else {
          synced++;
        }
      }
      console.log("Synced", order.lineItemContainer.productLineItems.length, "items for order", dbOrder.epages_order_id);
    }
  }

  console.log("\nTotal synced:", synced, "items");
}
syncRecentOrders();

const { createClient } = require("@supabase/supabase-js");
const supabase = createClient(
  "https://tlothekaphtiwvusgwzh.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRsb3RoZWthcGh0aXd2dXNnd3poIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NzYxOTYwMCwiZXhwIjoyMDgzMTk1NjAwfQ.PxMeALq2SEylsXwybYAASYcxjtVBzjjiWFsiOulhQyY"
);

async function testEpagesAPI() {
  const { data: store } = await supabase
    .from("stores")
    .select("domain, epages_shop_id, access_token")
    .eq("id", "a28836f6-9487-4b67-9194-e907eaf94b69")
    .single();

  if (!store) {
    console.log("Store not found");
    return;
  }

  const domainWithoutWww = store.domain.replace(/^www\./, "");
  const apiUrl = "https://www." + domainWithoutWww + "/rs/shops/" + store.epages_shop_id;

  // Get first order from list
  const listUrl = apiUrl + "/orders?resultsPerPage=1";
  const listRes = await fetch(listUrl, {
    headers: {
      "Authorization": "Bearer " + store.access_token,
      "Accept": "application/vnd.epages.v1+json"
    }
  });

  const listData = await listRes.json();
  const order = listData.items && listData.items[0];
  console.log("Order from LIST has lineItemContainer:", !!order?.lineItemContainer);
  console.log("Order has productLineItems:", order?.lineItemContainer?.productLineItems?.length || 0);

  // Now get single order details
  if (order?.orderId) {
    const detailUrl = apiUrl + "/orders/" + order.orderId;
    const detailRes = await fetch(detailUrl, {
      headers: {
        "Authorization": "Bearer " + store.access_token,
        "Accept": "application/vnd.epages.v1+json"
      }
    });

    const detail = await detailRes.json();
    console.log("\nOrder from DETAIL has lineItemContainer:", !!detail?.lineItemContainer);
    console.log("Order has productLineItems:", detail?.lineItemContainer?.productLineItems?.length || 0);
    if (detail?.lineItemContainer?.productLineItems?.[0]) {
      console.log("First line item:", JSON.stringify(detail.lineItemContainer.productLineItems[0], null, 2));
    }
  }
}
testEpagesAPI();

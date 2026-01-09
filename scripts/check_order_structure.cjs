const { createClient } = require("@supabase/supabase-js");
require("dotenv").config({ path: ".env.local" });

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const STORE_ID = "a28836f6-9487-4b67-9194-e907eaf94b69";

async function checkOrderStructure() {
  const { data: store } = await supabase
    .from("stores")
    .select("domain, epages_shop_id, access_token")
    .eq("id", STORE_ID)
    .single();

  // Hae tilauslista
  const listUrl = "https://" + store.domain + "/rs/shops/" + store.epages_shop_id + "/orders?resultsPerPage=1";
  const listResp = await fetch(listUrl, {
    headers: {
      "Authorization": "Bearer " + store.access_token,
      "Accept": "application/vnd.epages.v1+json"
    }
  });
  const list = await listResp.json();

  const orderFromList = list.items?.[0];
  console.log("=== ORDER FROM LIST ===");
  console.log("Keys:", Object.keys(orderFromList || {}));
  console.log("Has lineItemContainer:", !!orderFromList?.lineItemContainer);
  console.log("orderId:", orderFromList?.orderId);

  // Hae sama tilaus yksittäin (detail)
  if (orderFromList?.orderId) {
    const detailUrl = "https://" + store.domain + "/rs/shops/" + store.epages_shop_id + "/orders/" + orderFromList.orderId;
    console.log("\n=== FETCHING DETAIL ===");
    console.log("URL:", detailUrl);

    const detailResp = await fetch(detailUrl, {
      headers: {
        "Authorization": "Bearer " + store.access_token,
        "Accept": "application/vnd.epages.v1+json"
      }
    });

    if (detailResp.ok) {
      const detail = await detailResp.json();
      console.log("\n=== ORDER DETAIL ===");
      console.log("Keys:", Object.keys(detail));
      console.log("Has lineItemContainer:", !!detail.lineItemContainer);
      if (detail.lineItemContainer?.productLineItems) {
        console.log("Line items count:", detail.lineItemContainer.productLineItems.length);
        console.log("First line item:", JSON.stringify(detail.lineItemContainer.productLineItems[0], null, 2));
      }
    } else {
      console.log("Detail fetch failed:", detailResp.status);
    }
  }
}

checkOrderStructure();

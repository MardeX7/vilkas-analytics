const { createClient } = require("@supabase/supabase-js");
require("dotenv").config({ path: ".env.local" });

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const STORE_ID = "a28836f6-9487-4b67-9194-e907eaf94b69";

// Simuloi useAnalytics fetchPeriodSummary
async function fetchPeriodSummary(startDate, endDate) {
  let query = supabase
    .from("orders")
    .select("grand_total, billing_email, creation_date, status, shipping_price, discount_amount")
    .eq("store_id", STORE_ID);

  if (startDate) query = query.gte("creation_date", startDate);
  if (endDate) query = query.lte("creation_date", endDate + "T23:59:59");

  const { data: allOrders } = await query;

  const activeOrders = allOrders.filter(o => o.status !== "cancelled");
  const totalRevenue = activeOrders.reduce((sum, o) => sum + (o.grand_total || 0), 0);
  const orderCount = activeOrders.length;

  return { totalRevenue, orderCount };
}

async function check() {
  const result = await fetchPeriodSummary("2026-01-08", "2026-01-08");
  console.log("📦 fetchPeriodSummary 8.1.2026:");
  console.log("  totalRevenue:", result.totalRevenue, "SEK");
  console.log("  orderCount:", result.orderCount);
  console.log("  ePages raportti: 18784.60 SEK");
}
check();

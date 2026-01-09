const { supabase, STORE_ID, printProjectInfo } = require('./db.cjs')

async function getFlakesSales() {
  printProjectInfo()

  // Get flake product SKUs
  const { data: products } = await supabase
    .from("products")
    .select("id, product_number, name, cost_price")
    .eq("store_id", STORE_ID)

  const flakeProducts = products?.filter(p =>
    p.name?.toLowerCase().includes("flake") ||
    p.name?.toLowerCase().includes("hile")
  ) || []

  const skus = flakeProducts.map(p => p.product_number).filter(Boolean)

  // Get all sales for these products
  const { data: lineItems } = await supabase
    .from("order_line_items")
    .select("product_number, product_name, quantity, total_price, unit_price, orders!inner(creation_date, status, store_id)")
    .eq("orders.store_id", STORE_ID)
    .neq("orders.status", "cancelled")

  // Filter for flake products
  const flakeSales = lineItems?.filter(item =>
    skus.includes(item.product_number) ||
    item.product_name?.toLowerCase().includes("flake") ||
    item.product_name?.toLowerCase().includes("hile")
  ) || []

  // Calculate totals
  const totalQty = flakeSales.reduce((sum, s) => sum + (s.quantity || 0), 0)
  const totalRevenue = flakeSales.reduce((sum, s) => sum + (s.total_price || 0), 0)

  // Calculate cost
  const costMap = new Map()
  flakeProducts.forEach(p => costMap.set(p.product_number, p.cost_price || 0))

  let totalCost = 0
  flakeSales.forEach(s => {
    const cost = costMap.get(s.product_number) || 0
    totalCost += cost * (s.quantity || 0)
  })

  const grossProfit = totalRevenue - totalCost
  const marginPercent = totalRevenue > 0 ? (grossProfit / totalRevenue * 100) : 0

  console.log("╔════════════════════════════════════════════════╗")
  console.log("║   HILEET JA METALFLAKES - MYYNTIRAPORTTI       ║")
  console.log("╠════════════════════════════════════════════════╣")
  console.log("║ Tuotteita:         " + flakeProducts.length.toString().padStart(5) + " kpl                     ║")
  console.log("║ Myydyt kappaleet:  " + totalQty.toString().padStart(5) + " kpl                     ║")
  console.log("║ Tilausrivejä:      " + flakeSales.length.toString().padStart(5) + "                          ║")
  console.log("╠════════════════════════════════════════════════╣")
  console.log("║ Kokonaismyynti:   " + totalRevenue.toLocaleString("sv-SE").padStart(10) + " SEK              ║")
  console.log("║ Hankintahinta:    " + totalCost.toLocaleString("sv-SE").padStart(10) + " SEK              ║")
  console.log("║ Myyntikate:       " + grossProfit.toLocaleString("sv-SE").padStart(10) + " SEK              ║")
  console.log("║ Kate-%:           " + marginPercent.toFixed(1).padStart(10) + " %                ║")
  console.log("╚════════════════════════════════════════════════╝")

  // Top sellers
  const byProduct = {}
  flakeSales.forEach(s => {
    const name = s.product_name || "Unknown"
    if (!byProduct[name]) {
      byProduct[name] = { qty: 0, revenue: 0 }
    }
    byProduct[name].qty += s.quantity || 0
    byProduct[name].revenue += s.total_price || 0
  })

  const sorted = Object.entries(byProduct).sort((a, b) => b[1].revenue - a[1].revenue)

  console.log("\nTOP 5 MYYDYIMMÄT:")
  sorted.slice(0, 5).forEach(([name, data], i) => {
    const shortName = name.length > 38 ? name.substring(0, 35) + "..." : name
    console.log((i+1) + ". " + shortName.padEnd(40) + " " + data.qty + " kpl | " + data.revenue.toLocaleString("sv-SE") + " SEK")
  })
}

getFlakesSales()

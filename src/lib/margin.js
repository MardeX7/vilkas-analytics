/**
 * Gross margin: one definition for the whole app.
 *
 * The sales page (useAnalytics, useCategoryMargin) and the KPI snapshots behind the
 * Indicators page (api/cron/calculate-kpi.js) all price order lines through here, so
 * the same period shows the same margin everywhere.
 *
 * - Sales are net of VAT, read from the order's own split (total_before_tax over
 *   grand_total). Lines are stored VAT-inclusive, except in orders the shop kept net
 *   (B2B net price display), whose lines are already net and are not deflated a second
 *   time. Such an order is recognised when its lines add up to total_before_tax, or to
 *   total_before_tax minus one of the store's shipping prices (net). A VAT-inclusive
 *   order matches that only by coincidence (its gap to the net total is its shipping
 *   minus all of its VAT), so when the lines also add up to grand_total, or to
 *   grand_total minus a shipping price, the VAT-inclusive reading wins.
 * - Cost is cost_price times the ordered amount. order_line_items.quantity is rounded
 *   (a 0,5 l line says 1), so the amount is total / unit price.
 * - A line without cost_price is costed at ASSUMED_COST_SHARE of its sales. So is a
 *   charged line whose cost comes out over 10x its sales: early-2025 lines store ml/m
 *   as the quantity ("500" for a 500 ml can at 0,03), while cost_price is per package.
 *   A free BONUS line keeps its real cost.
 */

// Cost of a line without a usable cost_price, as a share of its net sales (60 % margin)
export const ASSUMED_COST_SHARE = 0.4

// Per store: the VAT divisor for the few orders that carry no net/tax split, and the
// shipping prices (VAT-inclusive) seen on orders, used to recognise net-stored orders
// that include shipping. If the shop changes its prices, those orders fall back to
// being read as VAT-inclusive, which is how every order was read before.
const PRICING = {
  EUR: { vatRate: 1.255, shippingPrices: [9.90, 17.90, 39.90] },
  SEK: { vatRate: 1.25, shippingPrices: [95, 99, 190, 199] },
}

// Pricing for a store by currency ('EUR' | 'SEK') or country ('FI' | 'SE')
export function pricingFor(code) {
  return code === 'SEK' || code === 'SE' ? PRICING.SEK : PRICING.EUR
}

// Multiplier that turns a VAT-inclusive amount into a net one, read from the order.
export function netFactor(order, vatRate) {
  const gross = parseFloat(order.grand_total) || 0
  let net = parseFloat(order.total_before_tax)
  if (!Number.isFinite(net)) {
    // Only a tax amount that is actually present tells us the split. Treating a
    // missing total_tax as zero would read as "no VAT on this order" and hand back
    // a factor of 1, which inflates the margin by the whole VAT rate.
    const tax = parseFloat(order.total_tax)
    net = Number.isFinite(tax) && tax > 0 ? gross - tax : NaN
  }
  if (gross > 0 && net > 0 && net <= gross) return net / gross
  return 1 / vatRate
}

// The ordered amount: quantity is rounded to a whole number, the prices are not.
export function trueQuantity(item) {
  const unit = parseFloat(item.unit_price) || 0
  const total = parseFloat(item.total_price) || 0
  if (unit > 0) return total / unit
  return parseFloat(item.quantity) || 0
}

// product_number -> cost_price. order_line_items.product_id is NULL on every row, so
// lines match on product_number. A few numbers occur twice within a store; keep the
// higher cost so the margin is not flattered by a stale row.
export function buildCostMap(products) {
  const map = new Map()
  for (const p of products || []) {
    if (!p.product_number) continue
    const cost = parseFloat(p.cost_price) || 0
    if (!map.has(p.product_number) || cost > map.get(p.product_number)) map.set(p.product_number, cost)
  }
  return map
}

// True when the order's lines were stored net of VAT (see the header)
function linesStoredNet(order, lineSum, shippingPrices) {
  const gross = parseFloat(order.grand_total) || 0
  const net = parseFloat(order.total_before_tax)
  if (!(net > 0 && net < gross)) return false
  const near = (x, price) => Math.abs(x - price) < 0.02
  // Both readings fit: take the VAT-inclusive one, which almost every order is
  const shippingIfGross = gross - lineSum
  if (near(shippingIfGross, 0) || shippingPrices.some(price => near(shippingIfGross, price))) return false
  const gap = net - lineSum
  if (near(gap, 0)) return true
  const shippingIfNet = gap * gross / net
  return shippingPrices.some(price => near(shippingIfNet, price))
}

// Net sales and cost of every line of one order. pricing comes from pricingFor().
export function priceOrderLines(order, items, costMap, pricing) {
  const lineSum = items.reduce((s, i) => s + (parseFloat(i.total_price) || 0), 0)
  const factor = linesStoredNet(order, lineSum, pricing.shippingPrices) ? 1 : netFactor(order, pricing.vatRate)
  return items.map(item => {
    const sales = (parseFloat(item.total_price) || 0) * factor
    const costPrice = costMap.get(item.product_number) || 0
    const lineCost = costPrice * trueQuantity(item)
    const unitMismatch = sales > 0 && lineCost > sales * 10
    const measured = costPrice > 0 && !unitMismatch
    return { item, sales, cost: measured ? lineCost : sales * ASSUMED_COST_SHARE, measured }
  })
}

// Margin over a set of orders, each carrying its order_line_items. An order without
// line items counts at its net value with the assumed cost. measuredShare is the share
// of sales priced with a real cost_price; below one half the margin is mostly the
// assumption, and both the sales page and the snapshots call it estimated.
export function marginTotals(orders, costMap, pricing) {
  let sales = 0, cost = 0, lines = 0, measuredLines = 0, measuredSales = 0, ordersWithLines = 0
  for (const order of orders) {
    const items = order.order_line_items || []
    if (items.length) {
      ordersWithLines++
      for (const l of priceOrderLines(order, items, costMap, pricing)) {
        sales += l.sales
        cost += l.cost
        lines++
        if (l.measured) { measuredLines++; measuredSales += l.sales }
      }
    } else {
      const orderNet = (parseFloat(order.grand_total) || 0) * netFactor(order, pricing.vatRate)
      sales += orderNet
      cost += orderNet * ASSUMED_COST_SHARE
    }
  }
  const grossProfit = sales - cost
  return {
    sales,
    cost,
    grossProfit,
    marginPercent: sales > 0 ? (grossProfit / sales) * 100 : 0,
    lines,
    measuredLines,
    ordersWithLines,
    measuredShare: sales > 0 ? measuredSales / sales : 0,
  }
}

export const isEstimatedMargin = totals => totals.measuredShare < 0.5

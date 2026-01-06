/**
 * Gross Margin Indicator Calculator
 *
 * Data Source: ePages (MASTER) - products.cost_price (GBasePurchasePrice/Inköpspris)
 * Category: sales
 *
 * Calculates gross margin (myyntikate) based on selling price and purchase price.
 */

import {
  createPeriod,
  determinePriority,
  determineConfidence,
  determineDirection,
  DEFAULT_THRESHOLDS
} from '../types.js'

/**
 * Calculate Gross Margin indicator
 *
 * @param {Object} params
 * @param {Array} params.orders - Orders array with line items
 * @param {Array} params.products - Products array with cost_price
 * @param {Date} params.periodEnd - End date for analysis
 * @param {'7d' | '30d' | '90d'} params.periodLabel - Period length
 * @returns {Object} Gross Margin indicator
 */
export function calculateGrossMargin({ orders, products, periodEnd, periodLabel = '30d' }) {
  const endDate = periodEnd instanceof Date ? periodEnd : new Date(periodEnd)

  // Determine period length in days
  const periodDays = periodLabel === '7d' ? 7 : periodLabel === '30d' ? 30 : 90

  // Calculate period dates
  const periodStart = new Date(endDate)
  periodStart.setDate(periodStart.getDate() - periodDays + 1)

  const comparisonEnd = new Date(periodStart)
  comparisonEnd.setDate(comparisonEnd.getDate() - 1)

  const comparisonStart = new Date(comparisonEnd)
  comparisonStart.setDate(comparisonStart.getDate() - periodDays + 1)

  // Build product cost map
  const productCostMap = buildProductCostMap(products)

  // Filter orders for each period
  const currentOrders = filterOrdersByPeriod(orders, periodStart, endDate)
  const previousOrders = filterOrdersByPeriod(orders, comparisonStart, comparisonEnd)

  // Calculate margin for each period
  const currentMarginData = calculateMarginFromOrders(currentOrders, productCostMap)
  const previousMarginData = calculateMarginFromOrders(previousOrders, productCostMap)

  // Calculate margin percentages
  const currentMarginPercent = currentMarginData.revenue > 0
    ? (currentMarginData.grossProfit / currentMarginData.revenue) * 100
    : 0

  const previousMarginPercent = previousMarginData.revenue > 0
    ? (previousMarginData.grossProfit / previousMarginData.revenue) * 100
    : null // null if no comparison data

  // Change in percentage points - only calculate if we have comparison data
  const changePercent = previousMarginPercent !== null
    ? currentMarginPercent - previousMarginPercent
    : null

  // Calculate by category
  const byCategory = calculateMarginByCategory(currentOrders, productCostMap, products)

  // Find margin alerts (products with significantly lower margin)
  const alerts = findMarginAlerts(currentOrders, productCostMap, products, currentMarginPercent)

  // Build indicator
  const thresholds = DEFAULT_THRESHOLDS.gross_margin
  const alertTriggered = changePercent !== null && (
    changePercent > thresholds.warning_high ||
    changePercent < thresholds.warning_low
  )

  // Confidence based on how many products have cost_price
  const productsWithCost = products.filter(p => p.cost_price && parseFloat(p.cost_price) > 0).length
  const costCoverage = products.length > 0 ? productsWithCost / products.length : 0
  const confidence = costCoverage > 0.8 ? 'high' : costCoverage > 0.5 ? 'medium' : 'low'

  // If no products have cost price, use estimated 40% margin but mark confidence as 'estimated'
  let displayMarginPercent = currentMarginPercent
  let isEstimated = false
  if (productsWithCost === 0 && currentMarginData.revenue > 0) {
    displayMarginPercent = 40 // Default industry estimate
    isEstimated = true
  }

  return {
    id: 'gross_margin',
    name: 'Myyntikate',
    category: 'sales',

    value: Math.round(displayMarginPercent * 100) / 100,
    unit: '%',

    direction: changePercent !== null ? determineDirection(changePercent, 1) : 'stable', // 1pp threshold for stable
    change_percent: changePercent !== null ? Math.round(changePercent * 100) / 100 : null, // This is pp change
    change_absolute: Math.round(currentMarginData.grossProfit * 100) / 100,

    period: createPeriod(periodStart, endDate, periodLabel),
    comparison_period: createPeriod(comparisonStart, comparisonEnd, periodLabel),

    confidence,
    priority: changePercent !== null ? determinePriority(changePercent * 2) : 'low', // Margin changes are more significant

    thresholds,
    alert_triggered: alertTriggered,

    context: {
      seasonal_adjusted: false,
      anomaly_detected: changePercent !== null && Math.abs(changePercent) > 5,
      anomaly_type: changePercent !== null && Math.abs(changePercent) > 5
        ? (changePercent > 0 ? 'spike' : 'drop')
        : null,
      is_estimated: isEstimated,
      no_comparison_data: changePercent === null,
      notes: generateMarginNotes(displayMarginPercent, changePercent, costCoverage, isEstimated)
    },

    // Additional metrics (spec-compliant)
    metrics: {
      total_revenue: Math.round(currentMarginData.revenue * 100) / 100,
      total_cost: Math.round(currentMarginData.totalCost * 100) / 100,
      gross_profit: Math.round(currentMarginData.grossProfit * 100) / 100,
      margin_percent: Math.round(currentMarginPercent * 100) / 100,
      previous_margin_percent: previousMarginPercent !== null ? Math.round(previousMarginPercent * 100) / 100 : null,
      change_pp: changePercent !== null ? Math.round(changePercent * 100) / 100 : null,
      products_with_cost_price: productsWithCost,
      cost_price_coverage: Math.round(costCoverage * 100)
    },

    by_category: byCategory,
    alerts,

    calculated_at: new Date().toISOString(),
    data_freshness: new Date().toISOString()
  }
}

/**
 * Build a map of product ID to cost price
 */
function buildProductCostMap(products) {
  const map = new Map()

  for (const product of products) {
    const costPrice = parseFloat(product.cost_price) || null
    if (costPrice !== null) {
      map.set(product.id, costPrice)
      map.set(product.epages_product_id, costPrice)
      if (product.product_number) {
        map.set(product.product_number, costPrice)
      }
    }
  }

  return map
}

/**
 * Filter orders by date period
 */
function filterOrdersByPeriod(orders, startDate, endDate) {
  return orders.filter(order => {
    const orderDate = new Date(order.creation_date || order.created_at)
    return orderDate >= startDate && orderDate <= endDate
  })
}

/**
 * Calculate margin data from orders
 */
function calculateMarginFromOrders(orders, productCostMap) {
  let revenue = 0
  let totalCost = 0
  let itemsWithCost = 0
  let totalItems = 0

  for (const order of orders) {
    const lineItems = order.line_items || order.order_line_items || []

    for (const item of lineItems) {
      const quantity = parseInt(item.quantity) || 1
      // Use total_price if available (more reliable), otherwise fall back to unit_price * quantity
      const lineRevenue = parseFloat(item.total_price) || (parseFloat(item.unit_price) || 0) * quantity

      revenue += lineRevenue
      totalItems++

      // Try to find cost price
      const costPrice = productCostMap.get(item.product_id) ||
                        productCostMap.get(item.product_number) ||
                        null

      if (costPrice !== null) {
        totalCost += costPrice * quantity
        itemsWithCost++
      } else {
        // Use default margin assumption (40%) if no cost price
        totalCost += lineRevenue * 0.6
      }
    }
  }

  return {
    revenue,
    totalCost,
    grossProfit: revenue - totalCost,
    itemsWithCost,
    totalItems
  }
}

/**
 * Calculate margin by category
 */
function calculateMarginByCategory(orders, productCostMap, products) {
  const categoryMap = new Map()

  // Build product to category map
  const productCategoryMap = new Map()
  for (const product of products) {
    const category = product.category_name || 'Okategoriserad'
    productCategoryMap.set(product.id, category)
    productCategoryMap.set(product.epages_product_id, category)
    if (product.product_number) {
      productCategoryMap.set(product.product_number, category)
    }
  }

  for (const order of orders) {
    const lineItems = order.line_items || order.order_line_items || []

    for (const item of lineItems) {
      const quantity = parseInt(item.quantity) || 1
      // Use total_price if available (more reliable), otherwise fall back to unit_price * quantity
      const lineRevenue = parseFloat(item.total_price) || (parseFloat(item.unit_price) || 0) * quantity
      const unitPrice = lineRevenue / quantity

      const category = productCategoryMap.get(item.product_id) ||
                       productCategoryMap.get(item.product_number) ||
                       'Okategoriserad'

      const costPrice = productCostMap.get(item.product_id) ||
                        productCostMap.get(item.product_number) ||
                        unitPrice * 0.6 // Default 40% margin

      const lineCost = costPrice * quantity
      const lineMargin = lineRevenue - lineCost

      if (!categoryMap.has(category)) {
        categoryMap.set(category, { revenue: 0, cost: 0 })
      }

      const cat = categoryMap.get(category)
      cat.revenue += lineRevenue
      cat.cost += lineCost
    }
  }

  // Convert to array and calculate margin %
  return Array.from(categoryMap.entries())
    .map(([category, data]) => ({
      category,
      revenue: Math.round(data.revenue * 100) / 100,
      margin: data.revenue > 0
        ? Math.round(((data.revenue - data.cost) / data.revenue) * 100 * 100) / 100
        : 0
    }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10) // Top 10 categories
}

/**
 * Find products with margin alerts
 */
function findMarginAlerts(orders, productCostMap, products, avgMargin) {
  const alerts = []
  const productMargins = new Map()

  // Build product name map
  const productNameMap = new Map()
  for (const product of products) {
    productNameMap.set(product.id, product.name)
    productNameMap.set(product.epages_product_id, product.name)
    if (product.product_number) {
      productNameMap.set(product.product_number, product.name)
    }
  }

  for (const order of orders) {
    const lineItems = order.line_items || order.order_line_items || []

    for (const item of lineItems) {
      const quantity = parseInt(item.quantity) || 1
      const lineRevenue = parseFloat(item.total_price) || (parseFloat(item.unit_price) || 0) * quantity
      const unitPrice = lineRevenue / quantity
      const costPrice = productCostMap.get(item.product_id) ||
                        productCostMap.get(item.product_number)

      if (costPrice && unitPrice > 0) {
        const margin = ((unitPrice - costPrice) / unitPrice) * 100
        const productId = item.product_id || item.product_number

        if (!productMargins.has(productId)) {
          productMargins.set(productId, {
            name: productNameMap.get(productId) || item.product_name || 'Unknown',
            margin,
            unitPrice,
            costPrice
          })
        }
      }
    }
  }

  // Find products with margin significantly below average
  const marginThreshold = avgMargin - 15 // 15pp below average

  for (const [productId, data] of productMargins) {
    if (data.margin < marginThreshold && data.margin < 25) {
      alerts.push({
        type: 'margin_drop',
        product: data.name,
        current_margin: Math.round(data.margin * 100) / 100,
        expected_margin: Math.round(avgMargin * 100) / 100,
        details: `Kate ${data.margin.toFixed(1)}% on merkittävästi alle keskiarvon (${avgMargin.toFixed(1)}%)`
      })
    }
  }

  return alerts.slice(0, 5) // Top 5 alerts
}

/**
 * Generate human-readable notes
 */
function generateMarginNotes(marginPercent, changePercent, costCoverage, isEstimated = false) {
  let note = ''

  if (isEstimated) {
    note = `Arvioitu myyntikate ~${marginPercent.toFixed(0)}% (toimialan keskiarvo). `
    note += `Tuotteista 0% sisältää ostohinnan – lisää Inköpspris/GBasePurchasePrice ePages:iin tarkempaa laskentaa varten.`
    return note
  }

  note = `Myyntikate on ${marginPercent.toFixed(1)}%.`

  if (changePercent === null) {
    note += ` Vertailudataa ei ole saatavilla.`
  } else if (changePercent > 1) {
    note += ` Kate nousi ${changePercent.toFixed(1)} prosenttiyksikköä.`
  } else if (changePercent < -1) {
    note += ` Kate laski ${Math.abs(changePercent).toFixed(1)} prosenttiyksikköä.`
  }

  if (costCoverage < 0.5) {
    note += ` HUOM: Vain ${Math.round(costCoverage * 100)}% tuotteista sisältää ostohinnan.`
  }

  return note
}

export default calculateGrossMargin

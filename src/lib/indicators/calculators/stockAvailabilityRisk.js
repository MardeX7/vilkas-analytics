/**
 * Stock Availability Risk Indicator Calculator
 *
 * Data Source: ePages + GSC (combined)
 * Category: combined
 *
 * Identifies SEO-valuable products that are low on stock.
 * CRITICAL indicator - prevents lost sales from out-of-stock top performers.
 */

import {
  createPeriod,
  determinePriority,
  determineConfidence,
  DEFAULT_THRESHOLDS
} from '../types.js'

/**
 * Calculate stock availability risk indicator
 *
 * @param {Object} params
 * @param {Array} params.products - ePages products with stock levels
 * @param {Array} params.gscData - GSC search analytics data
 * @param {Array} params.orders - Recent orders for velocity calculation
 * @param {Date} params.periodEnd - End date for analysis
 * @param {'7d' | '30d' | '90d'} params.periodLabel - Period length
 * @returns {Object} Stock availability risk indicator
 */
export function calculateStockAvailabilityRisk({
  products,
  gscData,
  orders = [],
  periodEnd,
  periodLabel = '30d',
  currency = 'SEK'
}) {
  const endDate = periodEnd instanceof Date ? periodEnd : new Date(periodEnd)

  // Determine period length in days
  const periodDays = periodLabel === '7d' ? 7 : periodLabel === '30d' ? 30 : 90

  // Calculate period dates
  const periodStart = new Date(endDate)
  periodStart.setDate(periodStart.getDate() - periodDays + 1)

  // Filter GSC data for current period
  const currentGSC = filterByPeriod(gscData, periodStart, endDate)

  // Aggregate GSC traffic by product URL
  const trafficByProduct = aggregateTrafficByProduct(currentGSC)

  // Calculate sales velocity from orders
  const salesVelocity = calculateSalesVelocity(orders, periodStart, endDate)

  // Analyze each product for risk
  const atRiskProducts = []
  let totalRevenueAtRisk = 0

  for (const product of products) {
    const stockLevel = product.stock_level || 0
    const minStock = product.min_stock_level || 5
    const productUrl = buildProductUrl(product)

    // Get organic traffic for this product
    const traffic = trafficByProduct[productUrl] || { clicks: 0, impressions: 0 }

    // Get sales velocity
    const velocity = salesVelocity[product.epages_product_id] || 0

    // Skip products with no SEO traffic
    if (traffic.clicks < 5) continue

    // Calculate days until stockout
    const daysUntilStockout = velocity > 0
      ? Math.floor(stockLevel / velocity)
      : stockLevel > 0 ? 999 : 0

    // Determine stock status
    let stockStatus = 'in_stock'
    let riskSeverity = 'low'

    if (stockLevel === 0) {
      stockStatus = 'out_of_stock'
      riskSeverity = 'critical'
    } else if (stockLevel <= minStock || daysUntilStockout <= 7) {
      stockStatus = 'low_stock'
      riskSeverity = daysUntilStockout <= 3 ? 'critical' : 'high'
    } else if (daysUntilStockout <= 14) {
      stockStatus = 'medium_stock'
      riskSeverity = 'medium'
    }

    // Only include at-risk products
    if (riskSeverity !== 'low') {
      const price = parseFloat(product.price_amount) || 0
      const estimatedMonthlyRevenue = traffic.clicks * 0.02 * price // 2% CR estimate

      atRiskProducts.push({
        product_id: product.epages_product_id,
        product_name: product.name,
        stock_level: stockLevel,
        stock_status: stockStatus,
        days_until_stockout: daysUntilStockout,
        organic_clicks_30d: traffic.clicks,
        organic_impressions_30d: traffic.impressions,
        organic_revenue_30d: Math.round(estimatedMonthlyRevenue),
        price: price,
        risk_severity: riskSeverity
      })

      totalRevenueAtRisk += estimatedMonthlyRevenue
    }
  }

  // Sort by risk severity and traffic
  atRiskProducts.sort((a, b) => {
    const severityOrder = { critical: 0, high: 1, medium: 2 }
    if (severityOrder[a.risk_severity] !== severityOrder[b.risk_severity]) {
      return severityOrder[a.risk_severity] - severityOrder[b.risk_severity]
    }
    return b.organic_clicks_30d - a.organic_clicks_30d
  })

  // Calculate summary
  const outOfStock = atRiskProducts.filter(p => p.stock_status === 'out_of_stock').length
  const lowStock = atRiskProducts.filter(p => p.stock_status === 'low_stock').length
  const mediumStock = atRiskProducts.filter(p => p.stock_status === 'medium_stock').length

  // Build indicator
  const thresholds = DEFAULT_THRESHOLDS.stock_availability_risk
  const hasCriticalRisk = atRiskProducts.some(p => p.risk_severity === 'critical')
  const alertTriggered = hasCriticalRisk || totalRevenueAtRisk > thresholds.warning_high

  return {
    id: 'stock_availability_risk',
    name: 'Varastoriski (SEO)',
    category: 'combined',

    value: Math.round(totalRevenueAtRisk),
    unit: currency,

    direction: 'down', // Lower risk is better
    change_percent: null, // No comparison for MVP
    change_absolute: null,

    period: createPeriod(periodStart, endDate, periodLabel),
    comparison_period: null,

    confidence: determineConfidence(products.length),
    priority: hasCriticalRisk ? 'critical' : atRiskProducts.length > 0 ? 'high' : 'low',

    thresholds,
    alert_triggered: alertTriggered,

    context: {
      seasonal_adjusted: false,
      anomaly_detected: hasCriticalRisk,
      anomaly_type: hasCriticalRisk ? 'stock_crisis' : null,
      notes: generateStockNotes(outOfStock, lowStock, totalRevenueAtRisk, currency)
    },

    at_risk_products: atRiskProducts.slice(0, 20),

    summary: {
      products_out_of_stock: outOfStock,
      products_low_stock: lowStock,
      products_medium_stock: mediumStock,
      total_products_at_risk: atRiskProducts.length,
      total_revenue_at_risk: Math.round(totalRevenueAtRisk)
    },

    calculated_at: new Date().toISOString(),
    data_freshness: new Date().toISOString()
  }
}

/**
 * Filter data by date period
 */
function filterByPeriod(data, startDate, endDate) {
  return data.filter(row => {
    const date = new Date(row.date)
    return date >= startDate && date <= endDate
  })
}

/**
 * Aggregate GSC traffic by product URL
 */
function aggregateTrafficByProduct(gscData) {
  const byProduct = {}

  for (const row of gscData) {
    const page = row.page || ''

    // Extract product identifier from URL
    const productMatch = page.match(/\/product\/([^/?]+)/) ||
                         page.match(/\/produkt\/([^/?]+)/) ||
                         page.match(/\/p\/([^/?]+)/)

    if (productMatch) {
      const key = productMatch[1].toLowerCase()
      if (!byProduct[key]) {
        byProduct[key] = { clicks: 0, impressions: 0 }
      }
      byProduct[key].clicks += row.clicks || 0
      byProduct[key].impressions += row.impressions || 0
    }
  }

  return byProduct
}

/**
 * Calculate sales velocity (units per day) from orders
 */
function calculateSalesVelocity(orders, startDate, endDate) {
  const velocity = {}
  const days = Math.max(1, (endDate - startDate) / (1000 * 60 * 60 * 24))

  for (const order of orders) {
    const orderDate = new Date(order.creation_date || order.created_at)
    if (orderDate < startDate || orderDate > endDate) continue

    // Parse line items if available
    const items = order.line_items || order.items || []
    for (const item of items) {
      const productId = item.product_id || item.productId
      const quantity = item.quantity || 1

      if (!velocity[productId]) {
        velocity[productId] = 0
      }
      velocity[productId] += quantity
    }
  }

  // Convert to daily velocity
  for (const productId of Object.keys(velocity)) {
    velocity[productId] = velocity[productId] / days
  }

  return velocity
}

/**
 * Build product URL key from product data
 */
function buildProductUrl(product) {
  // Try to match GSC URL format
  const slug = product.name?.toLowerCase()
    .replace(/[åä]/g, 'a')
    .replace(/ö/g, 'o')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || ''

  return slug
}

/**
 * Generate human-readable notes
 */
function generateStockNotes(outOfStock, lowStock, revenueAtRisk, currency = 'SEK') {
  const formattedRevenue = new Intl.NumberFormat('sv-SE', {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 0
  }).format(revenueAtRisk)

  if (outOfStock > 0) {
    return `KRIITTINEN: ${outOfStock} SEO-tuotetta loppunut varastosta. Potentiaalinen menetys ${formattedRevenue}/kk.`
  } else if (lowStock > 0) {
    return `Varoitus: ${lowStock} SEO-tuotetta vähissä. Tilaa lisää ennen kuin liikenne menetetään.`
  } else {
    return 'Varastotilanne kunnossa SEO-tuotteiden osalta.'
  }
}

export default calculateStockAvailabilityRisk

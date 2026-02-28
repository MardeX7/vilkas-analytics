/**
 * Sales Trend Indicator Calculator
 *
 * Data Source: ePages (MASTER)
 * Category: sales
 *
 * Calculates revenue and order trends over specified periods.
 */

import {
  createPeriod,
  determinePriority,
  determineConfidence,
  determineDirection,
  DEFAULT_THRESHOLDS
} from '../types.js'

/**
 * Calculate sales trend indicator
 *
 * @param {Object} params
 * @param {Array} params.orders - Orders array from ePages
 * @param {Date} params.periodEnd - End date for analysis
 * @param {'7d' | '30d' | '90d'} params.periodLabel - Period length
 * @returns {Object} Sales trend indicator
 */
export function calculateSalesTrend({ orders, periodEnd, periodLabel = '30d', currency = 'SEK' }) {
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

  // Filter orders for each period
  const currentOrders = filterOrdersByPeriod(orders, periodStart, endDate)
  const previousOrders = filterOrdersByPeriod(orders, comparisonStart, comparisonEnd)

  // Calculate metrics
  const currentRevenue = sumRevenue(currentOrders)
  const previousRevenue = sumRevenue(previousOrders)

  const currentOrderCount = currentOrders.length
  const previousOrderCount = previousOrders.length

  // Calculate changes - only if we have comparison data
  const hasComparisonData = previousOrders.length > 0 && previousRevenue > 0
  const revenueChangePercent = hasComparisonData
    ? ((currentRevenue - previousRevenue) / previousRevenue) * 100
    : null

  const ordersChangePercent = previousOrderCount > 0
    ? ((currentOrderCount - previousOrderCount) / previousOrderCount) * 100
    : null

  // Determine trend value - only if we have comparison data
  let trendValue
  if (revenueChangePercent === null) trendValue = 'stable'
  else if (revenueChangePercent > 5) trendValue = 'growing'
  else if (revenueChangePercent < -5) trendValue = 'declining'
  else trendValue = 'stable'

  // Calculate daily metrics
  const dailyRevenues = calculateDailyRevenues(currentOrders, periodStart, endDate)
  const dailyAverage = currentRevenue / periodDays
  const dailyStdDev = calculateStandardDeviation(dailyRevenues)

  // Detect anomalies - only if we have comparison data
  const anomalyDetected = revenueChangePercent !== null && Math.abs(revenueChangePercent) > 30
  const anomalyType = anomalyDetected
    ? (revenueChangePercent > 30 ? 'spike' : 'drop')
    : null

  // Build indicator
  const thresholds = DEFAULT_THRESHOLDS.sales_trend
  const alertTriggered = revenueChangePercent !== null && (
    revenueChangePercent > thresholds.warning_high ||
    revenueChangePercent < thresholds.warning_low
  )

  return {
    id: 'sales_trend',
    name: 'Myyntitrendi',
    category: 'sales',

    value: trendValue,
    unit: '',

    direction: revenueChangePercent !== null ? determineDirection(revenueChangePercent) : 'stable',
    change_percent: revenueChangePercent !== null ? Math.round(revenueChangePercent * 100) / 100 : null,
    change_absolute: hasComparisonData ? Math.round((currentRevenue - previousRevenue) * 100) / 100 : null,

    period: createPeriod(periodStart, endDate, periodLabel),
    comparison_period: createPeriod(comparisonStart, comparisonEnd, periodLabel),

    confidence: determineConfidence(currentOrderCount),
    priority: revenueChangePercent !== null ? determinePriority(revenueChangePercent) : 'low',

    thresholds,
    alert_triggered: alertTriggered,

    context: {
      seasonal_adjusted: false,
      seasonal_factor: 1.0,
      anomaly_detected: anomalyDetected,
      anomaly_type: anomalyType,
      no_comparison_data: !hasComparisonData,
      notes: generateTrendNotes(trendValue, revenueChangePercent, currentRevenue, hasComparisonData, currency)
    },

    // Additional metrics (spec-compliant)
    metrics: {
      current_revenue: Math.round(currentRevenue * 100) / 100,
      previous_revenue: hasComparisonData ? Math.round(previousRevenue * 100) / 100 : null,
      change_percent: revenueChangePercent !== null ? Math.round(revenueChangePercent * 100) / 100 : null,

      current_orders: currentOrderCount,
      previous_orders: previousOrderCount,
      orders_change_percent: ordersChangePercent !== null ? Math.round(ordersChangePercent * 100) / 100 : null,

      daily_average: Math.round(dailyAverage * 100) / 100,
      daily_stddev: Math.round(dailyStdDev * 100) / 100
    },

    seasonal: {
      adjusted: false,
      factor: 1.0,
      yoy_comparison: null // TODO: Implement when we have YoY data
    },

    calculated_at: new Date().toISOString(),
    data_freshness: new Date().toISOString()
  }
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
 * Sum revenue from orders
 */
function sumRevenue(orders) {
  return orders.reduce((sum, order) => {
    const amount = parseFloat(order.grand_total) || 0
    return sum + amount
  }, 0)
}

/**
 * Calculate daily revenue array
 */
function calculateDailyRevenues(orders, startDate, endDate) {
  const dailyMap = new Map()

  // Initialize all days with 0
  const current = new Date(startDate)
  while (current <= endDate) {
    const dateKey = current.toISOString().split('T')[0]
    dailyMap.set(dateKey, 0)
    current.setDate(current.getDate() + 1)
  }

  // Sum orders by day
  for (const order of orders) {
    const orderDate = new Date(order.creation_date || order.created_at)
    const dateKey = orderDate.toISOString().split('T')[0]
    const currentValue = dailyMap.get(dateKey) || 0
    dailyMap.set(dateKey, currentValue + (parseFloat(order.grand_total) || 0))
  }

  return Array.from(dailyMap.values())
}

/**
 * Calculate standard deviation
 */
function calculateStandardDeviation(values) {
  if (values.length === 0) return 0

  const mean = values.reduce((a, b) => a + b, 0) / values.length
  const squaredDiffs = values.map(v => Math.pow(v - mean, 2))
  const avgSquaredDiff = squaredDiffs.reduce((a, b) => a + b, 0) / values.length

  return Math.sqrt(avgSquaredDiff)
}

/**
 * Generate human-readable notes
 */
function generateTrendNotes(trend, changePercent, revenue, hasComparisonData, currency = 'SEK') {
  const formattedRevenue = new Intl.NumberFormat('sv-SE', {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 0
  }).format(revenue)

  if (!hasComparisonData) {
    return `Jakson myynti: ${formattedRevenue}. Vertailudataa ei ole saatavilla.`
  }

  if (trend === 'growing') {
    return `Myynti kasvoi ${Math.abs(changePercent).toFixed(1)}%. Jakson myynti: ${formattedRevenue}.`
  } else if (trend === 'declining') {
    return `Myynti laski ${Math.abs(changePercent).toFixed(1)}%. Jakson myynti: ${formattedRevenue}.`
  } else {
    return `Myynti pysyi vakaana. Jakson myynti: ${formattedRevenue}.`
  }
}

export default calculateSalesTrend

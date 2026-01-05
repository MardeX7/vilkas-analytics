/**
 * Sales Trend Indicator
 *
 * Source: ePages (MASTER - 100% reliable)
 * Measures: Revenue and order trends over time
 */

import {
  createPeriod,
  determinePriority,
  determineConfidence,
  determineDirection,
  DEFAULT_THRESHOLDS
} from './types'

/**
 * Calculate sales trend indicator
 * @param {Object[]} orders - Orders from ePages
 * @param {Date} periodStart - Period start date
 * @param {Date} periodEnd - Period end date
 * @param {Date} comparisonStart - Comparison period start
 * @param {Date} comparisonEnd - Comparison period end
 * @param {string} periodLabel - Period label ('7d', '30d', etc.)
 * @returns {Object} SalesTrendIndicator
 */
export function calculateSalesTrend(
  orders,
  periodStart,
  periodEnd,
  comparisonStart,
  comparisonEnd,
  periodLabel = '30d'
) {
  // Filter orders by period
  const currentOrders = orders.filter(o => {
    const date = new Date(o.creation_date)
    return date >= periodStart && date <= periodEnd
  })

  const previousOrders = orders.filter(o => {
    const date = new Date(o.creation_date)
    return date >= comparisonStart && date <= comparisonEnd
  })

  // Calculate revenue
  const currentRevenue = currentOrders.reduce((sum, o) => sum + (o.grand_total || 0), 0)
  const previousRevenue = previousOrders.reduce((sum, o) => sum + (o.grand_total || 0), 0)

  // Calculate change
  const revenueChange = previousRevenue > 0
    ? ((currentRevenue - previousRevenue) / previousRevenue) * 100
    : 0

  // Calculate order counts
  const currentOrderCount = currentOrders.length
  const previousOrderCount = previousOrders.length
  const ordersChange = previousOrderCount > 0
    ? ((currentOrderCount - previousOrderCount) / previousOrderCount) * 100
    : 0

  // Calculate daily metrics
  const period = createPeriod(periodStart, periodEnd, periodLabel)
  const dailyAverage = currentRevenue / Math.max(period.days, 1)

  // Calculate daily revenue for stddev
  const dailyRevenues = getDailyRevenues(currentOrders, periodStart, periodEnd)
  const dailyStddev = calculateStdDev(dailyRevenues)

  // Determine trend value
  let trendValue
  if (revenueChange > 5) trendValue = 'growing'
  else if (revenueChange < -5) trendValue = 'declining'
  else trendValue = 'stable'

  // Determine alert
  const thresholds = DEFAULT_THRESHOLDS.sales_trend
  const alertTriggered = Math.abs(revenueChange) > thresholds.warning_high

  return {
    id: 'sales_trend',
    name: 'Myyntitrendi',
    category: 'sales',

    value: trendValue,
    unit: '',

    direction: determineDirection(revenueChange),
    change_percent: Math.round(revenueChange * 10) / 10,
    change_absolute: Math.round(currentRevenue - previousRevenue),

    period,
    comparison_period: createPeriod(comparisonStart, comparisonEnd, periodLabel),

    confidence: determineConfidence(currentOrderCount),
    priority: determinePriority(revenueChange),

    thresholds,
    alert_triggered: alertTriggered,

    context: {
      seasonal_adjusted: false,
      seasonal_factor: 1.0,
      anomaly_detected: Math.abs(revenueChange) > 30,
      anomaly_type: revenueChange > 30 ? 'spike' : revenueChange < -30 ? 'drop' : undefined,
      related_indicators: ['aov', 'revenue_concentration']
    },

    // Extended metrics
    metrics: {
      current_revenue: Math.round(currentRevenue),
      previous_revenue: Math.round(previousRevenue),
      revenue_change_percent: Math.round(revenueChange * 10) / 10,

      current_orders: currentOrderCount,
      previous_orders: previousOrderCount,
      orders_change_percent: Math.round(ordersChange * 10) / 10,

      daily_average: Math.round(dailyAverage),
      daily_stddev: Math.round(dailyStddev)
    },

    calculated_at: new Date().toISOString(),
    data_freshness: 'Real-time (ePages sync)'
  }
}

/**
 * Get daily revenue totals
 * @param {Object[]} orders
 * @param {Date} startDate
 * @param {Date} endDate
 * @returns {number[]}
 */
function getDailyRevenues(orders, startDate, endDate) {
  const dailyMap = new Map()

  // Initialize all days
  const current = new Date(startDate)
  while (current <= endDate) {
    dailyMap.set(current.toISOString().split('T')[0], 0)
    current.setDate(current.getDate() + 1)
  }

  // Sum orders by day
  orders.forEach(order => {
    const date = new Date(order.creation_date).toISOString().split('T')[0]
    if (dailyMap.has(date)) {
      dailyMap.set(date, dailyMap.get(date) + (order.grand_total || 0))
    }
  })

  return Array.from(dailyMap.values())
}

/**
 * Calculate standard deviation
 * @param {number[]} values
 * @returns {number}
 */
function calculateStdDev(values) {
  if (values.length === 0) return 0

  const mean = values.reduce((sum, v) => sum + v, 0) / values.length
  const squaredDiffs = values.map(v => Math.pow(v - mean, 2))
  const variance = squaredDiffs.reduce((sum, v) => sum + v, 0) / values.length

  return Math.sqrt(variance)
}

export default calculateSalesTrend

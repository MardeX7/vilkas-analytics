/**
 * Average Order Value (AOV) Indicator Calculator
 *
 * Data Source: ePages (MASTER)
 * Category: sales
 *
 * Calculates average order value and distribution.
 */

import {
  createPeriod,
  determinePriority,
  determineConfidence,
  determineDirection,
  DEFAULT_THRESHOLDS
} from '../types.js'

/**
 * Calculate AOV indicator
 *
 * @param {Object} params
 * @param {Array} params.orders - Orders array from ePages
 * @param {Date} params.periodEnd - End date for analysis
 * @param {'7d' | '30d' | '90d'} params.periodLabel - Period length
 * @returns {Object} AOV indicator
 */
export function calculateAOV({ orders, periodEnd, periodLabel = '30d' }) {
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

  // Filter orders for each period (only orders with value > 0)
  const currentOrders = filterOrdersByPeriod(orders, periodStart, endDate)
    .filter(o => parseFloat(o.grand_total) > 0)
  const previousOrders = filterOrdersByPeriod(orders, comparisonStart, comparisonEnd)
    .filter(o => parseFloat(o.grand_total) > 0)

  // Calculate AOV
  const currentAOV = calculateAverage(currentOrders)
  const previousAOV = calculateAverage(previousOrders)

  // Calculate change - only if we have comparison data
  const hasComparisonData = previousOrders.length > 0 && previousAOV > 0
  const changePercent = hasComparisonData
    ? ((currentAOV - previousAOV) / previousAOV) * 100
    : null

  // Calculate additional metrics
  const orderValues = currentOrders.map(o => parseFloat(o.grand_total))
  const medianOrderValue = calculateMedian(orderValues)
  const minOrder = orderValues.length > 0 ? Math.min(...orderValues) : 0
  const maxOrder = orderValues.length > 0 ? Math.max(...orderValues) : 0

  // Order value distribution
  const distribution = calculateDistribution(orderValues)

  // Build indicator
  const thresholds = DEFAULT_THRESHOLDS.aov
  const alertTriggered = changePercent !== null && (
    changePercent > thresholds.warning_high ||
    changePercent < thresholds.warning_low
  )

  return {
    id: 'aov',
    name: 'Keskiostos (AOV)',
    category: 'sales',

    value: Math.round(currentAOV * 100) / 100,
    unit: 'SEK',

    direction: changePercent !== null ? determineDirection(changePercent) : 'stable',
    change_percent: changePercent !== null ? Math.round(changePercent * 100) / 100 : null,
    change_absolute: hasComparisonData ? Math.round((currentAOV - previousAOV) * 100) / 100 : null,

    period: createPeriod(periodStart, endDate, periodLabel),
    comparison_period: createPeriod(comparisonStart, comparisonEnd, periodLabel),

    confidence: determineConfidence(currentOrders.length),
    priority: changePercent !== null ? determinePriority(changePercent) : 'low',

    thresholds,
    alert_triggered: alertTriggered,

    context: {
      seasonal_adjusted: false,
      anomaly_detected: changePercent !== null && Math.abs(changePercent) > 20,
      anomaly_type: changePercent !== null && Math.abs(changePercent) > 20
        ? (changePercent > 0 ? 'spike' : 'drop')
        : null,
      no_comparison_data: !hasComparisonData,
      notes: generateAOVNotes(currentAOV, previousAOV, changePercent, hasComparisonData)
    },

    // Additional metrics (spec-compliant)
    metrics: {
      current_aov: Math.round(currentAOV * 100) / 100,
      previous_aov: hasComparisonData ? Math.round(previousAOV * 100) / 100 : null,
      median_order_value: Math.round(medianOrderValue * 100) / 100,
      min_order: Math.round(minOrder * 100) / 100,
      max_order: Math.round(maxOrder * 100) / 100,
      order_count: currentOrders.length,
      order_value_distribution: distribution
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
 * Calculate average order value
 */
function calculateAverage(orders) {
  if (orders.length === 0) return 0

  const total = orders.reduce((sum, order) => {
    return sum + (parseFloat(order.grand_total) || 0)
  }, 0)

  return total / orders.length
}

/**
 * Calculate median value
 */
function calculateMedian(values) {
  if (values.length === 0) return 0

  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)

  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2
}

/**
 * Calculate order value distribution by buckets
 */
function calculateDistribution(values) {
  const buckets = [
    { label: '0-500 SEK', min: 0, max: 500 },
    { label: '500-1000 SEK', min: 500, max: 1000 },
    { label: '1000-2000 SEK', min: 1000, max: 2000 },
    { label: '2000-5000 SEK', min: 2000, max: 5000 },
    { label: '5000+ SEK', min: 5000, max: Infinity }
  ]

  const total = values.length

  return buckets.map(bucket => {
    const count = values.filter(v => v >= bucket.min && v < bucket.max).length
    return {
      bucket: bucket.label,
      count,
      percentage: total > 0 ? Math.round((count / total) * 100 * 10) / 10 : 0
    }
  })
}

/**
 * Generate human-readable notes
 */
function generateAOVNotes(currentAOV, previousAOV, changePercent, hasComparisonData) {
  const formattedCurrent = new Intl.NumberFormat('sv-SE', {
    style: 'currency',
    currency: 'SEK',
    minimumFractionDigits: 0
  }).format(currentAOV)

  if (!hasComparisonData) {
    return `Keskiostos on ${formattedCurrent}. Vertailudataa ei ole saatavilla.`
  }

  if (changePercent > 5) {
    return `Keskiostos nousi ${Math.abs(changePercent).toFixed(1)}% tasolle ${formattedCurrent}.`
  } else if (changePercent < -5) {
    return `Keskiostos laski ${Math.abs(changePercent).toFixed(1)}% tasolle ${formattedCurrent}.`
  } else {
    return `Keskiostos pysyi vakaana tasolla ${formattedCurrent}.`
  }
}

export default calculateAOV

/**
 * Average Order Value (AOV) Indicator
 *
 * Source: ePages (MASTER - 100% reliable)
 * Measures: Average order value and distribution
 */

import {
  createPeriod,
  determinePriority,
  determineConfidence,
  determineDirection,
  DEFAULT_THRESHOLDS
} from './types'

/**
 * Calculate AOV indicator
 * @param {Object[]} orders - Orders from ePages
 * @param {Date} periodStart - Period start date
 * @param {Date} periodEnd - Period end date
 * @param {Date} comparisonStart - Comparison period start
 * @param {Date} comparisonEnd - Comparison period end
 * @param {string} periodLabel - Period label
 * @returns {Object} AOVIndicator
 */
export function calculateAOV(
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

  // Calculate AOV
  const currentValues = currentOrders.map(o => o.grand_total || 0).filter(v => v > 0)
  const previousValues = previousOrders.map(o => o.grand_total || 0).filter(v => v > 0)

  const currentAOV = currentValues.length > 0
    ? currentValues.reduce((sum, v) => sum + v, 0) / currentValues.length
    : 0

  const previousAOV = previousValues.length > 0
    ? previousValues.reduce((sum, v) => sum + v, 0) / previousValues.length
    : 0

  // Calculate change
  const aovChange = previousAOV > 0
    ? ((currentAOV - previousAOV) / previousAOV) * 100
    : 0

  // Calculate additional metrics
  const sortedValues = [...currentValues].sort((a, b) => a - b)
  const medianAOV = sortedValues.length > 0
    ? sortedValues[Math.floor(sortedValues.length / 2)]
    : 0

  const minOrder = sortedValues.length > 0 ? sortedValues[0] : 0
  const maxOrder = sortedValues.length > 0 ? sortedValues[sortedValues.length - 1] : 0

  // Calculate distribution buckets
  const distribution = calculateDistribution(currentValues)

  // Determine alert
  const thresholds = DEFAULT_THRESHOLDS.aov
  const alertTriggered = aovChange < thresholds.warning_low || aovChange > thresholds.warning_high

  return {
    id: 'aov',
    name: 'Keskitilausarvo (AOV)',
    category: 'sales',

    value: Math.round(currentAOV),
    unit: 'SEK',

    direction: determineDirection(aovChange),
    change_percent: Math.round(aovChange * 10) / 10,
    change_absolute: Math.round(currentAOV - previousAOV),

    period: createPeriod(periodStart, periodEnd, periodLabel),
    comparison_period: createPeriod(comparisonStart, comparisonEnd, periodLabel),

    confidence: determineConfidence(currentOrders.length),
    priority: determinePriority(aovChange),

    thresholds,
    alert_triggered: alertTriggered,

    context: {
      seasonal_adjusted: false,
      anomaly_detected: Math.abs(aovChange) > 20,
      related_indicators: ['sales_trend', 'revenue_concentration']
    },

    metrics: {
      current_aov: Math.round(currentAOV),
      previous_aov: Math.round(previousAOV),
      median_order_value: Math.round(medianAOV),
      min_order: Math.round(minOrder),
      max_order: Math.round(maxOrder),
      order_value_distribution: distribution
    },

    calculated_at: new Date().toISOString(),
    data_freshness: 'Real-time (ePages sync)'
  }
}

/**
 * Calculate order value distribution
 * @param {number[]} values
 * @returns {Object[]}
 */
function calculateDistribution(values) {
  const buckets = [
    { min: 0, max: 500, label: '0-500 SEK' },
    { min: 500, max: 1000, label: '500-1000 SEK' },
    { min: 1000, max: 2000, label: '1000-2000 SEK' },
    { min: 2000, max: 5000, label: '2000-5000 SEK' },
    { min: 5000, max: Infinity, label: '5000+ SEK' }
  ]

  const total = values.length || 1

  return buckets.map(bucket => {
    const count = values.filter(v => v >= bucket.min && v < bucket.max).length
    return {
      bucket: bucket.label,
      count,
      percentage: Math.round((count / total) * 1000) / 10
    }
  })
}

export default calculateAOV

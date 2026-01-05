/**
 * VilkasAnalytics Indicators
 *
 * MVP Indicators:
 * - sales_trend (ePages)
 * - aov (ePages)
 * - position_change (GSC)
 * - organic_conversion_rate (GSC + ePages)
 */

import { calculateSalesTrend } from './salesTrend'
import { calculateAOV } from './aov'
import { calculatePositionChange } from './positionChange'
import { calculateOrganicConversionRate } from './organicConversionRate'

export * from './types'
export { calculateSalesTrend, calculateAOV, calculatePositionChange, calculateOrganicConversionRate }

export function calculateAllIndicators({
  orders,
  products,
  gscData,
  previousGscData,
  periodStart,
  periodEnd,
  comparisonStart,
  comparisonEnd,
  periodLabel = '30d'
}) {
  const indicators = []

  // Sales indicators (ePages MASTER)
  if (orders && orders.length > 0) {
    indicators.push(
      calculateSalesTrend(orders, periodStart, periodEnd, comparisonStart, comparisonEnd, periodLabel)
    )
    indicators.push(
      calculateAOV(orders, periodStart, periodEnd, comparisonStart, comparisonEnd, periodLabel)
    )
  }

  // SEO indicators (GSC)
  if (gscData && gscData.length > 0 && previousGscData) {
    indicators.push(
      calculatePositionChange(gscData, previousGscData, periodStart, periodEnd, comparisonStart, comparisonEnd, periodLabel)
    )
  }

  // Combined indicators (GSC + ePages)
  if (gscData && gscData.length > 0 && orders && orders.length > 0) {
    indicators.push(
      calculateOrganicConversionRate(gscData, orders, products || [], periodStart, periodEnd, comparisonStart, comparisonEnd, periodLabel)
    )
  }

  return indicators
}

/**
 * Format indicator for AI analysis
 * @param {Object} indicator
 * @returns {Object}
 */
export function formatForAI(indicator) {
  return {
    id: indicator.id,
    name: indicator.name,
    category: indicator.category,
    value: indicator.value,
    unit: indicator.unit,
    direction: indicator.direction,
    change_percent: indicator.change_percent,
    priority: indicator.priority,
    alert_triggered: indicator.alert_triggered,
    metrics: indicator.metrics
  }
}

/**
 * Get indicator summary for dashboard
 * @param {Object[]} indicators
 * @returns {Object}
 */
export function getIndicatorSummary(indicators) {
  const summary = {
    total: indicators.length,
    by_category: {},
    alerts: [],
    critical_count: 0,
    high_count: 0
  }

  for (const ind of indicators) {
    // Count by category
    summary.by_category[ind.category] = (summary.by_category[ind.category] || 0) + 1

    // Count priorities
    if (ind.priority === 'critical') summary.critical_count++
    if (ind.priority === 'high') summary.high_count++

    // Collect alerts
    if (ind.alert_triggered) {
      summary.alerts.push({
        indicator_id: ind.id,
        indicator_name: ind.name,
        priority: ind.priority,
        message: `${ind.name}: ${ind.change_percent > 0 ? '+' : ''}${ind.change_percent}%`
      })
    }
  }

  return summary
}

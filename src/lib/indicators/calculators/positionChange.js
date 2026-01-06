/**
 * Position Change Indicator Calculator
 *
 * Data Source: GSC (Google Search Console)
 * Category: seo
 *
 * Tracks SEO position changes for key queries.
 */

import {
  createPeriod,
  determinePriority,
  determineConfidence,
  determineDirection,
  DEFAULT_THRESHOLDS
} from '../types.js'

/**
 * Calculate position change indicator
 *
 * @param {Object} params
 * @param {Array} params.gscData - GSC search analytics data
 * @param {Date} params.periodEnd - End date for analysis
 * @param {'7d' | '30d' | '90d'} params.periodLabel - Period length
 * @returns {Object} Position change indicator
 */
export function calculatePositionChange({ gscData, periodEnd, periodLabel = '30d' }) {
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

  // Filter data by period
  const currentData = filterByPeriod(gscData, periodStart, endDate)
  const previousData = filterByPeriod(gscData, comparisonStart, comparisonEnd)

  // Aggregate by query
  const currentByQuery = aggregateByQuery(currentData)
  const previousByQuery = aggregateByQuery(previousData)

  // Calculate position changes
  const positionChanges = []
  const allQueries = new Set([...Object.keys(currentByQuery), ...Object.keys(previousByQuery)])

  for (const query of allQueries) {
    const current = currentByQuery[query]
    const previous = previousByQuery[query]

    if (current && previous) {
      const change = previous.avgPosition - current.avgPosition // Negative = improved
      positionChanges.push({
        query,
        position_before: Math.round(previous.avgPosition * 10) / 10,
        position_after: Math.round(current.avgPosition * 10) / 10,
        change: Math.round(change * 10) / 10,
        impressions: current.impressions,
        clicks: current.clicks,
        impact: determineImpact(change, current.impressions)
      })
    }
  }

  // Sort by impact
  positionChanges.sort((a, b) => {
    const impactOrder = { high: 0, medium: 1, low: 2 }
    return impactOrder[a.impact] - impactOrder[b.impact] || Math.abs(b.change) - Math.abs(a.change)
  })

  // Calculate summary metrics
  const avgPositionCurrent = calculateWeightedAvgPosition(currentData)
  const avgPositionPrevious = calculateWeightedAvgPosition(previousData)
  const avgChange = avgPositionPrevious - avgPositionCurrent

  const improved = positionChanges.filter(p => p.change > 0).length
  const declined = positionChanges.filter(p => p.change < 0).length
  const stable = positionChanges.filter(p => Math.abs(p.change) < 0.5).length

  // Significant changes (moved 3+ positions)
  const significantChanges = positionChanges
    .filter(p => Math.abs(p.change) >= 3)
    .slice(0, 10)

  // Build indicator
  const thresholds = DEFAULT_THRESHOLDS.position_change
  const changePercent = avgPositionPrevious > 0
    ? ((avgPositionPrevious - avgPositionCurrent) / avgPositionPrevious) * 100
    : 0
  const alertTriggered = Math.abs(avgChange) > 2

  return {
    id: 'position_change',
    name: 'SEO-positiomuutokset',
    category: 'seo',

    value: Math.round(avgChange * 10) / 10,
    unit: 'positions',

    direction: determineDirection(avgChange), // Positive change = improved = up
    change_percent: Math.round(changePercent * 100) / 100,
    change_absolute: Math.round(avgChange * 10) / 10,

    period: createPeriod(periodStart, endDate, periodLabel),
    comparison_period: createPeriod(comparisonStart, comparisonEnd, periodLabel),

    confidence: determineConfidence(currentData.length),
    priority: determinePriority(Math.abs(avgChange) * 5), // Scale for priority

    thresholds,
    alert_triggered: alertTriggered,

    context: {
      seasonal_adjusted: false,
      anomaly_detected: Math.abs(avgChange) > 5,
      anomaly_type: Math.abs(avgChange) > 5
        ? (avgChange > 0 ? 'improvement' : 'drop')
        : null,
      notes: generatePositionNotes(avgChange, improved, declined, stable)
    },

    metrics: {
      avg_position_current: Math.round(avgPositionCurrent * 10) / 10,
      avg_position_previous: Math.round(avgPositionPrevious * 10) / 10,
      improved_queries: improved,
      declined_queries: declined,
      stable_queries: stable,
      total_queries: positionChanges.length
    },

    significant_changes: significantChanges,

    calculated_at: new Date().toISOString(),
    data_freshness: new Date().toISOString()
  }
}

/**
 * Filter GSC data by date period
 */
function filterByPeriod(data, startDate, endDate) {
  return data.filter(row => {
    const date = new Date(row.date)
    return date >= startDate && date <= endDate
  })
}

/**
 * Aggregate GSC data by query
 */
function aggregateByQuery(data) {
  const byQuery = {}

  for (const row of data) {
    const query = row.query
    if (!byQuery[query]) {
      byQuery[query] = {
        impressions: 0,
        clicks: 0,
        positionSum: 0,
        count: 0
      }
    }

    byQuery[query].impressions += row.impressions || 0
    byQuery[query].clicks += row.clicks || 0
    byQuery[query].positionSum += (row.position || 0) * (row.impressions || 1)
    byQuery[query].count += row.impressions || 1
  }

  // Calculate averages
  for (const query of Object.keys(byQuery)) {
    const q = byQuery[query]
    q.avgPosition = q.count > 0 ? q.positionSum / q.count : 0
  }

  return byQuery
}

/**
 * Calculate weighted average position
 */
function calculateWeightedAvgPosition(data) {
  let totalImpressions = 0
  let weightedSum = 0

  for (const row of data) {
    const impressions = row.impressions || 0
    const position = row.position || 0
    weightedSum += position * impressions
    totalImpressions += impressions
  }

  return totalImpressions > 0 ? weightedSum / totalImpressions : 0
}

/**
 * Determine impact level based on position change and traffic
 */
function determineImpact(change, impressions) {
  const absChange = Math.abs(change)

  if (absChange >= 5 && impressions >= 100) return 'high'
  if (absChange >= 3 && impressions >= 50) return 'medium'
  return 'low'
}

/**
 * Generate human-readable notes
 */
function generatePositionNotes(avgChange, improved, declined, stable) {
  if (avgChange > 2) {
    return `SEO-näkyvyys parantunut merkittävästi: ${improved} hakusanaa nousi, ${declined} laski.`
  } else if (avgChange < -2) {
    return `SEO-näkyvyys heikentynyt: ${declined} hakusanaa laski, ${improved} nousi.`
  } else {
    return `SEO-positiot pysyivät vakaina. ${stable} hakusanaa ilman merkittäviä muutoksia.`
  }
}

export default calculatePositionChange

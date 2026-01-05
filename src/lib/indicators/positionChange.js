/**
 * Position Change Indicator
 *
 * Source: Google Search Console (100% reliable for SEO data)
 * Measures: Changes in search positions over time
 */

import {
  createPeriod,
  determinePriority,
  determineConfidence,
  determineDirection,
  DEFAULT_THRESHOLDS
} from './types'

/**
 * Calculate position change indicator
 * @param {Object[]} gscData - GSC data with query, page, clicks, impressions, position
 * @param {Object[]} previousGscData - Previous period GSC data
 * @param {Date} periodStart
 * @param {Date} periodEnd
 * @param {Date} comparisonStart
 * @param {Date} comparisonEnd
 * @param {string} periodLabel
 * @returns {Object} PositionChangeIndicator
 */
export function calculatePositionChange(
  gscData,
  previousGscData,
  periodStart,
  periodEnd,
  comparisonStart,
  comparisonEnd,
  periodLabel = '30d'
) {
  // Aggregate current period by query
  const currentByQuery = aggregateByQuery(gscData)
  const previousByQuery = aggregateByQuery(previousGscData)

  // Calculate position changes
  const changes = []
  let improvedCount = 0
  let declinedCount = 0
  let stableCount = 0

  for (const [query, current] of currentByQuery) {
    const previous = previousByQuery.get(query)

    if (previous) {
      const positionChange = previous.avg_position - current.avg_position // Positive = improved
      const change = {
        query,
        page: current.top_page,
        position_before: Math.round(previous.avg_position * 10) / 10,
        position_after: Math.round(current.avg_position * 10) / 10,
        change: Math.round(positionChange * 10) / 10,
        impressions: current.impressions,
        clicks: current.clicks,
        impact: determineImpact(current.impressions, Math.abs(positionChange))
      }

      changes.push(change)

      if (positionChange > 1) improvedCount++
      else if (positionChange < -1) declinedCount++
      else stableCount++
    }
  }

  // Sort by impact (high impressions + large change)
  changes.sort((a, b) => {
    const impactA = a.impressions * Math.abs(a.change)
    const impactB = b.impressions * Math.abs(b.change)
    return impactB - impactA
  })

  // Calculate average position change
  const avgPositionChange = changes.length > 0
    ? changes.reduce((sum, c) => sum + c.change, 0) / changes.length
    : 0

  // Calculate weighted average (by impressions)
  const totalImpressions = changes.reduce((sum, c) => sum + c.impressions, 0) || 1
  const weightedAvgChange = changes.reduce((sum, c) =>
    sum + (c.change * c.impressions / totalImpressions), 0)

  // Significant changes (top 10 by impact)
  const significantChanges = changes.slice(0, 10)

  // Determine alert
  const thresholds = DEFAULT_THRESHOLDS.position_change
  const alertTriggered = avgPositionChange < thresholds.critical_low ||
    avgPositionChange > thresholds.critical_high

  return {
    id: 'position_change',
    name: 'Positionsförändringar',
    category: 'seo',

    value: Math.round(avgPositionChange * 10) / 10,
    unit: 'positioner',

    direction: determineDirection(-avgPositionChange), // Negative change = improvement = up
    change_percent: null, // Positions are not percentages
    change_absolute: Math.round(avgPositionChange * 10) / 10,

    period: createPeriod(periodStart, periodEnd, periodLabel),
    comparison_period: createPeriod(comparisonStart, comparisonEnd, periodLabel),

    confidence: determineConfidence(changes.length, 50, 20),
    priority: determinePriority(avgPositionChange * -5), // Scale for priority

    thresholds,
    alert_triggered: alertTriggered,

    context: {
      seasonal_adjusted: false,
      anomaly_detected: Math.abs(avgPositionChange) > 5,
      related_indicators: ['ctr_performance', 'organic_conversion_rate']
    },

    metrics: {
      average_position_change: Math.round(avgPositionChange * 10) / 10,
      weighted_average_change: Math.round(weightedAvgChange * 10) / 10,
      improved_queries: improvedCount,
      declined_queries: declinedCount,
      stable_queries: stableCount,
      total_queries_compared: changes.length,
      significant_changes: significantChanges
    },

    calculated_at: new Date().toISOString(),
    data_freshness: 'GSC data is 2-3 days delayed'
  }
}

/**
 * Aggregate GSC data by query
 * @param {Object[]} gscData
 * @returns {Map}
 */
function aggregateByQuery(gscData) {
  const byQuery = new Map()

  for (const row of gscData) {
    const existing = byQuery.get(row.query) || {
      impressions: 0,
      clicks: 0,
      position_sum: 0,
      count: 0,
      top_page: row.page
    }

    existing.impressions += row.impressions || 0
    existing.clicks += row.clicks || 0
    existing.position_sum += (row.position || 0) * (row.impressions || 0)
    existing.count += row.impressions || 0

    // Track top page by clicks
    if (row.clicks > 0) {
      existing.top_page = row.page
    }

    byQuery.set(row.query, existing)
  }

  // Calculate weighted average position
  for (const [query, data] of byQuery) {
    data.avg_position = data.count > 0 ? data.position_sum / data.count : 0
    byQuery.set(query, data)
  }

  return byQuery
}

/**
 * Determine impact level
 * @param {number} impressions
 * @param {number} positionChange
 * @returns {'high' | 'medium' | 'low'}
 */
function determineImpact(impressions, positionChange) {
  const score = impressions * positionChange
  if (score > 1000) return 'high'
  if (score > 100) return 'medium'
  return 'low'
}

export default calculatePositionChange

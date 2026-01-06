/**
 * Bounce Rate Trend Indicator Calculator
 *
 * Data Source: GA4 (Google Analytics 4)
 * Category: behavioral
 *
 * Tracks bounce rate changes over time.
 * NOTE: GA4 is for BEHAVIORAL data only, NOT transactions.
 */

import {
  createPeriod,
  determinePriority,
  determineConfidence,
  DEFAULT_THRESHOLDS
} from '../types.js'

/**
 * Calculate bounce rate trend indicator
 *
 * @param {Object} params
 * @param {Array} params.ga4Data - GA4 analytics data
 * @param {Date} params.periodEnd - End date for analysis
 * @param {'7d' | '30d' | '90d'} params.periodLabel - Period length
 * @returns {Object} Bounce rate trend indicator
 */
export function calculateBounceRateTrend({ ga4Data, periodEnd, periodLabel = '30d' }) {
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
  const currentData = filterByPeriod(ga4Data, periodStart, endDate)
  const previousData = filterByPeriod(ga4Data, comparisonStart, comparisonEnd)

  // Calculate weighted bounce rates
  const currentBounceRate = calculateWeightedBounceRate(currentData)
  const previousBounceRate = calculateWeightedBounceRate(previousData)

  const change = currentBounceRate - previousBounceRate
  const changePercent = previousBounceRate > 0
    ? ((currentBounceRate - previousBounceRate) / previousBounceRate) * 100
    : 0

  // For bounce rate: DOWN is good (lower = better)
  // So if change is negative, direction is 'up' (improvement)
  const direction = change > 1 ? 'down' : change < -1 ? 'up' : 'stable'
  const isImprovement = change < 0

  const thresholds = DEFAULT_THRESHOLDS.bounce_rate_trend || {
    critical_high: 80,
    warning_high: 65,
    warning_low: 20,
    critical_low: 10
  }

  const alertTriggered = currentBounceRate > thresholds.warning_high

  // Calculate totals for metrics
  const totalSessions = currentData.reduce((sum, d) => sum + (d.sessions || 0), 0)
  const totalEngaged = currentData.reduce((sum, d) => sum + (d.engaged_sessions || 0), 0)

  return {
    id: 'bounce_rate_trend',
    name: 'Avvisningsfrekvens',
    category: 'behavioral',

    value: Math.round(currentBounceRate * 100) / 100,
    unit: '%',

    direction,
    change_percent: Math.round(changePercent * 100) / 100,
    change_absolute: Math.round(change * 100) / 100,

    period: createPeriod(periodStart, endDate, periodLabel),
    comparison_period: createPeriod(comparisonStart, comparisonEnd, periodLabel),

    confidence: determineConfidence(currentData.length),
    priority: determinePriority(Math.abs(changePercent)),

    thresholds,
    alert_triggered: alertTriggered,

    context: {
      seasonal_adjusted: false,
      anomaly_detected: Math.abs(change) > 10,
      is_improvement: isImprovement,
      notes: generateBounceNotes(currentBounceRate, change)
    },

    metrics: {
      current_bounce_rate: Math.round(currentBounceRate * 100) / 100,
      previous_bounce_rate: Math.round(previousBounceRate * 100) / 100,
      total_sessions: totalSessions,
      engaged_sessions: totalEngaged,
      bounced_sessions: totalSessions - totalEngaged
    },

    calculated_at: new Date().toISOString(),
    data_freshness: new Date().toISOString()
  }
}

/**
 * Filter GA4 data by date period
 */
function filterByPeriod(data, startDate, endDate) {
  return data.filter(row => {
    const date = new Date(row.date)
    return date >= startDate && date <= endDate
  })
}

/**
 * Calculate weighted bounce rate from GA4 data
 * Bounce rate = (sessions - engaged_sessions) / sessions
 */
function calculateWeightedBounceRate(data) {
  let totalSessions = 0
  let totalBounced = 0

  for (const row of data) {
    const sessions = row.sessions || 0
    const engaged = row.engaged_sessions || 0
    const bounced = sessions - engaged
    totalSessions += sessions
    totalBounced += bounced
  }

  return totalSessions > 0 ? (totalBounced / totalSessions) * 100 : 0
}

/**
 * Generate human-readable notes
 */
function generateBounceNotes(bounceRate, change) {
  if (bounceRate > 70) {
    return `Hög avvisningsfrekvens (${bounceRate.toFixed(1)}%). Granska landningssidor och sidans laddningstid.`
  } else if (change < -5) {
    return `Avvisningsfrekvensen har förbättrats med ${Math.abs(change).toFixed(1)} procentenheter.`
  } else if (change > 5) {
    return `Avvisningsfrekvensen har ökat med ${change.toFixed(1)} procentenheter. Undersök orsaker.`
  }
  return `Avvisningsfrekvensen är stabil på ${bounceRate.toFixed(1)}%.`
}

export default calculateBounceRateTrend

/**
 * Landing Page Quality Indicator Calculator
 *
 * Data Source: GA4 (Google Analytics 4)
 * Category: behavioral
 *
 * Identifies problematic landing pages with high bounce rates.
 * NOTE: GA4 is for BEHAVIORAL data only, NOT transactions.
 */

import {
  createPeriod,
  determinePriority,
  determineConfidence,
  DEFAULT_THRESHOLDS
} from '../types.js'

/**
 * Calculate landing page quality indicator
 *
 * @param {Object} params
 * @param {Array} params.ga4Data - GA4 analytics data
 * @param {Date} params.periodEnd - End date for analysis
 * @param {'7d' | '30d' | '90d'} params.periodLabel - Period length
 * @returns {Object} Landing page quality indicator
 */
export function calculateLandingPageQuality({ ga4Data, periodEnd, periodLabel = '30d' }) {
  const endDate = periodEnd instanceof Date ? periodEnd : new Date(periodEnd)

  // Determine period length in days
  const periodDays = periodLabel === '7d' ? 7 : periodLabel === '30d' ? 30 : 90

  // Calculate period dates
  const periodStart = new Date(endDate)
  periodStart.setDate(periodStart.getDate() - periodDays + 1)

  // Filter data by period
  const currentData = filterByPeriod(ga4Data, periodStart, endDate)

  // Aggregate by landing page
  const pageMap = new Map()
  let totalSessions = 0

  for (const row of currentData) {
    const page = row.landing_page
    if (!page) continue

    const sessions = row.sessions || 0
    const engaged = row.engaged_sessions || 0

    if (!pageMap.has(page)) {
      pageMap.set(page, { sessions: 0, engaged: 0 })
    }
    const p = pageMap.get(page)
    p.sessions += sessions
    p.engaged += engaged
    totalSessions += sessions
  }

  // Calculate metrics per page
  const pages = Array.from(pageMap.entries())
    .map(([page, data]) => ({
      page,
      sessions: data.sessions,
      bounce_rate: data.sessions > 0
        ? ((data.sessions - data.engaged) / data.sessions) * 100
        : 0,
      traffic_share: totalSessions > 0 ? (data.sessions / totalSessions) * 100 : 0
    }))
    .filter(p => p.sessions >= 10) // Minimum sessions for relevance
    .sort((a, b) => b.sessions - a.sessions)

  // Identify problem pages (high bounce + significant traffic)
  const problemPages = pages.filter(p => p.bounce_rate > 65 && p.traffic_share > 2)
  const problemTrafficPercent = problemPages.reduce((sum, p) => sum + p.traffic_share, 0)

  // Identify good pages (low bounce)
  const goodPages = pages.filter(p => p.bounce_rate < 40)

  // Calculate average bounce rate across all pages
  const avgBounceRate = pages.length > 0
    ? pages.reduce((sum, p) => sum + p.bounce_rate * p.sessions, 0) / totalSessions
    : 0

  const thresholds = DEFAULT_THRESHOLDS.landing_page_quality || {
    critical_high: 75,
    warning_high: 50,
    warning_low: null,
    critical_low: null
  }

  const alertTriggered = problemTrafficPercent > thresholds.warning_high

  // Direction: many problem pages = 'down' (bad)
  const direction = problemTrafficPercent > 25 ? 'down' : 'up'

  return {
    id: 'landing_page_quality',
    name: 'Landningssidekvalitet',
    category: 'behavioral',

    value: Math.round(problemTrafficPercent * 100) / 100, // % of traffic on problem pages
    unit: '%',

    direction,
    change_percent: null, // No comparison
    change_absolute: null,

    period: createPeriod(periodStart, endDate, periodLabel),
    comparison_period: null,

    confidence: determineConfidence(pages.length, 20, 5),
    priority: determinePriority(problemTrafficPercent),

    thresholds,
    alert_triggered: alertTriggered,

    context: {
      seasonal_adjusted: false,
      anomaly_detected: problemTrafficPercent > 50,
      notes: generateQualityNotes(problemPages, avgBounceRate, goodPages)
    },

    metrics: {
      total_pages_analyzed: pages.length,
      problem_pages_count: problemPages.length,
      good_pages_count: goodPages.length,
      problem_traffic_percent: Math.round(problemTrafficPercent * 100) / 100,
      avg_bounce_rate: Math.round(avgBounceRate * 100) / 100,
      best_page: goodPages[0]?.page || null
    },

    problem_pages: problemPages.slice(0, 5).map(p => ({
      page: p.page,
      sessions: p.sessions,
      bounce_rate: Math.round(p.bounce_rate * 100) / 100,
      traffic_share: Math.round(p.traffic_share * 100) / 100
    })),

    top_pages: pages.slice(0, 10).map(p => ({
      page: p.page,
      sessions: p.sessions,
      bounce_rate: Math.round(p.bounce_rate * 100) / 100
    })),

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
 * Generate human-readable notes
 */
function generateQualityNotes(problemPages, avgBounceRate, goodPages) {
  if (problemPages.length === 0) {
    return `Bra landningssidekvalitet. Genomsnittlig avvisningsfrekvens: ${avgBounceRate.toFixed(1)}%.`
  } else if (problemPages.length >= 3) {
    return `${problemPages.length} landningssidor har hög avvisningsfrekvens. Prioritera: ${formatPagePath(problemPages[0]?.page)}.`
  } else if (goodPages.length > 0) {
    return `${problemPages.length} sida(or) behöver optimering. Bäst: ${formatPagePath(goodPages[0]?.page)} (${goodPages[0]?.bounce_rate.toFixed(0)}% bounce).`
  }
  return `${problemPages.length} landningssida(or) behöver optimering.`
}

/**
 * Format page path for display (truncate long paths)
 */
function formatPagePath(path) {
  if (!path) return 'N/A'
  if (path.length > 40) {
    return '...' + path.slice(-37)
  }
  return path
}

export default calculateLandingPageQuality

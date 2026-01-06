/**
 * Brand vs Non-Brand Indicator Calculator
 *
 * Data Source: GSC (Google Search Console)
 * Category: seo
 *
 * Analyzes the split between brand and non-brand search queries.
 */

import {
  createPeriod,
  determinePriority,
  determineConfidence,
  determineDirection,
  DEFAULT_THRESHOLDS
} from '../types.js'

// Default brand keywords (can be overridden per store)
const DEFAULT_BRAND_PATTERNS = [
  'billackering',
  'billäckering',
  'billack',
  'bilspray'
]

/**
 * Calculate brand vs non-brand indicator
 *
 * @param {Object} params
 * @param {Array} params.gscData - GSC search analytics data
 * @param {Array} params.brandKeywords - Store-specific brand keywords
 * @param {Date} params.periodEnd - End date for analysis
 * @param {'7d' | '30d' | '90d'} params.periodLabel - Period length
 * @returns {Object} Brand vs non-brand indicator
 */
export function calculateBrandVsNonBrand({
  gscData,
  brandKeywords = DEFAULT_BRAND_PATTERNS,
  periodEnd,
  periodLabel = '30d'
}) {
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

  // Build brand patterns regex
  const brandPatterns = brandKeywords.map(k => k.toLowerCase())

  // Classify and aggregate queries
  const current = classifyQueries(currentData, brandPatterns)
  const previous = classifyQueries(previousData, brandPatterns)

  // Calculate non-brand share
  const currentNonBrandShare = current.total > 0
    ? (current.nonBrand.clicks / current.total) * 100
    : 0

  // Only calculate comparison if we have previous data
  const hasComparisonData = previousData.length > 0 && previous.total > 0
  const previousNonBrandShare = hasComparisonData
    ? (previous.nonBrand.clicks / previous.total) * 100
    : null

  const changePercent = hasComparisonData && previousNonBrandShare > 0
    ? ((currentNonBrandShare - previousNonBrandShare) / previousNonBrandShare) * 100
    : null

  // Determine health status
  const health = determineHealth(currentNonBrandShare)

  // Build indicator
  const thresholds = DEFAULT_THRESHOLDS.brand_vs_nonbrand
  const alertTriggered = currentNonBrandShare < thresholds.critical_low ||
                         currentNonBrandShare > thresholds.warning_high

  return {
    id: 'brand_vs_nonbrand',
    name: 'Brändi vs. Geneerinen',
    category: 'seo',

    value: Math.round(currentNonBrandShare * 10) / 10,
    unit: '%',

    direction: changePercent !== null ? determineDirection(changePercent) : 'stable',
    change_percent: changePercent !== null ? Math.round(changePercent * 100) / 100 : null,
    change_absolute: hasComparisonData ? Math.round((currentNonBrandShare - previousNonBrandShare) * 10) / 10 : null,

    period: createPeriod(periodStart, endDate, periodLabel),
    comparison_period: createPeriod(comparisonStart, comparisonEnd, periodLabel),

    confidence: determineConfidence(currentData.length),
    priority: alertTriggered ? 'high' : 'medium',

    thresholds,
    alert_triggered: alertTriggered,

    context: {
      seasonal_adjusted: false,
      anomaly_detected: changePercent !== null && Math.abs(changePercent) > 20,
      anomaly_type: null,
      no_comparison_data: !hasComparisonData,
      notes: generateBrandNotes(currentNonBrandShare, health, hasComparisonData)
    },

    brand_queries: {
      total_clicks: current.brand.clicks,
      total_impressions: current.brand.impressions,
      attributed_revenue: null, // Would need order attribution
      avg_position: Math.round(current.brand.avgPosition * 10) / 10,
      top_queries: current.brand.topQueries.slice(0, 5)
    },

    nonbrand_queries: {
      total_clicks: current.nonBrand.clicks,
      total_impressions: current.nonBrand.impressions,
      attributed_revenue: null,
      avg_position: Math.round(current.nonBrand.avgPosition * 10) / 10,
      top_queries: current.nonBrand.topQueries.slice(0, 5)
    },

    analysis: {
      brand_share: Math.round((100 - currentNonBrandShare) * 10) / 10,
      nonbrand_share: Math.round(currentNonBrandShare * 10) / 10,
      health: health,
      recommendation: generateRecommendation(health, currentNonBrandShare)
    },

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
 * Classify queries as brand or non-brand
 */
function classifyQueries(data, brandPatterns) {
  const brand = {
    clicks: 0,
    impressions: 0,
    positionSum: 0,
    count: 0,
    topQueries: []
  }

  const nonBrand = {
    clicks: 0,
    impressions: 0,
    positionSum: 0,
    count: 0,
    topQueries: []
  }

  // Aggregate by query first
  const byQuery = {}
  for (const row of data) {
    const query = row.query?.toLowerCase() || ''
    if (!byQuery[query]) {
      byQuery[query] = {
        query: row.query,
        clicks: 0,
        impressions: 0,
        positionSum: 0,
        count: 0
      }
    }
    byQuery[query].clicks += row.clicks || 0
    byQuery[query].impressions += row.impressions || 0
    byQuery[query].positionSum += (row.position || 0) * (row.impressions || 1)
    byQuery[query].count += row.impressions || 1
  }

  // Classify each query
  for (const [queryLower, stats] of Object.entries(byQuery)) {
    const isBrand = brandPatterns.some(pattern =>
      queryLower.includes(pattern)
    )

    const target = isBrand ? brand : nonBrand
    target.clicks += stats.clicks
    target.impressions += stats.impressions
    target.positionSum += stats.positionSum
    target.count += stats.count
    target.topQueries.push({
      query: stats.query,
      clicks: stats.clicks,
      impressions: stats.impressions,
      position: stats.count > 0 ? stats.positionSum / stats.count : 0
    })
  }

  // Sort top queries by clicks
  brand.topQueries.sort((a, b) => b.clicks - a.clicks)
  nonBrand.topQueries.sort((a, b) => b.clicks - a.clicks)

  // Calculate averages
  brand.avgPosition = brand.count > 0 ? brand.positionSum / brand.count : 0
  nonBrand.avgPosition = nonBrand.count > 0 ? nonBrand.positionSum / nonBrand.count : 0

  return {
    brand,
    nonBrand,
    total: brand.clicks + nonBrand.clicks
  }
}

/**
 * Determine SEO health based on non-brand share
 */
function determineHealth(nonBrandShare) {
  if (nonBrandShare >= 50) return 'healthy'
  if (nonBrandShare >= 30) return 'moderate'
  if (nonBrandShare >= 15) return 'brand_dependent'
  return 'very_brand_dependent'
}

/**
 * Generate human-readable notes
 */
function generateBrandNotes(nonBrandShare, health, hasComparisonData) {
  const brandShare = 100 - nonBrandShare
  let note = ''

  switch (health) {
    case 'healthy':
      note = `Terve SEO-profiili: ${Math.round(nonBrandShare)}% liikenteestä tulee geneerisillä hakusanoilla.`
      break
    case 'moderate':
      note = `Kohtuullinen SEO-jakauma: ${Math.round(brandShare)}% liikenteestä brändihauilta.`
      break
    case 'brand_dependent':
      note = `Brändiriippuvainen: ${Math.round(brandShare)}% liikenteestä tulee brändihauista. Panosta geneeriseen SEO:hon.`
      break
    case 'very_brand_dependent':
      note = `Erittäin brändiriippuvainen: ${Math.round(brandShare)}% liikenteestä brändihauilta. Kriittinen parannuskohde.`
      break
    default:
      note = ''
  }

  if (!hasComparisonData) {
    note += ' Vertailudataa ei ole saatavilla.'
  }

  return note
}

/**
 * Generate recommendation based on health
 */
function generateRecommendation(health, nonBrandShare) {
  switch (health) {
    case 'healthy':
      return 'Jatka nykyistä strategiaa. Seuraa geneeristen hakujen konversiota.'
    case 'moderate':
      return 'Lisää sisältömarkkinointia geneerisille hakusanoille.'
    case 'brand_dependent':
      return 'Panosta geneeristen hakusanojen optimointiin. Luo kategoriasivuja ja tuotekuvauksia.'
    case 'very_brand_dependent':
      return 'Kriittinen: Rakenna SEO-strategia geneerisille hakusanoille. Ilman bränditunnettuutta liikenne on vaarassa.'
    default:
      return ''
  }
}

export default calculateBrandVsNonBrand

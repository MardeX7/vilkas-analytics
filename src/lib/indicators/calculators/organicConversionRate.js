/**
 * Organic Conversion Rate Indicator Calculator
 *
 * Data Source: GSC + ePages (combined)
 * Category: combined
 *
 * Calculates conversion rate for organic search traffic.
 * CRITICAL indicator - connects SEO efforts to actual sales.
 */

import {
  createPeriod,
  determinePriority,
  determineConfidence,
  determineDirection,
  DEFAULT_THRESHOLDS
} from '../types.js'

/**
 * Calculate organic conversion rate indicator
 *
 * @param {Object} params
 * @param {Array} params.gscData - GSC search analytics data
 * @param {Array} params.orders - ePages orders
 * @param {Date} params.periodEnd - End date for analysis
 * @param {'7d' | '30d' | '90d'} params.periodLabel - Period length
 * @returns {Object} Organic conversion rate indicator
 */
export function calculateOrganicConversionRate({
  gscData,
  orders,
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
  const currentGSC = filterByPeriod(gscData, periodStart, endDate, 'date')
  const previousGSC = filterByPeriod(gscData, comparisonStart, comparisonEnd, 'date')
  const currentOrders = filterByPeriod(orders, periodStart, endDate, 'creation_date')
  const previousOrders = filterByPeriod(orders, comparisonStart, comparisonEnd, 'creation_date')

  // Calculate total clicks
  const currentClicks = currentGSC.reduce((sum, row) => sum + (row.clicks || 0), 0)
  const previousClicks = previousGSC.reduce((sum, row) => sum + (row.clicks || 0), 0)

  // Calculate orders (using attribution model)
  // For MVP, we attribute a percentage of orders to organic
  // More sophisticated attribution would use UTM parameters or session tracking
  const ORGANIC_ATTRIBUTION_RATE = 0.35 // Estimate 35% of orders come from organic

  const currentOrderCount = currentOrders.filter(o => parseFloat(o.grand_total) > 0).length
  const previousOrderCount = previousOrders.filter(o => parseFloat(o.grand_total) > 0).length

  const currentAttributedOrders = Math.round(currentOrderCount * ORGANIC_ATTRIBUTION_RATE)
  const previousAttributedOrders = Math.round(previousOrderCount * ORGANIC_ATTRIBUTION_RATE)

  // Calculate conversion rates
  const currentCR = currentClicks > 0
    ? (currentAttributedOrders / currentClicks) * 100
    : 0

  // Only calculate comparison if we have previous data
  const hasComparisonData = previousGSC.length > 0 && previousClicks > 0
  const previousCR = hasComparisonData
    ? (previousAttributedOrders / previousClicks) * 100
    : null

  // Change percent - only if we have comparison data
  const changePercent = hasComparisonData && previousCR > 0
    ? ((currentCR - previousCR) / previousCR) * 100
    : null

  // Calculate by page type
  const byPageType = calculateByPageType(currentGSC, currentOrders)

  // Find high-traffic zero-conversion pages (alerts)
  const alerts = findHighTrafficZeroSales(currentGSC, currentOrders)

  // Build indicator
  const thresholds = DEFAULT_THRESHOLDS.organic_conversion_rate || {
    critical_high: 5,
    warning_high: 3,
    warning_low: 0.5,
    critical_low: 0.2
  }
  const alertTriggered = currentCR < thresholds.warning_low || alerts.length > 0

  return {
    id: 'organic_conversion_rate',
    name: 'Orgaaninen konversio',
    category: 'combined',

    value: Math.round(currentCR * 100) / 100,
    unit: '%',

    direction: changePercent !== null ? determineDirection(changePercent) : 'stable',
    change_percent: changePercent !== null ? Math.round(changePercent * 100) / 100 : null,
    change_absolute: hasComparisonData ? Math.round((currentCR - previousCR) * 100) / 100 : null,

    period: createPeriod(periodStart, endDate, periodLabel),
    comparison_period: createPeriod(comparisonStart, comparisonEnd, periodLabel),

    confidence: determineConfidence(Math.min(currentClicks, currentOrderCount)),
    priority: alertTriggered ? 'critical' : (changePercent !== null ? determinePriority(Math.abs(changePercent)) : 'low'),

    thresholds,
    alert_triggered: alertTriggered,

    context: {
      seasonal_adjusted: false,
      anomaly_detected: changePercent !== null && Math.abs(changePercent) > 30,
      anomaly_type: changePercent !== null && Math.abs(changePercent) > 30
        ? (changePercent > 0 ? 'spike' : 'drop')
        : null,
      no_comparison_data: !hasComparisonData,
      notes: generateCRNotes(currentCR, previousCR, changePercent, hasComparisonData),
      attribution_model: 'estimated_organic_share',
      attribution_rate: ORGANIC_ATTRIBUTION_RATE
    },

    metrics: {
      total_clicks: currentClicks,
      attributed_orders: currentAttributedOrders,
      conversion_rate: Math.round(currentCR * 100) / 100,
      previous_clicks: hasComparisonData ? previousClicks : null,
      previous_orders: hasComparisonData ? previousAttributedOrders : null,
      previous_cr: hasComparisonData ? Math.round(previousCR * 100) / 100 : null
    },

    by_page_type: byPageType,
    alerts: alerts.slice(0, 5),

    calculated_at: new Date().toISOString(),
    data_freshness: new Date().toISOString()
  }
}

/**
 * Filter data by date period
 */
function filterByPeriod(data, startDate, endDate, dateField) {
  return data.filter(row => {
    const date = new Date(row[dateField] || row.date || row.created_at)
    return date >= startDate && date <= endDate
  })
}

/**
 * Calculate conversion rate by page type
 */
function calculateByPageType(gscData, orders) {
  // Aggregate clicks by page type
  const pageTypes = {
    product: { clicks: 0, pattern: /\/product\// },
    category: { clicks: 0, pattern: /\/category\/|\/products\// },
    blog: { clicks: 0, pattern: /\/blog\/|\/artikkelit\// },
    other: { clicks: 0 }
  }

  for (const row of gscData) {
    const page = row.page || ''
    let matched = false

    for (const [type, config] of Object.entries(pageTypes)) {
      if (config.pattern && config.pattern.test(page)) {
        pageTypes[type].clicks += row.clicks || 0
        matched = true
        break
      }
    }

    if (!matched) {
      pageTypes.other.clicks += row.clicks || 0
    }
  }

  // Estimate CR by page type (product pages convert better)
  const crMultipliers = {
    product: 1.5,
    category: 0.8,
    blog: 0.3,
    other: 0.5
  }

  const totalOrders = orders.filter(o => parseFloat(o.grand_total) > 0).length
  const totalClicks = Object.values(pageTypes).reduce((sum, t) => sum + t.clicks, 0)
  const baseCR = totalClicks > 0 ? (totalOrders * 0.35 / totalClicks) * 100 : 0

  return Object.entries(pageTypes).map(([type, data]) => ({
    page_type: type,
    clicks: data.clicks,
    cr: Math.round(baseCR * (crMultipliers[type] || 1) * 100) / 100
  }))
}

/**
 * Find high-traffic pages with zero sales (potential issues)
 */
function findHighTrafficZeroSales(gscData, orders) {
  // Aggregate clicks by page
  const byPage = {}
  for (const row of gscData) {
    const page = row.page || ''
    if (!byPage[page]) {
      byPage[page] = { page, clicks: 0, impressions: 0 }
    }
    byPage[page].clicks += row.clicks || 0
    byPage[page].impressions += row.impressions || 0
  }

  // Find pages with high traffic (>50 clicks) that are product pages
  // In a real implementation, we'd match these to actual order referrers
  const alerts = []
  for (const [page, stats] of Object.entries(byPage)) {
    if (stats.clicks >= 50 && /\/product\//.test(page)) {
      // This is a simplification - real attribution would check if this product was ordered
      alerts.push({
        type: 'high_traffic_zero_sales',
        page,
        clicks: stats.clicks,
        orders: 0, // Would need actual attribution
        details: 'Paljon liikennettä, tarkista tuotesivu'
      })
    }
  }

  return alerts.sort((a, b) => b.clicks - a.clicks)
}

/**
 * Generate human-readable notes
 */
function generateCRNotes(currentCR, previousCR, changePercent, hasComparisonData) {
  if (!hasComparisonData) {
    return `Orgaaninen konversio on ${currentCR.toFixed(2)}%. Vertailudataa ei ole saatavilla.`
  }

  if (changePercent > 10) {
    return `Orgaaninen konversio parani ${Math.abs(changePercent).toFixed(1)}% tasolle ${currentCR.toFixed(2)}%.`
  } else if (changePercent < -10) {
    return `Orgaaninen konversio laski ${Math.abs(changePercent).toFixed(1)}%. Tarkista tuotesivujen toimivuus.`
  } else {
    return `Orgaaninen konversio pysyi vakaana tasolla ${currentCR.toFixed(2)}%.`
  }
}

export default calculateOrganicConversionRate

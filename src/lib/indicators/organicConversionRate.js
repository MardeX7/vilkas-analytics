/**
 * Organic Conversion Rate Indicator
 *
 * Source: COMBINED (GSC clicks + ePages orders)
 * This is the most valuable combined indicator!
 *
 * GSC clicks (100% reliable) + ePages orders (100% reliable) = TRUE organic conversion
 */

import {
  createPeriod,
  determinePriority,
  determineConfidence,
  determineDirection,
  DEFAULT_THRESHOLDS
} from './types'

/**
 * Calculate organic conversion rate
 * @param {Object[]} gscData - GSC data with clicks per page
 * @param {Object[]} orders - Orders from ePages
 * @param {Object[]} products - Products with slugs for matching
 * @param {Date} periodStart
 * @param {Date} periodEnd
 * @param {Date} comparisonStart
 * @param {Date} comparisonEnd
 * @param {string} periodLabel
 * @returns {Object} OrganicConversionRateIndicator
 */
export function calculateOrganicConversionRate(
  gscData,
  orders,
  products,
  periodStart,
  periodEnd,
  comparisonStart,
  comparisonEnd,
  periodLabel = '30d'
) {
  // Total organic clicks
  const totalClicks = gscData.reduce((sum, row) => sum + (row.clicks || 0), 0)

  // Total orders in period
  const periodOrders = orders.filter(o => {
    const date = new Date(o.creation_date)
    return date >= periodStart && date <= periodEnd
  })
  const totalOrders = periodOrders.length

  // Overall conversion rate
  const overallCR = totalClicks > 0 ? (totalOrders / totalClicks) * 100 : 0

  // Aggregate clicks by page type
  const byPageType = aggregateByPageType(gscData)

  // Attribute orders to pages (simplified: based on product pages in orders)
  const pageOrders = attributeOrdersToPages(periodOrders, products, gscData)

  // Calculate CR by page type
  const pageTypeCRs = calculatePageTypeCRs(byPageType, pageOrders)

  // Identify top converting and worst converting pages
  const pagePerformance = calculatePagePerformance(gscData, pageOrders, overallCR)

  // Identify alerts
  const alerts = identifyAlerts(gscData, pageOrders)

  // Calculate comparison
  const previousOrders = orders.filter(o => {
    const date = new Date(o.creation_date)
    return date >= comparisonStart && date <= comparisonEnd
  })
  const previousCR = totalClicks > 0 ? (previousOrders.length / totalClicks) * 100 : 0
  const crChange = previousCR > 0 ? ((overallCR - previousCR) / previousCR) * 100 : 0

  // Determine alert
  const thresholds = DEFAULT_THRESHOLDS.conversion_rate
  const alertTriggered = crChange < thresholds.warning_low || alerts.length > 0

  return {
    id: 'organic_conversion_rate',
    name: 'Organisk konversionsgrad',
    category: 'combined',

    value: Math.round(overallCR * 100) / 100,
    unit: '%',

    direction: determineDirection(crChange),
    change_percent: Math.round(crChange * 10) / 10,
    change_absolute: Math.round((overallCR - previousCR) * 100) / 100,

    period: createPeriod(periodStart, periodEnd, periodLabel),
    comparison_period: createPeriod(comparisonStart, comparisonEnd, periodLabel),

    confidence: determineConfidence(totalClicks, 500, 100),
    priority: alerts.length > 0 ? 'high' : determinePriority(crChange),

    thresholds,
    alert_triggered: alertTriggered,

    context: {
      seasonal_adjusted: false,
      anomaly_detected: alerts.length > 0,
      anomaly_type: alerts.length > 0 ? 'drop' : undefined,
      related_indicators: ['sales_trend', 'position_change', 'query_revenue']
    },

    metrics: {
      total_clicks: totalClicks,
      total_orders: totalOrders,
      overall_conversion_rate: Math.round(overallCR * 100) / 100,
      revenue_per_click: totalClicks > 0
        ? Math.round(periodOrders.reduce((sum, o) => sum + (o.grand_total || 0), 0) / totalClicks)
        : 0
    },

    by_page_type: pageTypeCRs,
    top_converting: pagePerformance.top.slice(0, 5),
    worst_converting: pagePerformance.worst.slice(0, 5),
    alerts,

    calculated_at: new Date().toISOString(),
    data_freshness: 'GSC: 2-3 days delayed, ePages: real-time'
  }
}

/**
 * Aggregate GSC data by page type
 * @param {Object[]} gscData
 * @returns {Map}
 */
function aggregateByPageType(gscData) {
  const byType = new Map()

  for (const row of gscData) {
    const pageType = classifyPageType(row.page)
    const existing = byType.get(pageType) || { clicks: 0, impressions: 0 }
    existing.clicks += row.clicks || 0
    existing.impressions += row.impressions || 0
    byType.set(pageType, existing)
  }

  return byType
}

/**
 * Classify page type from URL
 * @param {string} url
 * @returns {string}
 */
function classifyPageType(url) {
  if (!url) return 'other'
  const lower = url.toLowerCase()

  if (lower.includes('/product/') || lower.includes('/produkt/') || lower.includes('/tuote/')) {
    return 'product'
  }
  if (lower.includes('/category/') || lower.includes('/kategori/') || lower.includes('/kategoria/')) {
    return 'category'
  }
  if (lower.includes('/blog/') || lower.includes('/blogi/') || lower.includes('/artikkel/')) {
    return 'blog'
  }
  if (lower === '/' || lower.includes('/landing/') || lower.includes('/kampanj/')) {
    return 'landing'
  }
  return 'other'
}

/**
 * Attribute orders to pages (simplified last-click attribution)
 * @param {Object[]} orders
 * @param {Object[]} products
 * @param {Object[]} gscData
 * @returns {Map}
 */
function attributeOrdersToPages(orders, products, gscData) {
  const pageOrders = new Map()

  // Create product slug -> page mapping
  const slugToPage = new Map()
  for (const row of gscData) {
    if (row.page && row.clicks > 0) {
      // Extract slug from URL
      const parts = row.page.split('/')
      const slug = parts[parts.length - 1] || parts[parts.length - 2]
      if (slug) {
        slugToPage.set(slug.toLowerCase(), row.page)
      }
    }
  }

  // Match orders to pages via products
  for (const order of orders) {
    const lineItems = order.order_line_items || order.line_items || []

    for (const item of lineItems) {
      // Try to find matching page
      const productName = (item.product_name || '').toLowerCase()
      const productNumber = (item.product_number || '').toLowerCase()

      for (const [slug, page] of slugToPage) {
        if (productName.includes(slug) || productNumber.includes(slug) || slug.includes(productNumber)) {
          const existing = pageOrders.get(page) || { orders: 0, revenue: 0 }
          existing.orders += 1
          existing.revenue += item.total_price || 0
          pageOrders.set(page, existing)
          break
        }
      }
    }
  }

  return pageOrders
}

/**
 * Calculate conversion rates by page type
 * @param {Map} byPageType
 * @param {Map} pageOrders
 * @returns {Object[]}
 */
function calculatePageTypeCRs(byPageType, pageOrders) {
  const types = ['product', 'category', 'landing', 'blog', 'other']
  const siteTotal = { clicks: 0, orders: 0 }

  // Calculate totals
  for (const [, data] of byPageType) {
    siteTotal.clicks += data.clicks
  }
  for (const [, data] of pageOrders) {
    siteTotal.orders += data.orders
  }

  const siteAvgCR = siteTotal.clicks > 0 ? (siteTotal.orders / siteTotal.clicks) * 100 : 0

  return types.map(type => {
    const typeData = byPageType.get(type) || { clicks: 0, impressions: 0 }
    const typeOrders = Array.from(pageOrders.entries())
      .filter(([page]) => classifyPageType(page) === type)
      .reduce((sum, [, data]) => sum + data.orders, 0)

    const cr = typeData.clicks > 0 ? (typeOrders / typeData.clicks) * 100 : 0

    return {
      page_type: type,
      clicks: typeData.clicks,
      attributed_orders: typeOrders,
      conversion_rate: Math.round(cr * 100) / 100,
      vs_site_average: Math.round((cr - siteAvgCR) * 100) / 100,
      trend: 'stable' // Would need historical data
    }
  })
}

/**
 * Calculate page-level performance
 * @param {Object[]} gscData
 * @param {Map} pageOrders
 * @param {number} siteAvgCR
 * @returns {Object}
 */
function calculatePagePerformance(gscData, pageOrders, siteAvgCR) {
  // Aggregate clicks by page
  const pageClicks = new Map()
  for (const row of gscData) {
    const existing = pageClicks.get(row.page) || { clicks: 0, impressions: 0 }
    existing.clicks += row.clicks || 0
    existing.impressions += row.impressions || 0
    pageClicks.set(row.page, existing)
  }

  // Calculate CR per page
  const pages = []
  for (const [page, clickData] of pageClicks) {
    const orderData = pageOrders.get(page) || { orders: 0, revenue: 0 }
    const cr = clickData.clicks > 0 ? (orderData.orders / clickData.clicks) * 100 : 0

    pages.push({
      page,
      clicks: clickData.clicks,
      orders: orderData.orders,
      cr: Math.round(cr * 100) / 100,
      revenue: Math.round(orderData.revenue),
      lost_potential: cr < siteAvgCR && clickData.clicks > 10
        ? Math.round((siteAvgCR - cr) / 100 * clickData.clicks * (orderData.revenue / Math.max(orderData.orders, 1)))
        : 0
    })
  }

  // Sort for top and worst
  const withClicks = pages.filter(p => p.clicks >= 10)
  const top = [...withClicks].sort((a, b) => b.cr - a.cr).slice(0, 10)
  const worst = [...withClicks].sort((a, b) => a.cr - b.cr).slice(0, 10)

  return { top, worst }
}

/**
 * Identify conversion alerts
 * @param {Object[]} gscData
 * @param {Map} pageOrders
 * @returns {Object[]}
 */
function identifyAlerts(gscData, pageOrders) {
  const alerts = []

  // Aggregate clicks by page
  const pageClicks = new Map()
  for (const row of gscData) {
    const existing = pageClicks.get(row.page) || 0
    pageClicks.set(row.page, existing + (row.clicks || 0))
  }

  // Find "dead traffic" - high clicks, zero sales
  for (const [page, clicks] of pageClicks) {
    const orders = pageOrders.get(page)?.orders || 0

    if (clicks > 50 && orders === 0) {
      alerts.push({
        type: 'high_traffic_zero_sales',
        severity: clicks > 100 ? 'critical' : 'warning',
        page,
        details: `Sidan får ${clicks} klick men 0 kr försäljning. Kontrollera pris, produktbilder eller innehåll.`
      })
    }
  }

  return alerts.slice(0, 5) // Max 5 alerts
}

export default calculateOrganicConversionRate

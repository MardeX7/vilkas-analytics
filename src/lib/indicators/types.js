/**
 * VilkasAnalytics Indicator Types
 *
 * Data Mastership Hierarchy:
 * - ePages API = MASTER (100% reliable) for transactions, revenue, orders
 * - GSC = SEO data (100% reliable) for clicks, impressions, positions
 * - GA4 = Behavioral ONLY (60-80% coverage) for relative metrics
 */

/**
 * @typedef {'sales' | 'seo' | 'combined' | 'customer' | 'product' | 'operational'} IndicatorCategory
 */

/**
 * @typedef {'high' | 'medium' | 'low'} ConfidenceLevel
 */

/**
 * @typedef {'critical' | 'high' | 'medium' | 'low'} PriorityLevel
 */

/**
 * @typedef {'up' | 'down' | 'stable'} Direction
 */

/**
 * @typedef {'7d' | '30d' | '90d' | 'custom'} PeriodLabel
 */

/**
 * @typedef {Object} IndicatorPeriod
 * @property {string} start - ISO date string
 * @property {string} end - ISO date string
 * @property {number} days - Number of days in period
 * @property {PeriodLabel} label - Period label
 */

/**
 * @typedef {Object} IndicatorThresholds
 * @property {number} [critical_high] - Critical upper threshold
 * @property {number} [warning_high] - Warning upper threshold
 * @property {number} [normal_low] - Normal lower bound
 * @property {number} [normal_high] - Normal upper bound
 * @property {number} [warning_low] - Warning lower threshold
 * @property {number} [critical_low] - Critical lower threshold
 */

/**
 * @typedef {Object} IndicatorContext
 * @property {boolean} seasonal_adjusted - Whether seasonal adjustment was applied
 * @property {number} [seasonal_factor] - Seasonal adjustment factor (1.0 = normal)
 * @property {boolean} anomaly_detected - Whether an anomaly was detected
 * @property {'spike' | 'drop' | 'trend_break'} [anomaly_type] - Type of anomaly
 * @property {string[]} [related_indicators] - Related indicator IDs
 * @property {number[]} [previous_values] - Historical values
 * @property {number} [benchmark] - Industry benchmark if available
 * @property {string} [notes] - Additional notes
 */

/**
 * Base Indicator Interface
 * @typedef {Object} BaseIndicator
 * @property {string} id - Unique indicator ID (e.g., 'sales_trend')
 * @property {string} name - Human-readable name
 * @property {IndicatorCategory} category - Indicator category
 * @property {number|string|boolean} value - Indicator value
 * @property {string} unit - Unit (%, €, count, etc.)
 * @property {Direction} direction - Trend direction
 * @property {number|null} change_percent - Percentage change
 * @property {number|null} change_absolute - Absolute change
 * @property {IndicatorPeriod} period - Analysis period
 * @property {IndicatorPeriod} comparison_period - Comparison period
 * @property {ConfidenceLevel} confidence - Data confidence level
 * @property {PriorityLevel} priority - Alert priority
 * @property {IndicatorThresholds} thresholds - Alert thresholds
 * @property {boolean} alert_triggered - Whether alert threshold was exceeded
 * @property {IndicatorContext} context - Additional context
 * @property {string} calculated_at - ISO timestamp when calculated
 * @property {string} data_freshness - Data freshness description
 */

/**
 * Creates a period object from dates
 * @param {Date} startDate
 * @param {Date} endDate
 * @param {PeriodLabel} label
 * @returns {IndicatorPeriod}
 */
export function createPeriod(startDate, endDate, label = 'custom') {
  const days = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1
  return {
    start: startDate.toISOString().split('T')[0],
    end: endDate.toISOString().split('T')[0],
    days,
    label
  }
}

/**
 * Determines priority based on change percentage
 * @param {number} changePercent
 * @returns {PriorityLevel}
 */
export function determinePriority(changePercent) {
  const absChange = Math.abs(changePercent)
  if (absChange > 20) return 'critical'
  if (absChange > 10) return 'high'
  if (absChange > 5) return 'medium'
  return 'low'
}

/**
 * Determines confidence based on data count
 * @param {number} dataCount
 * @param {number} minHigh - Minimum for high confidence (default 30)
 * @param {number} minMedium - Minimum for medium confidence (default 10)
 * @returns {ConfidenceLevel}
 */
export function determineConfidence(dataCount, minHigh = 30, minMedium = 10) {
  if (dataCount >= minHigh) return 'high'
  if (dataCount >= minMedium) return 'medium'
  return 'low'
}

/**
 * Determines direction from change
 * @param {number} change
 * @param {number} threshold - Threshold for 'stable' (default 0.5%)
 * @returns {Direction}
 */
export function determineDirection(change, threshold = 0.5) {
  if (change > threshold) return 'up'
  if (change < -threshold) return 'down'
  return 'stable'
}

/**
 * Default thresholds for common indicator types
 */
export const DEFAULT_THRESHOLDS = {
  sales_trend: {
    critical_high: 30,
    warning_high: 15,
    warning_low: -15,
    critical_low: -30
  },
  aov: {
    critical_high: 20,
    warning_high: 10,
    warning_low: -10,
    critical_low: -20
  },
  gross_margin: {
    critical_high: 10,   // Margin increased by 10pp+
    warning_high: 5,
    warning_low: -5,     // Margin dropped by 5pp
    critical_low: -10    // Margin dropped by 10pp+
  },
  position_change: {
    critical_high: 10,   // Position dropped by 10+
    warning_high: 5,
    warning_low: -5,     // Position improved by 5+
    critical_low: -10
  },
  organic_conversion_rate: {
    critical_high: 50,
    warning_high: 25,
    warning_low: -25,
    critical_low: -50
  },
  stock_availability_risk: {
    critical_high: 5000,  // €5000+ at risk
    warning_high: 2000,   // €2000+ at risk
    warning_low: 0,
    critical_low: 0
  },
  brand_vs_nonbrand: {
    critical_high: 80,    // 80%+ brand dependent
    warning_high: 70,
    warning_low: 20,      // Too little brand (weak brand)
    critical_low: 10
  },

  // GA4 Behavioral indicators
  bounce_rate_trend: {
    critical_high: 80,    // 80%+ bounce rate is critical
    warning_high: 65,     // 65%+ needs attention
    warning_low: 20,      // Too low might indicate tracking issues
    critical_low: 10
  },
  traffic_source_mix: {
    critical_high: 80,    // 80%+ from single source = high risk
    warning_high: 60,     // 60%+ concentration = warning
    warning_low: null,
    critical_low: null
  },
  landing_page_quality: {
    critical_high: 75,    // 75%+ traffic on high-bounce pages
    warning_high: 50,     // 50%+ needs attention
    warning_low: null,
    critical_low: null
  }
}

/**
 * Indicator IDs for MVP (10 core indicators)
 */
export const MVP_INDICATORS = [
  // Sales indicators (ePages)
  'sales_trend',
  'aov',
  'gross_margin',

  // SEO indicators (GSC)
  'position_change',
  'brand_vs_nonbrand',

  // Combined indicators (GSC + ePages)
  'organic_conversion_rate',
  'stock_availability_risk',

  // Behavioral indicators (GA4) - NEW
  'bounce_rate_trend',
  'traffic_source_mix',
  'landing_page_quality'
]

/**
 * All indicator IDs
 */
export const ALL_INDICATORS = [
  ...MVP_INDICATORS,
  // Future indicators
  'revenue_concentration',
  'ctr_performance',
  'low_hanging_fruit',
  'query_revenue',
  'seo_sales_gap',
  'new_vs_returning',
  'customer_lifetime'
]

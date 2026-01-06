/**
 * Indicator Engine - Orchestrator
 *
 * Calculates all indicators for a store and saves them to the database.
 */

import { createClient } from '@supabase/supabase-js'
import { calculateSalesTrend } from './calculators/salesTrend.js'
import { calculateAOV } from './calculators/aov.js'
import { calculateGrossMargin } from './calculators/grossMargin.js'
import { calculatePositionChange } from './calculators/positionChange.js'
import { calculateBrandVsNonBrand } from './calculators/brandVsNonBrand.js'
import { calculateOrganicConversionRate } from './calculators/organicConversionRate.js'
import { calculateStockAvailabilityRisk } from './calculators/stockAvailabilityRisk.js'
import { MVP_INDICATORS } from './types.js'

/**
 * Calculate all MVP indicators for a store
 *
 * @param {Object} params
 * @param {string} params.storeId - Store UUID
 * @param {Object} params.supabase - Supabase client
 * @param {'7d' | '30d' | '90d'} params.periodLabel - Period to calculate
 * @param {Date} params.periodEnd - End date (defaults to yesterday for complete data)
 * @returns {Object} Results with calculated indicators
 */
export async function calculateAllIndicators({
  storeId,
  supabase,
  periodLabel = '30d',
  periodEnd = null // Default: yesterday (last complete day)
}) {
  // Use yesterday as default end date (current day is incomplete)
  if (!periodEnd) {
    periodEnd = new Date()
    periodEnd.setDate(periodEnd.getDate() - 1)
    periodEnd.setHours(23, 59, 59, 999)
  }
  const results = {
    success: [],
    errors: [],
    skipped: []
  }

  console.log(`\n🔧 Calculating indicators for store ${storeId}`)
  console.log(`   Period: ${periodLabel}, End: ${periodEnd.toISOString().split('T')[0]}`)

  try {
    // 1. Fetch orders data
    const periodDays = periodLabel === '7d' ? 7 : periodLabel === '30d' ? 30 : 90
    const startDate = new Date(periodEnd)
    startDate.setDate(startDate.getDate() - (periodDays * 2)) // Fetch 2x period for comparison

    const { data: orders, error: ordersError } = await supabase
      .from('orders')
      .select(`
        id,
        grand_total,
        creation_date,
        order_line_items (
          id,
          product_id,
          product_number,
          product_name,
          quantity,
          unit_price,
          total_price
        )
      `)
      .eq('store_id', storeId)
      .gte('creation_date', startDate.toISOString())
      .lte('creation_date', periodEnd.toISOString())
      .order('creation_date', { ascending: false })

    if (ordersError) {
      throw new Error(`Failed to fetch orders: ${ordersError.message}`)
    }

    console.log(`   📦 Fetched ${orders?.length || 0} orders`)

    // 2. Fetch products data (for gross margin)
    const { data: products, error: productsError } = await supabase
      .from('products')
      .select('id, epages_product_id, product_number, name, category_name, price_amount, cost_price')
      .eq('store_id', storeId)

    if (productsError) {
      console.warn(`   ⚠️ Failed to fetch products: ${productsError.message}`)
    }

    console.log(`   📦 Fetched ${products?.length || 0} products`)

    // Flatten line items for orders
    const ordersWithLineItems = (orders || []).map(order => ({
      ...order,
      line_items: order.order_line_items || []
    }))

    // 3. Calculate each indicator
    // ========================================

    // 3a. Sales Trend
    try {
      const salesTrend = calculateSalesTrend({
        orders: ordersWithLineItems,
        periodEnd,
        periodLabel
      })

      await saveIndicator(supabase, storeId, salesTrend)
      results.success.push('sales_trend')
      console.log(`   ✅ sales_trend: ${salesTrend.value} (${salesTrend.change_percent}%)`)
    } catch (err) {
      results.errors.push({ id: 'sales_trend', error: err.message })
      console.error(`   ❌ sales_trend: ${err.message}`)
    }

    // 3b. AOV
    try {
      const aov = calculateAOV({
        orders: ordersWithLineItems,
        periodEnd,
        periodLabel
      })

      await saveIndicator(supabase, storeId, aov)
      results.success.push('aov')
      console.log(`   ✅ aov: ${aov.value} SEK (${aov.change_percent}%)`)
    } catch (err) {
      results.errors.push({ id: 'aov', error: err.message })
      console.error(`   ❌ aov: ${err.message}`)
    }

    // 3c. Gross Margin
    if (products && products.length > 0) {
      try {
        const grossMargin = calculateGrossMargin({
          orders: ordersWithLineItems,
          products: products || [],
          periodEnd,
          periodLabel
        })

        await saveIndicator(supabase, storeId, grossMargin)
        results.success.push('gross_margin')
        console.log(`   ✅ gross_margin: ${grossMargin.value}% (${grossMargin.change_percent}pp)`)
      } catch (err) {
        results.errors.push({ id: 'gross_margin', error: err.message })
        console.error(`   ❌ gross_margin: ${err.message}`)
      }
    } else {
      results.skipped.push('gross_margin')
      console.log(`   ⏭️ gross_margin: skipped (no products)`)
    }

    // 4. Fetch GSC data for SEO indicators
    // ========================================
    const { data: gscData, error: gscError } = await supabase
      .from('gsc_search_analytics')
      .select('*')
      .eq('store_id', storeId)
      .gte('date', startDate.toISOString().split('T')[0])
      .lte('date', periodEnd.toISOString().split('T')[0])
      .order('date', { ascending: false })

    if (gscError) {
      console.warn(`   ⚠️ Failed to fetch GSC data: ${gscError.message}`)
    } else {
      console.log(`   📊 Fetched ${gscData?.length || 0} GSC rows`)
    }

    // 4a. Position Change
    if (gscData && gscData.length > 0) {
      try {
        const positionChange = calculatePositionChange({
          gscData,
          periodEnd,
          periodLabel
        })

        await saveIndicator(supabase, storeId, positionChange)
        results.success.push('position_change')
        console.log(`   ✅ position_change: ${positionChange.value} positions (${positionChange.metrics.improved_queries} improved, ${positionChange.metrics.declined_queries} declined)`)
      } catch (err) {
        results.errors.push({ id: 'position_change', error: err.message })
        console.error(`   ❌ position_change: ${err.message}`)
      }

      // 4b. Brand vs Non-Brand
      try {
        const brandVsNonBrand = calculateBrandVsNonBrand({
          gscData,
          periodEnd,
          periodLabel
        })

        await saveIndicator(supabase, storeId, brandVsNonBrand)
        results.success.push('brand_vs_nonbrand')
        console.log(`   ✅ brand_vs_nonbrand: ${brandVsNonBrand.value}% non-brand (${brandVsNonBrand.analysis.health})`)
      } catch (err) {
        results.errors.push({ id: 'brand_vs_nonbrand', error: err.message })
        console.error(`   ❌ brand_vs_nonbrand: ${err.message}`)
      }

      // 4c. Organic Conversion Rate
      try {
        const organicCR = calculateOrganicConversionRate({
          gscData,
          orders: ordersWithLineItems,
          periodEnd,
          periodLabel
        })

        await saveIndicator(supabase, storeId, organicCR)
        results.success.push('organic_conversion_rate')
        console.log(`   ✅ organic_conversion_rate: ${organicCR.value}% CR (${organicCR.metrics.total_clicks} clicks → ${organicCR.metrics.attributed_orders} orders)`)
      } catch (err) {
        results.errors.push({ id: 'organic_conversion_rate', error: err.message })
        console.error(`   ❌ organic_conversion_rate: ${err.message}`)
      }

      // 4d. Stock Availability Risk
      if (products && products.length > 0) {
        try {
          const stockRisk = calculateStockAvailabilityRisk({
            products,
            gscData,
            orders: ordersWithLineItems,
            periodEnd,
            periodLabel
          })

          await saveIndicator(supabase, storeId, stockRisk)
          results.success.push('stock_availability_risk')
          console.log(`   ✅ stock_availability_risk: ${stockRisk.value} SEK at risk (${stockRisk.summary.total_products_at_risk} products)`)
        } catch (err) {
          results.errors.push({ id: 'stock_availability_risk', error: err.message })
          console.error(`   ❌ stock_availability_risk: ${err.message}`)
        }
      } else {
        results.skipped.push('stock_availability_risk')
        console.log(`   ⏭️ stock_availability_risk: skipped (no products)`)
      }
    } else {
      results.skipped.push('position_change')
      results.skipped.push('brand_vs_nonbrand')
      results.skipped.push('organic_conversion_rate')
      results.skipped.push('stock_availability_risk')
      console.log(`   ⏭️ SEO indicators: skipped (no GSC data)`)
    }

    console.log(`\n✅ Done! Success: ${results.success.length}, Errors: ${results.errors.length}, Skipped: ${results.skipped.length}`)

  } catch (err) {
    console.error(`\n❌ Engine error: ${err.message}`)
    results.errors.push({ id: 'engine', error: err.message })
  }

  return results
}

/**
 * Save indicator to database using RPC
 */
async function saveIndicator(supabase, storeId, indicator) {
  // Determine numeric_value: use indicator.value if number, otherwise fallback to metrics
  let numericValue = null
  if (typeof indicator.value === 'number') {
    numericValue = indicator.value
  } else if (indicator.metrics) {
    // For sales_trend: use change_percent as the key metric
    if (indicator.id === 'sales_trend' && indicator.metrics.change_percent !== undefined) {
      numericValue = indicator.metrics.change_percent
    }
    // For other indicators with non-numeric values, try common metric fields
    else if (indicator.metrics.current_revenue !== undefined) {
      numericValue = indicator.metrics.current_revenue
    }
  }

  const { data, error } = await supabase.rpc('upsert_indicator', {
    p_store_id: storeId,
    p_indicator_id: indicator.id,
    p_indicator_category: indicator.category,
    p_period_start: indicator.period.start,
    p_period_end: indicator.period.end,
    p_period_label: indicator.period.label,
    p_value: indicator,
    p_numeric_value: numericValue,
    p_direction: indicator.direction,
    p_change_percent: indicator.change_percent,
    p_priority: indicator.priority,
    p_confidence: indicator.confidence,
    p_alert_triggered: indicator.alert_triggered
  })

  if (error) {
    throw new Error(`Failed to save ${indicator.id}: ${error.message}`)
  }

  return data
}

/**
 * Get all indicators for a store
 */
export async function getIndicators(supabase, storeId, periodLabel = '30d') {
  const { data, error } = await supabase.rpc('get_indicators', {
    p_store_id: storeId,
    p_period_label: periodLabel
  })

  if (error) {
    throw new Error(`Failed to get indicators: ${error.message}`)
  }

  return data || []
}

export default {
  calculateAllIndicators,
  getIndicators
}

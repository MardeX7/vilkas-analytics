/**
 * useStrategicIndices Hook
 *
 * Laskee 4 strategista indeksiä liiketoiminnan tilannekuvaa varten.
 * Kaikki vertailut perustuvat YoY (Year-over-Year) -vertailuun.
 *
 * Indeksit:
 * A. Kasvun laatu (Growth Quality Index) - 30%
 * B. Asiakassuhde & kysyntä (Customer Momentum Index) - 25%
 * C. Markkinanäkyvyys & kysynnän imu (Market Visibility Index) - 25%
 * D. Toimituskyky & pääoman hallinta (Execution & Capital Index) - 20%
 *
 * Jokainen indeksi 0-100, missä:
 * - 80-100: Erinomainen
 * - 60-79: Hyvä
 * - 40-59: Kohtalainen
 * - 20-39: Heikko
 * - 0-19: Kriittinen
 */

import { useState, useEffect, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { STORE_ID } from '@/config/storeConfig'

/**
 * Index weights for overall score
 */
const INDEX_WEIGHTS = {
  growth: 0.30,      // A. Kasvun laatu
  customer: 0.25,    // B. Asiakassuhde
  visibility: 0.25,  // C. Markkinanäkyvyys
  execution: 0.20    // D. Toimituskyky
}

/**
 * Normalize a YoY change percentage to 0-100 index
 *
 * Logic:
 * - +20% or better = 100 (erinomainen kasvu)
 * - +10% = 75 (hyvä kasvu)
 * - 0% = 50 (neutraali)
 * - -10% = 25 (heikko)
 * - -20% or worse = 0 (kriittinen)
 */
function normalizeYoYChange(changePercent, invertScale = false) {
  if (changePercent === null || changePercent === undefined || isNaN(changePercent)) {
    return null
  }

  // For metrics where lower is better (e.g. bounce rate), invert
  const value = invertScale ? -changePercent : changePercent

  // Map -20% to +20% range to 0-100
  // Using linear interpolation: -20% = 0, 0% = 50, +20% = 100
  const normalized = 50 + (value / 20) * 50

  // Clamp to 0-100
  return Math.max(0, Math.min(100, normalized))
}

/**
 * Normalize availability percentage to 0-100 index
 * 90%+ availability = 100, linear down to 70% = 0
 */
function normalizeAvailability(availabilityPercent) {
  if (availabilityPercent === null || availabilityPercent === undefined) {
    return null
  }

  // 90%+ = 100, 70% = 0
  const normalized = ((availabilityPercent - 70) / 20) * 100
  return Math.max(0, Math.min(100, normalized))
}

/**
 * Normalize stock days to 0-100 index
 * Lower is better: 30 days = 100, 180 days = 0
 */
function normalizeStockDays(stockDays) {
  if (stockDays === null || stockDays === undefined) {
    return null
  }

  // 30 days = 100 (excellent), 180 days = 0 (terrible)
  const normalized = ((180 - stockDays) / 150) * 100
  return Math.max(0, Math.min(100, normalized))
}

/**
 * Calculate weighted average of component values, ignoring nulls
 */
function calculateWeightedAverage(components) {
  let totalWeight = 0
  let totalValue = 0

  for (const comp of components) {
    if (comp.value !== null && comp.weight > 0) {
      totalWeight += comp.weight
      totalValue += comp.value * comp.weight
    }
  }

  if (totalWeight === 0) return null
  return Math.round(totalValue / totalWeight)
}

/**
 * Get interpretation for index value
 */
function getInterpretation(value) {
  if (value === null || value === undefined) {
    return { level: 'unknown', label: 'Ei dataa', color: 'gray' }
  }
  if (value >= 80) return { level: 'excellent', label: 'Erinomainen', color: 'emerald' }
  if (value >= 60) return { level: 'good', label: 'Hyvä', color: 'green' }
  if (value >= 40) return { level: 'fair', label: 'Kohtalainen', color: 'amber' }
  if (value >= 20) return { level: 'poor', label: 'Heikko', color: 'orange' }
  return { level: 'critical', label: 'Kriittinen', color: 'red' }
}

/**
 * Get ISO week number and year for a date
 */
function getISOWeek(date) {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + 4 - (d.getDay() || 7))
  const yearStart = new Date(d.getFullYear(), 0, 1)
  const weekNumber = Math.ceil((((d - yearStart) / 86400000) + 1) / 7)
  return { week: weekNumber, year: d.getFullYear() }
}

/**
 * Get start and end dates for a specific ISO week
 */
function getWeekDates(year, week) {
  const jan4 = new Date(year, 0, 4)
  const dayOfWeek = jan4.getDay() || 7
  const weekStart = new Date(jan4)
  weekStart.setDate(jan4.getDate() - dayOfWeek + 1 + (week - 1) * 7)
  const weekEnd = new Date(weekStart)
  weekEnd.setDate(weekStart.getDate() + 6)
  return {
    start: weekStart.toISOString().split('T')[0],
    end: weekEnd.toISOString().split('T')[0]
  }
}

/**
 * Get start and end dates for a specific month
 */
function getMonthDates(year, month) {
  const start = new Date(year, month, 1)
  const end = new Date(year, month + 1, 0) // Last day of month
  return {
    start: start.toISOString().split('T')[0],
    end: end.toISOString().split('T')[0]
  }
}

/**
 * Main hook: useStrategicIndices
 * @param {Object} options
 * @param {'week' | 'month'} options.granularity - Aikajakson tarkkuus
 */
export function useStrategicIndices({ granularity = 'week' } = {}) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [currentPeriodData, setCurrentPeriodData] = useState(null)
  const [yoyPeriodData, setYoyPeriodData] = useState(null)
  const [gscData, setGscData] = useState({ current: null, yoy: null })
  const [inventoryData, setInventoryData] = useState(null)

  // Calculate date ranges based on granularity (week or month)
  const dateRanges = useMemo(() => {
    const today = new Date()

    if (granularity === 'week') {
      // Get current week
      const { week, year } = getISOWeek(today)
      // Use previous completed week for more stable data
      const targetWeek = week > 1 ? week - 1 : 52
      const targetYear = week > 1 ? year : year - 1

      const currentDates = getWeekDates(targetYear, targetWeek)
      const yoyDates = getWeekDates(targetYear - 1, targetWeek)

      return {
        current: currentDates,
        yoy: yoyDates,
        label: `Viikko ${targetWeek}/${targetYear}`,
        yoyLabel: `Viikko ${targetWeek}/${targetYear - 1}`
      }
    } else {
      // Month granularity
      // Use previous completed month
      const targetMonth = today.getMonth() === 0 ? 11 : today.getMonth() - 1
      const targetYear = today.getMonth() === 0 ? today.getFullYear() - 1 : today.getFullYear()

      const currentDates = getMonthDates(targetYear, targetMonth)
      const yoyDates = getMonthDates(targetYear - 1, targetMonth)

      const monthNames = ['Tammikuu', 'Helmikuu', 'Maaliskuu', 'Huhtikuu', 'Toukokuu', 'Kesäkuu',
        'Heinäkuu', 'Elokuu', 'Syyskuu', 'Lokakuu', 'Marraskuu', 'Joulukuu']

      return {
        current: currentDates,
        yoy: yoyDates,
        label: `${monthNames[targetMonth]} ${targetYear}`,
        yoyLabel: `${monthNames[targetMonth]} ${targetYear - 1}`
      }
    }
  }, [granularity])

  // Fetch all data
  useEffect(() => {
    async function fetchData() {
      setLoading(true)
      setError(null)

      try {
        // Fetch current period orders
        const { data: currentOrders, error: currentError } = await supabase
          .from('orders')
          .select(`
            id, grand_total, total_before_tax, creation_date,
            billing_email, customer_id
          `)
          .eq('store_id', STORE_ID)
          .gte('creation_date', dateRanges.current.start)
          .lte('creation_date', dateRanges.current.end + 'T23:59:59')

        if (currentError) throw currentError

        // Fetch YoY period orders
        const { data: yoyOrders, error: yoyError } = await supabase
          .from('orders')
          .select(`
            id, grand_total, total_before_tax, creation_date,
            billing_email, customer_id
          `)
          .eq('store_id', STORE_ID)
          .gte('creation_date', dateRanges.yoy.start)
          .lte('creation_date', dateRanges.yoy.end + 'T23:59:59')

        if (yoyError) throw yoyError

        // Fetch current period line items for margin calculation
        const { data: currentLineItems, error: liError } = await supabase
          .from('line_items')
          .select(`
            quantity, unit_price, total_price, product_id,
            products (cost_price)
          `)
          .eq('store_id', STORE_ID)
          .in('order_id', (currentOrders || []).map(o => o.id))

        if (liError) throw liError

        // Fetch YoY period line items
        const { data: yoyLineItems, error: yoyLiError } = await supabase
          .from('line_items')
          .select(`
            quantity, unit_price, total_price, product_id,
            products (cost_price)
          `)
          .eq('store_id', STORE_ID)
          .in('order_id', (yoyOrders || []).map(o => o.id))

        if (yoyLiError) throw yoyLiError

        // Process current period
        setCurrentPeriodData(processOrderData(currentOrders || [], currentLineItems || []))
        setYoyPeriodData(processOrderData(yoyOrders || [], yoyLineItems || []))

        // Fetch GSC data for visibility metrics
        const { data: currentGsc } = await supabase
          .from('gsc_search_analytics')
          .select('clicks, impressions, position')
          .eq('store_id', STORE_ID)
          .gte('date', dateRanges.current.start)
          .lte('date', dateRanges.current.end)

        const { data: yoyGsc } = await supabase
          .from('gsc_search_analytics')
          .select('clicks, impressions, position')
          .eq('store_id', STORE_ID)
          .gte('date', dateRanges.yoy.start)
          .lte('date', dateRanges.yoy.end)

        setGscData({
          current: processGscData(currentGsc || []),
          yoy: processGscData(yoyGsc || [])
        })

        // Fetch inventory snapshot for execution metrics
        const { data: inventory } = await supabase
          .from('inventory_snapshots')
          .select('*')
          .eq('store_id', STORE_ID)
          .order('date', { ascending: false })
          .limit(1)
          .single()

        setInventoryData(inventory)

      } catch (err) {
        console.error('Failed to fetch strategic indices data:', err)
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [dateRanges])

  // Process order data into metrics
  function processOrderData(orders, lineItems) {
    if (!orders.length) {
      return {
        revenue: 0,
        grossProfit: 0,
        marginPercent: 0,
        orderCount: 0,
        aov: 0,
        uniqueCustomers: 0,
        returningCustomers: 0,
        returningPercent: 0
      }
    }

    const revenue = orders.reduce((sum, o) => sum + (o.grand_total || 0), 0)

    // Calculate gross profit from line items
    let totalCost = 0
    lineItems.forEach(li => {
      const costPrice = li.products?.cost_price || 0
      totalCost += costPrice * (li.quantity || 1)
    })
    const grossProfit = revenue - totalCost
    const marginPercent = revenue > 0 ? (grossProfit / revenue) * 100 : 0

    const orderCount = orders.length
    const aov = orderCount > 0 ? revenue / orderCount : 0

    // Customer analysis by email
    const customerMap = {}
    orders.forEach(order => {
      const email = (order.billing_email || '').toLowerCase()
      if (!email) return

      if (!customerMap[email]) {
        customerMap[email] = { orders: 0 }
      }
      customerMap[email].orders++
    })

    const uniqueCustomers = Object.keys(customerMap).length
    const returningCustomers = Object.values(customerMap).filter(c => c.orders > 1).length
    const returningPercent = uniqueCustomers > 0 ? (returningCustomers / uniqueCustomers) * 100 : 0

    return {
      revenue,
      grossProfit,
      marginPercent,
      orderCount,
      aov,
      uniqueCustomers,
      returningCustomers,
      returningPercent
    }
  }

  // Process GSC data
  function processGscData(data) {
    if (!data.length) return null

    const totalClicks = data.reduce((sum, d) => sum + (d.clicks || 0), 0)
    const totalImpressions = data.reduce((sum, d) => sum + (d.impressions || 0), 0)
    const avgPosition = data.reduce((sum, d) => sum + (d.position || 0), 0) / data.length

    return {
      clicks: totalClicks,
      impressions: totalImpressions,
      avgPosition
    }
  }

  // Calculate all indices
  const indices = useMemo(() => {
    if (!currentPeriodData || !yoyPeriodData) {
      return null
    }

    // ============================================
    // A. KASVUN LAATU (Growth Quality Index)
    // ============================================
    const revenueYoYChange = yoyPeriodData.revenue > 0
      ? ((currentPeriodData.revenue - yoyPeriodData.revenue) / yoyPeriodData.revenue) * 100
      : null

    const marginYoYChange = yoyPeriodData.grossProfit > 0
      ? ((currentPeriodData.grossProfit - yoyPeriodData.grossProfit) / yoyPeriodData.grossProfit) * 100
      : null

    const aovYoYChange = yoyPeriodData.aov > 0
      ? ((currentPeriodData.aov - yoyPeriodData.aov) / yoyPeriodData.aov) * 100
      : null

    const growthComponents = [
      { id: 'revenue', value: normalizeYoYChange(revenueYoYChange), weight: 0.40, raw: revenueYoYChange, label: 'Liikevaihto YoY' },
      { id: 'margin', value: normalizeYoYChange(marginYoYChange), weight: 0.35, raw: marginYoYChange, label: 'Myyntikate YoY' },
      { id: 'aov', value: normalizeYoYChange(aovYoYChange), weight: 0.25, raw: aovYoYChange, label: 'Keskiostos YoY' }
    ]

    const growthIndex = calculateWeightedAverage(growthComponents)

    // ============================================
    // B. ASIAKASSUHDE & KYSYNTÄ (Customer Momentum)
    // ============================================
    const customersYoYChange = yoyPeriodData.uniqueCustomers > 0
      ? ((currentPeriodData.uniqueCustomers - yoyPeriodData.uniqueCustomers) / yoyPeriodData.uniqueCustomers) * 100
      : null

    const returningYoYChange = yoyPeriodData.returningPercent > 0
      ? ((currentPeriodData.returningPercent - yoyPeriodData.returningPercent) / yoyPeriodData.returningPercent) * 100
      : null

    // LTV approximation: total revenue / unique customers
    const currentLTV = currentPeriodData.uniqueCustomers > 0
      ? currentPeriodData.revenue / currentPeriodData.uniqueCustomers
      : 0
    const yoyLTV = yoyPeriodData.uniqueCustomers > 0
      ? yoyPeriodData.revenue / yoyPeriodData.uniqueCustomers
      : 0
    const ltvYoYChange = yoyLTV > 0
      ? ((currentLTV - yoyLTV) / yoyLTV) * 100
      : null

    const customerComponents = [
      { id: 'customers', value: normalizeYoYChange(customersYoYChange), weight: 0.40, raw: customersYoYChange, label: 'Asiakkaat YoY' },
      { id: 'returning', value: normalizeYoYChange(returningYoYChange), weight: 0.35, raw: returningYoYChange, label: 'Palaavat YoY' },
      { id: 'ltv', value: normalizeYoYChange(ltvYoYChange), weight: 0.25, raw: ltvYoYChange, label: 'LTV YoY' }
    ]

    const customerIndex = calculateWeightedAverage(customerComponents)

    // ============================================
    // C. MARKKINANÄKYVYYS (Market Visibility)
    // ============================================
    let visibilityIndex = null
    let visibilityComponents = []

    if (gscData.current && gscData.yoy) {
      const clicksYoYChange = gscData.yoy.clicks > 0
        ? ((gscData.current.clicks - gscData.yoy.clicks) / gscData.yoy.clicks) * 100
        : null

      // Position: lower is better, so invert the change
      const positionYoYChange = gscData.yoy.avgPosition > 0
        ? ((gscData.yoy.avgPosition - gscData.current.avgPosition) / gscData.yoy.avgPosition) * 100
        : null

      const impressionsYoYChange = gscData.yoy.impressions > 0
        ? ((gscData.current.impressions - gscData.yoy.impressions) / gscData.yoy.impressions) * 100
        : null

      visibilityComponents = [
        { id: 'clicks', value: normalizeYoYChange(clicksYoYChange), weight: 0.40, raw: clicksYoYChange, label: 'Klikkaukset YoY' },
        { id: 'position', value: normalizeYoYChange(positionYoYChange), weight: 0.35, raw: positionYoYChange, label: 'Hakusijoitus YoY' },
        { id: 'impressions', value: normalizeYoYChange(impressionsYoYChange), weight: 0.25, raw: impressionsYoYChange, label: 'Näyttökerrat YoY' }
      ]

      visibilityIndex = calculateWeightedAverage(visibilityComponents)
    }

    // ============================================
    // D. TOIMITUSKYKY & PÄÄOMA (Execution & Capital)
    // ============================================
    let executionIndex = null
    let executionComponents = []

    if (inventoryData) {
      const inStockPercent = inventoryData.in_stock_percent || 0
      const avgStockDays = inventoryData.avg_stock_days || 90
      const outOfStockPercent = inventoryData.out_of_stock_percent || 0

      executionComponents = [
        { id: 'availability', value: normalizeAvailability(inStockPercent), weight: 0.40, raw: inStockPercent, label: 'Saatavuus %' },
        { id: 'stockDays', value: normalizeStockDays(avgStockDays), weight: 0.35, raw: avgStockDays, label: 'Varastopäivät' },
        { id: 'outOfStock', value: normalizeAvailability(100 - outOfStockPercent), weight: 0.25, raw: outOfStockPercent, label: 'Loppu-% (inv)' }
      ]

      executionIndex = calculateWeightedAverage(executionComponents)
    }

    // ============================================
    // OVERALL INDEX
    // ============================================
    const allIndices = [
      { id: 'growth', value: growthIndex, weight: INDEX_WEIGHTS.growth },
      { id: 'customer', value: customerIndex, weight: INDEX_WEIGHTS.customer },
      { id: 'visibility', value: visibilityIndex, weight: INDEX_WEIGHTS.visibility },
      { id: 'execution', value: executionIndex, weight: INDEX_WEIGHTS.execution }
    ]

    const overallIndex = calculateWeightedAverage(allIndices)

    return {
      overall: {
        value: overallIndex,
        interpretation: getInterpretation(overallIndex)
      },
      growth: {
        id: 'growth',
        name: 'Kasvun laatu',
        shortName: 'Kasvu',
        description: 'Liikevaihdon, katteen ja keskioston YoY-kehitys',
        value: growthIndex,
        interpretation: getInterpretation(growthIndex),
        weight: INDEX_WEIGHTS.growth,
        components: growthComponents,
        icon: 'TrendingUp',
        color: 'emerald'
      },
      customer: {
        id: 'customer',
        name: 'Asiakassuhde & kysyntä',
        shortName: 'Asiakkaat',
        description: 'Asiakaskannan, palaavien ja LTV:n kehitys',
        value: customerIndex,
        interpretation: getInterpretation(customerIndex),
        weight: INDEX_WEIGHTS.customer,
        components: customerComponents,
        icon: 'Users',
        color: 'violet'
      },
      visibility: {
        id: 'visibility',
        name: 'Markkinanäkyvyys',
        shortName: 'Näkyvyys',
        description: 'Orgaaninen näkyvyys ja hakukonesijoitukset',
        value: visibilityIndex,
        interpretation: getInterpretation(visibilityIndex),
        weight: INDEX_WEIGHTS.visibility,
        components: visibilityComponents,
        icon: 'Search',
        color: 'amber'
      },
      execution: {
        id: 'execution',
        name: 'Toimituskyky & pääoma',
        shortName: 'Toimitus',
        description: 'Varaston saatavuus ja pääoman tehokkuus',
        value: executionIndex,
        interpretation: getInterpretation(executionIndex),
        weight: INDEX_WEIGHTS.execution,
        components: executionComponents,
        icon: 'Package',
        color: 'blue'
      }
    }
  }, [currentPeriodData, yoyPeriodData, gscData, inventoryData])

  return {
    indices,
    loading,
    error,
    dateRanges,
    currentPeriod: currentPeriodData,
    yoyPeriod: yoyPeriodData
  }
}

export default useStrategicIndices

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useCurrentShop } from '@/config/storeConfig'

/**
 * useGrowthEngine - Hook for Growth Engine Index calculation
 *
 * Growth Engine Index koostuu 4 KPI-alueesta:
 * 1. Kysynnän kasvu (25%) - Orgaaninen liikenne
 * 2. Liikenteen laatu (15%) - Sitoutuminen ja orgaaninen osuus
 * 3. Myynnin tehokkuus (40%) - Konversio, AOV, kate, asiakasarvo
 * 4. Tuotevalikoiman teho (20%) - Top tuotteet, kategoriat, SEO-varastotilanne
 *
 * Käyttää YoY-vertailua kausivaihtelun takia.
 */
export function useGrowthEngine(dateRange = null) {
  const { storeId, ready } = useCurrentShop()

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [dataWarning, setDataWarning] = useState(null) // Warning when using fallback data
  const [effectiveDateRange, setEffectiveDateRange] = useState(null) // Actual date range used
  const [data, setData] = useState({
    // Kokonaisindeksi
    overallIndex: 0,
    indexLevel: 'poor', // poor, needs_work, good, excellent

    // KPI-alueet
    demandGrowth: {
      score: 0,
      weight: 25,
      metrics: {
        organicClicks: { current: 0, previous: 0, yoyChange: 0, score: 0 },
        impressions: { current: 0, previous: 0, yoyChange: 0, score: 0 },
        top10Keywords: { current: 0, previous: 0, yoyChange: 0, score: 0 }
      }
    },
    trafficQuality: {
      score: 0,
      weight: 15,
      metrics: {
        engagementRate: { current: 0, previous: 0, yoyChange: 0, score: 0 },
        organicShare: { current: 0, previous: 0, yoyChange: 0, score: 0 },
        bounceRate: { current: 0, previous: 0, yoyChange: 0, score: 0 }
      }
    },
    salesEfficiency: {
      score: 0,
      weight: 40,
      metrics: {
        conversionRate: { current: 0, previous: 0, yoyChange: 0, score: 0 },
        aov: { current: 0, previous: 0, yoyChange: 0, score: 0 },
        orderCount: { current: 0, previous: 0, yoyChange: 0, score: 0 },
        revenue: { current: 0, previous: 0, yoyChange: 0, score: 0 },
        uniqueCustomers: { current: 0, previous: 0, yoyChange: 0, score: 0 }
      }
    },
    productLeverage: {
      score: 0,
      weight: 20,
      metrics: {
        avgPosition: { current: 0, previous: 0, yoyChange: 0, score: 0 },
        avgCTR: { current: 0, previous: 0, yoyChange: 0, score: 0 },
        top10Pages: { current: 0, previous: 0, yoyChange: 0, score: 0 }
      }
    }
  })

  /**
   * Score calculation based on YoY change
   * YoY ≥+20% = 100pts, +10-19% = 80pts, +1-9% = 60pts
   * 0% = 50pts, -1-9% = 30pts, ≤-10% = 10pts
   * null (no data) = 50pts (neutral score)
   */
  const calculateScore = useCallback((yoyChange) => {
    // If no comparison data available, return neutral score
    if (yoyChange === null || yoyChange === undefined) return 50
    if (yoyChange >= 20) return 100
    if (yoyChange >= 10) return 80
    if (yoyChange >= 1) return 60
    if (yoyChange >= 0) return 50
    if (yoyChange >= -9) return 30
    return 10
  }, [])

  /**
   * Calculate index level from score
   */
  const getIndexLevel = useCallback((score) => {
    if (score >= 80) return 'excellent'
    if (score >= 60) return 'good'
    if (score >= 40) return 'needs_work'
    return 'poor'
  }, [])

  const fetchGrowthEngineData = useCallback(async () => {
    if (!ready || !storeId) return

    setLoading(true)
    setError(null)
    setDataWarning(null)

    try {
      // Calculate date ranges
      const now = new Date()
      let startDate = dateRange?.startDate || new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]
      let endDate = dateRange?.endDate || now.toISOString().split('T')[0]

      // ============================================
      // CHECK GSC DATA AVAILABILITY
      // Fall back to last COMPLETE week if requested period is incomplete
      // ============================================
      const { data: latestGscData } = await supabase
        .from('v_gsc_daily_summary')
        .select('date')
        .eq('store_id', storeId)
        .order('date', { ascending: false })
        .limit(1)

      const latestGscDate = latestGscData?.[0]?.date || null

      if (latestGscDate) {
        // Check how many days of GSC data exist in the requested period
        const { data: periodGscDays } = await supabase
          .from('v_gsc_daily_summary')
          .select('date')
          .eq('store_id', storeId)
          .gte('date', startDate)
          .lte('date', endDate)

        // Calculate expected days in period
        const periodStart = new Date(startDate)
        const periodEnd = new Date(endDate)
        const expectedDays = Math.round((periodEnd - periodStart) / (24 * 60 * 60 * 1000)) + 1
        const actualDays = periodGscDays?.length || 0

        // If period is incomplete (less than 80% of expected days), fall back to last complete week
        const isIncomplete = actualDays < expectedDays * 0.8

        if (isIncomplete) {
          // Find the last COMPLETE ISO week
          const latestDate = new Date(latestGscDate)

          // Get ISO week number and find the PREVIOUS complete week
          const getISOWeekStart = (date) => {
            const d = new Date(date)
            const day = d.getDay()
            const diff = d.getDate() - day + (day === 0 ? -6 : 1) // Monday
            return new Date(d.setDate(diff))
          }

          // Start from the week of latestGscDate and go back to find a complete one
          let weekStart = getISOWeekStart(latestDate)
          let weekEnd = new Date(weekStart)
          weekEnd.setDate(weekStart.getDate() + 6)

          // Check if this week is complete
          const { data: weekDays } = await supabase
            .from('v_gsc_daily_summary')
            .select('date')
            .eq('store_id', storeId)
            .gte('date', weekStart.toISOString().split('T')[0])
            .lte('date', weekEnd.toISOString().split('T')[0])

          // If current week incomplete, go back one week
          if (!weekDays || weekDays.length < 7) {
            weekStart.setDate(weekStart.getDate() - 7)
            weekEnd.setDate(weekEnd.getDate() - 7)
          }

          startDate = weekStart.toISOString().split('T')[0]
          endDate = weekEnd.toISOString().split('T')[0]

          setDataWarning(`GSC-data ei ole valmis valitulle jaksolle (${actualDays}/${expectedDays} päivää). Näytetään viimeisin täysi viikko: ${startDate} - ${endDate}`)
          setEffectiveDateRange({ startDate, endDate })
        } else {
          setEffectiveDateRange({ startDate, endDate })
        }
      }

      // YoY comparison dates
      const startDateObj = new Date(startDate)
      const endDateObj = new Date(endDate)
      const prevYearStart = new Date(startDateObj)
      prevYearStart.setFullYear(prevYearStart.getFullYear() - 1)
      const prevYearEnd = new Date(endDateObj)
      prevYearEnd.setFullYear(prevYearEnd.getFullYear() - 1)

      const prevStartStr = prevYearStart.toISOString().split('T')[0]
      const prevEndStr = prevYearEnd.toISOString().split('T')[0]

      // ============================================
      // 1. KYSYNNÄN KASVU (Demand Growth)
      // ============================================

      // Fetch current period GSC data WITH dates for fair YoY comparison
      // IMPORTANT: We only compare days that have data in BOTH current and previous year
      const [
        { data: currentGscDaily },
        { data: prevGscDaily },
        { data: currentKeywords },
        { data: prevKeywords }
      ] = await Promise.all([
        supabase
          .from('v_gsc_daily_summary')
          .select('date, total_clicks, total_impressions')
          .eq('store_id', storeId)
          .gte('date', startDate)
          .lte('date', endDate),
        supabase
          .from('v_gsc_daily_summary')
          .select('date, total_clicks, total_impressions')
          .eq('store_id', storeId)
          .gte('date', prevStartStr)
          .lte('date', prevEndStr),
        supabase
          .from('gsc_search_analytics')
          .select('date, query, position')
          .eq('store_id', storeId)
          .not('query', 'is', null)
          .gte('date', startDate)
          .lte('date', endDate),
        supabase
          .from('gsc_search_analytics')
          .select('date, query, position')
          .eq('store_id', storeId)
          .not('query', 'is', null)
          .gte('date', prevStartStr)
          .lte('date', prevEndStr)
      ])

      // =====================================================
      // FAIR YoY COMPARISON: Only compare matching days
      // If current period has 2 days of data, only compare to same 2 days from last year
      // =====================================================

      // Build map of previous year data by day-of-month (e.g., "01-18" -> data)
      const prevDataByDay = new Map()
      prevGscDaily?.forEach(d => {
        // Extract MM-DD from date to match with current year
        const dayKey = d.date.slice(5) // "2025-01-18" -> "01-18"
        prevDataByDay.set(dayKey, d)
      })

      // Only sum data from days that exist in current period
      let currentClicks = 0
      let currentImpressions = 0
      let prevClicks = 0
      let prevImpressions = 0
      let matchedDays = 0

      currentGscDaily?.forEach(d => {
        const dayKey = d.date.slice(5) // "2026-01-18" -> "01-18"
        const prevDay = prevDataByDay.get(dayKey)

        if (prevDay) {
          // Both years have data for this day - include in comparison
          currentClicks += d.total_clicks || 0
          currentImpressions += d.total_impressions || 0
          prevClicks += prevDay.total_clicks || 0
          prevImpressions += prevDay.total_impressions || 0
          matchedDays++
        }
      })

      // Calculate YoY only if we have matched days
      // Handle missing YoY data: if no previous data, return null to indicate "no comparison available"
      const clicksYoY = (matchedDays > 0 && prevClicks > 0) ? ((currentClicks - prevClicks) / prevClicks) * 100 : null
      const impressionsYoY = (matchedDays > 0 && prevImpressions > 0) ? ((currentImpressions - prevImpressions) / prevImpressions) * 100 : null

      // Log for debugging
      console.log(`GSC YoY: ${matchedDays} matched days, current: ${currentClicks} clicks, prev: ${prevClicks} clicks, YoY: ${clicksYoY?.toFixed(1)}%`)

      // =====================================================
      // TOP 10 KEYWORDS - FAIR YoY COMPARISON
      // Only count keywords from days that exist in both periods
      // =====================================================

      // Get dates that exist in current period (from GSC daily data)
      const currentDatesSet = new Set(currentGscDaily?.map(d => d.date.slice(5)) || [])

      // Filter keywords to only matching days
      const currentKeywordsFiltered = currentKeywords?.filter(row => {
        const dayKey = row.date?.slice(5) // "2026-01-18" -> "01-18"
        return dayKey && currentDatesSet.has(dayKey) && prevDataByDay.has(dayKey)
      }) || []

      const prevKeywordsFiltered = prevKeywords?.filter(row => {
        const dayKey = row.date?.slice(5) // "2025-01-18" -> "01-18"
        return dayKey && currentDatesSet.has(dayKey)
      }) || []

      // Calculate top 10 keywords from filtered data
      const currentTop10Map = new Map()
      currentKeywordsFiltered.forEach(row => {
        if (row.query) {
          const current = currentTop10Map.get(row.query)
          if (!current || row.position < current) {
            currentTop10Map.set(row.query, row.position)
          }
        }
      })
      const currentTop10 = Array.from(currentTop10Map.values()).filter(pos => pos <= 10).length

      const prevTop10Map = new Map()
      prevKeywordsFiltered.forEach(row => {
        if (row.query) {
          const current = prevTop10Map.get(row.query)
          if (!current || row.position < current) {
            prevTop10Map.set(row.query, row.position)
          }
        }
      })
      const prevTop10 = Array.from(prevTop10Map.values()).filter(pos => pos <= 10).length
      const top10YoY = (matchedDays > 0 && prevTop10 > 0) ? ((currentTop10 - prevTop10) / prevTop10) * 100 : null

      console.log(`GSC Top10: ${matchedDays} matched days, current: ${currentTop10} keywords, prev: ${prevTop10} keywords, YoY: ${top10YoY?.toFixed(1)}%`)

      // ============================================
      // 2. LIIKENTEEN LAATU (Traffic Quality)
      // ============================================

      // Fetch GA4 engagement data (if available)
      const [
        { data: currentGA4 },
        { data: prevGA4 }
      ] = await Promise.all([
        supabase
          .from('v_ga4_daily_summary')
          .select('total_sessions, total_engaged_sessions')
          .eq('store_id', storeId)
          .gte('date', startDate)
          .lte('date', endDate),
        supabase
          .from('v_ga4_daily_summary')
          .select('total_sessions, total_engaged_sessions')
          .eq('store_id', storeId)
          .gte('date', prevStartStr)
          .lte('date', prevEndStr)
      ])

      // Engagement rate (engaged sessions / total sessions)
      const currentSessions = currentGA4?.reduce((sum, d) => sum + (d.total_sessions || 0), 0) || 0
      const currentEngaged = currentGA4?.reduce((sum, d) => sum + (d.total_engaged_sessions || 0), 0) || 0
      const currentEngagementRate = currentSessions > 0 ? (currentEngaged / currentSessions) * 100 : 0

      const prevSessions = prevGA4?.reduce((sum, d) => sum + (d.total_sessions || 0), 0) || 0
      const prevEngaged = prevGA4?.reduce((sum, d) => sum + (d.total_engaged_sessions || 0), 0) || 0
      const prevEngagementRate = prevSessions > 0 ? (prevEngaged / prevSessions) * 100 : 0
      const engagementYoY = prevEngagementRate > 0 ? ((currentEngagementRate - prevEngagementRate) / prevEngagementRate) * 100 : null

      // Data completeness check for conversion calculation
      // Require at least 50% of expected days to have GA4 data
      const periodDays = Math.ceil((new Date(endDate) - new Date(startDate)) / (1000 * 60 * 60 * 24)) + 1
      const currentGA4Days = currentGA4?.length || 0
      const prevGA4Days = prevGA4?.length || 0
      const minRequiredDays = Math.floor(periodDays * 0.5) // 50% threshold
      const hasEnoughCurrentGA4 = currentGA4Days >= minRequiredDays
      const hasEnoughPrevGA4 = prevGA4Days >= minRequiredDays

      // Organic share - GA4 organic sessions / total sessions
      // Fetch organic sessions from GA4 (medium = 'organic')
      const [
        { data: currentOrganicGA4 },
        { data: prevOrganicGA4 }
      ] = await Promise.all([
        supabase
          .from('ga4_analytics')
          .select('sessions')
          .eq('store_id', storeId)
          .eq('session_medium', 'organic')
          .gte('date', startDate)
          .lte('date', endDate),
        supabase
          .from('ga4_analytics')
          .select('sessions')
          .eq('store_id', storeId)
          .eq('session_medium', 'organic')
          .gte('date', prevStartStr)
          .lte('date', prevEndStr)
      ])

      const currentOrganicSessions = currentOrganicGA4?.reduce((sum, d) => sum + (d.sessions || 0), 0) || 0
      const prevOrganicSessions = prevOrganicGA4?.reduce((sum, d) => sum + (d.sessions || 0), 0) || 0

      let currentOrganicShare = null
      let prevOrganicShare = null
      let organicShareYoY = null

      if (currentSessions > 0) {
        currentOrganicShare = (currentOrganicSessions / currentSessions) * 100
      }
      if (prevSessions > 0) {
        prevOrganicShare = (prevOrganicSessions / prevSessions) * 100
      }
      if (currentOrganicShare !== null && prevOrganicShare !== null && prevOrganicShare > 0) {
        organicShareYoY = ((currentOrganicShare - prevOrganicShare) / prevOrganicShare) * 100
      }

      console.log(`Organic share: ${currentOrganicSessions}/${currentSessions} = ${currentOrganicShare?.toFixed(1)}%`)

      // Bounce rate (inverse - lower is better, so we invert the YoY for scoring)
      const currentBounceRate = currentSessions > 0 ? ((currentSessions - currentEngaged) / currentSessions) * 100 : null
      const prevBounceRate = prevSessions > 0 ? ((prevSessions - prevEngaged) / prevSessions) * 100 : null
      // Invert: if bounce rate decreased, that's good (positive YoY for scoring)
      const bounceRateYoY = (prevBounceRate !== null && prevBounceRate > 0)
        ? -((currentBounceRate - prevBounceRate) / prevBounceRate) * 100
        : null

      // ============================================
      // 3. MYYNNIN TEHOKKUUS (Sales Efficiency)
      // ============================================

      // Fetch orders with customer and margin data
      // IMPORTANT: Also fetch ALL historical orders to calculate returning customers correctly
      const [
        { data: currentOrders },
        { data: prevOrders },
        { data: allHistoricalOrders },
        { data: products }
      ] = await Promise.all([
        supabase
          .from('orders')
          .select(`
            id, grand_total, billing_email, status,
            order_line_items (quantity, total_price, product_number, product_name)
          `)
          .eq('store_id', storeId)
          .neq('status', 'cancelled')
          .gte('creation_date', startDate)
          .lte('creation_date', endDate + 'T23:59:59'),
        supabase
          .from('orders')
          .select(`
            id, grand_total, billing_email, status,
            order_line_items (quantity, total_price, product_number, product_name)
          `)
          .eq('store_id', storeId)
          .neq('status', 'cancelled')
          .gte('creation_date', prevStartStr)
          .lte('creation_date', prevEndStr + 'T23:59:59'),
        // Fetch ALL orders to determine if a customer is truly returning
        supabase
          .from('orders')
          .select('id, billing_email, creation_date, grand_total')
          .eq('store_id', storeId)
          .neq('status', 'cancelled')
          .lte('creation_date', endDate + 'T23:59:59')
          .order('creation_date', { ascending: true }),
        supabase
          .from('products')
          .select('product_number, name, cost_price')
          .eq('store_id', storeId)
      ])

      // Build cost price maps - use BOTH product_number and name for matching
      // (order_line_items.product_number often doesn't match products.product_number)
      const costByNumber = new Map()
      const costByName = new Map()
      products?.forEach(p => {
        if (p.product_number && p.cost_price) {
          costByNumber.set(p.product_number, p.cost_price)
        }
        if (p.name && p.cost_price) {
          // Store by exact name
          costByName.set(p.name, p.cost_price)
          // Also store by first 15 chars for partial match
          costByName.set(p.name.substring(0, 15), p.cost_price)
        }
      })

      // Helper function to find cost price
      const findCostPrice = (productNumber, productName) => {
        // First try by product_number
        if (productNumber && costByNumber.has(productNumber)) {
          return costByNumber.get(productNumber)
        }
        // Then try by exact name
        if (productName && costByName.has(productName)) {
          return costByName.get(productName)
        }
        // Then try by partial name (first 15 chars)
        if (productName && costByName.has(productName.substring(0, 15))) {
          return costByName.get(productName.substring(0, 15))
        }
        return 0
      }

      // Calculate current period metrics
      const currentOrderCount = currentOrders?.length || 0
      const currentRevenue = currentOrders?.reduce((sum, o) => sum + (o.grand_total || 0), 0) || 0
      const currentAOV = currentOrderCount > 0 ? currentRevenue / currentOrderCount : 0

      // Gross margin calculation
      let currentCost = 0
      currentOrders?.forEach(o => {
        o.order_line_items?.forEach(item => {
          const cost = findCostPrice(item.product_number, item.product_name)
          currentCost += cost * (item.quantity || 1)
        })
      })
      const currentGrossProfit = currentRevenue - currentCost
      const currentGrossMargin = currentRevenue > 0 ? (currentGrossProfit / currentRevenue) * 100 : 0
      const currentMarginPerOrder = currentOrderCount > 0 ? currentGrossProfit / currentOrderCount : 0

      // =====================================================
      // RETURNING CUSTOMER CALCULATION - using historical data
      // =====================================================
      // Build a map of ALL customers and their first order date
      const customerFirstOrder = new Map()
      const customerTotalOrders = new Map()
      const customerTotalRevenue = new Map()

      allHistoricalOrders?.forEach(o => {
        const email = (o.billing_email || '').toLowerCase()
        if (email) {
          // Track first order date
          if (!customerFirstOrder.has(email)) {
            customerFirstOrder.set(email, o.creation_date)
          }
          // Track total order count
          customerTotalOrders.set(email, (customerTotalOrders.get(email) || 0) + 1)
          // Track total revenue
          customerTotalRevenue.set(email, (customerTotalRevenue.get(email) || 0) + (o.grand_total || 0))
        }
      })

      // Now analyze customers in the current period
      const currentPeriodCustomers = new Set()
      currentOrders?.forEach(o => {
        const email = (o.billing_email || '').toLowerCase()
        if (email) currentPeriodCustomers.add(email)
      })

      // A customer is "returning" if they had orders BEFORE the current period
      let currentReturningCustomers = 0
      let currentNewCustomers = 0
      let currentReturningRevenue = 0
      let currentNewRevenue = 0

      currentPeriodCustomers.forEach(email => {
        const firstOrderDate = customerFirstOrder.get(email)
        const isReturning = firstOrderDate && firstOrderDate < startDate

        if (isReturning) {
          currentReturningCustomers++
          // Sum their revenue in current period
          currentOrders?.forEach(o => {
            if ((o.billing_email || '').toLowerCase() === email) {
              currentReturningRevenue += o.grand_total || 0
            }
          })
        } else {
          currentNewCustomers++
          currentOrders?.forEach(o => {
            if ((o.billing_email || '').toLowerCase() === email) {
              currentNewRevenue += o.grand_total || 0
            }
          })
        }
      })

      const currentUniqueCustomers = currentPeriodCustomers.size
      const currentReturnShare = currentUniqueCustomers > 0
        ? (currentReturningCustomers / currentUniqueCustomers) * 100
        : null

      // LTV multiplier: average revenue of returning customers vs new customers
      const currentNewAvg = currentNewCustomers > 0 ? currentNewRevenue / currentNewCustomers : 0
      const currentReturningAvg = currentReturningCustomers > 0 ? currentReturningRevenue / currentReturningCustomers : 0
      // Only calculate if we have both new and returning customers
      const currentLTVMultiplier = (currentNewAvg > 0 && currentReturningCustomers > 0)
        ? currentReturningAvg / currentNewAvg
        : null

      // Conversion rate (orders / sessions)
      // Only calculate if we have ENOUGH GA4 session data to be meaningful
      // Requires at least 50% of expected days to avoid misleading metrics
      const currentConversionRate = (currentSessions > 0 && hasEnoughCurrentGA4)
        ? (currentOrderCount / currentSessions) * 100
        : null

      // Calculate previous period metrics
      const prevOrderCount = prevOrders?.length || 0
      const prevRevenue = prevOrders?.reduce((sum, o) => sum + (o.grand_total || 0), 0) || 0
      const prevAOV = prevOrderCount > 0 ? prevRevenue / prevOrderCount : 0

      let prevCost = 0
      prevOrders?.forEach(o => {
        o.order_line_items?.forEach(item => {
          const cost = findCostPrice(item.product_number, item.product_name)
          prevCost += cost * (item.quantity || 1)
        })
      })
      const prevGrossProfit = prevRevenue - prevCost
      const prevGrossMargin = prevRevenue > 0 ? (prevGrossProfit / prevRevenue) * 100 : 0
      const prevMarginPerOrder = prevOrderCount > 0 ? prevGrossProfit / prevOrderCount : 0

      // Previous period returning customer calculation
      // Build historical customer map for previous period (orders before prevStartStr)
      const prevPeriodCustomerFirstOrder = new Map()
      allHistoricalOrders?.forEach(o => {
        const orderDate = o.creation_date?.split('T')[0] || ''
        if (orderDate < prevStartStr) {
          const email = (o.billing_email || '').toLowerCase()
          if (email && !prevPeriodCustomerFirstOrder.has(email)) {
            prevPeriodCustomerFirstOrder.set(email, orderDate)
          }
        }
      })

      const prevPeriodCustomers = new Set()
      prevOrders?.forEach(o => {
        const email = (o.billing_email || '').toLowerCase()
        if (email) prevPeriodCustomers.add(email)
      })

      let prevReturningCustomers = 0
      let prevNewCustomers = 0
      let prevReturningRevenue = 0
      let prevNewRevenue = 0

      prevPeriodCustomers.forEach(email => {
        const hadOrderBefore = prevPeriodCustomerFirstOrder.has(email)

        if (hadOrderBefore) {
          prevReturningCustomers++
          prevOrders?.forEach(o => {
            if ((o.billing_email || '').toLowerCase() === email) {
              prevReturningRevenue += o.grand_total || 0
            }
          })
        } else {
          prevNewCustomers++
          prevOrders?.forEach(o => {
            if ((o.billing_email || '').toLowerCase() === email) {
              prevNewRevenue += o.grand_total || 0
            }
          })
        }
      })

      const prevUniqueCustomers = prevPeriodCustomers.size
      const prevReturnShare = prevUniqueCustomers > 0
        ? (prevReturningCustomers / prevUniqueCustomers) * 100
        : null

      const prevNewAvg = prevNewCustomers > 0 ? prevNewRevenue / prevNewCustomers : 0
      const prevReturningAvg = prevReturningCustomers > 0 ? prevReturningRevenue / prevReturningCustomers : 0
      const prevLTVMultiplier = (prevNewAvg > 0 && prevReturningCustomers > 0)
        ? prevReturningAvg / prevNewAvg
        : null

      const prevConversionRate = (prevSessions > 0 && hasEnoughPrevGA4)
        ? (prevOrderCount / prevSessions) * 100
        : null

      // Calculate YoY changes - return null if either current or previous is null/0
      // Also reject unrealistic changes (>500%) which indicate data quality issues
      let conversionYoY = (currentConversionRate !== null && prevConversionRate !== null && prevConversionRate > 0)
        ? ((currentConversionRate - prevConversionRate) / prevConversionRate) * 100
        : null

      // Cap extreme YoY changes that are likely data artifacts
      if (conversionYoY !== null && Math.abs(conversionYoY) > 500) {
        console.warn(`Conversion YoY ${conversionYoY.toFixed(1)}% capped due to likely data quality issue`)
        conversionYoY = null // Don't show unrealistic values
      }
      const aovYoY = (prevAOV > 0)
        ? ((currentAOV - prevAOV) / prevAOV) * 100
        : null

      // Order count YoY - RELIABLE (orders data exists for both years)
      const orderCountYoY = (prevOrderCount > 0)
        ? ((currentOrderCount - prevOrderCount) / prevOrderCount) * 100
        : null

      // Revenue YoY - RELIABLE (orders data exists for both years)
      const revenueYoY = (prevRevenue > 0)
        ? ((currentRevenue - prevRevenue) / prevRevenue) * 100
        : null

      // Unique customers YoY - RELIABLE (orders data exists for both years)
      const uniqueCustomersYoY = (prevUniqueCustomers > 0)
        ? ((currentUniqueCustomers - prevUniqueCustomers) / prevUniqueCustomers) * 100
        : null

      // Note: Margin YoY removed - now using GSC-based product metrics instead

      // ============================================
      // 4. SIVUSTON SEO-TEHO (Site SEO Performance)
      // GSC-pohjaiset metriikat - LUOTETTAVA YoY-data
      // ============================================

      // Calculate average position and CTR from ALL GSC data (already fetched above)
      // Use the daily summary for totals - already have currentClicks, currentImpressions, prevClicks, prevImpressions

      // Calculate average CTR
      const currentAvgCTR = currentImpressions > 0
        ? (currentClicks / currentImpressions) * 100
        : null
      const prevAvgCTR = prevImpressions > 0
        ? (prevClicks / prevImpressions) * 100
        : null

      // Calculate average position from GSC analytics data
      const { data: currentPositionData } = await supabase
        .from('gsc_search_analytics')
        .select('position, clicks')
        .eq('store_id', storeId)
        .gte('date', startDate)
        .lte('date', endDate)
        .gt('clicks', 0)

      const { data: prevPositionData } = await supabase
        .from('gsc_search_analytics')
        .select('position, clicks')
        .eq('store_id', storeId)
        .gte('date', prevStartStr)
        .lte('date', prevEndStr)
        .gt('clicks', 0)

      // Calculate weighted average position (weighted by clicks)
      const calcWeightedPosition = (data) => {
        if (!data || data.length === 0) return null
        const totalClicks = data.reduce((sum, row) => sum + (row.clicks || 0), 0)
        if (totalClicks === 0) return null
        const weightedSum = data.reduce((sum, row) => sum + (row.position || 0) * (row.clicks || 0), 0)
        return weightedSum / totalClicks
      }

      const currentAvgPosition = calcWeightedPosition(currentPositionData)
      const prevAvgPosition = calcWeightedPosition(prevPositionData)

      // Calculate YoY changes
      // For position: LOWER is better, so we INVERT the change (positive = improved = moved up)
      const avgPositionYoY = (prevAvgPosition !== null && prevAvgPosition > 0 && currentAvgPosition !== null)
        ? -((currentAvgPosition - prevAvgPosition) / prevAvgPosition) * 100  // Inverted: decrease = positive
        : null
      const avgCTRYoY = (prevAvgCTR !== null && prevAvgCTR > 0)
        ? ((currentAvgCTR - prevAvgCTR) / prevAvgCTR) * 100
        : null

      console.log(`Site SEO: Avg position ${currentAvgPosition?.toFixed(1)} (prev: ${prevAvgPosition?.toFixed(1)}), CTR: ${currentAvgCTR?.toFixed(2)}%`)

      // Top 10 Pages - unique pages with average position <= 10
      // Count unique pages that appear in top 10 search results
      const countTop10Pages = (data) => {
        if (!data || data.length === 0) return 0
        // Group by page, calculate weighted average position
        const pagePositions = new Map()
        data.forEach(row => {
          if (!row.page) return
          const existing = pagePositions.get(row.page) || { totalClicks: 0, weightedPosition: 0 }
          existing.totalClicks += row.clicks || 0
          existing.weightedPosition += (row.position || 0) * (row.clicks || 0)
          pagePositions.set(row.page, existing)
        })
        // Count pages with average position <= 10
        let top10Count = 0
        pagePositions.forEach(data => {
          if (data.totalClicks > 0) {
            const avgPos = data.weightedPosition / data.totalClicks
            if (avgPos <= 10) top10Count++
          }
        })
        return top10Count
      }

      // Fetch page-level data for current period
      const { data: currentPagesData } = await supabase
        .from('gsc_search_analytics')
        .select('page, position, clicks')
        .eq('store_id', storeId)
        .gte('date', startDate)
        .lte('date', endDate)
        .gt('clicks', 0)

      // Fetch page-level data for previous period
      const { data: prevPagesData } = await supabase
        .from('gsc_search_analytics')
        .select('page, position, clicks')
        .eq('store_id', storeId)
        .gte('date', prevStartStr)
        .lte('date', prevEndStr)
        .gt('clicks', 0)

      const currentTop10Pages = countTop10Pages(currentPagesData)
      const prevTop10Pages = countTop10Pages(prevPagesData)

      const top10PagesYoY = (prevTop10Pages > 0)
        ? ((currentTop10Pages - prevTop10Pages) / prevTop10Pages) * 100
        : null

      console.log(`Top 10 pages: ${currentTop10Pages} (prev: ${prevTop10Pages})`)

      // ============================================
      // CALCULATE SCORES
      // ============================================

      // Helper to safely round values (returns null if input is null)
      const safeRound = (val, decimals = 1) => {
        if (val === null || val === undefined) return null
        const multiplier = Math.pow(10, decimals)
        return Math.round(val * multiplier) / multiplier
      }

      const demandGrowthMetrics = {
        organicClicks: {
          current: currentClicks,
          previous: prevClicks,
          yoyChange: safeRound(clicksYoY),
          score: calculateScore(clicksYoY)
        },
        impressions: {
          current: currentImpressions,
          previous: prevImpressions,
          yoyChange: safeRound(impressionsYoY),
          score: calculateScore(impressionsYoY)
        },
        top10Keywords: {
          current: currentTop10,
          previous: prevTop10,
          yoyChange: safeRound(top10YoY),
          score: calculateScore(top10YoY)
        }
      }
      const demandGrowthScore = Math.round(
        (demandGrowthMetrics.organicClicks.score +
         demandGrowthMetrics.impressions.score +
         demandGrowthMetrics.top10Keywords.score) / 3
      )

      const trafficQualityMetrics = {
        engagementRate: {
          current: safeRound(currentEngagementRate),
          previous: safeRound(prevEngagementRate),
          yoyChange: safeRound(engagementYoY),
          score: calculateScore(engagementYoY)
        },
        organicShare: {
          current: safeRound(currentOrganicShare),
          previous: safeRound(prevOrganicShare),
          yoyChange: safeRound(organicShareYoY),
          score: calculateScore(organicShareYoY)
        },
        bounceRate: {
          current: safeRound(currentBounceRate),
          previous: safeRound(prevBounceRate),
          yoyChange: safeRound(bounceRateYoY),
          score: calculateScore(bounceRateYoY)
        }
      }
      const trafficQualityScore = Math.round(
        (trafficQualityMetrics.engagementRate.score +
         trafficQualityMetrics.organicShare.score +
         trafficQualityMetrics.bounceRate.score) / 3
      )

      const salesEfficiencyMetrics = {
        conversionRate: {
          current: safeRound(currentConversionRate, 2),
          previous: safeRound(prevConversionRate, 2),
          yoyChange: safeRound(conversionYoY),
          score: calculateScore(conversionYoY)
        },
        aov: {
          current: currentAOV > 0 ? Math.round(currentAOV) : null,
          previous: prevAOV > 0 ? Math.round(prevAOV) : null,
          yoyChange: safeRound(aovYoY),
          score: calculateScore(aovYoY)
        },
        orderCount: {
          current: currentOrderCount,
          previous: prevOrderCount,
          yoyChange: safeRound(orderCountYoY),
          score: calculateScore(orderCountYoY)
        },
        revenue: {
          current: currentRevenue > 0 ? Math.round(currentRevenue) : null,
          previous: prevRevenue > 0 ? Math.round(prevRevenue) : null,
          yoyChange: safeRound(revenueYoY),
          score: calculateScore(revenueYoY)
        },
        uniqueCustomers: {
          current: currentUniqueCustomers,
          previous: prevUniqueCustomers,
          yoyChange: safeRound(uniqueCustomersYoY),
          score: calculateScore(uniqueCustomersYoY)
        }
      }
      const salesEfficiencyScore = Math.round(
        (salesEfficiencyMetrics.conversionRate.score +
         salesEfficiencyMetrics.aov.score +
         salesEfficiencyMetrics.orderCount.score +
         salesEfficiencyMetrics.revenue.score +
         salesEfficiencyMetrics.uniqueCustomers.score) / 5
      )

      const productLeverageMetrics = {
        avgPosition: {
          current: safeRound(currentAvgPosition, 1),
          previous: safeRound(prevAvgPosition, 1),
          yoyChange: safeRound(avgPositionYoY),
          score: calculateScore(avgPositionYoY)
        },
        avgCTR: {
          current: safeRound(currentAvgCTR, 2),
          previous: safeRound(prevAvgCTR, 2),
          yoyChange: safeRound(avgCTRYoY),
          score: calculateScore(avgCTRYoY)
        },
        top10Pages: {
          current: currentTop10Pages,
          previous: prevTop10Pages,
          yoyChange: safeRound(top10PagesYoY),
          score: calculateScore(top10PagesYoY)
        }
      }
      const productLeverageScore = Math.round(
        (productLeverageMetrics.avgPosition.score +
         productLeverageMetrics.avgCTR.score +
         productLeverageMetrics.top10Pages.score) / 3
      )

      // Calculate overall index with weights
      const overallIndex = Math.round(
        (demandGrowthScore * 0.25) +
        (trafficQualityScore * 0.15) +
        (salesEfficiencyScore * 0.40) +
        (productLeverageScore * 0.20)
      )

      setData({
        overallIndex,
        indexLevel: getIndexLevel(overallIndex),
        demandGrowth: {
          score: demandGrowthScore,
          weight: 25,
          metrics: demandGrowthMetrics
        },
        trafficQuality: {
          score: trafficQualityScore,
          weight: 15,
          metrics: trafficQualityMetrics
        },
        salesEfficiency: {
          score: salesEfficiencyScore,
          weight: 40,
          metrics: salesEfficiencyMetrics
        },
        productLeverage: {
          score: productLeverageScore,
          weight: 20,
          metrics: productLeverageMetrics
        }
      })

    } catch (err) {
      console.error('Growth Engine fetch error:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [storeId, dateRange?.startDate, dateRange?.endDate, calculateScore, getIndexLevel])

  useEffect(() => {
    fetchGrowthEngineData()
  }, [fetchGrowthEngineData])

  return {
    ...data,
    loading,
    error,
    dataWarning,        // Warning message if fallback period is used
    effectiveDateRange, // Actual date range used (may differ from requested if GSC data missing)
    refresh: fetchGrowthEngineData
  }
}

export default useGrowthEngine

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useCurrentShop } from '@/config/storeConfig'

// Helper to fetch all rows with pagination (Supabase has 1000 row limit per request)
async function fetchAllRows(query, pageSize = 1000) {
  let allRows = []
  let page = 0
  let hasMore = true

  while (hasMore) {
    const from = page * pageSize
    const to = from + pageSize - 1
    const { data, error } = await query.range(from, to)

    if (error) throw error
    if (!data || data.length === 0) {
      hasMore = false
    } else {
      allRows = allRows.concat(data)
      hasMore = data.length === pageSize
      page++
    }
  }

  return allRows
}

export function useGSC(dateRange = null, comparisonMode = 'mom') {
  const { storeId, ready } = useCurrentShop()

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [connected, setConnected] = useState(false)
  const [data, setData] = useState({
    dailySummary: [],
    topQueries: [],
    topPages: [],
    deviceBreakdown: [],
    countryBreakdown: [],
    summary: null,
    // SEO KPIs
    keywordBuckets: { top3: 0, top10: 0, top20: 0, beyond20: 0 },
    totalUniqueKeywords: 0,
    page1Keywords: 0,
    // Previous period keyword data
    previousKeywordBuckets: { top3: 0, top10: 0, top20: 0, beyond20: 0 },
    previousTotalUniqueKeywords: 0,
    previousPage1Keywords: 0,
    // Comparison data
    previousDailySummary: [],
    previousSummary: null,
    comparisonEnabled: false,
    comparisonMode: 'mom',
    // Risk Radar data
    riskRadar: {
      decliningPages: [],      // Top 20 pages with clicks↓ & position↓ (2 weeks in a row)
      snippetProblems: [],     // CTR drop without position drop = title/description issue
      competitorThreats: []    // Position drop without impressions drop = competitor/relevance
    }
  })

  const fetchGSCData = useCallback(async () => {
    if (!ready || !storeId) return

    setLoading(true)
    setError(null)

    try {
      // Check if GSC is connected
      const { data: tokens } = await supabase
        .from('gsc_tokens')
        .select('site_url')
        .eq('store_id', storeId)

      if (!tokens || tokens.length === 0) {
        setConnected(false)
        setLoading(false)
        return
      }

      setConnected(true)

      const startDate = dateRange?.startDate
      const endDate = dateRange?.endDate

      // Fetch daily summary
      let dailyQuery = supabase
        .from('v_gsc_daily_summary')
        .select('*')
        .eq('store_id', storeId)
        .order('date', { ascending: false })

      if (startDate) dailyQuery = dailyQuery.gte('date', startDate)
      if (endDate) dailyQuery = dailyQuery.lte('date', endDate)

      // Fetch top queries with date filter
      let queriesQuery = supabase
        .from('gsc_search_analytics')
        .select('query, clicks, impressions, ctr, position')
        .eq('store_id', storeId)
        .not('query', 'is', null)

      if (startDate) queriesQuery = queriesQuery.gte('date', startDate)
      if (endDate) queriesQuery = queriesQuery.lte('date', endDate)

      // Fetch top pages with date filter
      let pagesQuery = supabase
        .from('gsc_search_analytics')
        .select('page, clicks, impressions, ctr, position')
        .eq('store_id', storeId)
        .not('page', 'is', null)

      if (startDate) pagesQuery = pagesQuery.gte('date', startDate)
      if (endDate) pagesQuery = pagesQuery.lte('date', endDate)

      // Fetch device breakdown
      let deviceQuery = supabase
        .from('gsc_search_analytics')
        .select('device, clicks, impressions')
        .eq('store_id', storeId)
        .not('device', 'is', null)

      if (startDate) deviceQuery = deviceQuery.gte('date', startDate)
      if (endDate) deviceQuery = deviceQuery.lte('date', endDate)

      // Fetch country breakdown
      let countryQuery = supabase
        .from('gsc_search_analytics')
        .select('country, clicks, impressions')
        .eq('store_id', storeId)
        .not('country', 'is', null)

      if (startDate) countryQuery = countryQuery.gte('date', startDate)
      if (endDate) countryQuery = countryQuery.lte('date', endDate)

      const [dailyRes, queriesRes, pagesRes, deviceRes, countryRes] = await Promise.all([
        dailyQuery.limit(90),
        queriesQuery,
        pagesQuery,
        deviceQuery,
        countryQuery
      ])

      // Aggregate queries
      const queryMap = new Map()
      queriesRes.data?.forEach(row => {
        if (!queryMap.has(row.query)) {
          queryMap.set(row.query, { query: row.query, clicks: 0, impressions: 0, ctr: 0, position: 0, count: 0 })
        }
        const q = queryMap.get(row.query)
        q.clicks += row.clicks || 0
        q.impressions += row.impressions || 0
        q.position += row.position || 0
        q.count += 1
      })
      const topQueries = Array.from(queryMap.values())
        .map(q => ({
          ...q,
          ctr: q.impressions > 0 ? q.clicks / q.impressions : 0,
          position: q.count > 0 ? q.position / q.count : 0
        }))
        .sort((a, b) => b.clicks - a.clicks)
        .slice(0, 20)

      // Aggregate pages
      const pageMap = new Map()
      pagesRes.data?.forEach(row => {
        if (!pageMap.has(row.page)) {
          pageMap.set(row.page, { page: row.page, clicks: 0, impressions: 0, ctr: 0, position: 0, count: 0 })
        }
        const p = pageMap.get(row.page)
        p.clicks += row.clicks || 0
        p.impressions += row.impressions || 0
        p.position += row.position || 0
        p.count += 1
      })
      const topPages = Array.from(pageMap.values())
        .map(p => ({
          ...p,
          ctr: p.impressions > 0 ? p.clicks / p.impressions : 0,
          position: p.count > 0 ? p.position / p.count : 0
        }))
        .sort((a, b) => b.clicks - a.clicks)
        .slice(0, 20)

      // Aggregate devices
      const deviceMap = new Map()
      deviceRes.data?.forEach(row => {
        if (!deviceMap.has(row.device)) {
          deviceMap.set(row.device, { device: row.device, clicks: 0, impressions: 0 })
        }
        const d = deviceMap.get(row.device)
        d.clicks += row.clicks || 0
        d.impressions += row.impressions || 0
      })
      const deviceBreakdown = Array.from(deviceMap.values())
        .sort((a, b) => b.clicks - a.clicks)

      // Aggregate countries
      const countryMap = new Map()
      countryRes.data?.forEach(row => {
        if (!countryMap.has(row.country)) {
          countryMap.set(row.country, { country: row.country, clicks: 0, impressions: 0 })
        }
        const c = countryMap.get(row.country)
        c.clicks += row.clicks || 0
        c.impressions += row.impressions || 0
      })
      const countryBreakdown = Array.from(countryMap.values())
        .sort((a, b) => b.clicks - a.clicks)
        .slice(0, 10)

      // Calculate summary
      const dailySummary = dailyRes.data || []
      const totalClicks = dailySummary.reduce((sum, d) => sum + (d.total_clicks || 0), 0)
      const totalImpressions = dailySummary.reduce((sum, d) => sum + (d.total_impressions || 0), 0)
      const avgCtr = totalImpressions > 0 ? totalClicks / totalImpressions : 0
      const avgPosition = dailySummary.reduce((sum, d) => sum + (d.avg_position || 0), 0) / Math.max(dailySummary.length, 1)

      // Calculate Keyword Ranking Buckets (unique keywords by position)
      const uniqueKeywordPositions = new Map()
      queriesRes.data?.forEach(row => {
        if (row.query) {
          // Keep the best (lowest) position for each keyword
          const current = uniqueKeywordPositions.get(row.query)
          if (!current || row.position < current) {
            uniqueKeywordPositions.set(row.query, row.position)
          }
        }
      })

      const totalUniqueKeywords = uniqueKeywordPositions.size
      const keywordBuckets = {
        top3: 0,
        top10: 0,
        top20: 0,
        beyond20: 0
      }

      uniqueKeywordPositions.forEach((position) => {
        if (position <= 3) keywordBuckets.top3++
        else if (position <= 10) keywordBuckets.top10++
        else if (position <= 20) keywordBuckets.top20++
        else keywordBuckets.beyond20++
      })

      // Page 1 keywords = positions 1-10 (top3 + top10)
      const page1Keywords = keywordBuckets.top3 + keywordBuckets.top10

      // Fetch comparison data based on comparisonMode (MoM or YoY)
      let previousDailySummary = []
      let previousSummary = null
      let comparisonEnabled = false
      let previousKeywordBuckets = { top3: 0, top10: 0, top20: 0, beyond20: 0 }
      let previousTotalUniqueKeywords = 0
      let previousPage1Keywords = 0

      // Calculate comparison date range based on mode
      if (startDate && endDate) {
        const start = new Date(startDate)
        const end = new Date(endDate)
        const daysDiff = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1

        let prevStartDate, prevEndDate

        if (comparisonMode === 'yoy') {
          // Year over Year: same period last year
          prevStartDate = new Date(start)
          prevStartDate.setFullYear(prevStartDate.getFullYear() - 1)
          prevEndDate = new Date(end)
          prevEndDate.setFullYear(prevEndDate.getFullYear() - 1)
        } else {
          // Month over Month: previous period of same length
          prevEndDate = new Date(start)
          prevEndDate.setDate(prevEndDate.getDate() - 1)
          prevStartDate = new Date(prevEndDate)
          prevStartDate.setDate(prevStartDate.getDate() - daysDiff + 1)
        }

        const prevStart = prevStartDate.toISOString().split('T')[0]
        const prevEnd = prevEndDate.toISOString().split('T')[0]

        const prevDailyQuery = await supabase
          .from('v_gsc_daily_summary')
          .select('*')
          .eq('store_id', storeId)
          .gte('date', prevStart)
          .lte('date', prevEnd)
          .order('date', { ascending: false })
          .limit(90)

        previousDailySummary = prevDailyQuery.data || []
        comparisonEnabled = previousDailySummary.length > 0

        if (comparisonEnabled) {
          const prevTotalClicks = previousDailySummary.reduce((sum, d) => sum + (d.total_clicks || 0), 0)
          const prevTotalImpressions = previousDailySummary.reduce((sum, d) => sum + (d.total_impressions || 0), 0)
          const prevAvgCtr = prevTotalImpressions > 0 ? prevTotalClicks / prevTotalImpressions : 0
          const prevAvgPosition = previousDailySummary.reduce((sum, d) => sum + (d.avg_position || 0), 0) / Math.max(previousDailySummary.length, 1)

          previousSummary = {
            totalClicks: prevTotalClicks,
            totalImpressions: prevTotalImpressions,
            avgCtr: prevAvgCtr,
            avgPosition: prevAvgPosition
          }

          // Fetch previous period keyword data for comparison
          const prevQueriesQuery = await supabase
            .from('gsc_search_analytics')
            .select('query, position')
            .eq('store_id', storeId)
            .not('query', 'is', null)
            .gte('date', prevStart)
            .lte('date', prevEnd)

          // Calculate previous keyword buckets
          const prevUniqueKeywordPositions = new Map()
          prevQueriesQuery.data?.forEach(row => {
            if (row.query) {
              const current = prevUniqueKeywordPositions.get(row.query)
              if (!current || row.position < current) {
                prevUniqueKeywordPositions.set(row.query, row.position)
              }
            }
          })

          previousTotalUniqueKeywords = prevUniqueKeywordPositions.size
          prevUniqueKeywordPositions.forEach((position) => {
            if (position <= 3) previousKeywordBuckets.top3++
            else if (position <= 10) previousKeywordBuckets.top10++
            else if (position <= 20) previousKeywordBuckets.top20++
            else previousKeywordBuckets.beyond20++
          })
          previousPage1Keywords = previousKeywordBuckets.top3 + previousKeywordBuckets.top10
        }
      }

      // === RISK RADAR: Weekly comparison for top pages ===
      // Calculate 3-week rolling data to detect 2-week decline patterns
      // Use date strings to avoid timezone issues (database stores YYYY-MM-DD)
      const today = new Date()
      const threeWeeksAgoDate = new Date(today)
      threeWeeksAgoDate.setDate(threeWeeksAgoDate.getDate() - 21)
      const twoWeeksAgoDate = new Date(today)
      twoWeeksAgoDate.setDate(twoWeeksAgoDate.getDate() - 14)
      const oneWeekAgoDate = new Date(today)
      oneWeekAgoDate.setDate(oneWeekAgoDate.getDate() - 7)

      // Convert to YYYY-MM-DD strings for comparison
      const threeWeeksAgoStr = threeWeeksAgoDate.toISOString().split('T')[0]
      const twoWeeksAgoStr = twoWeeksAgoDate.toISOString().split('T')[0]
      const oneWeekAgoStr = oneWeekAgoDate.toISOString().split('T')[0]

      // Fetch page-level data for 3 weeks using pagination
      // Supabase has 1000 row limit per request, so we need to paginate
      const riskData = await fetchAllRows(
        supabase
          .from('gsc_search_analytics')
          .select('page, clicks, impressions, ctr, position, date')
          .eq('store_id', storeId)
          .not('page', 'is', null)
          .gte('date', threeWeeksAgoStr)
          .order('date', { ascending: true })
      )

      // Group data by page and week
      const pageWeeklyData = new Map()

      riskData?.forEach(row => {
        // Compare date strings directly (YYYY-MM-DD format)
        const rowDateStr = row.date
        let week = 'week3' // most recent (last 7 days)
        if (rowDateStr < oneWeekAgoStr) {
          week = rowDateStr < twoWeeksAgoStr ? 'week1' : 'week2'
        }

        const key = row.page
        if (!pageWeeklyData.has(key)) {
          pageWeeklyData.set(key, {
            page: key,
            week1: { clicks: 0, impressions: 0, ctr: 0, position: 0, count: 0 },
            week2: { clicks: 0, impressions: 0, ctr: 0, position: 0, count: 0 },
            week3: { clicks: 0, impressions: 0, ctr: 0, position: 0, count: 0 }
          })
        }
        const p = pageWeeklyData.get(key)
        p[week].clicks += row.clicks || 0
        p[week].impressions += row.impressions || 0
        p[week].position += row.position || 0
        p[week].count += 1
      })

      // Calculate weekly averages and detect patterns
      const decliningPages = []
      const snippetProblems = []
      const competitorThreats = []

      pageWeeklyData.forEach((data, page) => {
        // Calculate averages
        const w1 = data.week1
        const w2 = data.week2
        const w3 = data.week3

        // Calculate average position per week
        const w1Pos = w1.count > 0 ? w1.position / w1.count : null
        const w2Pos = w2.count > 0 ? w2.position / w2.count : null
        const w3Pos = w3.count > 0 ? w3.position / w3.count : null

        // Calculate CTR per week
        const w1Ctr = w1.impressions > 0 ? w1.clicks / w1.impressions : null
        const w2Ctr = w2.impressions > 0 ? w2.clicks / w2.impressions : null
        const w3Ctr = w3.impressions > 0 ? w3.clicks / w3.impressions : null

        // Only analyze pages with enough data (at least 10 impressions in recent weeks)
        if (w3.impressions < 10 && w2.impressions < 10) return

        // 1. DECLINING PAGES: clicks↓ & position↓ (worse) 2 weeks in a row
        // Position going up (worse) means position number increases
        const clicksDeclining = w2.clicks > 0 && w3.clicks > 0 &&
                               w2.clicks < (w1.clicks * 0.9) &&
                               w3.clicks < (w2.clicks * 0.9)
        const positionWorsening = w1Pos && w2Pos && w3Pos &&
                                 w2Pos > (w1Pos * 1.1) &&
                                 w3Pos > (w2Pos * 1.1)

        if (clicksDeclining && positionWorsening) {
          decliningPages.push({
            page,
            clicks: w3.clicks,
            clicksChange: w1.clicks > 0 ? ((w3.clicks - w1.clicks) / w1.clicks * 100) : -100,
            position: w3Pos,
            positionChange: w1Pos ? ((w3Pos - w1Pos) / w1Pos * 100) : 100,
            weeks: 2,
            severity: 'critical'
          })
        }

        // 2. SNIPPET PROBLEMS: CTR drop without significant position change
        // CTR dropped > 20% but position stayed stable (< 10% change)
        if (w1Ctr && w3Ctr && w1Pos && w3Pos) {
          const ctrDrop = (w1Ctr - w3Ctr) / w1Ctr
          const positionStable = Math.abs((w3Pos - w1Pos) / w1Pos) < 0.1

          if (ctrDrop > 0.2 && positionStable && w3.impressions >= 20) {
            snippetProblems.push({
              page,
              ctr: w3Ctr,
              ctrChange: -ctrDrop * 100,
              position: w3Pos,
              positionChange: ((w3Pos - w1Pos) / w1Pos * 100),
              impressions: w3.impressions,
              severity: ctrDrop > 0.4 ? 'critical' : 'warning'
            })
          }
        }

        // 3. COMPETITOR THREATS: Position drop without impressions drop
        // Position got worse > 20% but impressions stayed stable or grew
        if (w1Pos && w3Pos && w1.impressions > 0) {
          const positionWorse = (w3Pos - w1Pos) / w1Pos
          const impressionsStable = (w3.impressions - w1.impressions) / w1.impressions >= -0.1

          if (positionWorse > 0.2 && impressionsStable && w3.impressions >= 20) {
            competitorThreats.push({
              page,
              position: w3Pos,
              positionChange: positionWorse * 100,
              impressions: w3.impressions,
              impressionsChange: ((w3.impressions - w1.impressions) / w1.impressions * 100),
              severity: positionWorse > 0.5 ? 'critical' : 'warning'
            })
          }
        }
      })

      // Sort and limit to top 20
      const riskRadar = {
        decliningPages: decliningPages
          .sort((a, b) => b.clicksChange - a.clicksChange)
          .slice(0, 20),
        snippetProblems: snippetProblems
          .sort((a, b) => a.ctrChange - b.ctrChange)
          .slice(0, 20),
        competitorThreats: competitorThreats
          .sort((a, b) => b.positionChange - a.positionChange)
          .slice(0, 20)
      }

      setData({
        dailySummary,
        topQueries,
        topPages,
        deviceBreakdown,
        countryBreakdown,
        summary: {
          totalClicks,
          totalImpressions,
          avgCtr,
          avgPosition
        },
        // New SEO KPIs
        keywordBuckets,
        totalUniqueKeywords,
        page1Keywords,
        // Previous period keyword data
        previousKeywordBuckets,
        previousTotalUniqueKeywords,
        previousPage1Keywords,
        previousDailySummary,
        previousSummary,
        comparisonEnabled,
        comparisonMode,
        riskRadar
      })

    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [storeId, dateRange?.startDate, dateRange?.endDate, comparisonMode])

  useEffect(() => {
    fetchGSCData()
  }, [fetchGSCData])

  // Connect GSC function - käyttää Vercel serverless API:a
  const connectGSC = () => {
    window.location.href = `/api/gsc/connect?store_id=${storeId}`
  }

  // Sync GSC data function - käyttää Vercel serverless API:a
  const syncGSC = async (startDate, endDate) => {
    const response = await fetch('/api/gsc/sync', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        store_id: storeId,
        start_date: startDate,
        end_date: endDate
      })
    })
    return response.json()
  }

  return {
    ...data,
    loading,
    error,
    connected,
    refresh: fetchGSCData,
    connectGSC,
    syncGSC
  }
}

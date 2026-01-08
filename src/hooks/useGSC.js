import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

// Kovakoodattu store_id (billackering)
const STORE_ID = 'a28836f6-9487-4b67-9194-e907eaf94b69'

export function useGSC(dateRange = null, comparisonMode = 'mom') {
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
    comparisonMode: 'mom'
  })

  const fetchGSCData = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      // Check if GSC is connected
      const { data: tokens } = await supabase
        .from('gsc_tokens')
        .select('site_url')
        .eq('store_id', STORE_ID)

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
        .eq('store_id', STORE_ID)
        .order('date', { ascending: false })

      if (startDate) dailyQuery = dailyQuery.gte('date', startDate)
      if (endDate) dailyQuery = dailyQuery.lte('date', endDate)

      // Fetch top queries with date filter
      let queriesQuery = supabase
        .from('gsc_search_analytics')
        .select('query, clicks, impressions, ctr, position')
        .eq('store_id', STORE_ID)
        .not('query', 'is', null)

      if (startDate) queriesQuery = queriesQuery.gte('date', startDate)
      if (endDate) queriesQuery = queriesQuery.lte('date', endDate)

      // Fetch top pages with date filter
      let pagesQuery = supabase
        .from('gsc_search_analytics')
        .select('page, clicks, impressions, ctr, position')
        .eq('store_id', STORE_ID)
        .not('page', 'is', null)

      if (startDate) pagesQuery = pagesQuery.gte('date', startDate)
      if (endDate) pagesQuery = pagesQuery.lte('date', endDate)

      // Fetch device breakdown
      let deviceQuery = supabase
        .from('gsc_search_analytics')
        .select('device, clicks, impressions')
        .eq('store_id', STORE_ID)
        .not('device', 'is', null)

      if (startDate) deviceQuery = deviceQuery.gte('date', startDate)
      if (endDate) deviceQuery = deviceQuery.lte('date', endDate)

      // Fetch country breakdown
      let countryQuery = supabase
        .from('gsc_search_analytics')
        .select('country, clicks, impressions')
        .eq('store_id', STORE_ID)
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
          .eq('store_id', STORE_ID)
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
            .eq('store_id', STORE_ID)
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
        comparisonMode
      })

    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [dateRange?.startDate, dateRange?.endDate, comparisonMode])

  useEffect(() => {
    fetchGSCData()
  }, [fetchGSCData])

  // Connect GSC function - käyttää Vercel serverless API:a
  const connectGSC = () => {
    window.location.href = `/api/gsc/connect?store_id=${STORE_ID}`
  }

  // Sync GSC data function - käyttää Vercel serverless API:a
  const syncGSC = async (startDate, endDate) => {
    const response = await fetch('/api/gsc/sync', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        store_id: STORE_ID,
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

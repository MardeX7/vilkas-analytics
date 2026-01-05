import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

// Kovakoodattu store_id (billackering)
const STORE_ID = 'a28836f6-9487-4b67-9194-e907eaf94b69'

export function useGSC(dateRange = null) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [connected, setConnected] = useState(false)
  const [data, setData] = useState({
    dailySummary: [],
    topQueries: [],
    topPages: [],
    deviceBreakdown: [],
    countryBreakdown: [],
    summary: null
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
        }
      })

    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [dateRange?.startDate, dateRange?.endDate])

  useEffect(() => {
    fetchGSCData()
  }, [fetchGSCData])

  // Connect GSC function
  const connectGSC = () => {
    const authUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/gsc-auth?action=authorize&store_id=${STORE_ID}`
    window.open(authUrl, '_blank', 'width=600,height=700')
  }

  // Sync GSC data function
  const syncGSC = async (startDate, endDate) => {
    const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/gsc-sync`, {
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

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

// Kovakoodattu store_id (billackering)
const STORE_ID = 'a28836f6-9487-4b67-9194-e907eaf94b69'

/**
 * useGA4 - Hook for Google Analytics 4 behavioral data
 *
 * NOTE: GA4 is for BEHAVIORAL data only (traffic sources, bounce rate)
 * NOT for transactions - ePages remains the master for sales data
 */
export function useGA4(dateRange = null, comparisonMode = 'mom') {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [connected, setConnected] = useState(false)
  const [propertyName, setPropertyName] = useState(null)
  const [data, setData] = useState({
    dailySummary: [],
    trafficSources: [],
    landingPages: [],
    deviceBreakdown: [],
    summary: null,
    // Comparison data
    previousSummary: null,
    comparisonEnabled: false,
    comparisonMode: 'mom'
  })

  const fetchGA4Data = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      // Check if GA4 is connected
      const { data: tokens } = await supabase
        .from('ga4_tokens')
        .select('property_id, property_name')
        .eq('store_id', STORE_ID)

      if (!tokens || tokens.length === 0) {
        setConnected(false)
        setLoading(false)
        return
      }

      setConnected(true)
      setPropertyName(tokens[0]?.property_name || null)

      const startDate = dateRange?.startDate
      const endDate = dateRange?.endDate

      // Fetch daily summary from view
      let dailyQuery = supabase
        .from('v_ga4_daily_summary')
        .select('*')
        .eq('store_id', STORE_ID)
        .order('date', { ascending: false })

      if (startDate) dailyQuery = dailyQuery.gte('date', startDate)
      if (endDate) dailyQuery = dailyQuery.lte('date', endDate)

      // Fetch traffic sources (raw data for aggregation)
      let sourcesQuery = supabase
        .from('ga4_analytics')
        .select('session_default_channel_grouping, sessions, engaged_sessions, bounce_rate')
        .eq('store_id', STORE_ID)
        .not('session_default_channel_grouping', 'is', null)

      if (startDate) sourcesQuery = sourcesQuery.gte('date', startDate)
      if (endDate) sourcesQuery = sourcesQuery.lte('date', endDate)

      // Fetch landing pages
      let landingQuery = supabase
        .from('ga4_analytics')
        .select('landing_page, sessions, engaged_sessions, bounce_rate')
        .eq('store_id', STORE_ID)
        .not('landing_page', 'is', null)

      if (startDate) landingQuery = landingQuery.gte('date', startDate)
      if (endDate) landingQuery = landingQuery.lte('date', endDate)

      const [dailyRes, sourcesRes, landingRes] = await Promise.all([
        dailyQuery.limit(90),
        sourcesQuery,
        landingQuery
      ])

      // ALWAYS use GSC for sessions (more reliable than GA4)
      // GA4 is only used for traffic sources and landing pages
      const hasGA4Data = false // Force GSC for sessions

      let dailySummary = []
      let trafficSources = []
      let landingPages = []
      let deviceBreakdown = []
      let totalSessions = 0
      let totalEngagedSessions = null
      let avgBounceRate = null
      let avgSessionDuration = null
      let totalNewUsers = null
      let totalReturningUsers = null
      let totalUsers = null

      if (hasGA4Data) {
        // Use GA4 data
        // Aggregate traffic sources by channel
        const sourceMap = new Map()
        sourcesRes.data?.forEach(row => {
          const channel = row.session_default_channel_grouping || 'Direct'
          if (!sourceMap.has(channel)) {
            sourceMap.set(channel, {
              channel,
              sessions: 0,
              engaged_sessions: 0,
              bounceSum: 0,
              count: 0
            })
          }
          const s = sourceMap.get(channel)
          s.sessions += row.sessions || 0
          s.engaged_sessions += row.engaged_sessions || 0
          s.bounceSum += (row.bounce_rate || 0) * (row.sessions || 1)
          s.count += row.sessions || 1
        })

        trafficSources = Array.from(sourceMap.values())
          .map(s => ({
            channel: s.channel,
            sessions: s.sessions,
            engaged_sessions: s.engaged_sessions,
            bounce_rate: s.count > 0 ? s.bounceSum / s.count : 0
          }))
          .sort((a, b) => b.sessions - a.sessions)

        // Aggregate landing pages
        const pageMap = new Map()
        landingRes.data?.forEach(row => {
          const page = row.landing_page
          if (!pageMap.has(page)) {
            pageMap.set(page, {
              page,
              sessions: 0,
              engaged_sessions: 0,
              bounceSum: 0,
              count: 0
            })
          }
          const p = pageMap.get(page)
          p.sessions += row.sessions || 0
          p.engaged_sessions += row.engaged_sessions || 0
          p.bounceSum += (row.bounce_rate || 0) * (row.sessions || 1)
          p.count += row.sessions || 1
        })

        landingPages = Array.from(pageMap.values())
          .map(p => ({
            page: p.page,
            sessions: p.sessions,
            engaged_sessions: p.engaged_sessions,
            bounce_rate: p.count > 0 ? p.bounceSum / p.count : 0
          }))
          .sort((a, b) => b.sessions - a.sessions)
          .slice(0, 20)

        // Calculate summary from GA4
        dailySummary = dailyRes.data || []
        totalSessions = dailySummary.reduce((sum, d) => sum + (d.total_sessions || 0), 0)
        totalEngagedSessions = dailySummary.reduce((sum, d) => sum + (d.total_engaged_sessions || 0), 0)
        avgBounceRate = totalSessions > 0 ? (totalSessions - totalEngagedSessions) / totalSessions : 0
        avgSessionDuration = dailySummary.length > 0
          ? dailySummary.reduce((sum, d) => sum + (d.avg_session_duration || 0), 0) / dailySummary.length
          : 0
        totalNewUsers = dailySummary.reduce((sum, d) => sum + (d.total_new_users || 0), 0)
        totalReturningUsers = dailySummary.reduce((sum, d) => sum + (d.total_returning_users || 0), 0)
        totalUsers = totalNewUsers + totalReturningUsers

      } else {
        // FALLBACK: Use GSC data when GA4 is empty
        console.log('GA4 data empty, using GSC fallback')

        // Fetch GSC daily summary
        let gscQuery = supabase
          .from('v_gsc_daily_summary')
          .select('*')
          .eq('store_id', STORE_ID)
          .order('date', { ascending: false })

        if (startDate) gscQuery = gscQuery.gte('date', startDate)
        if (endDate) gscQuery = gscQuery.lte('date', endDate)

        const { data: gscDaily } = await gscQuery.limit(90)

        // Fetch GSC landing pages for top pages
        let gscPagesQuery = supabase
          .from('gsc_search_analytics')
          .select('page, clicks, impressions, ctr, position')
          .eq('store_id', STORE_ID)

        if (startDate) gscPagesQuery = gscPagesQuery.gte('date', startDate)
        if (endDate) gscPagesQuery = gscPagesQuery.lte('date', endDate)

        const { data: gscPages } = await gscPagesQuery.limit(5000)

        // Fetch GSC device breakdown (real data!)
        let gscDeviceQuery = supabase
          .from('gsc_search_analytics')
          .select('device, clicks')
          .eq('store_id', STORE_ID)
          .not('device', 'is', null)

        if (startDate) gscDeviceQuery = gscDeviceQuery.gte('date', startDate)
        if (endDate) gscDeviceQuery = gscDeviceQuery.lte('date', endDate)

        const { data: gscDevices } = await gscDeviceQuery

        // Transform GSC daily to match GA4 format
        // NOTE: GSC only provides clicks - we cannot estimate engagement metrics
        dailySummary = (gscDaily || []).map(d => ({
          date: d.date,
          total_sessions: d.total_clicks, // GSC clicks = organic sessions
          total_impressions: d.total_impressions,
          avg_ctr: d.avg_ctr,
          avg_position: d.avg_position
        }))

        // Calculate totals from GSC - ONLY real data, no estimates
        totalSessions = dailySummary.reduce((sum, d) => sum + (d.total_sessions || 0), 0)
        const totalImpressions = dailySummary.reduce((sum, d) => sum + (d.total_impressions || 0), 0)
        const avgCtr = totalImpressions > 0 ? totalSessions / totalImpressions : 0
        const avgPosition = dailySummary.length > 0
          ? dailySummary.reduce((sum, d) => sum + (d.avg_position || 0), 0) / dailySummary.length
          : 0

        // GSC doesn't provide these - set to null to indicate unavailable
        totalEngagedSessions = null // Not available from GSC
        avgBounceRate = null // Not available from GSC
        avgSessionDuration = null // Not available from GSC
        totalNewUsers = null // Not available from GSC
        totalReturningUsers = null // Not available from GSC
        totalUsers = null // Not available from GSC

        // GSC is all organic search - this IS real data
        trafficSources = [{
          channel: 'Organic Search',
          sessions: totalSessions,
          impressions: totalImpressions,
          ctr: avgCtr,
          avg_position: avgPosition,
          bounce_rate: null // Not available
        }]

        // Aggregate GSC pages with real CTR data
        const pageMap = new Map()
        gscPages?.forEach(row => {
          const page = row.page
          if (!pageMap.has(page)) {
            pageMap.set(page, { page, clicks: 0, impressions: 0 })
          }
          const p = pageMap.get(page)
          p.clicks += row.clicks || 0
          p.impressions += row.impressions || 0
        })

        landingPages = Array.from(pageMap.values())
          .map(p => ({
            page: p.page,
            sessions: p.clicks,
            impressions: p.impressions,
            ctr: p.impressions > 0 ? p.clicks / p.impressions : 0,
            bounce_rate: null // Not available from GSC
          }))
          .sort((a, b) => b.sessions - a.sessions)
          .slice(0, 20)

        // Calculate REAL device breakdown from GSC
        const deviceMap = new Map()
        gscDevices?.forEach(row => {
          const device = row.device
          if (!deviceMap.has(device)) {
            deviceMap.set(device, 0)
          }
          deviceMap.set(device, deviceMap.get(device) + (row.clicks || 0))
        })

        const deviceTotal = Array.from(deviceMap.values()).reduce((a, b) => a + b, 0)
        deviceBreakdown = Array.from(deviceMap.entries())
          .map(([device, clicks]) => ({
            device,
            sessions: clicks,
            percentage: deviceTotal > 0 ? Math.round((clicks / deviceTotal) * 100) : 0
          }))
          .sort((a, b) => b.sessions - a.sessions)
      }

      // Only calculate device breakdown if not already set by GSC fallback
      if (!deviceBreakdown || deviceBreakdown.length === 0) {
        deviceBreakdown = []
      }

      // Fetch comparison data based on comparisonMode (MoM or YoY)
      let previousSummary = null
      let comparisonEnabled = false

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

        // Use GSC fallback for previous period if GA4 data is empty
        if (!hasGA4Data) {
          // Fetch previous period from GSC - ONLY real data
          const { data: prevGscData } = await supabase
            .from('v_gsc_daily_summary')
            .select('*')
            .eq('store_id', STORE_ID)
            .gte('date', prevStart)
            .lte('date', prevEnd)
            .order('date', { ascending: false })
            .limit(90)

          const previousDailySummary = prevGscData || []
          comparisonEnabled = previousDailySummary.length > 0

          if (comparisonEnabled) {
            // GSC only has clicks/impressions - no engagement metrics
            const prevTotalSessions = previousDailySummary.reduce((sum, d) => sum + (d.total_clicks || 0), 0)
            const prevTotalImpressions = previousDailySummary.reduce((sum, d) => sum + (d.total_impressions || 0), 0)

            previousSummary = {
              totalSessions: prevTotalSessions,
              totalImpressions: prevTotalImpressions,
              // These are NOT available from GSC - set to null
              totalEngagedSessions: null,
              avgBounceRate: null,
              avgSessionDuration: null,
              totalUsers: null,
              totalNewUsers: null,
              totalReturningUsers: null
            }
          }
        } else {
          // Use GA4 for previous period
          const { data: prevDailyData } = await supabase
            .from('v_ga4_daily_summary')
            .select('*')
            .eq('store_id', STORE_ID)
            .gte('date', prevStart)
            .lte('date', prevEnd)
            .order('date', { ascending: false })
            .limit(90)

          const previousDailySummary = prevDailyData || []
          comparisonEnabled = previousDailySummary.length > 0

          if (comparisonEnabled) {
            const prevTotalSessions = previousDailySummary.reduce((sum, d) => sum + (d.total_sessions || 0), 0)
            const prevTotalEngaged = previousDailySummary.reduce((sum, d) => sum + (d.total_engaged_sessions || 0), 0)
            const prevAvgBounceRate = prevTotalSessions > 0 ? (prevTotalSessions - prevTotalEngaged) / prevTotalSessions : 0
            const prevAvgSessionDuration = previousDailySummary.length > 0
              ? previousDailySummary.reduce((sum, d) => sum + (d.avg_session_duration || 0), 0) / previousDailySummary.length
              : 0
            const prevTotalNewUsers = previousDailySummary.reduce((sum, d) => sum + (d.total_new_users || 0), 0)
            const prevTotalReturningUsers = previousDailySummary.reduce((sum, d) => sum + (d.total_returning_users || 0), 0)
            const prevTotalUsers = prevTotalNewUsers + prevTotalReturningUsers

            previousSummary = {
              totalSessions: prevTotalSessions,
              totalEngagedSessions: prevTotalEngaged,
              avgBounceRate: prevAvgBounceRate,
              avgSessionDuration: prevAvgSessionDuration,
              totalUsers: prevTotalUsers,
              totalNewUsers: prevTotalNewUsers,
              totalReturningUsers: prevTotalReturningUsers
            }
          }
        }
      }

      // Calculate GSC-specific totals for summary
      const totalImpressions = dailySummary.reduce((sum, d) => sum + (d.total_impressions || 0), 0)
      const avgPosition = dailySummary.length > 0
        ? dailySummary.reduce((sum, d) => sum + (d.avg_position || 0), 0) / dailySummary.length
        : null

      setData({
        dailySummary,
        trafficSources,
        landingPages,
        deviceBreakdown,
        summary: {
          totalSessions,
          totalImpressions,
          avgPosition,
          totalEngagedSessions,
          avgBounceRate,
          avgSessionDuration,
          totalUsers,
          totalNewUsers,
          totalReturningUsers
        },
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
    fetchGA4Data()
  }, [fetchGA4Data])

  // Connect GA4 function - uses Vercel serverless API
  const connectGA4 = () => {
    window.location.href = `/api/ga4/connect?store_id=${STORE_ID}`
  }

  // Sync GA4 data function - uses Vercel serverless API
  const syncGA4 = async (startDate, endDate) => {
    const response = await fetch('/api/ga4/sync', {
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

  // Disconnect GA4
  const disconnectGA4 = async () => {
    await supabase
      .from('ga4_tokens')
      .delete()
      .eq('store_id', STORE_ID)

    await supabase
      .from('shops')
      .update({ ga4_property_id: null })
      .eq('id', STORE_ID)

    setConnected(false)
    setPropertyName(null)
  }

  return {
    ...data,
    loading,
    error,
    connected,
    propertyName,
    refresh: fetchGA4Data,
    connectGA4,
    syncGA4,
    disconnectGA4
  }
}

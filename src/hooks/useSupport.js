/**
 * useSupport Hook
 *
 * Hakee asiakaspalvelun tiketit ja tilastot Supabasesta.
 * Käyttää shop_id -järjestelmää (analytiikkataulu).
 */

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useCurrentShop } from '@/config/storeConfig'

async function fetchOpenTickets(shopId) {
  const { data, error } = await supabase
    .from('support_tickets')
    .select('*')
    .eq('shop_id', shopId)
    .neq('status_category', 'done')
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message)
  return data || []
}

async function fetchDailyStats(shopId, days = 30) {
  const since = new Date()
  since.setDate(since.getDate() - days)

  const { data, error } = await supabase
    .from('support_daily_stats')
    .select('*')
    .eq('shop_id', shopId)
    .gte('date', since.toISOString().split('T')[0])
    .order('date', { ascending: true })

  if (error) throw new Error(error.message)
  return data || []
}

async function fetchSummary(shopId, storeId) {
  // Open tickets count
  const { count: openCount } = await supabase
    .from('support_tickets')
    .select('*', { count: 'exact', head: true })
    .eq('shop_id', shopId)
    .neq('status_category', 'done')

  // Date ranges for this week and prev week
  const now = new Date()
  const sevenDaysAgo = new Date(now)
  sevenDaysAgo.setDate(now.getDate() - 7)
  const fourteenDaysAgo = new Date(now)
  fourteenDaysAgo.setDate(now.getDate() - 14)
  const sevenDaysAgoStr = sevenDaysAgo.toISOString().split('T')[0]
  const fourteenDaysAgoStr = fourteenDaysAgo.toISOString().split('T')[0]

  // This week + prev week support stats (14 days)
  const { data: twoWeekStats } = await supabase
    .from('support_daily_stats')
    .select('*')
    .eq('shop_id', shopId)
    .gte('date', fourteenDaysAgoStr)

  const thisWeekStats = (twoWeekStats || []).filter(d => d.date >= sevenDaysAgoStr)
  const prevWeekStats = (twoWeekStats || []).filter(d => d.date >= fourteenDaysAgoStr && d.date < sevenDaysAgoStr)

  const weekCreated = thisWeekStats.reduce((s, d) => s + (d.tickets_created || 0), 0)
  const weekResolved = thisWeekStats.reduce((s, d) => s + (d.tickets_resolved || 0), 0)
  const weekBreaches = thisWeekStats.reduce((s, d) => s + (d.sla_breaches || 0), 0)

  const prevWeekCreated = prevWeekStats.reduce((s, d) => s + (d.tickets_created || 0), 0)
  const prevWeekResolved = prevWeekStats.reduce((s, d) => s + (d.tickets_resolved || 0), 0)

  // Resolution rate: resolved / (resolved + still open)
  const resolutionRate = (weekResolved + openCount) > 0
    ? Math.round((weekResolved / (weekResolved + openCount)) * 100)
    : null
  const prevResolutionRate = (prevWeekResolved + openCount) > 0
    ? Math.round((prevWeekResolved / (prevWeekResolved + openCount)) * 100)
    : null

  // Average first response time (7d)
  const { data: recentTickets } = await supabase
    .from('support_tickets')
    .select('first_response_ms')
    .eq('shop_id', shopId)
    .not('first_response_ms', 'is', null)
    .gte('created_at', `${sevenDaysAgoStr}T00:00:00`)

  let avgFirstResponseMs = null
  if (recentTickets?.length) {
    avgFirstResponseMs = Math.round(
      recentTickets.reduce((s, t) => s + t.first_response_ms, 0) / recentTickets.length
    )
  }

  // SLA compliance (7d)
  const { data: weekTickets } = await supabase
    .from('support_tickets')
    .select('sla_first_response_breached, sla_resolution_breached')
    .eq('shop_id', shopId)
    .gte('created_at', `${sevenDaysAgoStr}T00:00:00`)

  let slaCompliance = null
  if (weekTickets?.length) {
    const breached = weekTickets.filter(
      t => t.sla_first_response_breached || t.sla_resolution_breached
    ).length
    slaCompliance = Math.round(((weekTickets.length - breached) / weekTickets.length) * 100)
  }

  // Yesterday's resolved
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  const yesterdayStr = yesterday.toISOString().split('T')[0]

  const { data: yesterdayStats } = await supabase
    .from('support_daily_stats')
    .select('tickets_resolved')
    .eq('shop_id', shopId)
    .eq('date', yesterdayStr)
    .maybeSingle()

  // Tickets per 100 orders (7d) - join with v_daily_sales via store_id
  let ticketsPer100Orders = null
  let prevTicketsPer100Orders = null
  if (storeId) {
    const { data: salesData } = await supabase
      .from('v_daily_sales')
      .select('order_count, sale_date')
      .eq('store_id', storeId)
      .gte('sale_date', fourteenDaysAgoStr)

    const thisWeekOrders = (salesData || [])
      .filter(d => d.sale_date >= sevenDaysAgoStr)
      .reduce((s, d) => s + (d.order_count || 0), 0)
    const prevWeekOrders = (salesData || [])
      .filter(d => d.sale_date >= fourteenDaysAgoStr && d.sale_date < sevenDaysAgoStr)
      .reduce((s, d) => s + (d.order_count || 0), 0)

    if (thisWeekOrders > 0) {
      ticketsPer100Orders = Math.round((weekCreated / thisWeekOrders) * 100 * 10) / 10
    }
    if (prevWeekOrders > 0) {
      prevTicketsPer100Orders = Math.round((prevWeekCreated / prevWeekOrders) * 100 * 10) / 10
    }
  }

  return {
    openCount: openCount || 0,
    weekCreated,
    weekResolved,
    weekBreaches,
    avgFirstResponseMs,
    slaCompliance,
    resolutionRate,
    resolvedYesterday: yesterdayStats?.tickets_resolved || 0,
    ticketsPer100Orders,
    // WoW comparisons
    prevWeekCreated,
    prevWeekResolved,
    prevResolutionRate,
    prevTicketsPer100Orders,
  }
}

export function useSupport() {
  const { shopId, storeId, ready } = useCurrentShop()

  const summaryQuery = useQuery({
    queryKey: ['support-summary', shopId],
    queryFn: () => fetchSummary(shopId, storeId),
    staleTime: 5 * 60 * 1000,
    enabled: ready && !!shopId,
  })

  const openTicketsQuery = useQuery({
    queryKey: ['support-open-tickets', shopId],
    queryFn: () => fetchOpenTickets(shopId),
    staleTime: 5 * 60 * 1000,
    enabled: ready && !!shopId,
  })

  const dailyStatsQuery = useQuery({
    queryKey: ['support-daily-stats', shopId],
    queryFn: () => fetchDailyStats(shopId, 30),
    staleTime: 5 * 60 * 1000,
    enabled: ready && !!shopId,
  })

  return {
    summary: summaryQuery.data,
    openTickets: openTicketsQuery.data,
    dailyStats: dailyStatsQuery.data,
    isLoading: summaryQuery.isLoading || openTicketsQuery.isLoading || dailyStatsQuery.isLoading,
    error: summaryQuery.error || openTicketsQuery.error || dailyStatsQuery.error,
  }
}

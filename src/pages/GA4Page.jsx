import { useState, useMemo } from 'react'
import { useGA4 } from '@/hooks/useGA4'
import { KPICard } from '@/components/KPICard'
import { DateRangePicker, getDateRange, formatDateISO } from '@/components/DateRangePicker'
import { Button } from '@/components/ui/button'
import {
  Users,
  MousePointer,
  Clock,
  TrendingUp,
  TrendingDown,
  RefreshCw,
  Link2,
  BarChart3,
  Globe,
  Loader2,
  ArrowUpRight,
  ArrowDownRight
} from 'lucide-react'

// Helper to create default date range
function createDefaultDateRange() {
  const range = getDateRange('last30')
  return {
    preset: 'last30',
    startDate: formatDateISO(range.startDate),
    endDate: formatDateISO(range.endDate),
    label: 'Senaste 30 dagarna'
  }
}

// Format session duration from seconds to mm:ss
function formatDuration(seconds) {
  if (!seconds || isNaN(seconds)) return '0:00'
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

// Get channel color
function getChannelColor(channel) {
  const colors = {
    'Organic Search': '#22c55e',
    'Direct': '#3b82f6',
    'Paid Search': '#f59e0b',
    'Paid Social': '#ec4899',
    'Organic Social': '#8b5cf6',
    'Referral': '#06b6d4',
    'Email': '#ef4444',
    'Cross-network': '#f97316',
    'Unassigned': '#6b7280'
  }
  return colors[channel] || '#6b7280'
}

export function GA4Page() {
  // Initialize date range inside component to avoid module-level execution issues
  const [dateRange, setDateRange] = useState(() => createDefaultDateRange())
  const [syncing, setSyncing] = useState(false)
  const [comparisonMode, setComparisonMode] = useState('mom')

  console.log('🔶 GA4Page render, dateRange:', dateRange)

  const {
    dailySummary = [],
    trafficSources = [],
    landingPages = [],
    summary,
    previousSummary,
    comparisonEnabled,
    connected,
    propertyName,
    connectGA4,
    syncGA4,
    loading,
    error,
    refresh
  } = useGA4(dateRange, comparisonMode)

  console.log('🔶 GA4Page hook result:', { loading, connected, error, trafficSourcesCount: trafficSources?.length })

  // Calculate change percentages
  const getChangePercent = (current, previous) => {
    if (!previous || previous === 0) return null
    return ((current - previous) / previous) * 100
  }

  const sessionsChange = comparisonEnabled && previousSummary
    ? getChangePercent(summary?.totalSessions, previousSummary.totalSessions)
    : null
  // For bounce rate, lower is better, so invert
  const bounceChange = comparisonEnabled && previousSummary
    ? getChangePercent(previousSummary.avgBounceRate, summary?.avgBounceRate)
    : null
  const durationChange = comparisonEnabled && previousSummary
    ? getChangePercent(summary?.avgSessionDuration, previousSummary.avgSessionDuration)
    : null

  const handleSync = async () => {
    setSyncing(true)
    try {
      await syncGA4(dateRange.startDate, dateRange.endDate)
      await refresh()
    } catch (err) {
      console.error('Sync failed:', err)
    } finally {
      setSyncing(false)
    }
  }

  // Show error if any
  if (error) {
    console.error('🔶 GA4Page error:', error)
    return (
      <div className="min-h-screen bg-slate-950 p-6">
        <div className="max-w-md mx-auto mt-20">
          <div className="bg-red-900/20 rounded-xl p-8 border border-red-800 text-center">
            <h2 className="text-xl font-semibold text-red-400 mb-2">Fel vid laddning</h2>
            <p className="text-slate-400 mb-4">{error}</p>
            <Button onClick={refresh} className="bg-slate-700 hover:bg-slate-600">
              Försök igen
            </Button>
          </div>
        </div>
      </div>
    )
  }

  // Not connected - show connect card
  if (!connected && !loading) {
    return (
      <div className="min-h-screen bg-slate-950 p-6">
        <div className="max-w-md mx-auto mt-20">
          <div className="bg-slate-900 rounded-xl p-8 border border-slate-800 text-center">
            <div className="w-16 h-16 bg-orange-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <BarChart3 className="w-8 h-8 text-orange-400" />
            </div>
            <h2 className="text-xl font-semibold text-white mb-2">
              Anslut Google Analytics
            </h2>
            <p className="text-slate-400 mb-6">
              Anslut ditt GA4-konto för att se trafikdata, avvisningsfrekvens och landningssidor.
            </p>
            <Button onClick={connectGA4} className="bg-orange-500 hover:bg-orange-600">
              <Link2 className="w-4 h-4 mr-2" />
              Anslut GA4
            </Button>
          </div>
        </div>
      </div>
    )
  }

  // Total sessions for percentage calculations
  const totalSessions = (trafficSources || []).reduce((sum, s) => sum + (s.sessions || 0), 0)

  return (
    <div className="min-h-screen bg-slate-950">
      {/* Header */}
      <div className="border-b border-slate-800 bg-slate-900/50 sticky top-0 z-10 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                <BarChart3 className="w-6 h-6 text-orange-400" />
                Google Analytics
              </h1>
              {propertyName && (
                <p className="text-sm text-slate-400 mt-1">{propertyName}</p>
              )}
            </div>
            <div className="flex items-center gap-3">
              <DateRangePicker
                value={dateRange}
                onChange={setDateRange}
              />
              <Button
                variant="outline"
                size="sm"
                onClick={handleSync}
                disabled={syncing || loading}
                className="border-slate-700 text-slate-300 hover:bg-slate-800"
              >
                {syncing ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4" />
                )}
              </Button>
            </div>
          </div>

          {/* Comparison toggle */}
          <div className="flex gap-2 mt-3">
            <button
              onClick={() => setComparisonMode('mom')}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                comparisonMode === 'mom'
                  ? 'bg-orange-500/20 text-orange-300 border border-orange-500/30'
                  : 'bg-slate-800 text-slate-400 border border-slate-700 hover:bg-slate-700'
              }`}
            >
              vs förra perioden
            </button>
            <button
              onClick={() => setComparisonMode('yoy')}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                comparisonMode === 'yoy'
                  ? 'bg-orange-500/20 text-orange-300 border border-orange-500/30'
                  : 'bg-slate-800 text-slate-400 border border-slate-700 hover:bg-slate-700'
              }`}
            >
              vs förra året
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-orange-400" />
          </div>
        ) : (
          <div className="space-y-6">
            {/* KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <KPICard
                title="Sessioner"
                value={summary?.totalSessions?.toLocaleString() || '0'}
                icon={Users}
                change={sessionsChange}
                color="orange"
              />
              <KPICard
                title="Engagerade sessioner"
                value={summary?.totalEngagedSessions?.toLocaleString() || '0'}
                icon={MousePointer}
                color="blue"
              />
              <KPICard
                title="Avvisningsfrekvens"
                value={`${((summary?.avgBounceRate || 0) * 100).toFixed(1)}%`}
                icon={TrendingDown}
                change={bounceChange}
                color={summary?.avgBounceRate > 0.5 ? 'red' : 'green'}
              />
              <KPICard
                title="Genomsnittlig sessionstid"
                value={formatDuration(summary?.avgSessionDuration || 0)}
                icon={Clock}
                change={durationChange}
                color="purple"
              />
            </div>

            {/* Traffic Sources & Landing Pages */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Traffic Sources */}
              <div className="bg-slate-900 rounded-xl border border-slate-800 p-6">
                <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                  <Globe className="w-5 h-5 text-orange-400" />
                  Trafikkällor
                </h3>
                <div className="space-y-3">
                  {trafficSources.slice(0, 8).map((source, i) => {
                    const pct = totalSessions > 0 ? (source.sessions / totalSessions) * 100 : 0
                    return (
                      <div key={i}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm text-slate-300">{source.channel}</span>
                          <div className="flex items-center gap-3">
                            <span className="text-sm text-slate-400">
                              {(source.bounce_rate * 100).toFixed(0)}% avv.
                            </span>
                            <span className="text-sm font-medium text-white">
                              {source.sessions.toLocaleString()}
                            </span>
                          </div>
                        </div>
                        <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{
                              width: `${pct}%`,
                              backgroundColor: getChannelColor(source.channel)
                            }}
                          />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Landing Pages */}
              <div className="bg-slate-900 rounded-xl border border-slate-800 p-6">
                <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                  <Link2 className="w-5 h-5 text-orange-400" />
                  Landningssidor
                </h3>
                <div className="space-y-2 max-h-[400px] overflow-y-auto">
                  {landingPages.map((page, i) => {
                    const bounceHigh = page.bounce_rate > 0.5
                    return (
                      <div
                        key={i}
                        className="flex items-center justify-between py-2 border-b border-slate-800 last:border-0"
                      >
                        <div className="flex-1 min-w-0 pr-4">
                          <p className="text-sm text-slate-300 truncate">
                            {page.page === '/' ? 'Startsida' : page.page}
                          </p>
                        </div>
                        <div className="flex items-center gap-4 flex-shrink-0">
                          <div className={`flex items-center gap-1 text-sm ${bounceHigh ? 'text-red-400' : 'text-green-400'}`}>
                            {bounceHigh ? (
                              <ArrowUpRight className="w-3 h-3" />
                            ) : (
                              <ArrowDownRight className="w-3 h-3" />
                            )}
                            {(page.bounce_rate * 100).toFixed(0)}%
                          </div>
                          <span className="text-sm font-medium text-white w-16 text-right">
                            {page.sessions.toLocaleString()}
                          </span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>

            {/* Daily Chart placeholder */}
            <div className="bg-slate-900 rounded-xl border border-slate-800 p-6">
              <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-orange-400" />
                Daglig trafik
              </h3>
              <div className="h-64 flex items-center justify-center">
                {dailySummary.length > 0 ? (
                  <div className="w-full">
                    {/* Simple bar chart */}
                    <div className="flex items-end justify-between h-48 gap-1">
                      {dailySummary.slice(0, 30).reverse().map((day, i) => {
                        const maxSessions = Math.max(...dailySummary.map(d => d.total_sessions || 0))
                        const height = maxSessions > 0 ? ((day.total_sessions || 0) / maxSessions) * 100 : 0
                        return (
                          <div
                            key={i}
                            className="flex-1 bg-orange-500/60 hover:bg-orange-500 transition-colors rounded-t cursor-pointer group relative"
                            style={{ height: `${height}%`, minHeight: '4px' }}
                            title={`${day.date}: ${day.total_sessions} sessioner`}
                          >
                            <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-10">
                              {day.date}: {day.total_sessions}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                    <div className="flex justify-between mt-2 text-xs text-slate-500">
                      <span>{dailySummary[dailySummary.length - 1]?.date}</span>
                      <span>{dailySummary[0]?.date}</span>
                    </div>
                  </div>
                ) : (
                  <p className="text-slate-500">Ingen data för vald period</p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default GA4Page

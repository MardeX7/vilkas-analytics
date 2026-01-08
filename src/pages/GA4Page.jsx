import { useState, useMemo } from 'react'
import { useGA4 } from '@/hooks/useGA4'
import { MetricCard, MetricCardGroup } from '@/components/MetricCard'
import { DateRangePicker, getDateRange, formatDateISO } from '@/components/DateRangePicker'
import { Button } from '@/components/ui/button'
import { useTranslation } from '@/lib/i18n'
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
    label: null // Will use translation
  }
}

// Format session duration from seconds to mm:ss
function formatDuration(seconds) {
  if (!seconds || isNaN(seconds)) return '0:00'
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

// Billackering brand-inspired channel colors
function getChannelColor(channel) {
  const colors = {
    'Organic Search': '#22c55e',
    'Direct': '#01a7da',     // Billackering blue
    'Paid Search': '#eee000', // Billackering yellow
    'Paid Social': '#ec4899',
    'Organic Social': '#8b5cf6',
    'Referral': '#14b8a6',
    'Email': '#d92d33',       // Billackering red
    'Cross-network': '#f97316',
    'Unassigned': '#6b7685'
  }
  return colors[channel] || '#6b7685'
}

export function GA4Page() {
  const { t } = useTranslation()
  // Initialize date range inside component to avoid module-level execution issues
  const [dateRange, setDateRange] = useState(() => createDefaultDateRange())
  const [syncing, setSyncing] = useState(false)
  const [comparisonMode, setComparisonMode] = useState('yoy') // Default YoY

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
    return (
      <div className="min-h-screen bg-background p-6">
        <div className="max-w-md mx-auto mt-20">
          <div className="bg-destructive-muted rounded-xl p-8 border border-destructive/30 text-center">
            <h2 className="text-xl font-semibold text-destructive mb-2">{t('common.error')}</h2>
            <p className="text-foreground-muted mb-4">{error}</p>
            <Button onClick={refresh} className="bg-background-subtle hover:bg-background-elevated border border-border">
              {t('ga4.tryAgain')}
            </Button>
          </div>
        </div>
      </div>
    )
  }

  // Not connected - show connect card
  if (!connected && !loading) {
    return (
      <div className="min-h-screen bg-background p-6">
        <div className="max-w-md mx-auto mt-20">
          <div className="bg-background-elevated rounded-xl p-8 border border-card-border text-center">
            <div className="w-16 h-16 bg-primary-muted rounded-full flex items-center justify-center mx-auto mb-4">
              <BarChart3 className="w-8 h-8 text-primary" />
            </div>
            <h2 className="text-xl font-semibold text-foreground mb-2">
              {t('ga4.connectTitle')}
            </h2>
            <p className="text-foreground-muted mb-6">
              {t('ga4.connectDescription')}
            </p>
            <Button onClick={connectGA4} className="bg-primary hover:bg-primary/90 text-primary-foreground">
              <Link2 className="w-4 h-4 mr-2" />
              {t('ga4.connect')}
            </Button>
          </div>
        </div>
      </div>
    )
  }

  // Total sessions for percentage calculations
  const totalSessions = (trafficSources || []).reduce((sum, s) => sum + (s.sessions || 0), 0)

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-background-elevated/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="px-8 py-5 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-foreground flex items-center gap-2">
              <BarChart3 className="w-6 h-6 text-primary" />
              {t('ga4.title')}
            </h1>
            {propertyName && (
              <p className="text-foreground-muted text-sm mt-1">{propertyName}</p>
            )}
          </div>
          <div className="flex items-center gap-3">
            <DateRangePicker
              value={dateRange?.preset || 'last30'}
              onChange={setDateRange}
            />
            {/* MoM/YoY Toggle */}
            <div className="flex bg-background-subtle rounded-lg p-1">
              <button
                onClick={() => setComparisonMode('mom')}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all ${
                  comparisonMode === 'mom'
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-foreground-muted hover:text-foreground'
                }`}
                title={t('comparison.momFull')}
              >
                {t('comparison.mom')}
              </button>
              <button
                onClick={() => setComparisonMode('yoy')}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all ${
                  comparisonMode === 'yoy'
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-foreground-muted hover:text-foreground'
                }`}
                title={t('comparison.yoyFull')}
              >
                {t('comparison.yoy')}
              </button>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleSync}
              disabled={syncing || loading}
              className="bg-background-elevated border-border text-foreground-muted hover:bg-background-subtle hover:text-foreground"
            >
              {syncing ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4" />
              )}
            </Button>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="px-8 py-8 max-w-7xl mx-auto">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : (
          <div className="space-y-6">
            {/* KPI Cards */}
            <MetricCardGroup columns={4} className="mb-8">
              <MetricCard
                label={t('ga4.sessions')}
                value={summary?.totalSessions || 0}
                delta={sessionsChange}
                deltaLabel={comparisonEnabled ? comparisonMode.toUpperCase() : undefined}
              />
              <MetricCard
                label={t('ga4.engagedSessions')}
                value={summary?.totalEngagedSessions || 0}
              />
              <MetricCard
                label={t('ga4.bounceRate')}
                value={`${((summary?.avgBounceRate || 0) * 100).toFixed(1)}%`}
                delta={bounceChange}
                deltaLabel={comparisonEnabled ? comparisonMode.toUpperCase() : undefined}
                invertDelta={true}
              />
              <MetricCard
                label={t('ga4.avgSessionDuration')}
                value={formatDuration(summary?.avgSessionDuration || 0)}
                delta={durationChange}
                deltaLabel={comparisonEnabled ? comparisonMode.toUpperCase() : undefined}
              />
            </MetricCardGroup>

            {/* Traffic Sources & Landing Pages */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Traffic Sources */}
              <div className="bg-background-elevated rounded-lg border border-card-border p-5">
                <h3 className="text-base font-medium text-foreground mb-4 flex items-center gap-2">
                  <Globe className="w-5 h-5 text-primary" />
                  {t('ga4.trafficSources')}
                </h3>
                <div className="space-y-3">
                  {trafficSources.slice(0, 8).map((source, i) => {
                    const pct = totalSessions > 0 ? (source.sessions / totalSessions) * 100 : 0
                    return (
                      <div key={i}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm text-foreground">{source.channel}</span>
                          <div className="flex items-center gap-3">
                            <span className="text-sm text-foreground-subtle tabular-nums">
                              {(source.bounce_rate * 100).toFixed(0)}% {t('ga4.bounceShort')}
                            </span>
                            <span className="text-sm font-medium text-foreground tabular-nums">
                              {source.sessions.toLocaleString()}
                            </span>
                          </div>
                        </div>
                        <div className="h-1.5 bg-background-subtle rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-500"
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
              <div className="bg-background-elevated rounded-lg border border-card-border p-5">
                <h3 className="text-base font-medium text-foreground mb-4 flex items-center gap-2">
                  <Link2 className="w-5 h-5 text-primary" />
                  {t('ga4.landingPages')}
                </h3>
                <div className="space-y-2 max-h-[400px] overflow-y-auto">
                  {landingPages.map((page, i) => {
                    const bounceHigh = page.bounce_rate > 0.5
                    return (
                      <div
                        key={i}
                        className="flex items-center justify-between py-2 border-b border-border last:border-0"
                      >
                        <div className="flex-1 min-w-0 pr-4">
                          <p className="text-sm text-foreground truncate">
                            {page.page === '/' ? t('ga4.homePage') : page.page}
                          </p>
                        </div>
                        <div className="flex items-center gap-4 flex-shrink-0">
                          <div className={`flex items-center gap-1 text-sm ${bounceHigh ? 'text-destructive' : 'text-success'}`}>
                            {bounceHigh ? (
                              <ArrowUpRight className="w-3 h-3" />
                            ) : (
                              <ArrowDownRight className="w-3 h-3" />
                            )}
                            {(page.bounce_rate * 100).toFixed(0)}%
                          </div>
                          <span className="text-sm font-medium text-foreground w-16 text-right tabular-nums">
                            {page.sessions.toLocaleString()}
                          </span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>

            {/* Daily Chart */}
            <div className="bg-background-elevated rounded-lg border border-card-border p-5">
              <h3 className="text-base font-medium text-foreground mb-4 flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-primary" />
                {t('ga4.dailyTraffic')}
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
                            className="flex-1 bg-primary/60 hover:bg-primary transition-colors rounded-t cursor-pointer group relative"
                            style={{ height: `${height}%`, minHeight: '4px' }}
                            title={`${day.date}: ${day.total_sessions} ${t('ga4.sessions').toLowerCase()}`}
                          >
                            <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-background-subtle border border-border text-foreground text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-10">
                              {day.date}: {day.total_sessions}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                    <div className="flex justify-between mt-2 text-xs text-foreground-subtle">
                      <span>{dailySummary[dailySummary.length - 1]?.date}</span>
                      <span>{dailySummary[0]?.date}</span>
                    </div>
                  </div>
                ) : (
                  <p className="text-foreground-subtle">{t('ga4.noDataForPeriod')}</p>
                )}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

export default GA4Page

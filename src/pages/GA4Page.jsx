import { useState } from 'react'
import { useGA4 } from '@/hooks/useGA4'
import { useGA4Ecommerce } from '@/hooks/useGA4Ecommerce'
import { MetricCard, MetricCardGroup } from '@/components/MetricCard'
import { DateRangePicker, getDateRange, formatDateISO } from '@/components/DateRangePicker'
import { Button } from '@/components/ui/button'
import { useTranslation } from '@/lib/i18n'
import {
  TrendingUp,
  TrendingDown,
  RefreshCw,
  Link2,
  BarChart3,
  Globe,
  Loader2,
  ArrowUpRight,
  ShoppingCart,
  Eye,
  AlertTriangle,
  MousePointer
} from 'lucide-react'
import { BrowseAnalysisCard } from '@/components/BrowseAnalysisCard'
import { TopProductsGA4 } from '@/components/TopProductsGA4'

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
    deviceBreakdown = [],
    summary,
    previousSummary,
    comparisonEnabled,
    connected,
    propertyName,
    connectGA4,
    syncGA4,
    loading,
    error,
    refresh,
    riskRadar = { decliningPages: [], channelDecline: [], deviceShift: [] }
  } = useGA4(dateRange, comparisonMode)

  // E-commerce data
  const {
    topProducts = [],
    previousTopProducts = [],
    productFunnel,
    lowConversionProducts = [],
    loading: ecommerceLoading,
    syncEcommerce,
    comparisonEnabled: ecommerceComparisonEnabled
  } = useGA4Ecommerce(dateRange, comparisonMode)

  // Calculate change percentages
  const getChangePercent = (current, previous) => {
    if (!previous || previous === 0) return null
    return ((current - previous) / previous) * 100
  }

  const sessionsChange = comparisonEnabled && previousSummary
    ? getChangePercent(summary?.totalSessions, previousSummary.totalSessions)
    : null

  const handleSync = async () => {
    setSyncing(true)
    try {
      // Sync both behavioral and e-commerce data in parallel
      await Promise.all([
        syncGA4(dateRange.startDate, dateRange.endDate),
        syncEcommerce(dateRange.startDate, dateRange.endDate)
      ])
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
            {/* KPI Cards - Row 1: GSC Organic Traffic (real data) */}
            <MetricCardGroup columns={4} className="mb-6">
              <MetricCard
                label={t('gsc.clicks')}
                value={summary?.totalSessions || 0}
                delta={sessionsChange}
                deltaLabel={comparisonEnabled ? comparisonMode.toUpperCase() : undefined}
              />
              <MetricCard
                label={t('gsc.impressions')}
                value={summary?.totalImpressions || 0}
                delta={comparisonEnabled && previousSummary?.totalImpressions
                  ? getChangePercent(summary?.totalImpressions, previousSummary.totalImpressions)
                  : null}
                deltaLabel={comparisonEnabled ? comparisonMode.toUpperCase() : undefined}
              />
              <MetricCard
                label={t('gsc.ctr')}
                value={summary?.totalImpressions > 0
                  ? `${((summary.totalSessions / summary.totalImpressions) * 100).toFixed(2)}%`
                  : '—'}
              />
              <MetricCard
                label={t('gsc.avgPosition')}
                value={summary?.avgPosition?.toFixed(1) || '—'}
              />
            </MetricCardGroup>

            {/* Device Breakdown - Real GSC data */}
            <MetricCardGroup columns={1} className="mb-8">
              <div className="bg-background-elevated rounded-xl p-5 border border-border">
                <h3 className="text-sm font-medium text-foreground-muted mb-3">{t('ga4.deviceBreakdown')}</h3>
                {deviceBreakdown.length > 0 ? (
                  <div className="flex gap-8">
                    {deviceBreakdown.map((device) => (
                      <div key={device.device} className="flex items-center gap-3">
                        <span className="text-sm text-foreground capitalize">{device.device.toLowerCase()}</span>
                        <div className="flex items-center gap-2">
                          <div className="w-24 h-2 bg-background-subtle rounded-full overflow-hidden">
                            <div
                              className="h-full bg-primary rounded-full"
                              style={{ width: `${device.percentage}%` }}
                            />
                          </div>
                          <span className="text-sm font-medium text-foreground w-12 text-right">{device.percentage}%</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-foreground-muted">{t('common.loading')}</p>
                )}
              </div>
            </MetricCardGroup>

            {/* Traffic Sources & Landing Pages */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Traffic Sources */}
              <div className="bg-background-elevated rounded-lg border border-card-border p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-base font-medium text-foreground flex items-center gap-2">
                    <Globe className="w-5 h-5 text-primary" />
                    {t('ga4.trafficSources')}
                  </h3>
                  {comparisonEnabled && (
                    <span className="text-xs text-foreground-subtle px-2 py-0.5 bg-background-subtle rounded">
                      {comparisonMode.toUpperCase()}
                    </span>
                  )}
                </div>
                <div className="space-y-3">
                  {trafficSources.slice(0, 8).map((source, i) => {
                    const pct = totalSessions > 0 ? (source.sessions / totalSessions) * 100 : 0
                    // Calculate CTR for this source
                    const ctr = source.impressions > 0 ? (source.sessions / source.impressions) * 100 : null
                    // Calculate change vs previous period (per-channel comparison)
                    const sessionsChange = comparisonEnabled && source.previousSessions > 0
                      ? getChangePercent(source.sessions, source.previousSessions)
                      : null

                    return (
                      <div key={i}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm text-foreground">{source.channel}</span>
                          <div className="flex items-center gap-3">
                            {source.impressions != null && (
                              <span className="text-sm text-foreground-subtle tabular-nums">
                                {source.impressions.toLocaleString()} {t('gsc.impressions').toLowerCase()}
                              </span>
                            )}
                            <span className="text-sm font-medium text-foreground tabular-nums">
                              {source.sessions.toLocaleString()} {t('gsc.clicks').toLowerCase()}
                            </span>
                            {sessionsChange !== null && (
                              <span className={`inline-flex items-center gap-0.5 text-xs tabular-nums ${
                                sessionsChange > 0 ? 'text-success' : sessionsChange < 0 ? 'text-destructive' : 'text-foreground-subtle'
                              }`}>
                                {sessionsChange > 0 && <TrendingUp className="w-3 h-3" />}
                                {sessionsChange < 0 && <TrendingDown className="w-3 h-3" />}
                                {sessionsChange > 0 && '+'}{sessionsChange.toFixed(0)}%
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 mb-1">
                          <div className="flex-1 h-1.5 bg-background-subtle rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all duration-500"
                              style={{
                                width: `${pct}%`,
                                backgroundColor: getChannelColor(source.channel)
                              }}
                            />
                          </div>
                          {ctr !== null && (
                            <span className="text-xs text-foreground-muted tabular-nums w-14 text-right">
                              CTR {ctr.toFixed(2)}%
                            </span>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Landing Pages */}
              <div className="bg-background-elevated rounded-lg border border-card-border p-5">
                <div className="mb-4">
                  <h3 className="text-base font-medium text-foreground flex items-center gap-2">
                    <Link2 className="w-5 h-5 text-primary" />
                    {t('ga4.landingPages')}
                  </h3>
                  <p className="text-xs text-foreground-muted mt-1">{t('ga4.landingPagesSubtitle')}</p>
                </div>
                {/* Column headers */}
                <div className="flex items-center justify-between pb-2 mb-2 border-b border-border text-xs text-foreground-muted">
                  <span>{t('gsc.page')}</span>
                  <div className="flex items-center gap-4">
                    <span className="w-16 text-right">{t('gsc.ctr')}</span>
                    <span className="w-16 text-right">{t('gsc.clicks')}</span>
                  </div>
                </div>
                <div className="space-y-2 max-h-[360px] overflow-y-auto">
                  {landingPages.map((page, i) => {
                    const ctrGood = page.ctr > 0.05 // 5% CTR is good
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
                          <div className={`flex items-center gap-1 text-sm w-16 justify-end ${ctrGood ? 'text-success' : 'text-foreground-muted'}`}>
                            {ctrGood && <ArrowUpRight className="w-3 h-3" />}
                            {page.ctr != null ? `${(page.ctr * 100).toFixed(1)}%` : '—'}
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

            {/* Risk Radar Section */}
            <div className="mb-8">
              <div className="flex items-center gap-2 mb-4">
                <AlertTriangle className="w-5 h-5 text-warning" />
                <h2 className="text-lg font-semibold text-foreground">{t('gsc.riskRadar.title')}</h2>
                <span className="text-sm text-foreground-muted">— {t('gsc.riskRadar.subtitle')}</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Declining Landing Pages */}
                <div className="bg-background-elevated rounded-lg border border-card-border p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <TrendingDown className="w-4 h-4 text-destructive" />
                    <h3 className="text-sm font-medium text-foreground">{t('gsc.riskRadar.decliningPages')}</h3>
                  </div>
                  <p className="text-xs text-foreground-muted mb-3">{t('gsc.riskRadar.decliningPagesDesc')}</p>

                  {riskRadar.decliningPages.length > 0 ? (
                    <div className="space-y-2">
                      {riskRadar.decliningPages.slice(0, 5).map((page, i) => (
                        <div
                          key={i}
                          className={`p-2 rounded-md border ${
                            page.severity === 'critical'
                              ? 'bg-destructive/10 border-destructive/30'
                              : 'bg-warning/10 border-warning/30'
                          }`}
                        >
                          <p className="text-sm text-foreground truncate" title={page.page}>
                            {page.page}
                          </p>
                          <div className="flex items-center gap-3 mt-1 text-xs">
                            <span className="text-destructive">
                              {t('gsc.riskRadar.clicks')}: {page.clicksChange.toFixed(0)}%
                            </span>
                            <span className="text-foreground-muted">
                              {page.week1Clicks} → {page.week3Clicks}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-foreground-muted py-4 text-center">
                      {t('gsc.riskRadar.noIssues')}
                    </p>
                  )}
                </div>

                {/* Traffic Health Summary */}
                <div className="bg-background-elevated rounded-lg border border-card-border p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Globe className="w-4 h-4 text-primary" />
                    <h3 className="text-sm font-medium text-foreground">{t('ga4.trafficHealth')}</h3>
                  </div>
                  <p className="text-xs text-foreground-muted mb-3">{t('ga4.trafficHealthDesc')}</p>

                  <div className="space-y-3">
                    {/* Organic Search status */}
                    <div className="flex items-center justify-between p-2 bg-background-subtle rounded-md">
                      <span className="text-sm text-foreground">Organic Search</span>
                      <span className={`text-sm font-medium ${
                        riskRadar.decliningPages.length === 0 ? 'text-success' : 'text-warning'
                      }`}>
                        {riskRadar.decliningPages.length === 0 ? t('ga4.healthy') : `${riskRadar.decliningPages.length} ${t('ga4.pagesAtRisk')}`}
                      </span>
                    </div>

                    {/* Device breakdown health */}
                    {deviceBreakdown.length > 0 && (
                      <div className="flex items-center justify-between p-2 bg-background-subtle rounded-md">
                        <span className="text-sm text-foreground">{t('ga4.deviceBreakdown')}</span>
                        <span className="text-sm font-medium text-success">{t('ga4.balanced')}</span>
                      </div>
                    )}

                    {/* Total pages monitored */}
                    <div className="flex items-center justify-between p-2 bg-background-subtle rounded-md">
                      <span className="text-sm text-foreground">{t('ga4.pagesMonitored')}</span>
                      <span className="text-sm font-medium text-foreground">{landingPages.length}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* E-commerce Section */}
            {topProducts.length > 0 && (
              <>
                {/* E-commerce Funnel KPIs */}
                <div className="mt-8">
                  <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                    <ShoppingCart className="w-5 h-5 text-primary" />
                    {t('ga4.ecommerce.title')}
                  </h2>
                  <MetricCardGroup columns={4} className="mb-6">
                    <MetricCard
                      label={t('ga4.ecommerce.itemsViewed')}
                      value={productFunnel?.totalViews?.toLocaleString() || 0}
                    />
                    <MetricCard
                      label={t('ga4.ecommerce.addedToCart')}
                      value={productFunnel?.totalAddToCart?.toLocaleString() || 0}
                      subtitle={productFunnel?.totalViews > 0 ? `${((productFunnel.viewToCartRate) * 100).toFixed(1)}% ${t('ga4.ecommerce.conversionRate')}` : undefined}
                    />
                    <MetricCard
                      label={t('ga4.ecommerce.purchased')}
                      value={productFunnel?.totalPurchased?.toLocaleString() || 0}
                      subtitle={productFunnel?.totalAddToCart > 0 ? `${((productFunnel.cartToPurchaseRate) * 100).toFixed(1)}% ${t('ga4.ecommerce.conversionRate')}` : undefined}
                    />
                    <MetricCard
                      label={t('ga4.ecommerce.revenue')}
                      value={`kr${(productFunnel?.totalRevenue || 0).toLocaleString('sv-SE', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`}
                    />
                  </MetricCardGroup>
                </div>

                {/* Top Products by Revenue (with comparison) */}
                <TopProductsGA4
                  products={topProducts}
                  previousProducts={previousTopProducts}
                  compare={ecommerceComparisonEnabled}
                  comparisonMode={comparisonMode}
                />

                {/* Top Products & Problem Products */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
                  {/* Top Products by Views */}
                  <div className="bg-background-elevated rounded-lg border border-card-border p-5">
                    <div className="mb-4">
                      <h3 className="text-base font-medium text-foreground flex items-center gap-2">
                        <Eye className="w-5 h-5 text-primary" />
                        {t('ga4.ecommerce.topProducts')}
                      </h3>
                      <p className="text-xs text-foreground-muted mt-1">{t('ga4.ecommerce.topProductsDesc')}</p>
                    </div>
                    {/* Column headers */}
                    <div className="flex items-center justify-between pb-2 mb-2 border-b border-border text-xs text-foreground-muted">
                      <span>{t('ga4.ecommerce.product')}</span>
                      <div className="flex items-center gap-3">
                        <span className="w-14 text-right">{t('ga4.ecommerce.views')}</span>
                        <span className="w-14 text-right">{t('ga4.ecommerce.cart')}</span>
                        <span className="w-14 text-right">{t('ga4.ecommerce.sold')}</span>
                      </div>
                    </div>
                    <div className="space-y-2 max-h-[320px] overflow-y-auto">
                      {topProducts.slice(0, 15).map((product, i) => (
                        <div
                          key={i}
                          className="flex items-center justify-between py-2 border-b border-border last:border-0"
                        >
                          <div className="flex-1 min-w-0 pr-3">
                            <p className="text-sm text-foreground truncate" title={product.item_name}>
                              {product.item_name}
                            </p>
                          </div>
                          <div className="flex items-center gap-3 flex-shrink-0">
                            <span className="text-sm text-foreground-muted w-14 text-right tabular-nums">
                              {product.items_viewed.toLocaleString()}
                            </span>
                            <span className="text-sm text-foreground-muted w-14 text-right tabular-nums">
                              {product.items_added_to_cart.toLocaleString()}
                            </span>
                            <span className="text-sm font-medium text-foreground w-14 text-right tabular-nums">
                              {product.items_purchased.toLocaleString()}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Low Conversion Products */}
                  <div className="bg-background-elevated rounded-lg border border-card-border p-5">
                    <div className="mb-4">
                      <h3 className="text-base font-medium text-foreground flex items-center gap-2">
                        <AlertTriangle className="w-5 h-5 text-warning" />
                        {t('ga4.ecommerce.lowConversion')}
                      </h3>
                      <p className="text-xs text-foreground-muted mt-1">{t('ga4.ecommerce.lowConversionDesc')}</p>
                    </div>
                    {lowConversionProducts.length > 0 ? (
                      <>
                        {/* Column headers */}
                        <div className="flex items-center justify-between pb-2 mb-2 border-b border-border text-xs text-foreground-muted">
                          <span>{t('ga4.ecommerce.product')}</span>
                          <div className="flex items-center gap-3">
                            <span className="w-14 text-right">{t('ga4.ecommerce.views')}</span>
                            <span className="w-16 text-right">{t('ga4.ecommerce.cartRate')}</span>
                          </div>
                        </div>
                        <div className="space-y-2 max-h-[320px] overflow-y-auto">
                          {lowConversionProducts.map((product, i) => (
                            <div
                              key={i}
                              className="flex items-center justify-between py-2 border-b border-border last:border-0"
                            >
                              <div className="flex-1 min-w-0 pr-3">
                                <p className="text-sm text-foreground truncate" title={product.item_name}>
                                  {product.item_name}
                                </p>
                              </div>
                              <div className="flex items-center gap-3 flex-shrink-0">
                                <span className="text-sm text-foreground-muted w-14 text-right tabular-nums">
                                  {product.items_viewed.toLocaleString()}
                                </span>
                                <span className="text-sm font-medium text-destructive w-16 text-right tabular-nums">
                                  {(product.view_to_cart_rate * 100).toFixed(1)}%
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </>
                    ) : (
                      <div className="py-8 text-center text-foreground-muted text-sm">
                        {t('ga4.ecommerce.noLowConversion')}
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}

            {/* E-commerce empty state */}
            {topProducts.length === 0 && !ecommerceLoading && (
              <div className="mt-8 bg-background-elevated rounded-lg border border-card-border p-8 text-center">
                <ShoppingCart className="w-12 h-12 text-foreground-muted mx-auto mb-4" />
                <h3 className="text-lg font-medium text-foreground mb-2">{t('ga4.ecommerce.noData')}</h3>
                <p className="text-foreground-muted text-sm mb-4">{t('ga4.ecommerce.noDataDesc')}</p>
                <Button
                  variant="outline"
                  onClick={() => syncEcommerce(dateRange.startDate, dateRange.endDate)}
                  disabled={syncing}
                  className="bg-background-subtle border-border"
                >
                  <RefreshCw className={`w-4 h-4 mr-2 ${syncing ? 'animate-spin' : ''}`} />
                  {t('ga4.ecommerce.syncNow')}
                </Button>
              </div>
            )}

            {/* Browse Analysis Section */}
            <div className="mt-8">
              <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                <MousePointer className="w-5 h-5 text-primary" />
                {t('insights.tabs.browse')}
              </h2>
              <BrowseAnalysisCard
                startDate={dateRange.startDate}
                endDate={dateRange.endDate}
              />
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

export default GA4Page

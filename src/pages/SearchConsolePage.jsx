import { useState } from 'react'
import { useGSC } from '@/hooks/useGSC'
import { MetricCard, MetricCardGroup } from '@/components/MetricCard'
import { DateRangePicker, getDateRange, formatDateISO, getYearOverYearPeriod } from '@/components/DateRangePicker'
import {
  GSCConnectCard,
  GSCDailyChart,
  GSCTopQueries,
  GSCTopPages,
  GSCDeviceChart,
  GSCCountryChart
} from '@/components/GSCCharts'
import { Search, RefreshCw, Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useTranslation } from '@/lib/i18n'

// Helper to create default date range with YoY comparison enabled
function createDefaultDateRange() {
  const range = getDateRange('last30')
  const yoyRange = getYearOverYearPeriod(range.startDate, range.endDate)
  return {
    preset: 'last30',
    startDate: formatDateISO(range.startDate),
    endDate: formatDateISO(range.endDate),
    label: null,
    compare: true,
    compareMode: 'yoy',
    previousStartDate: formatDateISO(yoyRange.startDate),
    previousEndDate: formatDateISO(yoyRange.endDate)
  }
}

export function SearchConsolePage() {
  const { t } = useTranslation()
  const [dateRange, setDateRange] = useState(() => createDefaultDateRange())
  const [syncing, setSyncing] = useState(false)
  const [comparisonMode, setComparisonMode] = useState('yoy') // 'mom' or 'yoy', default YoY

  const {
    dailySummary,
    topQueries,
    topPages,
    deviceBreakdown,
    countryBreakdown,
    summary,
    keywordBuckets,
    totalUniqueKeywords,
    page1Keywords,
    previousKeywordBuckets,
    previousTotalUniqueKeywords,
    previousPage1Keywords,
    previousDailySummary,
    previousSummary,
    comparisonEnabled,
    connected,
    connectGSC,
    syncGSC,
    loading,
    refresh
  } = useGSC(dateRange, comparisonMode)

  // Calculate change percentages for comparison
  const getChangePercent = (current, previous) => {
    if (!previous || previous === 0) return null
    return ((current - previous) / previous) * 100
  }

  const clicksChange = comparisonEnabled && previousSummary
    ? getChangePercent(summary?.totalClicks, previousSummary.totalClicks)
    : null
  const impressionsChange = comparisonEnabled && previousSummary
    ? getChangePercent(summary?.totalImpressions, previousSummary.totalImpressions)
    : null
  const ctrChange = comparisonEnabled && previousSummary
    ? getChangePercent(summary?.avgCtr, previousSummary.avgCtr)
    : null
  // For position, lower is better, so invert the comparison
  const positionChange = comparisonEnabled && previousSummary
    ? getChangePercent(previousSummary.avgPosition, summary?.avgPosition)
    : null

  // Keyword stats changes
  const totalKeywordsChange = comparisonEnabled && previousTotalUniqueKeywords
    ? getChangePercent(totalUniqueKeywords, previousTotalUniqueKeywords)
    : null
  const page1KeywordsChange = comparisonEnabled && previousPage1Keywords
    ? getChangePercent(page1Keywords, previousPage1Keywords)
    : null

  const handleSync = async () => {
    setSyncing(true)
    try {
      await syncGSC(dateRange.startDate, dateRange.endDate)
      await refresh()
    } catch (err) {
      console.error('Sync failed:', err)
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-background-elevated/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="px-8 py-5 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-foreground flex items-center gap-2">
              <Search className="w-6 h-6 text-primary" />
              {t('gsc.title')}
            </h1>
            <p className="text-foreground-muted text-sm mt-1">{t('gsc.subtitle')}</p>
          </div>
          <div className="flex items-center gap-3">
            <DateRangePicker
              value={dateRange.preset}
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
            {connected && (
              <Button
                onClick={handleSync}
                disabled={syncing}
                variant="outline"
                size="sm"
                className="bg-background-elevated border-border text-foreground-muted hover:bg-background-subtle hover:text-foreground"
              >
                <Download className={`w-4 h-4 mr-2 ${syncing ? 'animate-spin' : ''}`} />
                {syncing ? t('common.loading') : t('gsc.syncData')}
              </Button>
            )}
            <Button
              onClick={refresh}
              variant="outline"
              size="sm"
              className="bg-background-elevated border-border text-foreground-muted hover:bg-background-subtle hover:text-foreground"
            >
              <RefreshCw className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="px-8 py-8 max-w-7xl mx-auto">
        {!connected ? (
          <GSCConnectCard onConnect={connectGSC} />
        ) : loading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-foreground-muted text-sm">{t('common.loading')}</p>
          </div>
        ) : (
          <>
            {/* KPI Cards */}
            <MetricCardGroup columns={4} className="mb-6">
              <MetricCard
                label={t('gsc.clicks')}
                value={summary?.totalClicks || 0}
                delta={clicksChange}
                deltaLabel={comparisonEnabled ? comparisonMode.toUpperCase() : undefined}
              />
              <MetricCard
                label={t('gsc.impressions')}
                value={summary?.totalImpressions || 0}
                delta={impressionsChange}
                deltaLabel={comparisonEnabled ? comparisonMode.toUpperCase() : undefined}
              />
              <MetricCard
                label={t('gsc.ctr')}
                value={`${((summary?.avgCtr || 0) * 100).toFixed(1)}%`}
                delta={ctrChange}
                deltaLabel={comparisonEnabled ? comparisonMode.toUpperCase() : undefined}
              />
              <MetricCard
                label={t('gsc.avgPosition')}
                value={(summary?.avgPosition || 0).toFixed(1)}
                delta={positionChange}
                deltaLabel={comparisonEnabled ? comparisonMode.toUpperCase() : undefined}
                invertDelta={true}
              />
            </MetricCardGroup>

            {/* Keyword Stats */}
            <MetricCardGroup columns={3} className="mb-8">
              <MetricCard
                label={t('gsc.totalKeywords')}
                value={totalUniqueKeywords}
                delta={totalKeywordsChange}
                deltaLabel={comparisonEnabled ? comparisonMode.toUpperCase() : undefined}
              />
              <MetricCard
                label={t('gsc.page1Keywords')}
                value={page1Keywords}
                subtitle={totalUniqueKeywords > 0 ? `${((page1Keywords / totalUniqueKeywords) * 100).toFixed(0)}% ${t('gsc.ofTotal')}` : undefined}
                delta={page1KeywordsChange}
                deltaLabel={comparisonEnabled ? comparisonMode.toUpperCase() : undefined}
              />
              <div className="bg-background-elevated rounded-xl p-5 border border-border">
                <h3 className="text-sm font-medium text-foreground-muted mb-3">{t('gsc.rankingDistribution')}</h3>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-foreground">Top 3</span>
                    <div className="flex items-center gap-2">
                      <div className="w-24 h-2 bg-background-subtle rounded-full overflow-hidden">
                        <div
                          className="h-full bg-green-500 rounded-full"
                          style={{ width: `${totalUniqueKeywords > 0 ? (keywordBuckets.top3 / totalUniqueKeywords) * 100 : 0}%` }}
                        />
                      </div>
                      <span className="text-sm font-medium text-foreground w-8 text-right">{keywordBuckets.top3}</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-foreground">4-10</span>
                    <div className="flex items-center gap-2">
                      <div className="w-24 h-2 bg-background-subtle rounded-full overflow-hidden">
                        <div
                          className="h-full bg-blue-500 rounded-full"
                          style={{ width: `${totalUniqueKeywords > 0 ? (keywordBuckets.top10 / totalUniqueKeywords) * 100 : 0}%` }}
                        />
                      </div>
                      <span className="text-sm font-medium text-foreground w-8 text-right">{keywordBuckets.top10}</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-foreground">11-20</span>
                    <div className="flex items-center gap-2">
                      <div className="w-24 h-2 bg-background-subtle rounded-full overflow-hidden">
                        <div
                          className="h-full bg-yellow-500 rounded-full"
                          style={{ width: `${totalUniqueKeywords > 0 ? (keywordBuckets.top20 / totalUniqueKeywords) * 100 : 0}%` }}
                        />
                      </div>
                      <span className="text-sm font-medium text-foreground w-8 text-right">{keywordBuckets.top20}</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-foreground">20+</span>
                    <div className="flex items-center gap-2">
                      <div className="w-24 h-2 bg-background-subtle rounded-full overflow-hidden">
                        <div
                          className="h-full bg-red-400 rounded-full"
                          style={{ width: `${totalUniqueKeywords > 0 ? (keywordBuckets.beyond20 / totalUniqueKeywords) * 100 : 0}%` }}
                        />
                      </div>
                      <span className="text-sm font-medium text-foreground w-8 text-right">{keywordBuckets.beyond20}</span>
                    </div>
                  </div>
                </div>
              </div>
            </MetricCardGroup>

            {dailySummary.length > 0 ? (
              <>
                {/* Daily chart full width */}
                <div className="mb-6">
                  <GSCDailyChart
                    data={dailySummary}
                    previousData={previousDailySummary}
                    comparisonEnabled={comparisonEnabled}
                  />
                </div>

                {/* Queries and Pages */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                  <GSCTopQueries queries={topQueries} />
                  <GSCTopPages pages={topPages} />
                </div>

                {/* Device and Country */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <GSCDeviceChart devices={deviceBreakdown} />
                  <GSCCountryChart countries={countryBreakdown} />
                </div>
              </>
            ) : (
              <div className="bg-background-elevated/50 rounded-lg p-8 text-center border border-border">
                <Search className="w-12 h-12 text-foreground-subtle mx-auto mb-4" />
                <h3 className="text-lg font-medium text-foreground mb-2">{t('gsc.noData')}</h3>
                <p className="text-foreground-muted mb-4">
                  {t('gsc.noDataDescription')}
                </p>
                <Button onClick={handleSync} disabled={syncing}>
                  <Download className={`w-4 h-4 mr-2 ${syncing ? 'animate-spin' : ''}`} />
                  {syncing ? t('common.loading') : t('gsc.syncDataNow')}
                </Button>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  )
}

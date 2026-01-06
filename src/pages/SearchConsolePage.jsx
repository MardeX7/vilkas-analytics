import { useState } from 'react'
import { useGSC } from '@/hooks/useGSC'
import { KPICard } from '@/components/KPICard'
import { DateRangePicker, getDateRange, formatDateISO } from '@/components/DateRangePicker'
import {
  GSCConnectCard,
  GSCDailyChart,
  GSCTopQueries,
  GSCTopPages,
  GSCDeviceChart,
  GSCCountryChart
} from '@/components/GSCCharts'
import { Search, MousePointer, Eye, Target, RefreshCw, Download } from 'lucide-react'
import { Button } from '@/components/ui/button'

const defaultRange = getDateRange('last30')
const defaultDateRange = {
  preset: 'last30',
  startDate: formatDateISO(defaultRange.startDate),
  endDate: formatDateISO(defaultRange.endDate),
  label: 'Senaste 30 dagarna'
}

export function SearchConsolePage() {
  const [dateRange, setDateRange] = useState(defaultDateRange)
  const [syncing, setSyncing] = useState(false)
  const [comparisonMode, setComparisonMode] = useState('mom') // 'mom' or 'yoy'

  const {
    dailySummary,
    topQueries,
    topPages,
    deviceBreakdown,
    countryBreakdown,
    summary,
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
    <div className="min-h-screen bg-slate-950">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="px-8 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
              <Search className="w-6 h-6 text-cyan-400" />
              Google Search Console
            </h1>
            <p className="text-slate-400 text-sm mt-1">Organisk söktrafik och sökordsprestanda</p>
          </div>
          <div className="flex items-center gap-3">
            <DateRangePicker
              value={dateRange.preset}
              onChange={setDateRange}
            />
            {/* MoM/YoY Toggle */}
            <div className="flex bg-slate-800 rounded-lg p-1">
              <button
                onClick={() => setComparisonMode('mom')}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all ${
                  comparisonMode === 'mom'
                    ? 'bg-cyan-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title="Månad för månad"
              >
                MoM
              </button>
              <button
                onClick={() => setComparisonMode('yoy')}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all ${
                  comparisonMode === 'yoy'
                    ? 'bg-cyan-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title="År för år"
              >
                YoY
              </button>
            </div>
            {connected && (
              <Button
                onClick={handleSync}
                disabled={syncing}
                variant="outline"
                size="sm"
                className="bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700"
              >
                <Download className={`w-4 h-4 mr-2 ${syncing ? 'animate-spin' : ''}`} />
                {syncing ? 'Synkar...' : 'Synka data'}
              </Button>
            )}
            <Button
              onClick={refresh}
              variant="outline"
              size="sm"
              className="bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700"
            >
              <RefreshCw className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="px-8 py-8">
        {!connected ? (
          <GSCConnectCard onConnect={connectGSC} />
        ) : loading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-400 mx-auto mb-4"></div>
            <p className="text-slate-400 text-sm">Laddar Search Console data...</p>
          </div>
        ) : (
          <>
            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
              <KPICard
                title="Klick"
                value={summary?.totalClicks || 0}
                icon={MousePointer}
                change={clicksChange}
                previousValue={previousSummary?.totalClicks}
                comparisonMode={comparisonEnabled ? comparisonMode : null}
              />
              <KPICard
                title="Visningar"
                value={summary?.totalImpressions || 0}
                icon={Eye}
                change={impressionsChange}
                previousValue={previousSummary?.totalImpressions}
                comparisonMode={comparisonEnabled ? comparisonMode : null}
              />
              <KPICard
                title="Snitt CTR"
                value={`${((summary?.avgCtr || 0) * 100).toFixed(1)}%`}
                icon={Target}
                change={ctrChange}
                comparisonMode={comparisonEnabled ? comparisonMode : null}
                previousValue={previousSummary ? `${(previousSummary.avgCtr * 100).toFixed(1)}%` : null}
              />
              <KPICard
                title="Snittposition"
                value={(summary?.avgPosition || 0).toFixed(1)}
                icon={Search}
                change={positionChange}
                previousValue={previousSummary?.avgPosition?.toFixed(1)}
                invertColor={true}
                comparisonMode={comparisonEnabled ? comparisonMode : null}
              />
            </div>

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
              <div className="bg-slate-800/30 rounded-lg p-8 text-center border border-slate-700/50">
                <Search className="w-12 h-12 text-slate-600 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-white mb-2">Ingen data ännu</h3>
                <p className="text-slate-400 mb-4">
                  Klicka på "Synka data" för att hämta data från Google Search Console.
                </p>
                <Button onClick={handleSync} disabled={syncing}>
                  <Download className={`w-4 h-4 mr-2 ${syncing ? 'animate-spin' : ''}`} />
                  {syncing ? 'Synkar...' : 'Synka data nu'}
                </Button>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  )
}

import { useState } from 'react'
import { useAnalytics } from '@/hooks/useAnalytics'
import { useGSC } from '@/hooks/useGSC'
import { KPICard } from '@/components/KPICard'
import { DailySalesChart, WeekdayChart, HourlyChart } from '@/components/SalesChart'
import { TopProducts } from '@/components/TopProducts'
import { PaymentMethodsChart, ShippingMethodsChart } from '@/components/PaymentMethods'
import { DateRangePicker, getDateRange, formatDateISO } from '@/components/DateRangePicker'
import {
  GSCConnectCard,
  GSCDailyChart,
  GSCTopQueries,
  GSCTopPages,
  GSCDeviceChart,
  GSCCountryChart
} from '@/components/GSCCharts'
import { DollarSign, ShoppingCart, Users, TrendingUp, RefreshCw, Search, MousePointer, Eye, Target } from 'lucide-react'
import { Button } from '@/components/ui/button'

// Default to last 30 days
const defaultRange = getDateRange('last30')
const defaultDateRange = {
  preset: 'last30',
  startDate: formatDateISO(defaultRange.startDate),
  endDate: formatDateISO(defaultRange.endDate),
  label: 'Senaste 30 dagarna'
}

export function Dashboard() {
  const [dateRange, setDateRange] = useState(defaultDateRange)

  const {
    dailySales,
    topProducts,
    paymentMethods,
    shippingMethods,
    weekdayAnalysis,
    hourlyAnalysis,
    summary,
    loading,
    error,
    refresh
  } = useAnalytics(dateRange)

  // Google Search Console data
  const {
    dailySummary: gscDaily,
    topQueries,
    topPages,
    deviceBreakdown,
    countryBreakdown,
    summary: gscSummary,
    connected: gscConnected,
    connectGSC,
    loading: gscLoading
  } = useGSC(dateRange)

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-400 mx-auto mb-4"></div>
          <p className="text-slate-400">Laddar analytik...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-400 mb-4">Fel: {error}</p>
          <Button onClick={refresh} variant="outline">Försök igen</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-900">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">Vilkas Analytics</h1>
            <p className="text-slate-400 text-sm">Billackering.eu - Realtidsanalytik</p>
          </div>
          <div className="flex items-center gap-3">
            <DateRangePicker
              value={dateRange.preset}
              onChange={setDateRange}
            />
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

      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* Period indicator */}
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-slate-400 text-sm">Visar data för:</span>
            <span className="inline-flex items-center px-3 py-1 rounded-full bg-cyan-500/20 text-cyan-400 text-sm font-medium">
              {dateRange.label}
            </span>
          </div>
          <span className="text-xs text-slate-500">
            {dateRange.startDate} → {dateRange.endDate}
          </span>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <KPICard
            title="Försäljning"
            value={summary?.totalRevenue || 0}
            currency="SEK"
            icon={DollarSign}
          />
          <KPICard
            title="Antal ordrar"
            value={summary?.orderCount || 0}
            icon={ShoppingCart}
          />
          <KPICard
            title="Snittordervärde"
            value={Math.round(summary?.avgOrderValue || 0)}
            currency="SEK"
            icon={TrendingUp}
          />
          <KPICard
            title="Unika kunder"
            value={summary?.uniqueCustomers || 0}
            icon={Users}
          />
        </div>

        {/* Quick stats */}
        {dailySales.length > 0 && (
          <div className="bg-slate-800/30 rounded-lg p-4 mb-8 border border-slate-700/50">
            <div className="flex flex-wrap gap-6 text-sm">
              <div>
                <span className="text-slate-400">Dagar med data:</span>
                <span className="text-white ml-2 font-medium">{dailySales.length}</span>
              </div>
              <div>
                <span className="text-slate-400">Snitt/dag:</span>
                <span className="text-white ml-2 font-medium">
                  {Math.round((summary?.totalRevenue || 0) / Math.max(dailySales.length, 1)).toLocaleString('sv-SE')} SEK
                </span>
              </div>
              <div>
                <span className="text-slate-400">Ordrar/dag:</span>
                <span className="text-white ml-2 font-medium">
                  {((summary?.orderCount || 0) / Math.max(dailySales.length, 1)).toFixed(1)}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Charts Row 1 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          <DailySalesChart data={dailySales} />
          <TopProducts products={topProducts} />
        </div>

        {/* Charts Row 2 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          <WeekdayChart data={weekdayAnalysis} />
          <HourlyChart data={hourlyAnalysis} />
        </div>

        {/* Charts Row 3 - Payment & Shipping */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <PaymentMethodsChart data={paymentMethods} />
          <ShippingMethodsChart data={shippingMethods} />
        </div>

        {/* ============================================ */}
        {/* GOOGLE SEARCH CONSOLE SECTION */}
        {/* ============================================ */}
        <div className="mt-12 mb-8">
          <h2 className="text-xl font-bold text-white mb-2 flex items-center gap-2">
            <Search className="w-5 h-5 text-cyan-400" />
            Google Search Console
          </h2>
          <p className="text-slate-400 text-sm">Organisk söktrafik och sökordsprestanda</p>
        </div>

        {!gscConnected ? (
          <GSCConnectCard onConnect={connectGSC} />
        ) : gscLoading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-400 mx-auto mb-4"></div>
            <p className="text-slate-400 text-sm">Laddar Search Console data...</p>
          </div>
        ) : (
          <>
            {/* GSC KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
              <KPICard
                title="Klick"
                value={gscSummary?.totalClicks || 0}
                icon={MousePointer}
              />
              <KPICard
                title="Visningar"
                value={gscSummary?.totalImpressions || 0}
                icon={Eye}
              />
              <KPICard
                title="Snitt CTR"
                value={`${((gscSummary?.avgCtr || 0) * 100).toFixed(1)}%`}
                icon={Target}
              />
              <KPICard
                title="Snittposition"
                value={(gscSummary?.avgPosition || 0).toFixed(1)}
                icon={Search}
              />
            </div>

            {/* GSC Charts */}
            {gscDaily.length > 0 && (
              <>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                  <GSCDailyChart data={gscDaily} />
                  <GSCTopQueries queries={topQueries} />
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                  <GSCTopPages pages={topPages} />
                  <div className="grid grid-cols-1 gap-6">
                    <GSCDeviceChart devices={deviceBreakdown} />
                    <GSCCountryChart countries={countryBreakdown} />
                  </div>
                </div>
              </>
            )}

            {gscDaily.length === 0 && (
              <div className="bg-slate-800/30 rounded-lg p-8 text-center border border-slate-700/50">
                <p className="text-slate-400">Ingen Search Console data hittades för vald period.</p>
                <p className="text-slate-500 text-sm mt-2">Data synkroniseras automatiskt varje dag.</p>
              </div>
            )}
          </>
        )}

        {/* Footer */}
        <footer className="text-center text-sm text-slate-500 pt-8 pb-4 border-t border-slate-800">
          Vilkas Analytics &copy; 2026 — Data synkroniseras från ePages API
        </footer>
      </main>
    </div>
  )
}

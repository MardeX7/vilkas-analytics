import { useAnalytics, useKPISummary } from '@/hooks/useAnalytics'
import { KPICard } from '@/components/KPICard'
import { DailySalesChart, WeekdayChart, HourlyChart } from '@/components/SalesChart'
import { TopProducts } from '@/components/TopProducts'
import { PaymentMethodsChart, ShippingMethodsChart } from '@/components/PaymentMethods'
import { DollarSign, ShoppingCart, Users, TrendingUp, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function Dashboard() {
  const { kpi, loading: kpiLoading } = useKPISummary()
  const {
    dailySales,
    topProducts,
    paymentMethods,
    shippingMethods,
    weekdayAnalysis,
    hourlyAnalysis,
    loading,
    error,
    refresh
  } = useAnalytics()

  if (loading || kpiLoading) {
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

  // Calculate MoM change
  const revenueChange = kpi?.lastMonth?.revenue
    ? ((kpi.thisMonth.revenue - kpi.lastMonth.revenue) / kpi.lastMonth.revenue * 100)
    : 0

  const ordersChange = kpi?.lastMonth?.orders
    ? ((kpi.thisMonth.orders - kpi.lastMonth.orders) / kpi.lastMonth.orders * 100)
    : 0

  return (
    <div className="min-h-screen bg-slate-900">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">Vilkas Analytics</h1>
            <p className="text-slate-400 text-sm">Billackering.eu - Realtidsanalytik</p>
          </div>
          <Button
            onClick={refresh}
            variant="outline"
            size="sm"
            className="bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Uppdatera
          </Button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* Period indicator */}
        <div className="mb-6">
          <span className="inline-flex items-center px-3 py-1 rounded-full bg-cyan-500/20 text-cyan-400 text-sm">
            📅 {kpi?.thisMonth?.label || '-'}
          </span>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <KPICard
            title="Månadens försäljning"
            value={kpi?.thisMonth?.revenue || 0}
            currency="SEK"
            change={revenueChange}
            changeLabel="vs förra månaden"
            icon={DollarSign}
          />
          <KPICard
            title="Antal ordrar"
            value={kpi?.thisMonth?.orders || 0}
            change={ordersChange}
            changeLabel="vs förra månaden"
            icon={ShoppingCart}
          />
          <KPICard
            title="Snittordervärde"
            value={kpi?.thisMonth?.aov || 0}
            currency="SEK"
            icon={TrendingUp}
          />
          <KPICard
            title="Unika kunder"
            value={kpi?.thisMonth?.customers || 0}
            icon={Users}
          />
        </div>

        {/* Last month comparison */}
        <div className="bg-slate-800/30 rounded-lg p-4 mb-8 border border-slate-700/50">
          <p className="text-sm text-slate-400">
            <span className="font-medium text-white">{kpi?.lastMonth?.label}</span>: {' '}
            {kpi?.lastMonth?.revenue?.toLocaleString('sv-SE')} SEK försäljning, {' '}
            {kpi?.lastMonth?.orders} ordrar, {' '}
            AOV {kpi?.lastMonth?.aov} SEK
          </p>
        </div>

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

        {/* Footer */}
        <footer className="text-center text-sm text-slate-500 pt-8 pb-4 border-t border-slate-800">
          Vilkas Analytics &copy; 2026 — Data synkroniseras från ePages API
        </footer>
      </main>
    </div>
  )
}

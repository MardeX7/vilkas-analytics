import { useState } from 'react'
import { useAnalytics } from '@/hooks/useAnalytics'
import { useCategories } from '@/hooks/useCategories'
import { KPICard } from '@/components/KPICard'
import { DailySalesChart, WeekdayChart, HourlyChart } from '@/components/SalesChart'
import { TopProducts } from '@/components/TopProducts'
import { CategoryChart } from '@/components/CategoryChart'
import { PaymentMethodsChart, ShippingMethodsChart } from '@/components/PaymentMethods'
import { DateRangePicker, getDateRange, formatDateISO } from '@/components/DateRangePicker'
import { DollarSign, ShoppingCart, Users, TrendingUp, RefreshCw, BarChart3 } from 'lucide-react'
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
    previousDailySales,
    topProducts,
    paymentMethods,
    shippingMethods,
    weekdayAnalysis,
    hourlyAnalysis,
    summary,
    comparison,
    loading,
    error,
    refresh
  } = useAnalytics(dateRange)

  // Get category data (default 30 days, could be linked to dateRange)
  const { categories, loading: categoriesLoading } = useCategories(30)

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-400 mx-auto mb-4"></div>
          <p className="text-slate-400">Laddar analytik...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-400 mb-4">Fel: {error}</p>
          <Button onClick={refresh} variant="outline">Försök igen</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-950">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="px-8 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
              <BarChart3 className="w-6 h-6 text-cyan-400" />
              Försäljning
            </h1>
            <p className="text-slate-400 text-sm mt-1">Realtidsanalytik för din webshop</p>
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

      <main className="px-8 py-8">
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
            change={comparison?.revenue}
            changeLabel={dateRange.compare ? 'vs förra' : undefined}
          />
          <KPICard
            title="Antal ordrar"
            value={summary?.orderCount || 0}
            icon={ShoppingCart}
            change={comparison?.orders}
            changeLabel={dateRange.compare ? 'vs förra' : undefined}
          />
          <KPICard
            title="Snittordervärde"
            value={Math.round(summary?.avgOrderValue || 0)}
            currency="SEK"
            icon={TrendingUp}
            change={comparison?.aov}
            changeLabel={dateRange.compare ? 'vs förra' : undefined}
          />
          <KPICard
            title="Unika kunder"
            value={summary?.uniqueCustomers || 0}
            icon={Users}
            change={comparison?.customers}
            changeLabel={dateRange.compare ? 'vs förra' : undefined}
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
          <DailySalesChart
            data={dailySales}
            previousData={previousDailySales}
            compare={dateRange.compare}
          />
          <TopProducts products={topProducts} />
        </div>

        {/* Charts Row 1.5 - Categories */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          <CategoryChart
            categories={categories}
            maxItems={10}
            title="Topp kategorier (30 dagar)"
          />
          {/* Second category view - filtered by parent category */}
          <CategoryChart
            categories={categories.filter(c => c.parent_category === 'Billack')}
            maxItems={8}
            title="Billack (underkategorier)"
          />
        </div>

        {/* Charts Row 2 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          <WeekdayChart data={weekdayAnalysis} />
          <HourlyChart data={hourlyAnalysis} />
        </div>

        {/* Charts Row 3 - Payment & Shipping */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <PaymentMethodsChart data={paymentMethods} />
          <ShippingMethodsChart data={shippingMethods} />
        </div>
      </main>
    </div>
  )
}

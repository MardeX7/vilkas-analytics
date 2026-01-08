import { useState } from 'react'
import { useAnalytics } from '@/hooks/useAnalytics'
import { useGA4 } from '@/hooks/useGA4'
import { useCategories } from '@/hooks/useCategories'
import { MetricCard, MetricCardGroup, MetricCardSkeleton } from '@/components/MetricCard'
import { DailySalesChart, WeekdayChart, HourlyChart } from '@/components/SalesChart'
import { TopProducts } from '@/components/TopProducts'
import { CategoryChart } from '@/components/CategoryChart'
import { PaymentMethodsChart, ShippingMethodsChart } from '@/components/PaymentMethods'
import { DateRangePicker, getDateRange, formatDateISO } from '@/components/DateRangePicker'
import { RefreshCw, BarChart3, TrendingUp, Package, XCircle, Truck, Tag } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

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

  // GA4 data for sessions and conversion
  const {
    summary: ga4Summary,
    connected: ga4Connected
  } = useGA4(dateRange)

  // Get category data (default 30 days, could be linked to dateRange)
  const { categories } = useCategories(30)

  // Calculate conversion rate (orders / sessions * 100)
  const conversionRate = ga4Connected && ga4Summary?.totalSessions > 0
    ? ((summary?.orderCount || 0) / ga4Summary.totalSessions) * 100
    : null

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-foreground-muted">Laddar analytik...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <p className="text-destructive mb-4">Fel: {error}</p>
          <Button onClick={refresh} variant="outline">Försök igen</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-background-elevated/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="px-8 py-5 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-foreground flex items-center gap-2">
              <BarChart3 className="w-6 h-6 text-primary" />
              Försäljning
            </h1>
            <p className="text-foreground-muted text-sm mt-1">Realtidsanalytik för din webshop</p>
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
              className="bg-background-elevated border-border text-foreground-muted hover:bg-background-subtle hover:text-foreground"
            >
              <RefreshCw className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="px-8 py-8 max-w-7xl mx-auto">
        {/* Period indicator */}
        <div className="mb-8 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-foreground-subtle text-sm">Visar data för:</span>
            <span className="inline-flex items-center px-3 py-1 rounded-full bg-primary-muted text-primary text-sm font-medium">
              {dateRange.label}
            </span>
          </div>
          <span className="text-xs text-foreground-subtle">
            {dateRange.startDate} → {dateRange.endDate}
          </span>
        </div>

        {/* KPI Cards - Top row: 5 core metrics */}
        <MetricCardGroup columns={5} className="mb-6">
          <MetricCard
            label="Försäljning"
            value={summary?.totalRevenue || 0}
            suffix="kr"
            delta={comparison?.revenue}
            deltaLabel={dateRange.compare ? 'vs förra' : undefined}
          />
          <MetricCard
            label="Bruttomarginal"
            value={(summary?.marginPercent || 0).toFixed(1)}
            suffix="%"
            delta={comparison?.margin}
            deltaLabel={dateRange.compare ? 'vs förra' : undefined}
          />
          <MetricCard
            label="Antal ordrar"
            value={summary?.orderCount || 0}
            delta={comparison?.orders}
            deltaLabel={dateRange.compare ? 'vs förra' : undefined}
          />
          <MetricCard
            label="Snittordervärde"
            value={Math.round(summary?.avgOrderValue || 0)}
            suffix="kr"
            delta={comparison?.aov}
            deltaLabel={dateRange.compare ? 'vs förra' : undefined}
          />
          <MetricCard
            label="Konvertering"
            value={conversionRate !== null ? conversionRate.toFixed(2) : '—'}
            suffix={conversionRate !== null ? '%' : ''}
            deltaLabel={!ga4Connected ? 'Anslut GA4' : undefined}
          />
        </MetricCardGroup>

        {/* KPI Cards - Second row: Customer & traffic metrics */}
        <MetricCardGroup columns={4} className="mb-8">
          <MetricCard
            label="Unika kunder"
            value={summary?.uniqueCustomers || 0}
            delta={comparison?.customers}
            deltaLabel={dateRange.compare ? 'vs förra' : undefined}
          />
          <MetricCard
            label="Återkommande kunder"
            value={(summary?.returningCustomerPercent || 0).toFixed(1)}
            suffix="%"
            delta={comparison?.returningCustomers}
            deltaLabel={dateRange.compare ? 'vs förra' : undefined}
          />
          <MetricCard
            label="Sessioner"
            value={ga4Connected ? (ga4Summary?.totalSessions || 0) : '—'}
            deltaLabel={!ga4Connected ? 'Anslut GA4' : undefined}
          />
          <MetricCard
            label="Avvisningsfrekvens"
            value={ga4Connected && ga4Summary?.avgBounceRate != null ? (ga4Summary.avgBounceRate * 100).toFixed(1) : '—'}
            suffix={ga4Connected ? '%' : ''}
            invertDelta={true}
            deltaLabel={!ga4Connected ? 'Anslut GA4' : undefined}
          />
        </MetricCardGroup>

        {/* Quick stats - Secondary metrics row */}
        <div className="rounded-lg border border-border bg-background-elevated/50 p-4 mb-8">
          <div className="flex flex-wrap gap-6 text-sm">
            <div className="flex items-center gap-2">
              <Package className="w-4 h-4 text-foreground-subtle" />
              <span className="text-foreground-subtle">Produkter/order:</span>
              <span className="text-foreground font-medium tabular-nums">
                {(summary?.avgItemsPerOrder || 0).toFixed(1)}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-foreground-subtle" />
              <span className="text-foreground-subtle">Snitt/dag:</span>
              <span className="text-foreground font-medium tabular-nums">
                {Math.round((summary?.totalRevenue || 0) / Math.max(dailySales.length, 1)).toLocaleString('sv-SE')} kr
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Truck className="w-4 h-4 text-foreground-subtle" />
              <span className="text-foreground-subtle">Fraktkostnad:</span>
              <span className="text-foreground font-medium tabular-nums">
                {(summary?.shippingPercent || 0).toFixed(1)}%
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Tag className="w-4 h-4 text-foreground-subtle" />
              <span className="text-foreground-subtle">Rabatter:</span>
              <span className="text-foreground font-medium tabular-nums">
                {(summary?.discountPercent || 0).toFixed(1)}%
              </span>
            </div>
            <div className="flex items-center gap-2">
              <XCircle className="w-4 h-4 text-foreground-subtle" />
              <span className="text-foreground-subtle">Avbeställda:</span>
              <span className={cn(
                "font-medium tabular-nums",
                (summary?.cancelledPercent || 0) > 5 ? "text-destructive" : "text-foreground"
              )}>
                {(summary?.cancelledPercent || 0).toFixed(1)}%
              </span>
            </div>
          </div>
        </div>

        {/* Charts Row 1 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          <DailySalesChart
            data={dailySales}
            previousData={previousDailySales}
            compare={dateRange.compare}
          />
          <TopProducts products={topProducts} />
        </div>

        {/* Charts Row 1.5 - Categories (single view) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          <CategoryChart
            categories={categories}
            maxItems={10}
            title="Topp kategorier (30 dagar)"
          />
          <WeekdayChart data={weekdayAnalysis} />
        </div>

        {/* Charts Row 2 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          <HourlyChart data={hourlyAnalysis} />
          <PaymentMethodsChart data={paymentMethods} />
        </div>

        {/* Charts Row 3 - Shipping */}
        <div className="grid grid-cols-1 gap-6">
          <ShippingMethodsChart data={shippingMethods} />
        </div>
      </main>
    </div>
  )
}

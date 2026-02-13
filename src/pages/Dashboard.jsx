import { useState } from 'react'
import { useAnalytics } from '@/hooks/useAnalytics'
import { useGA4 } from '@/hooks/useGA4'
import { useCategories } from '@/hooks/useCategories'
import { useTranslation } from '@/lib/i18n'
import { MetricCard, MetricCardGroup } from '@/components/MetricCard'
import { DailySalesChart, DailyMarginChart, WeekdayChart, HourlyChart } from '@/components/SalesChart'
import { TopProducts } from '@/components/TopProducts'
import { CategoryChart } from '@/components/CategoryChart'
import { PaymentMethodsChart, ShippingMethodsChart } from '@/components/PaymentMethods'
import { OrderBucketChart } from '@/components/OrderBucketChart'
import { CampaignsCard } from '@/components/CampaignsCard'
import { ProductRolesCard } from '@/components/ProductRolesCard'
import { CategoryMarginCard } from '@/components/CategoryMarginCard'
import { ShippingPaymentCard } from '@/components/ShippingPaymentCard'
import { DateRangePicker, getDateRange, formatDateISO, getPreviousPeriod, getYearOverYearPeriod } from '@/components/DateRangePicker'
import { RefreshCw, BarChart3, TrendingUp, Package, XCircle, Truck, Tag, Gift, Coins } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

// Helper to create default date range with YoY comparison enabled
function createDefaultDateRange() {
  const range = getDateRange('last30')
  const yoyRange = getYearOverYearPeriod(range.startDate, range.endDate)
  return {
    preset: 'last30',
    startDate: formatDateISO(range.startDate),
    endDate: formatDateISO(range.endDate),
    label: null, // Will use translation
    compare: true, // YoY enabled by default
    compareMode: 'yoy',
    previousStartDate: formatDateISO(yoyRange.startDate),
    previousEndDate: formatDateISO(yoyRange.endDate)
  }
}

export function Dashboard() {
  const { t, language } = useTranslation()
  const [dateRange, setDateRange] = useState(() => createDefaultDateRange())
  const [comparisonMode, setComparisonMode] = useState('yoy') // 'mom' or 'yoy', default YoY

  const {
    dailySales,
    dailyMargin,
    previousDailySales,
    previousDailyMargin,
    topProducts,
    previousTopProducts,
    paymentMethods,
    shippingMethods,
    weekdayAnalysis,
    hourlyAnalysis,
    summary,
    previousSummary,
    comparison,
    loading,
    error,
    refresh
  } = useAnalytics(dateRange)

  // GA4 data for sessions and conversion
  const {
    summary: ga4Summary,
    previousSummary: ga4PreviousSummary,
    comparisonEnabled: ga4ComparisonEnabled,
    connected: ga4Connected
  } = useGA4(dateRange, comparisonMode)

  // Get category data (default 30 days, could be linked to dateRange)
  const { categories } = useCategories(30)

  // Calculate conversion rate (orders / sessions * 100)
  const conversionRate = ga4Connected && ga4Summary?.totalSessions > 0
    ? ((summary?.orderCount || 0) / ga4Summary.totalSessions) * 100
    : null

  // Calculate previous conversion rate for comparison
  const previousConversionRate = ga4Connected && ga4PreviousSummary?.totalSessions > 0 && previousSummary?.orderCount
    ? ((previousSummary.orderCount || 0) / ga4PreviousSummary.totalSessions) * 100
    : null

  // Calculate GA4 comparison deltas
  const getChangePercent = (current, previous) => {
    if (!previous || previous === 0) return null
    return ((current - previous) / previous) * 100
  }

  const sessionsChange = ga4ComparisonEnabled && dateRange.compare && ga4PreviousSummary
    ? getChangePercent(ga4Summary?.totalSessions, ga4PreviousSummary.totalSessions)
    : null

  // For bounce rate, lower is better - so we invert (previous - current to show improvement as positive)
  const bounceRateChange = ga4ComparisonEnabled && dateRange.compare && ga4PreviousSummary
    ? getChangePercent(ga4PreviousSummary.avgBounceRate, ga4Summary?.avgBounceRate)
    : null

  const conversionChange = dateRange.compare && conversionRate !== null && previousConversionRate !== null
    ? getChangePercent(conversionRate, previousConversionRate)
    : null

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-foreground-muted">{t('common.loading')}</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <p className="text-destructive mb-4">{t('common.error')}: {error}</p>
          <Button onClick={refresh} variant="outline">{t('common.refresh')}</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header - Responsive: stacks on mobile */}
      <header className="border-b border-border bg-background-elevated/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="px-4 sm:px-6 lg:px-8 py-4 sm:py-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            {/* Title */}
            <div className="flex-shrink-0">
              <h1 className="text-lg sm:text-xl lg:text-2xl font-semibold text-foreground flex items-center gap-2">
                <BarChart3 className="w-5 h-5 sm:w-6 sm:h-6 text-primary flex-shrink-0" />
                <span className="truncate">{t('dashboard.title')}</span>
              </h1>
              <p className="text-foreground-muted text-xs sm:text-sm mt-1 hidden sm:block">{t('dashboard.subtitle')}</p>
            </div>

            {/* Controls - wrap on mobile */}
            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
              {/* Date picker */}
              <div className="order-1">
                <DateRangePicker
                  value={dateRange.preset}
                  onChange={setDateRange}
                />
              </div>

              {/* MoM/YoY Toggle - GA4 style */}
              <div className="flex bg-background-subtle rounded-lg p-0.5 sm:p-1 order-2">
                <button
                  onClick={() => {
                    setComparisonMode('mom')
                    const currentRange = getDateRange(dateRange.preset || 'last30')
                    const prevRange = getPreviousPeriod(currentRange.startDate, currentRange.endDate)
                    setDateRange(prev => ({
                      ...prev,
                      compare: true,
                      compareMode: 'mom',
                      previousStartDate: formatDateISO(prevRange.startDate),
                      previousEndDate: formatDateISO(prevRange.endDate)
                    }))
                  }}
                  className={`px-2 sm:px-3 py-1 sm:py-1.5 text-xs sm:text-sm font-medium rounded-md transition-all ${
                    comparisonMode === 'mom'
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'text-foreground-muted hover:text-foreground'
                  }`}
                  title={t('comparison.momFull')}
                >
                  {t('comparison.mom')}
                </button>
                <button
                  onClick={() => {
                    setComparisonMode('yoy')
                    const currentRange = getDateRange(dateRange.preset || 'last30')
                    const prevRange = getYearOverYearPeriod(currentRange.startDate, currentRange.endDate)
                    setDateRange(prev => ({
                      ...prev,
                      compare: true,
                      compareMode: 'yoy',
                      previousStartDate: formatDateISO(prevRange.startDate),
                      previousEndDate: formatDateISO(prevRange.endDate)
                    }))
                  }}
                  className={`px-2 sm:px-3 py-1 sm:py-1.5 text-xs sm:text-sm font-medium rounded-md transition-all ${
                    comparisonMode === 'yoy'
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'text-foreground-muted hover:text-foreground'
                  }`}
                  title={t('comparison.yoyFull')}
                >
                  {t('comparison.yoy')}
                </button>
              </div>

              {/* Refresh button */}
              <Button
                onClick={refresh}
                variant="outline"
                size="sm"
                className="bg-background-elevated border-border text-foreground-muted hover:bg-background-subtle hover:text-foreground p-2 order-3"
              >
                <RefreshCw className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="px-4 sm:px-6 lg:px-8 py-6 sm:py-8 max-w-7xl mx-auto">
        {/* Period indicator - responsive */}
        <div className="mb-6 sm:mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
            <span className="text-foreground-subtle text-xs sm:text-sm">{t('dashboard.showingDataFor')}</span>
            <span className="inline-flex items-center px-2 sm:px-3 py-0.5 sm:py-1 rounded-full bg-primary-muted text-primary text-xs sm:text-sm font-medium">
              {dateRange.label || t(`datePicker.presets.${dateRange.preset || 'last30'}`)}
            </span>
          </div>
          <span className="text-xs text-foreground-subtle">
            {dateRange.startDate} → {dateRange.endDate}
          </span>
        </div>

        {/* KPI Cards - Top row: 5 core metrics */}
        <MetricCardGroup columns={5} className="mb-6">
          <MetricCard
            label={t('dashboard.metrics.sales')}
            value={summary?.totalRevenue || 0}
            suffix=" kr"
            delta={comparison?.revenue}
            previousValue={dateRange.compare ? previousSummary?.totalRevenue : undefined}
            deltaLabel={dateRange.compare ? comparisonMode.toUpperCase() : undefined}
          />
          <MetricCard
            label={t('dashboard.metrics.grossMargin')}
            value={(summary?.marginPercent || 0).toFixed(1)}
            suffix="%"
            subValue={summary?.grossProfit ? `${Math.round(summary.grossProfit).toLocaleString(language === 'fi' ? 'fi-FI' : 'sv-SE')} kr` : undefined}
            delta={comparison?.margin}
            previousValue={dateRange.compare ? previousSummary?.marginPercent?.toFixed(1) : undefined}
            deltaLabel={dateRange.compare ? comparisonMode.toUpperCase() : undefined}
          />
          <MetricCard
            label={t('dashboard.metrics.orders')}
            value={summary?.orderCount || 0}
            delta={comparison?.orders}
            previousValue={dateRange.compare ? previousSummary?.orderCount : undefined}
            deltaLabel={dateRange.compare ? comparisonMode.toUpperCase() : undefined}
          />
          <MetricCard
            label={t('dashboard.metrics.avgOrderValue')}
            value={Math.round(summary?.avgOrderValue || 0)}
            suffix=" kr"
            delta={comparison?.aov}
            previousValue={dateRange.compare ? Math.round(previousSummary?.avgOrderValue || 0) : undefined}
            deltaLabel={dateRange.compare ? comparisonMode.toUpperCase() : undefined}
          />
          <MetricCard
            label={t('dashboard.metrics.conversion')}
            value={conversionRate !== null ? conversionRate.toFixed(2) : '—'}
            suffix={conversionRate !== null ? '%' : ''}
            delta={conversionChange}
            previousValue={dateRange.compare && previousConversionRate !== null ? previousConversionRate.toFixed(2) : undefined}
            deltaLabel={!ga4Connected ? t('dashboard.connectGA4') : (dateRange.compare ? comparisonMode.toUpperCase() : undefined)}
          />
        </MetricCardGroup>

        {/* KPI Cards - Second row: Customer & traffic metrics */}
        <MetricCardGroup columns={4} className="mb-8">
          <MetricCard
            label={t('dashboard.metrics.uniqueCustomers')}
            value={summary?.uniqueCustomers || 0}
            delta={comparison?.customers}
            previousValue={dateRange.compare ? previousSummary?.uniqueCustomers : undefined}
            deltaLabel={dateRange.compare ? comparisonMode.toUpperCase() : undefined}
          />
          <MetricCard
            label={t('dashboard.metrics.returningCustomers')}
            value={(summary?.returningCustomerPercent || 0).toFixed(1)}
            suffix="%"
            delta={comparison?.returningCustomers}
            previousValue={dateRange.compare ? previousSummary?.returningCustomerPercent?.toFixed(1) : undefined}
            deltaLabel={dateRange.compare ? comparisonMode.toUpperCase() : undefined}
          />
          <MetricCard
            label={t('dashboard.metrics.sessions')}
            value={ga4Connected ? (ga4Summary?.totalSessions || 0) : '—'}
            delta={sessionsChange}
            previousValue={dateRange.compare && ga4PreviousSummary?.totalSessions ? ga4PreviousSummary.totalSessions : undefined}
            deltaLabel={!ga4Connected ? t('dashboard.connectGA4') : (dateRange.compare ? comparisonMode.toUpperCase() : undefined)}
          />
          <MetricCard
            label={t('dashboard.metrics.bounceRate')}
            value={ga4Connected && ga4Summary?.avgBounceRate != null ? (ga4Summary.avgBounceRate * 100).toFixed(1) : '—'}
            suffix={ga4Connected ? '%' : ''}
            delta={bounceRateChange}
            previousValue={dateRange.compare && ga4PreviousSummary?.avgBounceRate != null ? (ga4PreviousSummary.avgBounceRate * 100).toFixed(1) : undefined}
            invertDelta={true}
            deltaLabel={!ga4Connected ? t('dashboard.connectGA4') : (dateRange.compare ? comparisonMode.toUpperCase() : undefined)}
          />
        </MetricCardGroup>

        {/* Quick stats - Secondary metrics row */}
        <div className="rounded-lg border border-border bg-background-elevated/50 p-4 mb-8">
          <div className="flex flex-wrap gap-6 text-sm">
            <div className="flex items-center gap-2">
              <Package className="w-4 h-4 text-foreground-subtle" />
              <span className="text-foreground-subtle">{t('dashboard.metrics.productsPerOrder')}:</span>
              <span className="text-foreground font-medium tabular-nums">
                {(summary?.avgItemsPerOrder || 0).toFixed(1)}
              </span>
              {dateRange.compare && previousSummary?.avgItemsPerOrder > 0 && (
                <span className={cn(
                  "text-xs",
                  (summary?.avgItemsPerOrder || 0) >= previousSummary.avgItemsPerOrder ? "text-success" : "text-destructive"
                )}>
                  ({(summary?.avgItemsPerOrder || 0) >= previousSummary.avgItemsPerOrder ? '↑' : '↓'}
                  {Math.abs(((summary?.avgItemsPerOrder || 0) - previousSummary.avgItemsPerOrder) / previousSummary.avgItemsPerOrder * 100).toFixed(0)}%)
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-foreground-subtle" />
              <span className="text-foreground-subtle">{t('dashboard.metrics.avgPerDay')}:</span>
              <span className="text-foreground font-medium tabular-nums">
                {Math.round((summary?.totalRevenue || 0) / Math.max(dailySales.length, 1)).toLocaleString(language === 'fi' ? 'fi-FI' : 'sv-SE')} kr
              </span>
            </div>
            {/* Show shipping only if data exists (totalShipping > 0) */}
            {summary?.totalShipping > 0 && (
              <div className="flex items-center gap-2">
                <Truck className="w-4 h-4 text-foreground-subtle" />
                <span className="text-foreground-subtle">{t('dashboard.metrics.shippingCost')}:</span>
                <span className="text-foreground font-medium tabular-nums">
                  {(summary?.shippingPercent || 0).toFixed(1)}%
                </span>
              </div>
            )}
            {/* Show discounts only if data exists (totalDiscount > 0) */}
            {summary?.totalDiscount > 0 && (
              <div className="flex items-center gap-2">
                <Tag className="w-4 h-4 text-foreground-subtle" />
                <span className="text-foreground-subtle">{t('dashboard.metrics.discounts')}:</span>
                <span className="text-foreground font-medium tabular-nums">
                  {(summary?.discountPercent || 0).toFixed(1)}%
                </span>
              </div>
            )}
            {/* Show cancelled only if data exists (cancelledCount > 0) */}
            {summary?.cancelledCount > 0 && (
              <div className="flex items-center gap-2">
                <XCircle className="w-4 h-4 text-foreground-subtle" />
                <span className="text-foreground-subtle">{t('dashboard.metrics.cancelled')}:</span>
                <span className={cn(
                  "font-medium tabular-nums",
                  (summary?.cancelledPercent || 0) > 5 ? "text-destructive" : "text-foreground"
                )}>
                  {(summary?.cancelledPercent || 0).toFixed(1)}%
                </span>
              </div>
            )}
            {/* Kit products share */}
            {summary?.kitRevenuePercent > 0 && (
              <div className="flex items-center gap-2">
                <Gift className="w-4 h-4 text-foreground-subtle" />
                <span className="text-foreground-subtle">{t('dashboard.metrics.kitShare')}:</span>
                <span className="text-foreground font-medium tabular-nums">
                  {(summary?.kitRevenuePercent || 0).toFixed(1)}%
                </span>
                <span className="text-foreground-subtle text-xs">
                  ({t('dashboard.metrics.margin')} {(summary?.kitMarginPercent || 0).toFixed(0)}%)
                </span>
                {dateRange.compare && previousSummary?.kitRevenuePercent > 0 && (
                  <span className={cn(
                    "text-xs",
                    (summary?.kitRevenuePercent || 0) >= previousSummary.kitRevenuePercent ? "text-success" : "text-destructive"
                  )}>
                    ({(summary?.kitRevenuePercent || 0) >= previousSummary.kitRevenuePercent ? '↑' : '↓'}
                    {Math.abs((summary?.kitRevenuePercent || 0) - previousSummary.kitRevenuePercent).toFixed(1)}pp)
                  </span>
                )}
              </div>
            )}
            {/* Margin per order */}
            {summary?.marginPerOrder > 0 && (
              <div className="flex items-center gap-2">
                <Coins className="w-4 h-4 text-foreground-subtle" />
                <span className="text-foreground-subtle">{t('dashboard.metrics.marginPerOrder')}:</span>
                <span className="text-foreground font-medium tabular-nums">
                  {Math.round(summary?.marginPerOrder || 0).toLocaleString(language === 'fi' ? 'fi-FI' : 'sv-SE')} kr
                </span>
                {dateRange.compare && previousSummary?.marginPerOrder > 0 && (
                  <span className={cn(
                    "text-xs",
                    (summary?.marginPerOrder || 0) >= previousSummary.marginPerOrder ? "text-success" : "text-destructive"
                  )}>
                    ({(summary?.marginPerOrder || 0) >= previousSummary.marginPerOrder ? '↑' : '↓'}
                    {Math.abs(((summary?.marginPerOrder || 0) - previousSummary.marginPerOrder) / previousSummary.marginPerOrder * 100).toFixed(0)}%)
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Charts Row 1 - Daily Sales & Daily Margin */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          <DailySalesChart
            data={dailySales}
            previousData={previousDailySales}
            compare={dateRange.compare}
          />
          <DailyMarginChart data={dailyMargin} previousData={previousDailyMargin} compare={dateRange.compare} />
        </div>

        {/* Charts Row 1.5 - Top Products */}
        <div className="grid grid-cols-1 gap-6 mb-6">
          <TopProducts
            products={topProducts}
            previousProducts={previousTopProducts}
            compare={dateRange.compare}
            comparisonMode={comparisonMode}
          />
        </div>

        {/* Charts Row 1.5 - Sales by Time (weekday + hourly side by side) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          <WeekdayChart data={weekdayAnalysis} />
          <HourlyChart data={hourlyAnalysis} />
        </div>

        {/* Charts Row 2 - Payment & Shipping stacked + Order Buckets */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {/* Left: Payment & Shipping stacked */}
          <div className="space-y-6">
            <PaymentMethodsChart data={paymentMethods} />
            <ShippingMethodsChart data={shippingMethods} />
          </div>
          {/* Right: Order Buckets */}
          <OrderBucketChart
            startDate={dateRange.startDate}
            endDate={dateRange.endDate}
            label={dateRange.label}
          />
        </div>

        {/* Charts Row 2.7 - Campaigns & Product Roles */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          <CampaignsCard
            startDate={dateRange.startDate}
            endDate={dateRange.endDate}
          />
          <ProductRolesCard
            startDate={dateRange.startDate}
            endDate={dateRange.endDate}
          />
        </div>

        {/* Charts Row 3 - Categories (only show if data exists) */}
        {categories && categories.length > 0 && (
          <div className="grid grid-cols-1 gap-6 mb-6">
            <CategoryChart
              categories={categories}
              maxItems={10}
              title={t('charts.topCategories')}
            />
          </div>
        )}

        {/* Charts Row 4 - Category Margin Analysis */}
        <CategoryMarginCard
          startDate={dateRange.startDate}
          endDate={dateRange.endDate}
          className="mb-6"
        />

        {/* Charts Row 5 - Shipping & Payment Analysis */}
        <ShippingPaymentCard
          startDate={dateRange.startDate}
          endDate={dateRange.endDate}
        />
      </main>
    </div>
  )
}

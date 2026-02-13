import { useState } from 'react'
import { useCustomers } from '@/hooks/useCustomers'
import { useEntryProducts } from '@/hooks/useEntryProducts'
import { MetricCard, MetricCardGroup } from '@/components/MetricCard'
import { CustomerSegmentCard } from '@/components/CustomerSegmentCard'
import { DateRangePicker, getDateRange, formatDateISO, getPreviousPeriod, getYearOverYearPeriod } from '@/components/DateRangePicker'
import { useTranslation } from '@/lib/i18n'
import {
  Users,
  UserPlus,
  UserCheck,
  Building2,
  User,
  TrendingUp,
  Crown,
  Globe,
  Loader2,
  ArrowRight,
  Clock,
  Repeat,
  Package,
  ShoppingBag,
  MessageSquare,
  AlertTriangle
} from 'lucide-react'

// Helper to create default date range with YoY comparison enabled
function createDefaultDateRange() {
  const range = getDateRange('last90')
  const yoyRange = getYearOverYearPeriod(range.startDate, range.endDate)
  return {
    preset: 'last90',
    startDate: formatDateISO(range.startDate),
    endDate: formatDateISO(range.endDate),
    compare: true,
    compareMode: 'yoy',
    previousStartDate: formatDateISO(yoyRange.startDate),
    previousEndDate: formatDateISO(yoyRange.endDate)
  }
}

// Format currency
function formatCurrency(value, currency = 'kr') {
  if (value == null) return '—'
  return Math.round(value).toLocaleString('sv-SE') + ' ' + currency
}

export function CustomersPage() {
  const { t } = useTranslation()
  const [dateRange, setDateRange] = useState(() => createDefaultDateRange())
  const [comparisonMode, setComparisonMode] = useState('yoy') // 'mom' or 'yoy'

  // Current period data
  const {
    uniqueCustomers,
    b2b,
    b2c,
    newCustomers,
    returningCustomers,
    returnRate,
    ltvMultiplier,
    topCustomers,
    countries,
    lifecycle,
    ltvAnalysis,
    notesStats,
    dataQuality,
    loading,
    error
  } = useCustomers(dateRange)

  // Previous period data for comparison
  const previousDateRange = dateRange.compare ? {
    startDate: dateRange.previousStartDate,
    endDate: dateRange.previousEndDate
  } : null

  const {
    uniqueCustomers: prevUniqueCustomers,
    returnRate: prevReturnRate,
    returningCustomers: prevReturningCustomers,
    ltvMultiplier: prevLtvMultiplier,
    dataQuality: prevDataQuality,
    loading: prevLoading
  } = useCustomers(previousDateRange)

  // Check if comparison data is reliable
  const comparisonReliable = !prevDataQuality || prevDataQuality.isReliable

  // Calculate delta percentages
  const getChangePercent = (current, previous) => {
    if (!previous || previous === 0) return null
    return ((current - previous) / previous) * 100
  }

  const customersChange = dateRange.compare && !prevLoading
    ? getChangePercent(uniqueCustomers, prevUniqueCustomers)
    : null

  const returnRateChange = dateRange.compare && !prevLoading
    ? getChangePercent(returnRate, prevReturnRate)
    : null

  const returningRevenueChange = dateRange.compare && !prevLoading
    ? getChangePercent(returningCustomers.percentage, prevReturningCustomers?.percentage)
    : null

  const ltvChange = dateRange.compare && !prevLoading && prevLtvMultiplier && parseFloat(prevLtvMultiplier) > 0
    ? getChangePercent(parseFloat(ltvMultiplier), parseFloat(prevLtvMultiplier))
    : null

  const {
    b2bEntryProducts,
    b2cEntryProducts,
    firstPurchaseProducts,
    loading: entryLoading
  } = useEntryProducts(dateRange)

  if (error) {
    return (
      <div className="min-h-screen bg-background p-6">
        <div className="max-w-md mx-auto mt-20">
          <div className="bg-destructive-muted rounded-xl p-8 border border-destructive/30 text-center">
            <h2 className="text-xl font-semibold text-destructive mb-2">{t('common.error')}</h2>
            <p className="text-foreground-muted mb-4">{error}</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-background-elevated/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="px-4 sm:px-6 lg:px-8 py-4 sm:py-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex-shrink-0">
              <h1 className="text-lg sm:text-xl lg:text-2xl font-semibold text-foreground flex items-center gap-2">
                <Users className="w-5 h-5 sm:w-6 sm:h-6 text-primary flex-shrink-0" />
                <span>{t('customers.title')}</span>
              </h1>
              <p className="text-foreground-muted text-xs sm:text-sm mt-1">
                {t('customers.subtitle')}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
              {/* Date picker */}
              <DateRangePicker
                value={dateRange?.preset || 'last90'}
                onChange={setDateRange}
              />

              {/* MoM/YoY Toggle */}
              <div className="flex bg-background-subtle rounded-lg p-0.5 sm:p-1">
                <button
                  onClick={() => {
                    setComparisonMode('mom')
                    const currentRange = getDateRange(dateRange.preset || 'last90')
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
                    const currentRange = getDateRange(dateRange.preset || 'last90')
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
            </div>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="px-4 sm:px-6 lg:px-8 py-6 sm:py-8 max-w-7xl mx-auto">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : (
          <div className="space-y-6">
            {/* Data quality warning for comparison period */}
            {dateRange.compare && !comparisonReliable && (
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4 flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-amber-500">
                    {t('customers.dataQualityWarning')}
                  </p>
                  <p className="text-xs text-foreground-muted mt-1">
                    {t('customers.dataQualityWarningDesc', {
                      coverage: prevDataQuality?.emailCoverage || 0,
                      missing: prevDataQuality?.ordersWithoutEmail || 0
                    })}
                  </p>
                </div>
              </div>
            )}

            {/* KPI Cards */}
            <MetricCardGroup columns={4}>
              <MetricCard
                label={t('customers.uniqueCustomers')}
                value={uniqueCustomers}
                icon={<Users className="w-5 h-5" />}
                delta={comparisonReliable ? customersChange : null}
                previousValue={dateRange.compare && !prevLoading && comparisonReliable ? prevUniqueCustomers : undefined}
                deltaLabel={dateRange.compare && comparisonReliable ? comparisonMode.toUpperCase() : undefined}
              />
              <MetricCard
                label={t('customers.returnRate')}
                value={returnRate}
                suffix="%"
                icon={<UserCheck className="w-5 h-5" />}
                delta={returnRateChange}
                previousValue={dateRange.compare && !prevLoading ? prevReturnRate : undefined}
                deltaLabel={dateRange.compare ? comparisonMode.toUpperCase() : undefined}
              />
              <MetricCard
                label={t('customers.returningRevenue')}
                value={returningCustomers.percentage}
                suffix="%"
                icon={<TrendingUp className="w-5 h-5" />}
                delta={returningRevenueChange}
                previousValue={dateRange.compare && !prevLoading ? prevReturningCustomers?.percentage : undefined}
                deltaLabel={dateRange.compare ? comparisonMode.toUpperCase() : undefined}
              />
              <MetricCard
                label={t('customers.ltvMultiplier')}
                value={ltvMultiplier}
                suffix="x"
                icon={<Crown className="w-5 h-5" />}
                delta={ltvChange}
                previousValue={dateRange.compare && !prevLoading ? prevLtvMultiplier : undefined}
                deltaLabel={dateRange.compare ? comparisonMode.toUpperCase() : undefined}
              />
            </MetricCardGroup>

            {/* Customer Segments - Revenue & Margin breakdown */}
            <CustomerSegmentCard
              startDate={dateRange.startDate}
              endDate={dateRange.endDate}
              className="mb-6"
            />

            {/* B2B vs B2C Section */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* B2B vs B2C Comparison */}
              <div className="bg-background-elevated rounded-xl p-5 border border-card-border">
                <h3 className="text-base font-medium text-foreground mb-4 flex items-center gap-2">
                  <Building2 className="w-5 h-5 text-primary" />
                  {t('customers.b2bVsB2c')}
                </h3>

                {/* Visual comparison bar */}
                <div className="mb-6">
                  <div className="flex h-8 rounded-lg overflow-hidden">
                    <div
                      className="bg-primary flex items-center justify-center text-xs font-medium text-primary-foreground"
                      style={{ width: `${b2b.percentage || 0}%`, minWidth: b2b.percentage > 0 ? '40px' : '0' }}
                    >
                      {b2b.percentage > 5 && `B2B ${b2b.percentage}%`}
                    </div>
                    <div
                      className="bg-cyan-600 flex items-center justify-center text-xs font-medium text-white"
                      style={{ width: `${b2c.percentage || 0}%` }}
                    >
                      {b2c.percentage > 5 && `B2C ${b2c.percentage}%`}
                    </div>
                  </div>
                </div>

                {/* Stats grid */}
                <div className="grid grid-cols-2 gap-4">
                  {/* B2B */}
                  <div className="bg-background-subtle rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <Building2 className="w-4 h-4 text-primary" />
                      <span className="text-sm font-medium text-foreground">B2B</span>
                    </div>
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-foreground-muted">{t('customers.orders')}</span>
                        <span className="text-foreground font-medium">{b2b.orders}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-foreground-muted">{t('customers.aov')}</span>
                        <span className="text-foreground font-medium">{formatCurrency(b2b.aov)}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-foreground-muted">{t('customers.revenue')}</span>
                        <span className="text-foreground font-medium">{formatCurrency(b2b.revenue)}</span>
                      </div>
                    </div>
                  </div>

                  {/* B2C */}
                  <div className="bg-background-subtle rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <User className="w-4 h-4 text-cyan-500" />
                      <span className="text-sm font-medium text-foreground">B2C</span>
                    </div>
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-foreground-muted">{t('customers.orders')}</span>
                        <span className="text-foreground font-medium">{b2c.orders}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-foreground-muted">{t('customers.aov')}</span>
                        <span className="text-foreground font-medium">{formatCurrency(b2c.aov)}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-foreground-muted">{t('customers.revenue')}</span>
                        <span className="text-foreground font-medium">{formatCurrency(b2c.revenue)}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {b2b.aov > 0 && b2c.aov > 0 && (
                  <p className="text-xs text-foreground-muted mt-4 text-center">
                    B2B AOV on <span className="text-primary font-medium">+{Math.round((b2b.aov / b2c.aov - 1) * 100)}%</span> korkeampi kuin B2C
                  </p>
                )}
              </div>

              {/* New vs Returning */}
              <div className="bg-background-elevated rounded-xl p-5 border border-card-border">
                <h3 className="text-base font-medium text-foreground mb-4 flex items-center gap-2">
                  <UserPlus className="w-5 h-5 text-primary" />
                  {t('customers.newVsReturning')}
                </h3>

                {/* Visual comparison bar */}
                <div className="mb-6">
                  <div className="flex h-8 rounded-lg overflow-hidden">
                    <div
                      className="bg-emerald-500 flex items-center justify-center text-xs font-medium text-white"
                      style={{ width: `${newCustomers.percentage || 0}%`, minWidth: newCustomers.percentage > 0 ? '40px' : '0' }}
                    >
                      {newCustomers.percentage > 5 && `${t('customers.new')} ${newCustomers.percentage}%`}
                    </div>
                    <div
                      className="bg-amber-500 flex items-center justify-center text-xs font-medium text-white"
                      style={{ width: `${returningCustomers.percentage || 0}%` }}
                    >
                      {returningCustomers.percentage > 5 && `${t('customers.returning')} ${returningCustomers.percentage}%`}
                    </div>
                  </div>
                  <p className="text-xs text-foreground-muted mt-2 text-center">
                    {t('customers.revenueDistribution')}
                  </p>
                </div>

                {/* Stats grid */}
                <div className="grid grid-cols-2 gap-4">
                  {/* New */}
                  <div className="bg-background-subtle rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <UserPlus className="w-4 h-4 text-emerald-500" />
                      <span className="text-sm font-medium text-foreground">{t('customers.newCustomers')}</span>
                    </div>
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-foreground-muted">{t('customers.count')}</span>
                        <span className="text-foreground font-medium">{newCustomers.count}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-foreground-muted">{t('customers.avgValue')}</span>
                        <span className="text-foreground font-medium">{formatCurrency(newCustomers.aov)}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-foreground-muted">{t('customers.revenue')}</span>
                        <span className="text-foreground font-medium">{formatCurrency(newCustomers.revenue)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Returning */}
                  <div className="bg-background-subtle rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <UserCheck className="w-4 h-4 text-amber-500" />
                      <span className="text-sm font-medium text-foreground">{t('customers.returningCustomers')}</span>
                    </div>
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-foreground-muted">{t('customers.count')}</span>
                        <span className="text-foreground font-medium">{returningCustomers.count}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-foreground-muted">{t('customers.ltv')}</span>
                        <span className="text-foreground font-medium">{formatCurrency(returningCustomers.ltv)}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-foreground-muted">{t('customers.revenue')}</span>
                        <span className="text-foreground font-medium">{formatCurrency(returningCustomers.revenue)}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {ltvMultiplier > 1 && (
                  <p className="text-xs text-foreground-muted mt-4 text-center">
                    {t('customers.ltvInsight', { multiplier: ltvMultiplier })}
                  </p>
                )}
              </div>
            </div>

            {/* PHASE 2: Customer Journey Funnel */}
            <div className="bg-background-elevated rounded-xl p-5 border border-card-border">
              <h3 className="text-base font-medium text-foreground mb-4 flex items-center gap-2">
                <Repeat className="w-5 h-5 text-primary" />
                {t('customers.customerJourney')}
              </h3>
              <p className="text-xs text-foreground-muted mb-4">{t('customers.journeyDesc')}</p>

              {/* Funnel visualization */}
              <div className="flex items-center justify-between gap-2 mb-6">
                {lifecycle?.funnel?.map((step, index) => (
                  <div key={step.step} className="flex items-center flex-1">
                    <div className="flex-1 text-center">
                      <div
                        className="mx-auto rounded-lg bg-gradient-to-b from-primary/20 to-primary/5 border border-primary/30 flex flex-col items-center justify-center p-3"
                        style={{
                          width: `${Math.max(60, 100 - (index * 15))}%`,
                          minHeight: '80px'
                        }}
                      >
                        <span className="text-2xl font-bold text-foreground">{step.count}</span>
                        <span className="text-xs text-foreground-muted">{t(`customers.order${step.label}`)}</span>
                      </div>
                      {step.step > 1 && (
                        <div className="mt-2 text-xs">
                          <span className={`font-medium ${step.rate >= 50 ? 'text-emerald-500' : step.rate >= 30 ? 'text-amber-500' : 'text-red-400'}`}>
                            {step.rate}%
                          </span>
                          <span className="text-foreground-muted ml-1">{t('customers.converted')}</span>
                        </div>
                      )}
                    </div>
                    {index < lifecycle.funnel.length - 1 && (
                      <ArrowRight className="w-5 h-5 text-foreground-muted flex-shrink-0 mx-1" />
                    )}
                  </div>
                ))}
              </div>

              {/* Drop-off insights */}
              <div className="grid grid-cols-2 gap-4 pt-4 border-t border-border">
                <div className="bg-background-subtle rounded-lg p-3">
                  <p className="text-xs text-foreground-muted mb-1">{t('customers.dropoff1to2')}</p>
                  <p className="text-lg font-semibold text-red-400">
                    {lifecycle?.dropoffs?.firstToSecond} ({lifecycle?.dropoffs?.firstToSecondRate}%)
                  </p>
                </div>
                <div className="bg-background-subtle rounded-lg p-3">
                  <p className="text-xs text-foreground-muted mb-1">{t('customers.dropoff2to3')}</p>
                  <p className="text-lg font-semibold text-amber-500">
                    {lifecycle?.dropoffs?.secondToThird} ({lifecycle?.dropoffs?.secondToThirdRate}%)
                  </p>
                </div>
              </div>
            </div>

            {/* PHASE 2: LTV Analysis by Segment */}
            <div className="bg-background-elevated rounded-xl p-5 border border-card-border">
              <h3 className="text-base font-medium text-foreground mb-4 flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-emerald-500" />
                {t('customers.ltvAnalysis')}
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                {/* B2B LTV */}
                <div className="bg-background-subtle rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Building2 className="w-4 h-4 text-primary" />
                    <span className="text-sm font-medium text-foreground">B2B LTV</span>
                  </div>
                  <p className="text-2xl font-bold text-foreground">{formatCurrency(ltvAnalysis?.b2b?.ltv)}</p>
                  <p className="text-xs text-foreground-muted mt-1">
                    {ltvAnalysis?.b2b?.avgOrders} {t('customers.ordersAvg')} · {ltvAnalysis?.b2b?.customers} {t('customers.customersCount')}
                  </p>
                </div>

                {/* B2C LTV */}
                <div className="bg-background-subtle rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <User className="w-4 h-4 text-cyan-500" />
                    <span className="text-sm font-medium text-foreground">B2C LTV</span>
                  </div>
                  <p className="text-2xl font-bold text-foreground">{formatCurrency(ltvAnalysis?.b2c?.ltv)}</p>
                  <p className="text-xs text-foreground-muted mt-1">
                    {ltvAnalysis?.b2c?.avgOrders} {t('customers.ordersAvg')} · {ltvAnalysis?.b2c?.customers} {t('customers.customersCount')}
                  </p>
                </div>

                {/* Time between orders */}
                <div className="bg-background-subtle rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Clock className="w-4 h-4 text-amber-500" />
                    <span className="text-sm font-medium text-foreground">{t('customers.orderCycle')}</span>
                  </div>
                  <p className="text-2xl font-bold text-foreground">{ltvAnalysis?.avgDaysBetweenOrders} {t('customers.days')}</p>
                  <p className="text-xs text-foreground-muted mt-1">
                    {ltvAnalysis?.avgOrdersPerCustomer} {t('customers.ordersPerCustomer')}
                  </p>
                </div>
              </div>

              {/* LTV comparison insight */}
              {ltvAnalysis?.ltvDifference !== 0 && (
                <div className="bg-primary/5 border border-primary/20 rounded-lg p-3 text-center">
                  <p className="text-sm text-foreground">
                    {ltvAnalysis?.ltvDifference > 0 ? (
                      <>B2B LTV on <span className="text-primary font-semibold">+{ltvAnalysis.ltvDifference}%</span> korkeampi kuin B2C</>
                    ) : (
                      <>B2C LTV on <span className="text-cyan-500 font-semibold">+{Math.abs(ltvAnalysis.ltvDifference)}%</span> korkeampi kuin B2B</>
                    )}
                  </p>
                </div>
              )}
            </div>

            {/* Top Customers */}
            <div className="bg-background-elevated rounded-xl p-5 border border-card-border">
              <h3 className="text-base font-medium text-foreground mb-4 flex items-center gap-2">
                <Crown className="w-5 h-5 text-amber-500" />
                {t('customers.topCustomers')}
              </h3>
              <p className="text-xs text-foreground-muted mb-4">{t('customers.topCustomersDesc')}</p>

              {/* Column headers */}
              <div className="grid grid-cols-12 gap-2 pb-2 mb-2 border-b border-border text-xs text-foreground-muted">
                <span className="col-span-1">#</span>
                <span className="col-span-3">{t('customers.customer')}</span>
                <span className="col-span-2 text-right">{t('customers.orders')}</span>
                <span className="col-span-2 text-right">{t('customers.ltv')}</span>
                <span className="col-span-2 text-right">{t('customers.aov')}</span>
                <span className="col-span-2 text-right">{t('customers.type')}</span>
              </div>

              <div className="space-y-1 max-h-[400px] overflow-y-auto">
                {topCustomers.map((customer) => (
                  <div
                    key={customer.rank}
                    className="grid grid-cols-12 gap-2 py-2 border-b border-border/50 last:border-0 items-center"
                  >
                    <span className="col-span-1 text-sm text-foreground-muted">
                      {customer.rank <= 3 ? ['🥇', '🥈', '🥉'][customer.rank - 1] : customer.rank}
                    </span>
                    <span className="col-span-3 text-sm text-foreground font-mono">{customer.id}</span>
                    <span className="col-span-2 text-sm text-foreground text-right tabular-nums">{customer.orders}</span>
                    <span className="col-span-2 text-sm text-foreground font-medium text-right tabular-nums">
                      {formatCurrency(customer.revenue)}
                    </span>
                    <span className="col-span-2 text-sm text-foreground-muted text-right tabular-nums">
                      {formatCurrency(customer.aov)}
                    </span>
                    <span className={`col-span-2 text-xs text-right ${customer.isB2B ? 'text-primary' : 'text-cyan-500'}`}>
                      {customer.isB2B ? 'B2B' : 'B2C'}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Countries */}
            {countries.length > 1 && (
              <div className="bg-background-elevated rounded-xl p-5 border border-card-border">
                <h3 className="text-base font-medium text-foreground mb-4 flex items-center gap-2">
                  <Globe className="w-5 h-5 text-primary" />
                  {t('customers.byCountry')}
                </h3>

                <div className="space-y-3">
                  {countries.slice(0, 10).map((country) => (
                    <div key={country.country} className="flex items-center gap-3">
                      <span className="text-sm text-foreground w-8">{country.country}</span>
                      <div className="flex-1 h-2 bg-background-subtle rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary rounded-full"
                          style={{ width: `${country.percentage}%` }}
                        />
                      </div>
                      <span className="text-sm text-foreground-muted w-16 text-right">
                        {country.orders} ({country.percentage}%)
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Customer Notes/Feedback */}
            {notesStats && (
              <div className="bg-background-elevated rounded-xl p-5 border border-card-border">
                <h3 className="text-base font-medium text-foreground mb-4 flex items-center gap-2">
                  <MessageSquare className="w-5 h-5 text-amber-500" />
                  {t('customers.customerNotes')}
                </h3>
                <p className="text-xs text-foreground-muted mb-4">{t('customers.customerNotesDesc')}</p>

                {/* Stats summary */}
                <div className="flex gap-4 mb-4">
                  <div className="bg-background-subtle rounded-lg px-4 py-2">
                    <span className="text-lg font-bold text-foreground">{notesStats.totalWithNotes}</span>
                    <span className="text-xs text-foreground-muted ml-2">
                      {t('customers.notesCount', { count: notesStats.totalWithNotes })}
                    </span>
                  </div>
                  <div className="bg-background-subtle rounded-lg px-4 py-2">
                    <span className="text-lg font-bold text-foreground">{notesStats.percentage}%</span>
                    <span className="text-xs text-foreground-muted ml-2">
                      {t('customers.notesPercentage', { percent: notesStats.percentage })}
                    </span>
                  </div>
                </div>

                {/* Notes list */}
                {notesStats.recentNotes?.length > 0 ? (
                  <div className="space-y-3 max-h-[400px] overflow-y-auto">
                    {notesStats.recentNotes.map((note, index) => (
                      <div
                        key={index}
                        className="bg-background-subtle rounded-lg p-3 border-l-2 border-amber-500/50"
                      >
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-foreground">
                              {note.customerName}
                            </span>
                            {note.isB2B && (
                              <span className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded">B2B</span>
                            )}
                            {note.company && (
                              <span className="text-xs text-foreground-muted">({note.company})</span>
                            )}
                          </div>
                          <div className="text-right flex-shrink-0">
                            <span className="text-xs text-foreground-muted">
                              {new Date(note.orderDate).toLocaleDateString('sv-SE')}
                            </span>
                            <span className="text-xs text-foreground ml-2 font-medium">
                              {formatCurrency(note.total)}
                            </span>
                          </div>
                        </div>
                        <p className="text-sm text-foreground-muted italic">"{note.note}"</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-foreground-muted text-center py-4">{t('customers.noNotes')}</p>
                )}
              </div>
            )}

            {/* PHASE 3: Entry Products - What brings in new customers */}
            {!entryLoading && firstPurchaseProducts?.length > 0 && (
              <div className="bg-background-elevated rounded-xl p-5 border border-card-border">
                <h3 className="text-base font-medium text-foreground mb-4 flex items-center gap-2">
                  <ShoppingBag className="w-5 h-5 text-emerald-500" />
                  {t('customers.entryProducts')}
                </h3>
                <p className="text-xs text-foreground-muted mb-4">{t('customers.entryProductsDesc')}</p>

                <div className="space-y-2">
                  {firstPurchaseProducts.slice(0, 10).map((product, index) => (
                    <div
                      key={product.sku || index}
                      className="flex items-center justify-between py-2 border-b border-border/50 last:border-0"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-foreground truncate">{product.name}</p>
                        <p className="text-xs text-foreground-muted">
                          SKU: {product.sku || '—'}
                        </p>
                      </div>
                      <div className="flex items-center gap-4 ml-4">
                        <div className="text-right">
                          <p className="text-sm font-medium text-foreground">{product.firstOrderCount}</p>
                          <p className="text-xs text-foreground-muted">{t('customers.firstOrders')}</p>
                        </div>
                        <div className="text-right min-w-[60px]">
                          <p className={`text-sm font-medium ${product.entryRate >= 50 ? 'text-emerald-500' : 'text-foreground'}`}>
                            {product.entryRate}%
                          </p>
                          <p className="text-xs text-foreground-muted">{t('customers.entryRate')}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* PHASE 3: B2B vs B2C Entry Products */}
            {!entryLoading && (b2bEntryProducts?.length > 0 || b2cEntryProducts?.length > 0) && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* B2B Entry Products */}
                {b2bEntryProducts?.length > 0 && (
                  <div className="bg-background-elevated rounded-xl p-5 border border-card-border">
                    <h3 className="text-base font-medium text-foreground mb-4 flex items-center gap-2">
                      <Building2 className="w-5 h-5 text-primary" />
                      {t('customers.b2bEntryProducts')}
                    </h3>
                    <p className="text-xs text-foreground-muted mb-4">{t('customers.b2bEntryProductsDesc')}</p>

                    <div className="space-y-2">
                      {b2bEntryProducts.slice(0, 5).map((product, index) => (
                        <div
                          key={product.sku || index}
                          className="flex items-center justify-between py-2 border-b border-border/50 last:border-0"
                        >
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-foreground truncate">{product.name}</p>
                          </div>
                          <div className="flex items-center gap-3 ml-2">
                            <span className="text-sm font-medium text-primary">{product.b2bFirstOrders}</span>
                            <span className="text-xs text-foreground-muted bg-background-subtle px-2 py-0.5 rounded">
                              {product.entryRate}% {t('customers.entry')}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* B2C Entry Products */}
                {b2cEntryProducts?.length > 0 && (
                  <div className="bg-background-elevated rounded-xl p-5 border border-card-border">
                    <h3 className="text-base font-medium text-foreground mb-4 flex items-center gap-2">
                      <Package className="w-5 h-5 text-cyan-500" />
                      {t('customers.b2cEntryProducts')}
                    </h3>
                    <p className="text-xs text-foreground-muted mb-4">{t('customers.b2cEntryProductsDesc')}</p>

                    <div className="space-y-2">
                      {b2cEntryProducts.slice(0, 5).map((product, index) => (
                        <div
                          key={product.sku || index}
                          className="flex items-center justify-between py-2 border-b border-border/50 last:border-0"
                        >
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-foreground truncate">{product.name}</p>
                          </div>
                          <div className="flex items-center gap-3 ml-2">
                            <span className="text-sm font-medium text-cyan-500">{product.b2cFirstOrders}</span>
                            <span className="text-xs text-foreground-muted bg-background-subtle px-2 py-0.5 rounded">
                              {product.entryRate}% {t('customers.entry')}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  )
}

export default CustomersPage

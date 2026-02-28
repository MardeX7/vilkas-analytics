/**
 * Tilannekuva-sivu (KPI Dashboard)
 *
 * Verkkokaupan suorituskykymittaristo:
 * - Growth Engine YoY-mittarit
 * - 4 KPI-aluetta (Kysynnän kasvu, Liikenteen laatu, Myynnin tehokkuus, Tuotevalikoima)
 * - Tavoitteet & Muistiinpanot
 * - Growth Engine historia
 *
 * Versio: 2.5
 */

import { useState, useMemo } from 'react'
import { RefreshCw, AlertTriangle, TrendingUp, TrendingDown, Minus, ChevronRight, ChevronLeft, Package, Search, Truck, DollarSign, Users, ShoppingCart } from 'lucide-react'
import { useKPIDashboard } from '@/hooks/useKPIDashboard'
import { KPIHistoryChart } from '@/components/SalesChart'
import { MerchantGoalsCard } from '@/components/MerchantGoalsCard'
import { ContextNotesCard } from '@/components/ContextNotesCard'
import { WeeklyAnalysisCard } from '@/components/WeeklyAnalysisCard'
import { useGrowthEngine } from '@/hooks/useGrowthEngine'
import { useGrowthEngineHistory } from '@/hooks/useGrowthEngineHistory'
import { useTranslation } from '@/lib/i18n'
import { useCurrentShop } from '@/config/storeConfig'

// Index icons
const INDEX_ICONS = {
  overall: DollarSign,
  core: DollarSign,
  ppi: Package,
  spi: Search,
  oi: Truck
}

// Index colors
const INDEX_COLORS = {
  overall: 'cyan',
  core: 'emerald',
  ppi: 'violet',
  spi: 'amber',
  oi: 'blue'
}

export function IndicatorsPage() {
  const { t, locale } = useTranslation()
  const [granularity, setGranularity] = useState('week')
  const [selectedIndex, setSelectedIndex] = useState(null)
  // Default to current/newest week (offset 0)
  const [periodOffset, setPeriodOffset] = useState(0)

  const {
    dashboard,
    indexes,
    alerts,
    profitSummary,
    isLoading,
    error,
    hasData,
    refresh,
    triggerCalculation,
    totalPeriods
  } = useKPIDashboard({ granularity, periodOffset })

  // Growth Engine YoY metrics
  const dateRange = dashboard?.period ? { startDate: dashboard.period.start, endDate: dashboard.period.end } : null
  const {
    overallIndex: growthIndex,
    indexLevel: growthLevel,
    demandGrowth,
    trafficQuality,
    salesEfficiency,
    productLeverage,
    dataWarning: gscDataWarning,
    effectiveDateRange
  } = useGrowthEngine(dateRange)

  // Growth Engine REAL history (from growth_engine_snapshots table)
  const {
    history: growthEngineHistory,
    loading: growthHistoryLoading,
    hasData: hasGrowthHistory
  } = useGrowthEngineHistory({ periodType: 'week', limit: 52 })

  // Reset period offset when granularity changes - show newest period
  const handleGranularityChange = (newGranularity) => {
    setGranularity(newGranularity)
    setPeriodOffset(0) // Always show the newest/current period
  }

  // Navigation handlers
  const canGoBack = periodOffset < totalPeriods - 1
  const canGoForward = periodOffset > 0
  const isLatest = periodOffset === 0
  const isCurrentPeriodIncomplete = periodOffset === 0 // Current week/month is still in progress

  const goToPreviousPeriod = () => {
    if (canGoBack) {
      setPeriodOffset(prev => prev + 1)
    }
  }

  const goToNextPeriod = () => {
    if (canGoForward) {
      setPeriodOffset(prev => prev - 1)
    }
  }

  const goToLatest = () => {
    setPeriodOffset(0)
  }

  // Format period label for display
  const getPeriodLabel = useMemo(() => {
    if (!dashboard?.period) return ''

    const endDate = new Date(dashboard.period.end)

    if (granularity === 'week') {
      // Calculate ISO week number
      const startOfYear = new Date(endDate.getFullYear(), 0, 1)
      const days = Math.floor((endDate - startOfYear) / (24 * 60 * 60 * 1000))
      const weekNumber = Math.ceil((days + startOfYear.getDay() + 1) / 7)
      return t('kpi.navigation.weekNumber', { week: weekNumber }) + ` / ${endDate.getFullYear()}`
    } else {
      // Month name
      const monthNames = locale === 'fi'
        ? ['Tammikuu', 'Helmikuu', 'Maaliskuu', 'Huhtikuu', 'Toukokuu', 'Kesäkuu', 'Heinäkuu', 'Elokuu', 'Syyskuu', 'Lokakuu', 'Marraskuu', 'Joulukuu']
        : ['Januari', 'Februari', 'Mars', 'April', 'Maj', 'Juni', 'Juli', 'Augusti', 'September', 'Oktober', 'November', 'December']
      return `${monthNames[endDate.getMonth()]} ${endDate.getFullYear()}`
    }
  }, [dashboard?.period, granularity, locale, t])

  // Overall index (first in array)
  const overallIndex = indexes.find(i => i.id === 'overall')

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-pulse flex flex-col items-center gap-4">
          <div className="w-20 h-20 rounded-full bg-background-elevated" />
          <div className="w-40 h-4 rounded bg-background-elevated" />
          <p className="text-foreground-subtle text-sm">{t('kpi.loading')}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">

        {/* Header - Responsive: stacks on mobile, row on desktop */}
        <div className="flex flex-col gap-4 mb-10 lg:flex-row lg:items-center lg:justify-between">
          {/* Title section - always visible */}
          <div className="flex-shrink-0">
            <h1 className="text-xl sm:text-2xl font-semibold text-foreground">
              {t('kpi.title')}
            </h1>
            <p className="text-foreground-subtle text-xs sm:text-sm mt-1">
              {t('kpi.subtitle')}
            </p>
          </div>

          {/* Controls - wraps on mobile */}
          <div className="flex flex-wrap items-center gap-2 sm:gap-3 lg:gap-4">
            {/* Period Navigation */}
            {totalPeriods > 1 && (
              <div className="flex items-center gap-1 sm:gap-2 bg-background-elevated rounded-lg border border-border px-1.5 sm:px-2 py-1 order-1">
                <button
                  onClick={goToPreviousPeriod}
                  disabled={!canGoBack}
                  className={`p-1 sm:p-1.5 rounded-md transition-colors ${
                    canGoBack
                      ? 'text-foreground-muted hover:text-foreground hover:bg-background-subtle'
                      : 'text-foreground-subtle/30 cursor-not-allowed'
                  }`}
                  title={t('kpi.navigation.previous')}
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>

                <div className="min-w-[100px] sm:min-w-[140px] text-center">
                  <span className="text-xs sm:text-sm font-medium text-foreground whitespace-nowrap">
                    {getPeriodLabel}
                  </span>
                </div>

                <button
                  onClick={goToNextPeriod}
                  disabled={!canGoForward}
                  className={`p-1 sm:p-1.5 rounded-md transition-colors ${
                    canGoForward
                      ? 'text-foreground-muted hover:text-foreground hover:bg-background-subtle'
                      : 'text-foreground-subtle/30 cursor-not-allowed'
                  }`}
                  title={t('kpi.navigation.next')}
                >
                  <ChevronRight className="w-4 h-4" />
                </button>

                {/* Jump to latest button - hidden on very small screens */}
                {!isLatest && (
                  <button
                    onClick={goToLatest}
                    className="hidden xs:block ml-0.5 sm:ml-1 px-1.5 sm:px-2 py-1 text-xs font-medium text-primary hover:text-primary/80 transition-colors"
                    title={t('kpi.navigation.latest')}
                  >
                    {t('kpi.navigation.latest')}
                  </button>
                )}
              </div>
            )}

            {/* Granularity Toggle */}
            <div className="flex bg-background-subtle rounded-lg p-0.5 sm:p-1 order-2">
              <button
                onClick={() => handleGranularityChange('week')}
                className={`px-2.5 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm font-medium rounded-md transition-all ${
                  granularity === 'week'
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-foreground-muted hover:text-foreground'
                }`}
              >
                {t('kpi.granularity.week')}
              </button>
              <button
                onClick={() => handleGranularityChange('month')}
                className={`px-2.5 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm font-medium rounded-md transition-all ${
                  granularity === 'month'
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-foreground-muted hover:text-foreground'
                }`}
              >
                {t('kpi.granularity.month')}
              </button>
            </div>

            {/* Refresh */}
            <button
              onClick={refresh}
              className="p-2 sm:p-2.5 rounded-lg bg-background-elevated text-foreground-muted hover:text-foreground hover:bg-background-subtle transition-colors border border-border order-3"
              title={t('common.refresh')}
            >
              <RefreshCw className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-destructive-muted border border-destructive/20 rounded-lg p-4 mb-8">
            <p className="text-destructive text-sm">{error.message}</p>
          </div>
        )}

        {/* GSC Data Warning - shown when falling back to older period */}
        {gscDataWarning && effectiveDateRange && (
          <div className="bg-warning/10 border border-warning/30 rounded-lg p-4 mb-6 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-warning flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-warning font-medium text-sm">
                Hakukone-data ei ole valmis valitulle jaksolle. Näytetään viimeisin täysi viikko.
              </p>
              <div className="text-foreground-muted text-xs mt-2 space-y-1">
                <p>
                  <span className="text-foreground-subtle">Nykyinen:</span>{' '}
                  <span className="text-foreground font-medium">
                    {new Date(effectiveDateRange.startDate).getDate()}.{new Date(effectiveDateRange.startDate).getMonth() + 1}-{new Date(effectiveDateRange.endDate).getDate()}.{new Date(effectiveDateRange.endDate).getMonth() + 1}.{new Date(effectiveDateRange.startDate).getFullYear()}
                  </span>
                </p>
                <p>
                  <span className="text-foreground-subtle">Vertailu (YoY):</span>{' '}
                  <span className="text-foreground font-medium">
                    {new Date(effectiveDateRange.startDate).getDate()}.{new Date(effectiveDateRange.startDate).getMonth() + 1}-{new Date(effectiveDateRange.endDate).getDate()}.{new Date(effectiveDateRange.endDate).getMonth() + 1}.{new Date(effectiveDateRange.startDate).getFullYear() - 1}
                  </span>
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Current Period Incomplete Warning */}
        {isCurrentPeriodIncomplete && hasData && (
          <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4 mb-6 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-blue-400 font-medium text-sm">
                {granularity === 'week'
                  ? (locale === 'fi' ? 'Viikko kesken – data ei ole vielä valmis' : 'Veckan pågår – data inte färdig ännu')
                  : (locale === 'fi' ? 'Kuukausi kesken – data ei ole vielä valmis' : 'Månaden pågår – data inte färdig ännu')}
              </p>
              <p className="text-foreground-subtle text-xs mt-1">
                {locale === 'fi'
                  ? 'Suosittelemme tarkastelemaan edellisen jakson dataa luotettavampien tulosten saamiseksi.'
                  : 'Vi rekommenderar att granska föregående periods data för mer tillförlitliga resultat.'}
              </p>
            </div>
          </div>
        )}

        {/* No Data State */}
        {!hasData && !isLoading && (
          <NoDataState onCalculate={triggerCalculation} t={t} />
        )}

        {/* Main Dashboard */}
        {hasData && (
          <>
            {/* Weekly AI Analysis */}
            <div className="mb-6">
              <WeeklyAnalysisCard dateRange={dateRange} granularity={granularity} />
            </div>

            {/* KPI Overview: Overall Index + 4 Growth Engine KPIs */}
            <div className="grid grid-cols-12 gap-6 mb-6">
              {/* Overall Index - Large */}
              <div className="col-span-12 lg:col-span-5">
                <OverallIndexCard
                  index={overallIndex}
                  alerts={alerts}
                  t={t}
                  growthIndex={growthIndex}
                  growthLevel={growthLevel}
                />
              </div>

              {/* 4 Growth Engine KPIs */}
              <div className="col-span-12 lg:col-span-7 grid grid-cols-2 gap-4">
                <GrowthKPICard
                  areaKey="demandGrowth"
                  data={demandGrowth}
                  isExpanded={selectedIndex === 'demandGrowth'}
                  onToggle={() => setSelectedIndex(selectedIndex === 'demandGrowth' ? null : 'demandGrowth')}
                  t={t}
                />
                <GrowthKPICard
                  areaKey="trafficQuality"
                  data={trafficQuality}
                  isExpanded={selectedIndex === 'trafficQuality'}
                  onToggle={() => setSelectedIndex(selectedIndex === 'trafficQuality' ? null : 'trafficQuality')}
                  t={t}
                />
                <GrowthKPICard
                  areaKey="salesEfficiency"
                  data={salesEfficiency}
                  isExpanded={selectedIndex === 'salesEfficiency'}
                  onToggle={() => setSelectedIndex(selectedIndex === 'salesEfficiency' ? null : 'salesEfficiency')}
                  t={t}
                />
                <GrowthKPICard
                  areaKey="productLeverage"
                  data={productLeverage}
                  isExpanded={selectedIndex === 'productLeverage'}
                  onToggle={() => setSelectedIndex(selectedIndex === 'productLeverage' ? null : 'productLeverage')}
                  t={t}
                />
              </div>
            </div>

            {/* Alerts Banner */}
            {alerts.length > 0 && (
              <AlertsBanner alerts={alerts} t={t} />
            )}

            {/* Expanded KPI Detail */}
            {selectedIndex && ['demandGrowth', 'trafficQuality', 'salesEfficiency', 'productLeverage'].includes(selectedIndex) && (
              <GrowthKPIDetail
                areaKey={selectedIndex}
                data={selectedIndex === 'demandGrowth' ? demandGrowth :
                      selectedIndex === 'trafficQuality' ? trafficQuality :
                      selectedIndex === 'salesEfficiency' ? salesEfficiency : productLeverage}
                onClose={() => setSelectedIndex(null)}
                effectiveDateRange={effectiveDateRange}
                t={t}
              />
            )}

            {/* Gross Profit Summary */}
            {profitSummary && (
              <GrossProfitCard profitSummary={profitSummary} t={t} />
            )}

            {/* Growth Engine History Chart - REAL data from growth_engine_snapshots */}
            {hasGrowthHistory && (
              <div className="mt-6">
                <KPIHistoryChart
                  data={growthEngineHistory.map(h => ({
                    period_end: h.periodEnd,
                    overall_index: h.overall,
                    demand_growth: h.demandGrowth,
                    traffic_quality: h.trafficQuality,
                    sales_efficiency: h.salesEfficiency,
                    product_leverage: h.productLeverage
                  }))}
                  title={`${t('growthEngine.title')} - ${t('kpi.weeksCount')}`}
                  indexKey="overall_index"
                  granularity="week"
                />
              </div>
            )}
            {!hasGrowthHistory && !growthHistoryLoading && (
              <div className="mt-6 p-4 bg-background-subtle rounded-lg text-center text-foreground-muted text-sm">
                {t('charts.noHistory')} - {t('growthEngine.historyStarting')}
              </div>
            )}

            {/* Goals & Notes */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-10">
              <MerchantGoalsCard />
              <ContextNotesCard />
            </div>

            {/* Period Info */}
            {dashboard?.period && (
              <div className="mt-10 text-center">
                <p className="text-foreground-subtle text-sm">
                  {t('kpi.period.label')}: {dashboard.period.start} – {dashboard.period.end}
                  {dashboard.calculated_at && (
                    <span className="ml-2">
                      | {t('kpi.period.calculated')}: {new Date(dashboard.calculated_at).toLocaleString(locale)}
                    </span>
                  )}
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

/**
 * Overall Index Card - Large hero display
 * Now uses Growth Engine index
 */
function OverallIndexCard({ index, alerts, t, growthIndex, growthLevel }) {
  // Use growth index if available, otherwise fall back to KPI index
  const displayValue = growthIndex ?? index?.value ?? 0
  const displayLevel = growthLevel || index?.interpretation?.level || 'unknown'

  const getColorClass = (level) => {
    switch (level) {
      case 'excellent': return 'text-success'
      case 'good': return 'text-success'
      case 'fair':
      case 'needs_work': return 'text-warning'
      case 'poor': return 'text-orange-400'
      case 'critical': return 'text-destructive'
      default: return 'text-foreground-subtle'
    }
  }

  const getBgGradient = (level) => {
    switch (level) {
      case 'excellent': return 'from-success/10 to-success/5'
      case 'good': return 'from-success/10 to-success/5'
      case 'fair':
      case 'needs_work': return 'from-warning/10 to-warning/5'
      case 'poor': return 'from-orange-500/10 to-orange-500/5'
      case 'critical': return 'from-destructive/10 to-destructive/5'
      default: return 'from-background-elevated to-background'
    }
  }

  const getLevelLabel = (level) => {
    switch (level) {
      case 'excellent': return t('growthEngine.indexLevels.excellent')
      case 'good': return t('growthEngine.indexLevels.good')
      case 'needs_work': return t('growthEngine.indexLevels.needs_work')
      case 'poor': return t('growthEngine.indexLevels.poor')
      default: return '—'
    }
  }

  return (
    <div className={`bg-gradient-to-br ${getBgGradient(displayLevel)} rounded-2xl p-8 h-full border border-card-border`}>
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="text-foreground-muted text-sm font-medium">{t('growthEngine.title')}</p>
          <p className="text-foreground-subtle text-xs mt-0.5">{t('growthEngine.subtitle')}</p>
        </div>
        {alerts && alerts.length > 0 && (
          <div className="flex items-center gap-1.5 bg-warning-muted text-warning px-2 py-1 rounded-lg">
            <AlertTriangle className="w-3.5 h-3.5" />
            <span className="text-xs font-medium">{alerts.length}</span>
          </div>
        )}
      </div>

      <div className="flex items-end gap-4 mb-4">
        <span className={`text-8xl font-bold tabular-nums ${getColorClass(displayLevel)}`}>
          {displayValue}
        </span>
        <span className="text-foreground-subtle text-2xl mb-2">/100</span>
      </div>

      <div className="flex items-center gap-3 mb-6">
        <span className={`text-lg font-semibold ${getColorClass(displayLevel)}`}>
          {getLevelLabel(displayLevel)}
        </span>
      </div>

      {/* Index Gauge */}
      <div className="mt-6">
        <div className="h-3 bg-background-subtle rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              displayLevel === 'excellent' ? 'bg-success' :
              displayLevel === 'good' ? 'bg-success' :
              displayLevel === 'fair' || displayLevel === 'needs_work' ? 'bg-warning' :
              displayLevel === 'poor' ? 'bg-orange-500' : 'bg-destructive'
            }`}
            style={{ width: `${displayValue || 0}%` }}
          />
        </div>
        <div className="flex justify-between mt-2 text-xs text-foreground-subtle">
          <span>0</span>
          <span className="text-foreground-muted">60 = {t('growthEngine.target.description')}</span>
          <span>100</span>
        </div>
      </div>
    </div>
  )
}

/**
 * Growth KPI Card - Shows one of the 4 Growth Engine KPIs
 */
const GROWTH_KPI_ICONS = {
  demandGrowth: Search,
  trafficQuality: Users,
  salesEfficiency: ShoppingCart,
  productLeverage: Package
}

const GROWTH_KPI_COLORS = {
  demandGrowth: 'emerald',
  trafficQuality: 'blue',
  salesEfficiency: 'violet',
  productLeverage: 'amber'
}

function GrowthKPICard({ areaKey, data, isExpanded, onToggle, t }) {
  if (!data) return null

  const Icon = GROWTH_KPI_ICONS[areaKey] || Package
  const color = GROWTH_KPI_COLORS[areaKey] || 'slate'

  const getKpiColorClasses = (color, score) => {
    if (score < 40) {
      return { text: 'text-destructive', bg: 'bg-destructive/5', border: 'border-destructive/20', iconBg: 'bg-destructive-muted' }
    }
    if (score < 60) {
      return { text: 'text-warning', bg: 'bg-warning/5', border: 'border-warning/20', iconBg: 'bg-warning-muted' }
    }
    const colors = {
      emerald: { text: 'text-success', bg: 'bg-success/5', border: 'border-success/20', iconBg: 'bg-success-muted' },
      blue: { text: 'text-info', bg: 'bg-info/5', border: 'border-info/20', iconBg: 'bg-info-muted' },
      violet: { text: 'text-purple-400', bg: 'bg-purple-500/5', border: 'border-purple-500/20', iconBg: 'bg-purple-500/10' },
      amber: { text: 'text-amber-400', bg: 'bg-amber-500/5', border: 'border-amber-500/20', iconBg: 'bg-amber-500/10' }
    }
    return colors[color] || colors.emerald
  }

  const colorClasses = getKpiColorClasses(color, data.score)

  return (
    <div
      onClick={onToggle}
      className={`
        group relative overflow-hidden cursor-pointer
        ${colorClasses.bg} hover:brightness-95
        border ${isExpanded ? 'border-primary' : colorClasses.border}
        rounded-lg p-5 transition-all duration-200
      `}
    >
      {/* Icon */}
      <div className={`w-10 h-10 rounded-lg ${colorClasses.iconBg} flex items-center justify-center mb-4`}>
        <Icon className={`w-5 h-5 ${colorClasses.text}`} />
      </div>

      {/* Title */}
      <p className="text-foreground font-medium text-sm mb-1">
        {t(`growthEngine.${areaKey}.title`)}
      </p>
      <p className="text-foreground-subtle text-xs mb-3">
        {t(`growthEngine.${areaKey}.subtitle`)}
      </p>

      {/* Value */}
      <div className="flex items-baseline gap-2 mb-2">
        <span className={`text-4xl font-bold tabular-nums ${colorClasses.text}`}>
          {data.score}
        </span>
      </div>

      {/* Weight */}
      <p className="text-foreground-subtle text-xs">
        {t('growthEngine.weight')}: {data.weight}%
      </p>

      {/* Expand icon */}
      <ChevronRight className={`absolute top-5 right-5 w-4 h-4 text-foreground-subtle group-hover:text-foreground-muted transition-all ${isExpanded ? 'rotate-90' : ''}`} />
    </div>
  )
}

/**
 * Metric tooltips - what each metric means
 */
const METRIC_TOOLTIPS = {
  // Demand Growth
  organicClicks: 'Google-hauista tulleet klikkaukset sivustollesi. Mittaa orgaanisen näkyvyyden tehokkuutta.',
  impressions: 'Kuinka monta kertaa sivustosi näkyi Google-hakutuloksissa. Kertoo hakukonenäkyvyydestä.',
  top10Keywords: 'Hakusanat, joissa sivustosi on TOP 10 -sijoituksella. Arvokkaat sijat tuovat eniten liikennettä.',
  // Traffic Quality
  engagementRate: 'Sitoutuneiden istuntojen osuus kaikista istunnoista (GA4). Korkea % = laadukas liikenne.',
  organicShare: 'Orgaanisen liikenteen osuus kaikesta liikenteestä. Ilmainen vs. maksettu liikenne.',
  bounceRate: 'Välittömästi poistuneiden osuus. Pienempi = parempi. Käänteinen pisteytys.',
  // Sales Efficiency
  conversionRate: 'Tilausten määrä / istuntojen määrä. Kuinka hyvin liikenne muuttuu myynniksi.',
  aov: 'Keskimääräinen tilausarvo (Average Order Value). Mitä enemmän per tilaus, sitä parempi.',
  orderCount: 'Tilausten kokonaismäärä jaksolla. Perusmetriikka myynnin volyymille.',
  revenue: 'Kokonaisliikevaihto. Kaikki tilaukset yhteensä.',
  uniqueCustomers: 'Uniikkien asiakkaiden määrä (sähköpostin perusteella).',
  // Product Leverage (GSC-based - all pages)
  avgPosition: 'Sivuston keskimääräinen sijainti Google-hauissa (painotettu klikeillä). Pienempi = parempi, käänteinen pisteytys.',
  avgCTR: 'Sivuston keskimääräinen klikkausprosentti hauissa. Korkea CTR = houkuttelevat otsikot ja kuvaukset.',
  top10Pages: 'Kuinka monta sivua näkyy Googlen TOP 10 -tuloksissa (1. sivu). Enemmän = parempi näkyvyys.'
}

/**
 * Growth KPI Detail - Expanded view with metrics
 */
function GrowthKPIDetail({ areaKey, data, onClose, effectiveDateRange, t }) {
  const { currencySymbol } = useCurrentShop()
  if (!data || !data.metrics) return null

  const Icon = GROWTH_KPI_ICONS[areaKey] || Package

  const formatValue = (value, metricKey) => {
    if (value === null || value === undefined) return '—'
    if (['engagementRate', 'organicShare', 'bounceRate', 'conversionRate'].includes(metricKey)) {
      return `${Number(value).toFixed(1)}%`
    }
    if (['avgCTR'].includes(metricKey)) {
      return `${Number(value).toFixed(2)}%`
    }
    if (['avgPosition'].includes(metricKey)) {
      return Number(value).toFixed(1)
    }
    if (['aov', 'revenue'].includes(metricKey)) {
      return `${Math.round(value).toLocaleString('sv-SE')} ${currencySymbol}`
    }
    if (['orderCount', 'uniqueCustomers', 'top10Pages'].includes(metricKey)) {
      return value.toLocaleString('sv-SE')
    }
    if (value >= 1000) {
      return Math.round(value).toLocaleString('sv-SE')
    }
    return value.toString()
  }

  const getScoreColor = (score) => {
    if (score >= 80) return 'text-success'
    if (score >= 60) return 'text-success/80'
    if (score >= 40) return 'text-warning'
    if (score >= 20) return 'text-orange-400'
    return 'text-destructive'
  }

  // Format date range for display
  const formatDateRange = (range) => {
    if (!range) return null
    const formatDate = (dateStr) => {
      const d = new Date(dateStr)
      return `${d.getDate()}.${d.getMonth() + 1}`
    }
    const year = new Date(range.startDate).getFullYear()
    return `${formatDate(range.startDate)}-${formatDate(range.endDate)}.${year}`
  }

  const currentPeriodLabel = effectiveDateRange ? formatDateRange(effectiveDateRange) : null
  const prevPeriodLabel = effectiveDateRange ? formatDateRange({
    startDate: new Date(new Date(effectiveDateRange.startDate).setFullYear(new Date(effectiveDateRange.startDate).getFullYear() - 1)).toISOString().split('T')[0],
    endDate: new Date(new Date(effectiveDateRange.endDate).setFullYear(new Date(effectiveDateRange.endDate).getFullYear() - 1)).toISOString().split('T')[0]
  }) : null

  return (
    <div className="bg-background-elevated border border-card-border rounded-lg p-6 mb-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Icon className="w-6 h-6 text-primary" />
          <div>
            <h3 className="text-lg font-semibold text-foreground">
              {t(`growthEngine.${areaKey}.title`)}
            </h3>
            <p className="text-foreground-subtle text-sm">
              {t(`growthEngine.${areaKey}.subtitle`)}
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="text-foreground-subtle hover:text-foreground text-sm"
        >
          {t('kpi.detail.close')}
        </button>
      </div>

      {/* Comparison Period Info */}
      {effectiveDateRange && (
        <div className="mb-4 px-3 py-2 bg-background-subtle rounded-lg text-xs text-foreground-muted">
          <span className="font-medium">Vertailujakso:</span>{' '}
          <span className="text-foreground">{currentPeriodLabel}</span>
          {' vs '}
          <span className="text-foreground">{prevPeriodLabel}</span>
          <span className="text-foreground-subtle ml-1">(YoY)</span>
        </div>
      )}

      {/* Column Headers */}
      <div className="flex items-center justify-between gap-4 mb-3 pb-2 border-b border-border">
        <div className="flex-1 min-w-0">
          <p className="text-foreground-subtle text-xs font-medium uppercase tracking-wide">
            Metriikka
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right min-w-[80px]">
            <p className="text-foreground-subtle text-xs font-medium uppercase tracking-wide">
              Nyt
            </p>
          </div>
          <div className="text-right min-w-[80px]">
            <p className="text-foreground-subtle text-xs font-medium uppercase tracking-wide">
              Viime v.
            </p>
          </div>
          <div className="min-w-[70px] text-right">
            <p className="text-foreground-subtle text-xs font-medium uppercase tracking-wide">
              YoY
            </p>
          </div>
          <div className="min-w-[50px] text-right">
            <p className="text-foreground-subtle text-xs font-medium uppercase tracking-wide">
              Pisteet
            </p>
          </div>
        </div>
      </div>

      {/* Metrics */}
      <div className="space-y-3">
        {Object.entries(data.metrics).map(([metricKey, metric]) => (
          <div key={metricKey} className="flex items-center justify-between gap-4 group">
            <div className="flex-1 min-w-0 flex items-center gap-2">
              <p className="text-foreground-muted text-sm truncate">
                {t(`growthEngine.${areaKey}.metrics.${metricKey}`)}
              </p>
              {/* Info tooltip */}
              {METRIC_TOOLTIPS[metricKey] && (
                <div className="relative group/tooltip flex-shrink-0">
                  <span className="w-4 h-4 rounded-full bg-foreground-subtle/20 text-foreground-subtle text-xs flex items-center justify-center cursor-help hover:bg-foreground-subtle/30 transition-colors">
                    i
                  </span>
                  <div className="absolute left-6 top-1/2 -translate-y-1/2 z-50 hidden group-hover/tooltip:block w-64 p-2 bg-background-elevated border border-border rounded-lg shadow-lg">
                    <p className="text-foreground-muted text-xs leading-relaxed">
                      {METRIC_TOOLTIPS[metricKey]}
                    </p>
                  </div>
                </div>
              )}
            </div>
            <div className="flex items-center gap-4">
              {/* Current value */}
              <div className="text-right min-w-[80px]">
                <p className="text-foreground text-sm font-medium tabular-nums">
                  {formatValue(metric.current, metricKey)}
                </p>
              </div>
              {/* Previous year value */}
              <div className="text-right min-w-[80px]">
                <p className="text-foreground-subtle text-sm tabular-nums">
                  {formatValue(metric.previous, metricKey)}
                </p>
              </div>
              {/* YoY change */}
              <div className="min-w-[70px] text-right">
                {metric.yoyChange === null || metric.yoyChange === undefined ? (
                  <span className="text-foreground-subtle text-sm" title="Ei vertailudataa viime vuodelta">—</span>
                ) : metric.yoyChange === 0 ? (
                  <span className="flex items-center justify-end gap-1 text-foreground-subtle text-sm">
                    <Minus className="w-3 h-3" />
                    <span>0%</span>
                  </span>
                ) : (
                  <span className={`flex items-center justify-end gap-1 text-sm font-medium tabular-nums ${
                    metric.yoyChange > 0 ? 'text-success' : 'text-destructive'
                  }`}>
                    {metric.yoyChange > 0 ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                    <span>{metric.yoyChange > 0 ? '+' : ''}{metric.yoyChange.toFixed(1)}%</span>
                  </span>
                )}
              </div>
              {/* Score */}
              <div className={`min-w-[50px] text-right font-bold tabular-nums ${getScoreColor(metric.score)}`}>
                {metric.score}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Scoring explanation */}
      <div className="mt-4 pt-4 border-t border-border">
        <p className="text-foreground-subtle text-xs">
          <span className="font-medium text-foreground-muted">Pisteytys:</span>{' '}
          YoY ≥+20% = 100, +10-19% = 80, +1-9% = 60, 0% = 50, -1-9% = 30, ≤-10% = 10
        </p>
      </div>
    </div>
  )
}

/**
 * Index Card - Sub-index display
 */
function IndexCard({ index, onClick, isSelected }) {
  if (!index) return null

  const { id, name, value, delta, interpretation } = index
  const Icon = INDEX_ICONS[id] || DollarSign
  const color = INDEX_COLORS[id] || 'slate'

  const getColorClasses = (color, level) => {
    if (level === 'critical' || level === 'poor') {
      return {
        text: 'text-destructive',
        bg: 'bg-destructive-muted',
        border: 'border-destructive/20'
      }
    }

    const colors = {
      emerald: { text: 'text-success', bg: 'bg-success-muted', border: 'border-success/20' },
      violet: { text: 'text-purple-400', bg: 'bg-purple-500/10', border: 'border-purple-500/20' },
      amber: { text: 'text-warning', bg: 'bg-warning-muted', border: 'border-warning/20' },
      blue: { text: 'text-info', bg: 'bg-info-muted', border: 'border-info/20' },
      cyan: { text: 'text-primary', bg: 'bg-primary-muted', border: 'border-primary/20' }
    }
    return colors[color] || colors.cyan
  }

  const colorClasses = getColorClasses(color, interpretation?.level)

  return (
    <div
      onClick={onClick}
      className={`
        group relative overflow-hidden cursor-pointer
        bg-background-elevated hover:bg-background-subtle
        border ${isSelected ? 'border-primary' : 'border-card-border hover:border-border'}
        rounded-lg p-5 transition-all duration-200
      `}
    >
      {/* Icon */}
      <div className={`w-10 h-10 rounded-lg ${colorClasses.bg} flex items-center justify-center mb-4`}>
        <Icon className={`w-5 h-5 ${colorClasses.text}`} />
      </div>

      {/* Title */}
      <p className="text-foreground-muted text-sm font-medium mb-2">{name}</p>

      {/* Value */}
      <div className="flex items-baseline gap-2 mb-2">
        <span className="text-4xl font-bold text-foreground tabular-nums">
          {value ?? '—'}
        </span>
      </div>

      {/* Delta & Status */}
      <div className="flex items-center gap-2">
        <DeltaBadge delta={delta} />
        <span className={`text-xs ${colorClasses.text}`}>
          {interpretation?.label}
        </span>
      </div>

      {/* Expand icon */}
      <ChevronRight className="absolute top-5 right-5 w-4 h-4 text-foreground-subtle group-hover:text-foreground-muted transition-colors" />
    </div>
  )
}

/**
 * Delta Badge
 */
function DeltaBadge({ delta }) {
  if (delta === 0 || delta === null || delta === undefined) {
    return (
      <span className="flex items-center gap-1 text-foreground-subtle text-sm">
        <Minus className="w-3 h-3" />
        <span>0</span>
      </span>
    )
  }

  const isPositive = delta > 0
  const Icon = isPositive ? TrendingUp : TrendingDown

  return (
    <span className={`flex items-center gap-1 text-sm font-medium tabular-nums ${
      isPositive ? 'text-success' : 'text-destructive'
    }`}>
      <Icon className="w-3.5 h-3.5" />
      <span>{isPositive ? '+' : ''}{delta.toFixed(0)}</span>
    </span>
  )
}

/**
 * Alerts Banner
 */
function AlertsBanner({ alerts, t }) {
  return (
    <div className="bg-warning-muted border border-warning/20 rounded-lg p-4 mb-6">
      <div className="flex items-center gap-3">
        <AlertTriangle className="w-5 h-5 text-warning" />
        <div>
          <p className="text-warning font-medium text-sm">
            {t('kpi.alerts.count', { count: alerts.length })}
          </p>
          <p className="text-warning/70 text-xs mt-0.5">
            {alerts.slice(0, 3).map(a => a.replace(/_/g, ' ')).join(', ')}
            {alerts.length > 3 && ` ${t('kpi.alerts.more', { count: alerts.length - 3 })}`}
          </p>
        </div>
      </div>
    </div>
  )
}

/**
 * Index Detail Panel
 */
function IndexDetail({ index, onClose, t }) {
  if (!index) return null

  const { id, name, description, components } = index
  const Icon = INDEX_ICONS[id] || DollarSign

  // Laske kuinka monta komponenttia on "Ei dataa" -tilassa
  const missingComponents = components
    ? Object.values(components).filter(c => c.available === false || (c.index === null && c.value === 0))
    : []
  const totalComponents = components ? Object.keys(components).length : 0
  const hasMissingData = missingComponents.length > 0

  return (
    <div className="bg-background-elevated border border-card-border rounded-lg p-6 mb-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Icon className="w-6 h-6 text-primary" />
          <div>
            <h3 className="text-lg font-semibold text-foreground">{name}</h3>
            <p className="text-foreground-subtle text-sm">{description}</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="text-foreground-subtle hover:text-foreground text-sm"
        >
          {t('kpi.detail.close')}
        </button>
      </div>

      {/* Data Quality Banner */}
      {hasMissingData && (
        <div className="bg-warning-muted border border-warning/20 rounded-lg p-3 mb-4">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-warning mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-warning text-sm font-medium">
                {t('kpi.detail.missingData.title', { missing: missingComponents.length, total: totalComponents })}
              </p>
              <p className="text-warning/70 text-xs mt-0.5">
                {t('kpi.detail.missingData.description')}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Components Breakdown */}
      {components && Object.keys(components).length > 0 && (
        <div className="space-y-3">
          <p className="text-foreground-muted text-sm font-medium mb-3">{t('kpi.detail.components')}</p>
          {Object.entries(components).map(([key, comp]) => (
            <ComponentBar key={key} name={key} component={comp} t={t} />
          ))}
        </div>
      )}

      {/* No components */}
      {(!components || Object.keys(components).length === 0) && (
        <p className="text-foreground-subtle text-sm">{t('kpi.detail.noComponents')}</p>
      )}
    </div>
  )
}

/**
 * Component metadata for tooltips and display
 */
const COMPONENT_META = {
  // Core Index components
  gross_profit: {
    label: 'Myyntikate',
    tooltip: 'Myyntikate euroissa. Korkeampi = parempi.',
    valueFormat: (v) => `€${v?.toLocaleString('fi-FI') ?? '—'}`,
    unit: '€'
  },
  aov: {
    label: 'Keskitilaus',
    tooltip: 'Keskimääräinen tilauksen arvo (AOV). Korkeampi = parempi.',
    valueFormat: (v) => `€${v?.toFixed(0) ?? '—'}`,
    unit: '€'
  },
  repeat_rate: {
    label: 'Palautuvuus',
    tooltip: 'Kuinka moni asiakas tilaa uudelleen samalla jaksolla.',
    valueFormat: (v) => `${v?.toFixed(1) ?? '—'}%`,
    unit: '%'
  },
  trend: {
    label: 'Trendi',
    tooltip: 'Myynnin kehityssuunta edelliseen jaksoon verrattuna.',
    valueFormat: (v) => v > 0 ? `+${v?.toFixed(0)}%` : `${v?.toFixed(0) ?? '—'}%`,
    unit: '%'
  },
  stock: {
    label: 'Varastotilanne',
    tooltip: 'Tuotteiden saatavuus. 100 = kaikki tuotteet varastossa, 0 = kaikki loppu.',
    valueFormat: (v) => `${v?.toFixed(0) ?? '—'}% saatavilla`,
    unit: '% saatavilla'
  },
  // SPI components
  clicks_trend: {
    label: 'Klikkauskehitys',
    tooltip: 'Google-hakutulosten klikkausten kehitys.',
    valueFormat: (v) => v > 0 ? `+${v?.toFixed(0)}%` : `${v?.toFixed(0) ?? '—'}%`,
    unit: '%'
  },
  position: {
    label: 'Hakusijoitus',
    tooltip: 'Keskimääräinen sijoitus Google-hauissa. Pienempi = parempi (1 = paras).',
    valueFormat: (v) => `#${v?.toFixed(1) ?? '—'}`,
    unit: '#'
  },
  nonbrand: {
    label: 'Non-brand',
    tooltip: 'Kuinka suuri osa hauista ei sisällä brändinimeä. Optimi 40-70%.',
    valueFormat: (v) => `${v?.toFixed(0) ?? '—'}%`,
    unit: '%'
  },
  rising: {
    label: 'Nousevat haut',
    tooltip: 'Hakutermit joiden näkyvyys on kasvussa.',
    valueFormat: (v) => `${v ?? '—'} kpl`,
    unit: 'kpl'
  },
  // OI components
  fulfillment: {
    label: 'Toimitusaika',
    tooltip: 'Keskimääräinen aika tilauksesta lähetykseen. Nopeampi = parempi. (Vaatii dispatched_on -datan ePages-kaupasta)',
    valueFormat: (v) => v === 0 ? 'Ei dataa' : `${v?.toFixed(1) ?? '—'} päivää`,
    unit: 'pv'
  },
  dispatch_rate: {
    label: 'Lähetetty',
    tooltip: 'Kuinka suuri osa tilauksista on merkitty lähetetyksi. (Vaatii status-datan ePages-kaupasta)',
    valueFormat: (v) => v === 0 ? 'Ei dataa' : `${v?.toFixed(0) ?? '—'}%`,
    unit: '%'
  },
  // PPI components
  margin: {
    label: 'Myyntikate',
    tooltip: 'Keskimääräinen myyntikate-%. Vaatii tuotteiden ostohintojen syöttämisen (cost_price).',
    valueFormat: (v) => `${v?.toFixed(1) ?? '—'}%`,
    unit: '%'
  }
}

/**
 * Component Bar with tooltip
 * Näyttää "Ei dataa" jos komponentilla ei ole saatavilla olevaa dataa
 */
function ComponentBar({ name, component, t }) {
  if (!component) return null

  const { index, value, weight, available, reason } = component

  // Get translated label and tooltip
  const translatedLabel = t(`kpi.components.${name}.label`, { defaultValue: name.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) })
  const translatedTooltip = t(`kpi.components.${name}.tooltip`, { defaultValue: '' })

  const meta = COMPONENT_META[name] || {
    label: translatedLabel,
    tooltip: translatedTooltip,
    valueFormat: (v) => v?.toFixed(1) ?? '—',
    unit: ''
  }

  // Jos data ei ole saatavilla, näytä "Ei dataa" -tila
  const isDataMissing = available === false || (index === null && value === 0)

  const displayValue = isDataMissing ? t('kpi.components.noData') : meta.valueFormat(value)

  // Status text based on index
  const getStatusText = (idx) => {
    if (idx === null || idx === undefined) return t('kpi.status.noData')
    if (idx >= 80) return t('kpi.status.excellent')
    if (idx >= 60) return t('kpi.status.good')
    if (idx >= 40) return t('kpi.status.fair')
    if (idx >= 20) return t('kpi.status.poor')
    return t('kpi.status.critical')
  }

  return (
    <div className="group relative flex items-center gap-4">
      {/* Label with tooltip trigger */}
      <div
        className={`w-32 text-sm truncate cursor-help ${isDataMissing ? 'text-foreground-subtle/50' : 'text-foreground-muted'}`}
        title={meta.tooltip}
      >
        {meta.label}
      </div>

      {/* Progress bar tai "Ei dataa" -tila */}
      {isDataMissing ? (
        <div className="flex-1 flex items-center">
          <div className="flex-1 h-2 bg-background-subtle/30 rounded-full" style={{ backgroundImage: 'repeating-linear-gradient(90deg, transparent, transparent 4px, rgba(100,116,139,0.15) 4px, rgba(100,116,139,0.15) 8px)' }} />
          <span className="ml-2 text-foreground-subtle/50 text-xs whitespace-nowrap">{t('kpi.components.noData')}</span>
        </div>
      ) : (
        <div className="flex-1 h-2 bg-background-subtle rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-300 ${
              index >= 60 ? 'bg-success' :
              index >= 40 ? 'bg-warning' : 'bg-destructive'
            }`}
            style={{ width: `${index || 0}%` }}
          />
        </div>
      )}

      {/* Index score */}
      <div className={`w-12 text-right text-sm font-medium tabular-nums ${isDataMissing ? 'text-foreground-subtle/50' : 'text-foreground'}`}>
        {isDataMissing ? '—' : (index?.toFixed(0) ?? '—')}
      </div>

      {/* Weight */}
      <div className={`w-16 text-right text-xs tabular-nums ${isDataMissing ? 'text-foreground-subtle/30' : 'text-foreground-subtle'}`}>
        ({(weight * 100).toFixed(0)}%)
      </div>

      {/* Tooltip on hover */}
      <div className="absolute left-0 bottom-full mb-2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
        <div className="bg-background-elevated border border-border rounded-lg px-3 py-2 shadow-xl min-w-[200px]">
          <p className="text-foreground text-sm font-medium mb-1">{meta.label}</p>
          <p className="text-foreground-muted text-xs mb-2">{meta.tooltip}</p>
          {isDataMissing && reason && (
            <p className="text-warning/80 text-xs mb-2 italic">{reason}</p>
          )}
          <div className="flex justify-between items-center pt-1 border-t border-border">
            <span className={`text-sm ${isDataMissing ? 'text-foreground-subtle' : 'text-primary'}`}>{displayValue}</span>
            <span className={`text-xs ${
              isDataMissing ? 'text-foreground-subtle' :
              index >= 60 ? 'text-success' :
              index >= 40 ? 'text-warning' : 'text-destructive'
            }`}>
              {getStatusText(index)}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * No Data State
 */
function NoDataState({ onCalculate, t }) {
  const [isCalculating, setIsCalculating] = useState(false)

  const handleCalculate = async () => {
    setIsCalculating(true)
    try {
      await onCalculate()
    } catch (error) {
      console.error('Calculation failed:', error)
    } finally {
      setIsCalculating(false)
    }
  }

  return (
    <div className="text-center py-20">
      <div className="w-24 h-24 rounded-full bg-background-elevated mx-auto mb-6 flex items-center justify-center">
        <span className="text-4xl">📊</span>
      </div>
      <h2 className="text-xl font-semibold text-foreground mb-2">
        {t('kpi.noData.title')}
      </h2>
      <p className="text-foreground-subtle mb-6 max-w-md mx-auto">
        {t('kpi.noData.description')}
      </p>
      <button
        onClick={handleCalculate}
        disabled={isCalculating}
        className={`px-6 py-3 rounded-lg font-medium transition-colors ${
          isCalculating
            ? 'bg-background-subtle text-foreground-subtle cursor-not-allowed'
            : 'bg-primary text-primary-foreground hover:bg-primary/90'
        }`}
      >
        {isCalculating ? (
          <span className="flex items-center gap-2">
            <RefreshCw className="w-4 h-4 animate-spin" />
            {t('kpi.noData.calculating')}
          </span>
        ) : (
          t('kpi.noData.button')
        )}
      </button>
    </div>
  )
}

/**
 * Gross Profit Card - Myyntikate-yhteenveto
 * Näyttää myyntikatteen isolla ja YoY-vertailun
 */
function GrossProfitCard({ profitSummary, t }) {
  if (!profitSummary) return null

  const { revenue, cost, grossProfit, marginPercent, currency, period = '30 pv', yoy } = profitSummary

  // Format number with space as thousand separator (Swedish style)
  const formatNumber = (num) => {
    return Math.round(num).toLocaleString('sv-SE')
  }

  // Format percentage change with + or - sign
  const formatChange = (change) => {
    if (change === null || change === undefined) return null
    const sign = change >= 0 ? '+' : ''
    return `${sign}${change.toFixed(1)}%`
  }

  return (
    <div className="mt-10 mb-6">
      <div className="bg-gradient-to-br from-success/10 to-background border border-success/20 rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-success/80 text-sm font-medium uppercase tracking-wide">
              {t('kpi.profit.title')} ({period})
            </p>
            <div className="flex items-baseline gap-3 mt-1">
              <span className="text-4xl font-bold text-foreground tabular-nums">
                {formatNumber(grossProfit)}
              </span>
              <span className="text-2xl text-success font-medium">
                {currency}
              </span>
              {/* YoY change badge */}
              {yoy && yoy.grossProfitChange !== null && (
                <span className={`text-sm font-medium px-2 py-0.5 rounded-full tabular-nums ${
                  yoy.grossProfitChange >= 0
                    ? 'bg-success-muted text-success'
                    : 'bg-destructive-muted text-destructive'
                }`}>
                  {formatChange(yoy.grossProfitChange)} {t('kpi.profit.vsLastYear')}
                </span>
              )}
            </div>
          </div>
          <div className="text-right">
            <div className="bg-success-muted px-4 py-2 rounded-lg">
              <p className="text-success text-2xl font-bold tabular-nums">
                {marginPercent.toFixed(1)}%
              </p>
              <p className="text-success/60 text-xs">{t('kpi.profit.marginPercent')}</p>
            </div>
          </div>
        </div>

        {/* Revenue breakdown bar */}
        <div className="mt-6">
          <div className="flex justify-between text-sm mb-2">
            <span className="text-foreground-muted">{t('kpi.profit.salesNet')}</span>
            <div className="flex items-center gap-2">
              <span className="text-foreground font-medium tabular-nums">{formatNumber(revenue)} {currency}</span>
              {yoy && yoy.revenueChange !== null && (
                <span className={`text-xs tabular-nums ${yoy.revenueChange >= 0 ? 'text-success' : 'text-destructive'}`}>
                  ({formatChange(yoy.revenueChange)})
                </span>
              )}
            </div>
          </div>
          <div className="h-3 bg-background-subtle rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-success to-success/80 rounded-full"
              style={{ width: '100%' }}
            />
          </div>
        </div>

        <div className="mt-3">
          <div className="flex justify-between text-sm mb-2">
            <span className="text-foreground-muted">{t('kpi.profit.purchasesNet')}</span>
            <span className="text-foreground font-medium tabular-nums">{formatNumber(cost)} {currency}</span>
          </div>
          <div className="h-3 bg-background-subtle rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-destructive/60 to-destructive/40 rounded-full"
              style={{ width: `${(cost / revenue) * 100}%` }}
            />
          </div>
        </div>

        <div className="mt-4 pt-4 border-t border-border">
          <div className="flex justify-between items-center">
            <span className="text-foreground-muted text-sm">= {t('kpi.profit.grossMargin')}</span>
            <span className="text-success font-bold text-lg tabular-nums">
              {formatNumber(grossProfit)} {currency}
            </span>
          </div>
          {/* YoY comparison detail */}
          {yoy && yoy.grossProfit > 0 && (
            <div className="flex justify-between items-center mt-2 text-xs text-foreground-subtle tabular-nums">
              <span>{t('kpi.profit.lastYearSamePeriod')}</span>
              <span>{formatNumber(yoy.grossProfit)} {currency}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default IndicatorsPage

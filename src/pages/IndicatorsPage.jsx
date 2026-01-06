/**
 * IndicatorsPage
 *
 * Clean, minimal dashboard for 7 MVP indicators.
 * Inspired by modern dark analytics dashboards.
 */

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { RefreshCw } from 'lucide-react'
import { useIndicators, useIndicatorsSummary } from '@/hooks/useIndicators'
import { AlertsPanel } from '@/components/AlertsPanel'
import { HealthScoreModal } from '@/components/HealthScoreModal'
import { useTranslation } from '@/lib/i18n'
import { MiniSparkline } from '@/components/IndicatorTrendChart'

export function IndicatorsPage() {
  const [period, setPeriod] = useState('30d')
  const [comparisonMode, setComparisonMode] = useState('mom') // 'mom' or 'yoy'
  const [alertsPanelOpen, setAlertsPanelOpen] = useState(false)
  const [healthScoreModalOpen, setHealthScoreModalOpen] = useState(false)
  const { t } = useTranslation()
  const navigate = useNavigate()

  const {
    indicators,
    alerts,
    isLoading,
    error,
    refresh
  } = useIndicators({ period, comparisonMode })

  const { summary } = useIndicatorsSummary({ period })

  // Fixed order for each category (prevents jumping between periods)
  const SALES_ORDER = ['sales_trend', 'aov', 'gross_margin']
  const SEO_ORDER = ['position_change', 'brand_vs_nonbrand']
  const COMBINED_ORDER = ['organic_conversion_rate', 'stock_availability_risk']

  // Group by category with fixed order
  const salesIndicators = SALES_ORDER
    .map(id => indicators.find(i => i.indicator_id === id))
    .filter(Boolean)
  const seoIndicators = SEO_ORDER
    .map(id => indicators.find(i => i.indicator_id === id))
    .filter(Boolean)
  const combinedIndicators = COMBINED_ORDER
    .map(id => indicators.find(i => i.indicator_id === id))
    .filter(Boolean)

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="animate-pulse flex flex-col items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-slate-800" />
          <div className="w-32 h-4 rounded bg-slate-800" />
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-950">
      <div className="max-w-7xl mx-auto px-6 py-8">

        {/* Header - Minimal */}
        <div className="flex items-center justify-between mb-10">
          <div>
            <h1 className="text-2xl font-semibold text-white">
              {t('indicators.title')}
            </h1>
            <p className="text-slate-500 text-sm mt-1">
              {t('indicators.subtitle')}
            </p>
          </div>

          <div className="flex items-center gap-4">
            {/* Period Pills */}
            <div className="flex bg-slate-900 rounded-xl p-1">
              {['7d', '30d', '90d'].map(p => (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${
                    period === p
                      ? 'bg-slate-800 text-white shadow-sm'
                      : 'text-slate-500 hover:text-slate-300'
                  }`}
                >
                  {t(`periods.${p}`)}
                </button>
              ))}
            </div>

            {/* MoM/YoY Toggle */}
            <div className="flex bg-slate-900 rounded-xl p-1">
              <button
                onClick={() => setComparisonMode('mom')}
                className={`px-3 py-2 text-sm font-medium rounded-lg transition-all ${
                  comparisonMode === 'mom'
                    ? 'bg-cyan-600 text-white shadow-sm'
                    : 'text-slate-500 hover:text-slate-300'
                }`}
                title={t('comparison.momFull')}
              >
                MoM
              </button>
              <button
                onClick={() => setComparisonMode('yoy')}
                className={`px-3 py-2 text-sm font-medium rounded-lg transition-all ${
                  comparisonMode === 'yoy'
                    ? 'bg-cyan-600 text-white shadow-sm'
                    : 'text-slate-500 hover:text-slate-300'
                }`}
                title={t('comparison.yoyFull')}
              >
                YoY
              </button>
            </div>

            {/* Refresh */}
            <button
              onClick={refresh}
              className="p-2.5 rounded-xl bg-slate-900 text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              <RefreshCw className="w-5 h-5" />
            </button>
          </div>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-4 mb-8">
            <p className="text-red-400 text-sm">{error.message}</p>
          </div>
        )}

        {/* Hero Section - Health Score + Key Stats */}
        <div className="grid grid-cols-12 gap-6 mb-10">

          {/* Health Score - Large */}
          <div
            className="col-span-12 lg:col-span-4 bg-gradient-to-br from-slate-900 to-slate-900/50 rounded-3xl p-8 cursor-pointer hover:from-slate-800/80 transition-all"
            onClick={() => setHealthScoreModalOpen(true)}
          >
            <p className="text-slate-500 text-sm font-medium mb-4">{t('summary.healthScore')}</p>
            <div className="flex items-end gap-4">
              <span className={`text-7xl font-bold ${
                (summary?.healthScore || 0) >= 60 ? 'text-emerald-400' :
                (summary?.healthScore || 0) >= 40 ? 'text-amber-400' : 'text-red-400'
              }`}>
                {summary?.healthScore || 0}
              </span>
              <span className="text-3xl text-slate-600 mb-2">%</span>
            </div>
            <div className="mt-6 flex gap-8">
              <div>
                <span className="text-2xl font-semibold text-emerald-400">{summary?.up || 0}</span>
                <p className="text-slate-600 text-xs mt-1">{t('summary.up')}</p>
              </div>
              <div>
                <span className="text-2xl font-semibold text-red-400">{summary?.down || 0}</span>
                <p className="text-slate-600 text-xs mt-1">{t('summary.down')}</p>
              </div>
              <div>
                <span className="text-2xl font-semibold text-slate-400">{alerts.length}</span>
                <p className="text-slate-600 text-xs mt-1">{t('summary.alerts')}</p>
              </div>
            </div>
          </div>

          {/* Top 3 Key Metrics */}
          <div className="col-span-12 lg:col-span-8 grid grid-cols-3 gap-4">
            {salesIndicators.slice(0, 3).map(ind => (
              <MetricCard
                key={ind.indicator_id}
                indicator={ind}
                onClick={() => navigate(`/indicators/${ind.indicator_id}`)}
                t={t}
                period={period}
              />
            ))}
          </div>
        </div>

        {/* Indicator Sections */}
        <div className="space-y-10">

          {/* SEO Section */}
          <Section title="SEO" subtitle="Google Search Console">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {seoIndicators.map(ind => (
                <MetricCard
                  key={ind.indicator_id}
                  indicator={ind}
                  onClick={() => navigate(`/indicators/${ind.indicator_id}`)}
                  t={t}
                  period={period}
                  size="large"
                />
              ))}
            </div>
          </Section>

          {/* Combined Section */}
          <Section title={t('indicators.combined.title')} subtitle="ePages + GSC">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {combinedIndicators.map(ind => (
                <MetricCard
                  key={ind.indicator_id}
                  indicator={ind}
                  onClick={() => navigate(`/indicators/${ind.indicator_id}`)}
                  t={t}
                  period={period}
                  size="large"
                />
              ))}
            </div>
          </Section>
        </div>

        {/* No data state */}
        {indicators.length === 0 && !isLoading && (
          <div className="text-center py-20">
            <div className="w-20 h-20 rounded-full bg-slate-900 mx-auto mb-6 flex items-center justify-center">
              <span className="text-3xl">📊</span>
            </div>
            <p className="text-slate-400 mb-2">{t('indicators.noData')}</p>
            <p className="text-slate-600 text-sm">
              {t('indicators.runCommand')}
            </p>
          </div>
        )}

        {/* Modals */}
        <AlertsPanel
          isOpen={alertsPanelOpen}
          onClose={() => setAlertsPanelOpen(false)}
          alerts={alerts}
          onViewIndicator={(indicatorId) => {
            setAlertsPanelOpen(false)
            navigate(`/indicators/${indicatorId}`)
          }}
        />

        <HealthScoreModal
          isOpen={healthScoreModalOpen}
          onClose={() => setHealthScoreModalOpen(false)}
          score={summary?.healthScore || 0}
          indicators={indicators}
        />
      </div>
    </div>
  )
}

/**
 * Section wrapper with title
 */
function Section({ title, subtitle, children }) {
  return (
    <div>
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-white">{title}</h2>
        {subtitle && <p className="text-slate-600 text-sm">{subtitle}</p>}
      </div>
      {children}
    </div>
  )
}

/**
 * MetricCard - Clean, large metric display with mini sparkline
 */
function MetricCard({ indicator, onClick, t, period, size = 'default' }) {
  if (!indicator) return null

  const {
    indicator_id,
    numeric_value,
    display_direction,
    display_change_percent,
    comparison_mode,
    yoy_loading,
    alert_triggered
  } = indicator

  // Format value
  const formatValue = (id, val) => {
    if (val === null || val === undefined) return '—'

    switch (id) {
      case 'aov':
      case 'stock_availability_risk':
        return `${Math.round(val).toLocaleString('fi-FI')}`
      case 'gross_margin':
      case 'brand_vs_nonbrand':
      case 'organic_conversion_rate':
        return `${val.toFixed(1)}`
      case 'position_change':
        return val > 0 ? `+${val.toFixed(1)}` : val.toFixed(1)
      case 'sales_trend':
        return val > 0 ? `+${val.toFixed(1)}` : val.toFixed(1)
      default:
        return String(val)
    }
  }

  // Get unit
  const getUnit = (id) => {
    switch (id) {
      case 'aov':
      case 'stock_availability_risk':
        return 'SEK'
      case 'gross_margin':
      case 'brand_vs_nonbrand':
      case 'organic_conversion_rate':
        return '%'
      case 'sales_trend':
        return '%'
      default:
        return ''
    }
  }

  const title = t(`indicators.types.${indicator_id}.title`) || indicator_id
  const description = t(`indicators.types.${indicator_id}.shortDesc`) ||
                     t(`indicators.types.${indicator_id}.description`) || ''

  const isLarge = size === 'large'

  return (
    <div
      onClick={onClick}
      className={`
        group relative overflow-hidden
        bg-slate-900/50 hover:bg-slate-900
        border border-slate-800/50 hover:border-slate-700
        rounded-2xl cursor-pointer transition-all duration-200
        ${isLarge ? 'p-6' : 'p-5'}
      `}
    >
      {/* Alert indicator */}
      {alert_triggered && (
        <div className="absolute top-4 right-4 w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
      )}

      {/* Title */}
      <p className="text-slate-500 text-sm font-medium mb-3">{title}</p>

      {/* Value + Unit */}
      <div className="flex items-baseline gap-2 mb-2">
        <span className={`font-bold text-white ${isLarge ? 'text-4xl' : 'text-3xl'}`}>
          {formatValue(indicator_id, numeric_value)}
        </span>
        <span className="text-slate-600 text-lg">{getUnit(indicator_id)}</span>
      </div>

      {/* Change indicator with comparison mode badge */}
      {display_change_percent !== null && display_change_percent !== undefined && (
        <div className="flex items-center gap-2 mb-4">
          <span className="text-cyan-400 text-xs font-semibold bg-cyan-500/10 px-1.5 py-0.5 rounded">
            {comparison_mode === 'yoy' ? 'YoY' : 'MoM'}
          </span>
          <span className={`text-sm font-medium ${
            display_direction === 'up' ? 'text-emerald-400' :
            display_direction === 'down' ? 'text-red-400' : 'text-slate-500'
          }`}>
            {display_direction === 'up' ? '↗' : display_direction === 'down' ? '↘' : '→'}
            {' '}
            {display_change_percent > 0 && '+'}{display_change_percent.toFixed(1)}%
          </span>
        </div>
      )}
      {/* Loading state for YoY */}
      {yoy_loading && (
        <div className="flex items-center gap-2 mb-4">
          <span className="text-cyan-400 text-xs font-semibold bg-cyan-500/10 px-1.5 py-0.5 rounded">
            YoY
          </span>
          <div className="w-4 h-4 animate-spin rounded-full border-2 border-slate-600 border-t-cyan-400" />
        </div>
      )}
      {/* No YoY data available */}
      {!yoy_loading && comparison_mode === 'yoy' && display_change_percent === null && (
        <div className="flex items-center gap-2 mb-4">
          <span className="text-cyan-400 text-xs font-semibold bg-cyan-500/10 px-1.5 py-0.5 rounded">
            YoY
          </span>
          <span className="text-slate-500 text-xs">—</span>
        </div>
      )}

      {/* Mini sparkline */}
      <div className="mt-auto pt-2">
        <MiniSparkline
          indicatorId={indicator_id}
          days={period === '7d' ? 7 : period === '90d' ? 90 : 30}
          width={isLarge ? 140 : 100}
          height={32}
        />
      </div>

      {/* Description on hover */}
      {description && (
        <p className="text-slate-600 text-xs mt-3 line-clamp-2 group-hover:text-slate-500 transition-colors">
          {description}
        </p>
      )}
    </div>
  )
}

export default IndicatorsPage

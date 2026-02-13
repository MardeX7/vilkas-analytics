/**
 * GrowthEngineCard - Growth Engine Index Component
 *
 * Näyttää Growth Engine -indeksin ja sen 4 KPI-aluetta:
 * 1. Kysynnän kasvu (25%)
 * 2. Liikenteen laatu (15%)
 * 3. Myynnin tehokkuus (40%)
 * 4. Tuotevalikoiman teho (20%)
 */

import { useState } from 'react'
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Search,
  Users,
  ShoppingCart,
  Package,
  ChevronDown,
  ChevronUp,
  Info
} from 'lucide-react'
import { useGrowthEngine } from '@/hooks/useGrowthEngine'
import { useTranslation } from '@/lib/i18n'

// KPI area icons
const KPI_ICONS = {
  demandGrowth: Search,
  trafficQuality: Users,
  salesEfficiency: ShoppingCart,
  productLeverage: Package
}

// KPI area colors
const KPI_COLORS = {
  demandGrowth: 'emerald',
  trafficQuality: 'blue',
  salesEfficiency: 'violet',
  productLeverage: 'amber'
}

/**
 * Main Growth Engine Card
 */
export function GrowthEngineCard({ dateRange }) {
  const { t, formatNumber, formatCurrency } = useTranslation()
  const [expandedKpi, setExpandedKpi] = useState(null)

  const {
    overallIndex,
    indexLevel,
    demandGrowth,
    trafficQuality,
    salesEfficiency,
    productLeverage,
    loading,
    error
  } = useGrowthEngine(dateRange)

  if (loading) {
    return (
      <div className="bg-background-elevated border border-card-border rounded-lg p-6">
        <div className="animate-pulse">
          <div className="h-6 w-48 bg-background-subtle rounded mb-4" />
          <div className="h-24 bg-background-subtle rounded mb-4" />
          <div className="grid grid-cols-2 gap-4">
            <div className="h-20 bg-background-subtle rounded" />
            <div className="h-20 bg-background-subtle rounded" />
            <div className="h-20 bg-background-subtle rounded" />
            <div className="h-20 bg-background-subtle rounded" />
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-background-elevated border border-card-border rounded-lg p-6">
        <p className="text-destructive text-sm">{error}</p>
      </div>
    )
  }

  const kpiAreas = [
    { key: 'demandGrowth', data: demandGrowth },
    { key: 'trafficQuality', data: trafficQuality },
    { key: 'salesEfficiency', data: salesEfficiency },
    { key: 'productLeverage', data: productLeverage }
  ]

  return (
    <div className="bg-background-elevated border border-card-border rounded-lg overflow-hidden">
      {/* Header with Overall Index */}
      <div className={`p-6 ${getGradientBg(indexLevel)}`}>
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold text-foreground">
              {t('growthEngine.title')}
            </h2>
            <p className="text-foreground-subtle text-sm mt-0.5">
              {t('growthEngine.subtitle')}
            </p>
          </div>
          <div className="text-right">
            <p className="text-foreground-muted text-xs uppercase tracking-wide mb-1">
              {t('growthEngine.overallIndex')}
            </p>
            <div className="flex items-baseline gap-2">
              <span className={`text-5xl font-bold tabular-nums ${getColorClass(indexLevel)}`}>
                {overallIndex}
              </span>
              <span className="text-foreground-subtle text-lg">/100</span>
            </div>
            <p className={`text-sm font-medium mt-1 ${getColorClass(indexLevel)}`}>
              {t(`growthEngine.indexLevels.${indexLevel}`)}
            </p>
          </div>
        </div>

        {/* Index Gauge */}
        <div className="mt-6">
          <div className="h-3 bg-background/50 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${getBarColor(indexLevel)}`}
              style={{ width: `${overallIndex}%` }}
            />
          </div>
          <div className="flex justify-between mt-2 text-xs text-foreground-subtle">
            <span>0</span>
            <span className="text-foreground-muted">60 = {t('growthEngine.target.description')}</span>
            <span>100</span>
          </div>
        </div>
      </div>

      {/* KPI Areas Grid */}
      <div className="p-6 pt-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {kpiAreas.map(({ key, data }) => (
            <KPIAreaCard
              key={key}
              areaKey={key}
              data={data}
              isExpanded={expandedKpi === key}
              onToggle={() => setExpandedKpi(expandedKpi === key ? null : key)}
              t={t}
              formatNumber={formatNumber}
            />
          ))}
        </div>

        {/* Scoring Info */}
        <div className="mt-6 pt-4 border-t border-border">
          <div className="flex items-start gap-2 text-foreground-subtle text-xs">
            <Info className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-medium text-foreground-muted mb-1">
                {t('growthEngine.scoring.title')}
              </p>
              <p>{t('growthEngine.scoring.description')}</p>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                <span className="text-success">{t('growthEngine.scoring.levels.100')}</span>
                <span className="text-success/80">{t('growthEngine.scoring.levels.80')}</span>
                <span className="text-warning">{t('growthEngine.scoring.levels.60')}</span>
                <span className="text-foreground-subtle">{t('growthEngine.scoring.levels.50')}</span>
                <span className="text-orange-400">{t('growthEngine.scoring.levels.30')}</span>
                <span className="text-destructive">{t('growthEngine.scoring.levels.10')}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * KPI Area Card (collapsible)
 */
function KPIAreaCard({ areaKey, data, isExpanded, onToggle, t, formatNumber }) {
  const Icon = KPI_ICONS[areaKey] || Package
  const color = KPI_COLORS[areaKey] || 'slate'

  const colorClasses = getKpiColorClasses(color, data.score)

  return (
    <div className={`border rounded-lg overflow-hidden ${colorClasses.border}`}>
      {/* Header - always visible */}
      <button
        onClick={onToggle}
        className={`w-full p-4 flex items-center justify-between ${colorClasses.bg} hover:brightness-95 transition-all`}
      >
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-lg ${colorClasses.iconBg} flex items-center justify-center`}>
            <Icon className={`w-5 h-5 ${colorClasses.text}`} />
          </div>
          <div className="text-left">
            <p className="text-foreground font-medium text-sm">
              {t(`growthEngine.${areaKey}.title`)}
            </p>
            <p className="text-foreground-subtle text-xs">
              {t(`growthEngine.${areaKey}.subtitle`)}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Score */}
          <div className="text-right">
            <p className={`text-2xl font-bold tabular-nums ${colorClasses.text}`}>
              {data.score}
            </p>
            <p className="text-foreground-subtle text-xs">
              {t('growthEngine.weight')}: {data.weight}%
            </p>
          </div>

          {/* Expand icon */}
          {isExpanded ? (
            <ChevronUp className="w-5 h-5 text-foreground-muted" />
          ) : (
            <ChevronDown className="w-5 h-5 text-foreground-muted" />
          )}
        </div>
      </button>

      {/* Expanded metrics */}
      {isExpanded && (
        <div className="p-4 bg-background-subtle/50 border-t border-border">
          <div className="space-y-3">
            {Object.entries(data.metrics).map(([metricKey, metric]) => (
              <MetricRow
                key={metricKey}
                metricKey={metricKey}
                areaKey={areaKey}
                metric={metric}
                t={t}
                formatNumber={formatNumber}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * Metric Row (inside expanded KPI area)
 */
function MetricRow({ metricKey, areaKey, metric, t, formatNumber }) {
  const { current, previous, yoyChange, score } = metric

  // Format value based on metric type
  const formatValue = (value, key) => {
    if (value === null || value === undefined) return '—'

    // Percentage metrics
    if (['engagementRate', 'organicShare', 'bounceRate', 'conversionRate', 'seoStockHealth'].includes(key)) {
      return `${Number(value).toFixed(1)}%`
    }

    // CTR metrics (2 decimals)
    if (['productPageCTR'].includes(key)) {
      return `${Number(value).toFixed(2)}%`
    }

    // Currency metrics
    if (['aov', 'marginPerOrder'].includes(key)) {
      return `${formatNumber(value)} kr`
    }

    // Multiplier
    if (key === 'ltvMultiplier') {
      return `${Number(value).toFixed(1)}x`
    }

    // Large numbers
    if (value >= 1000) {
      return formatNumber(value)
    }

    return value.toString()
  }

  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex-1 min-w-0">
        <p className="text-foreground-muted text-sm truncate">
          {t(`growthEngine.${areaKey}.metrics.${metricKey}`)}
        </p>
      </div>

      <div className="flex items-center gap-4">
        {/* Current value */}
        <div className="text-right min-w-[60px]">
          <p className="text-foreground text-sm font-medium tabular-nums">
            {formatValue(current, metricKey)}
          </p>
          <p className="text-foreground-subtle text-xs">
            {t('growthEngine.current')}
          </p>
        </div>

        {/* YoY change */}
        <div className="min-w-[70px] text-right">
          <YoYBadge change={yoyChange} />
        </div>

        {/* Score */}
        <div className={`min-w-[40px] text-right font-bold tabular-nums ${getScoreColor(score)}`}>
          {score}
        </div>
      </div>
    </div>
  )
}

/**
 * YoY Change Badge
 */
function YoYBadge({ change }) {
  // No data available - show dash
  if (change === null || change === undefined) {
    return (
      <span className="flex items-center justify-end gap-1 text-foreground-subtle text-sm">
        <span>—</span>
      </span>
    )
  }

  // Exactly zero
  if (change === 0) {
    return (
      <span className="flex items-center justify-end gap-1 text-foreground-subtle text-sm">
        <Minus className="w-3 h-3" />
        <span>0%</span>
      </span>
    )
  }

  const isPositive = change > 0
  const Icon = isPositive ? TrendingUp : TrendingDown

  return (
    <span className={`flex items-center justify-end gap-1 text-sm font-medium tabular-nums ${
      isPositive ? 'text-success' : 'text-destructive'
    }`}>
      <Icon className="w-3.5 h-3.5" />
      <span>{isPositive ? '+' : ''}{change.toFixed(1)}%</span>
    </span>
  )
}

// Helper functions for colors
function getColorClass(level) {
  switch (level) {
    case 'excellent': return 'text-success'
    case 'good': return 'text-success'
    case 'needs_work': return 'text-warning'
    case 'poor': return 'text-destructive'
    default: return 'text-foreground-subtle'
  }
}

function getBarColor(level) {
  switch (level) {
    case 'excellent': return 'bg-success'
    case 'good': return 'bg-success'
    case 'needs_work': return 'bg-warning'
    case 'poor': return 'bg-destructive'
    default: return 'bg-foreground-subtle'
  }
}

function getGradientBg(level) {
  switch (level) {
    case 'excellent': return 'bg-gradient-to-br from-success/10 to-success/5'
    case 'good': return 'bg-gradient-to-br from-success/10 to-success/5'
    case 'needs_work': return 'bg-gradient-to-br from-warning/10 to-warning/5'
    case 'poor': return 'bg-gradient-to-br from-destructive/10 to-destructive/5'
    default: return 'bg-background-elevated'
  }
}

function getKpiColorClasses(color, score) {
  // If score is low, use warning/destructive colors
  if (score < 40) {
    return {
      bg: 'bg-destructive/5',
      border: 'border-destructive/20',
      text: 'text-destructive',
      iconBg: 'bg-destructive-muted'
    }
  }
  if (score < 60) {
    return {
      bg: 'bg-warning/5',
      border: 'border-warning/20',
      text: 'text-warning',
      iconBg: 'bg-warning-muted'
    }
  }

  // Otherwise use the KPI's own color
  const colors = {
    emerald: {
      bg: 'bg-success/5',
      border: 'border-success/20',
      text: 'text-success',
      iconBg: 'bg-success-muted'
    },
    blue: {
      bg: 'bg-info/5',
      border: 'border-info/20',
      text: 'text-info',
      iconBg: 'bg-info-muted'
    },
    violet: {
      bg: 'bg-purple-500/5',
      border: 'border-purple-500/20',
      text: 'text-purple-400',
      iconBg: 'bg-purple-500/10'
    },
    amber: {
      bg: 'bg-amber-500/5',
      border: 'border-amber-500/20',
      text: 'text-amber-400',
      iconBg: 'bg-amber-500/10'
    }
  }
  return colors[color] || colors.emerald
}

function getScoreColor(score) {
  if (score >= 80) return 'text-success'
  if (score >= 60) return 'text-success/80'
  if (score >= 40) return 'text-warning'
  if (score >= 20) return 'text-orange-400'
  return 'text-destructive'
}

export default GrowthEngineCard

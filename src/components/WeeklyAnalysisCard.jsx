/**
 * WeeklyAnalysisCard - Viikon AI-analyysi
 *
 * Näyttää AI:n generoimasta viikkoanalyysistä:
 * - Tiivistelmä (5-10 bulletia)
 * - Vastaa 3 avainkysymykseen:
 *   1. Mikä muuttui olennaisesti?
 *   2. Mikä vaikutti eniten?
 *   3. Kausiluonteinen vai poikkeama?
 */

import { useState } from 'react'
import {
  Brain,
  ChevronDown,
  ChevronUp,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Calendar,
  RefreshCw,
  Sparkles
} from 'lucide-react'
import { useTranslation } from '@/lib/i18n'
import { useWeeklyAnalysis } from '@/hooks/useWeeklyAnalysis'

/**
 * Placeholder data kun analyysiä ei ole vielä generoitu
 */
const PLACEHOLDER_ANALYSIS = {
  summary: null,
  bullets: [],
  isPlaceholder: true
}

/**
 * Map KPI area keys to translation keys (supports both snake_case and camelCase)
 */
const KPI_AREA_TRANSLATIONS = {
  // camelCase
  demandGrowth: 'growthEngine.demandGrowth.title',
  trafficQuality: 'growthEngine.trafficQuality.title',
  salesEfficiency: 'growthEngine.salesEfficiency.title',
  productLeverage: 'growthEngine.productLeverage.title',
  // snake_case (from API)
  demand_growth: 'growthEngine.demandGrowth.title',
  traffic_quality: 'growthEngine.trafficQuality.title',
  sales_efficiency: 'growthEngine.salesEfficiency.title',
  product_leverage: 'growthEngine.productLeverage.title'
}

/**
 * Main WeeklyAnalysisCard Component
 * Supports both weekly and monthly analyses based on granularity prop
 */
export function WeeklyAnalysisCard({ dateRange, granularity = 'week' }) {
  const { t, language } = useTranslation()
  const [isExpanded, setIsExpanded] = useState(false)

  const {
    analysis,
    loading,
    error,
    isGenerating,
    generateAnalysis,
    currentWeek,
    currentYear,
    currentMonth
  } = useWeeklyAnalysis(dateRange, language, granularity)

  // Determine title and period label based on granularity
  const isMonthly = granularity === 'month'
  const titleKey = isMonthly ? 'monthlyAnalysis.title' : 'weeklyAnalysis.title'
  const periodLabelKey = isMonthly ? 'monthlyAnalysis.monthLabel' : 'weeklyAnalysis.weekLabel'
  const periodValue = isMonthly ? { month: currentMonth, year: currentYear } : { week: currentWeek, year: currentYear }

  // Placeholder kun ei ole dataa
  const displayAnalysis = analysis || PLACEHOLDER_ANALYSIS
  const hasAnalysis = !displayAnalysis.isPlaceholder && displayAnalysis.bullets?.length > 0

  if (loading) {
    return (
      <div className="bg-background-elevated border border-card-border rounded-lg p-6">
        <div className="animate-pulse">
          <div className="flex items-center gap-3 mb-4">
            <div className="h-10 w-10 bg-background-subtle rounded-lg" />
            <div className="h-6 w-48 bg-background-subtle rounded" />
          </div>
          <div className="space-y-3">
            <div className="h-4 w-full bg-background-subtle rounded" />
            <div className="h-4 w-5/6 bg-background-subtle rounded" />
            <div className="h-4 w-4/6 bg-background-subtle rounded" />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-gradient-to-br from-background-elevated to-background-subtle border border-card-border rounded-lg overflow-hidden">
      {/* Header */}
      <div className="p-6 border-b border-card-border/50">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-lg">
              <Brain className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
                {t(titleKey)}
                <span className="text-sm font-normal text-muted-foreground">
                  {t(periodLabelKey, periodValue)}
                </span>
              </h2>
              {analysis?.generated_at && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  {t('weeklyAnalysis.generatedAt')} {new Date(analysis.generated_at).toLocaleDateString(language === 'sv' ? 'sv-SE' : 'fi-FI')}
                </p>
              )}
            </div>
          </div>

          {/* Generate / Refresh button */}
          <button
            onClick={generateAnalysis}
            disabled={isGenerating}
            className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium
                       bg-primary/10 hover:bg-primary/20 text-primary
                       rounded-lg transition-colors disabled:opacity-50"
          >
            {isGenerating ? (
              <>
                <RefreshCw className="h-4 w-4 animate-spin" />
                {t('weeklyAnalysis.generating')}
              </>
            ) : hasAnalysis ? (
              <>
                <RefreshCw className="h-4 w-4" />
                {t('weeklyAnalysis.refresh')}
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                {t('weeklyAnalysis.generate')}
              </>
            )}
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="p-6">
        {error && (
          <div className="flex items-center gap-2 text-destructive text-sm mb-4">
            <AlertTriangle className="h-4 w-4" />
            {error}
          </div>
        )}

        {!hasAnalysis && !isGenerating ? (
          // Empty state
          <div className="text-center py-8">
            <Brain className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-muted-foreground">
              {t('weeklyAnalysis.noAnalysis')}
            </p>
            <p className="text-sm text-muted-foreground/70 mt-1">
              {t('weeklyAnalysis.noAnalysisDesc')}
            </p>
          </div>
        ) : (
          // Analysis content
          <div className="space-y-4">
            {/* Summary */}
            {displayAnalysis.summary && (
              <p className="text-foreground font-medium">
                {displayAnalysis.summary}
              </p>
            )}

            {/* Bullet points */}
            <ul className="space-y-3">
              {(isExpanded ? displayAnalysis.bullets : displayAnalysis.bullets?.slice(0, 4))?.map((bullet, index) => (
                <li
                  key={index}
                  className="flex items-start gap-3 text-sm text-muted-foreground"
                >
                  <BulletIcon type={bullet.type} />
                  <span>{bullet.text}</span>
                </li>
              ))}
            </ul>

            {/* Expand/collapse button */}
            {displayAnalysis.bullets?.length > 4 && (
              <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="flex items-center gap-1 text-sm text-primary hover:text-primary/80 transition-colors"
              >
                {isExpanded ? (
                  <>
                    <ChevronUp className="h-4 w-4" />
                    {t('weeklyAnalysis.hideFull')}
                  </>
                ) : (
                  <>
                    <ChevronDown className="h-4 w-4" />
                    {t('weeklyAnalysis.showFull')}
                  </>
                )}
              </button>
            )}

            {/* Key insights grid */}
            {displayAnalysis.key_metrics && (
              <div className="grid grid-cols-3 gap-4 pt-4 border-t border-card-border/50 mt-4">
                <KeyInsight
                  label={t('weeklyAnalysis.keyMetrics.overallIndex')}
                  value={displayAnalysis.key_metrics.overall_index?.change}
                  suffix="%"
                  type="change"
                />
                <KeyInsight
                  label={t('weeklyAnalysis.keyMetrics.biggestImpact')}
                  value={
                    displayAnalysis.key_metrics.biggest_impact
                      ? t(KPI_AREA_TRANSLATIONS[displayAnalysis.key_metrics.biggest_impact] || displayAnalysis.key_metrics.biggest_impact)
                      : '—'
                  }
                  type="text"
                />
                <KeyInsight
                  label={t('weeklyAnalysis.keyMetrics.isSeasonal')}
                  value={
                    displayAnalysis.key_metrics.is_seasonal === true
                      ? t('common.yes')
                      : displayAnalysis.key_metrics.is_seasonal === false
                        ? t('common.no')
                        : '—'
                  }
                  type={displayAnalysis.key_metrics.is_seasonal ? 'neutral' : 'warning'}
                />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * Bullet icon based on type
 */
function BulletIcon({ type }) {
  switch (type) {
    case 'positive':
      return <TrendingUp className="h-4 w-4 text-emerald-500 mt-0.5 flex-shrink-0" />
    case 'negative':
      return <TrendingDown className="h-4 w-4 text-rose-500 mt-0.5 flex-shrink-0" />
    case 'warning':
      return <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 flex-shrink-0" />
    case 'info':
    default:
      return <div className="h-1.5 w-1.5 rounded-full bg-primary mt-2 flex-shrink-0" />
  }
}

/**
 * Key insight display
 */
function KeyInsight({ label, value, suffix = '', type = 'text' }) {
  const getValueColor = () => {
    switch (type) {
      case 'change':
        if (typeof value === 'number') {
          return value > 0 ? 'text-emerald-500' : value < 0 ? 'text-rose-500' : 'text-muted-foreground'
        }
        return 'text-foreground'
      case 'warning':
        return 'text-amber-500'
      case 'neutral':
        return 'text-muted-foreground'
      default:
        return 'text-foreground'
    }
  }

  const formatValue = () => {
    if (value === null || value === undefined) {
      return '—'
    }
    if (type === 'change' && typeof value === 'number') {
      const prefix = value > 0 ? '+' : ''
      return `${prefix}${value}${suffix}`
    }
    return suffix ? `${value}${suffix}` : value
  }

  return (
    <div className="text-center">
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      <p className={`text-sm font-semibold ${getValueColor()}`}>
        {formatValue()}
      </p>
    </div>
  )
}

export default WeeklyAnalysisCard

/**
 * IndicatorDetailPage
 *
 * Full detail view for a single indicator with large trend chart,
 * period comparison, and related alerts.
 */

import { useState } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  ArrowLeft,
  TrendingUp,
  TrendingDown,
  Minus,
  AlertTriangle,
  Calendar,
  Database,
  Clock,
  ShoppingCart,
  DollarSign,
  Percent,
  Search,
  Tag,
  Package,
  BarChart3,
  HelpCircle,
  Info,
  ThumbsUp,
  ThumbsDown,
  Lightbulb
} from 'lucide-react'
import { useIndicators } from '@/hooks/useIndicators'
import { IndicatorTrendChart } from '@/components/IndicatorTrendChart'
import { AlertItem } from '@/components/AlertItem'
import { useTranslation } from '@/lib/i18n'

// Indicator icons
const INDICATOR_ICONS = {
  sales_trend: ShoppingCart,
  aov: DollarSign,
  gross_margin: Percent,
  position_change: Search,
  brand_vs_nonbrand: Tag,
  organic_conversion_rate: BarChart3,
  stock_availability_risk: Package
}

// Data source info
const DATA_SOURCES = {
  sales_trend: 'ePages',
  aov: 'ePages',
  gross_margin: 'ePages',
  position_change: 'Google Search Console',
  brand_vs_nonbrand: 'Google Search Console',
  organic_conversion_rate: 'ePages + GSC',
  stock_availability_risk: 'ePages + GSC'
}

export function IndicatorDetailPage() {
  const { indicatorId } = useParams()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { t, formatNumber, formatPercent, formatCurrency, formatDate } = useTranslation()

  // Get period from URL or default to 30d
  const period = searchParams.get('period') || '30d'
  // Get comparison type from URL or default to MoM
  const comparisonType = searchParams.get('compare') || 'mom'

  const setPeriod = (newPeriod) => {
    setSearchParams({ period: newPeriod, compare: comparisonType })
  }

  const setComparisonType = (newType) => {
    setSearchParams({ period, compare: newType })
  }

  // Calculate days for chart based on period
  const chartDays = period === '7d' ? 7 : period === '90d' ? 90 : 30

  const { indicators, alerts, isLoading, error } = useIndicators({
    period,
    comparisonMode: comparisonType
  })

  // Find the specific indicator
  const indicator = indicators.find(i => i.indicator_id === indicatorId)

  // Related alerts for this indicator
  const relatedAlerts = alerts.filter(a => a.indicator_id === indicatorId)

  const Icon = INDICATOR_ICONS[indicatorId] || BarChart3
  const title = t(`indicators.types.${indicatorId}.title`)
  const description = t(`indicators.types.${indicatorId}.description`)
  const dataSource = DATA_SOURCES[indicatorId]

  // Format value based on indicator type
  const formatValue = (value) => {
    if (value === null || value === undefined) return '—'

    switch (indicatorId) {
      case 'aov':
      case 'stock_availability_risk':
        return formatCurrency(value, 'SEK')
      case 'gross_margin':
      case 'brand_vs_nonbrand':
      case 'organic_conversion_rate':
        return formatPercent(value)
      case 'position_change':
        const pos = Number(value)
        return pos > 0 ? `+${pos.toFixed(1)}` : pos.toFixed(1)
      default:
        return formatNumber(value, { maximumFractionDigits: 2 })
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-400 mx-auto mb-4"></div>
          <p className="text-slate-400">{t('common.loading')}</p>
        </div>
      </div>
    )
  }

  if (error || !indicator) {
    return (
      <div className="min-h-screen bg-slate-950 p-8">
        <Button
          onClick={() => navigate('/indicators')}
          variant="ghost"
          className="text-slate-400 hover:text-white mb-6"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          {t('common.back')}
        </Button>
        <div className="text-center py-12">
          <AlertTriangle className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <p className="text-slate-400">
            {error ? `${t('common.error')}: ${error.message}` : 'Indicator not found'}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-950 p-4 sm:p-6 lg:p-8">
      {/* Back button */}
      <Button
        onClick={() => navigate('/indicators')}
        variant="ghost"
        className="text-slate-400 hover:text-white mb-6"
      >
        <ArrowLeft className="w-4 h-4 mr-2" />
        {t('common.back')}
      </Button>

      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-8">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-cyan-500/20 rounded-xl">
            <Icon className="w-8 h-8 text-cyan-400" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white">{title}</h1>
            <p className="text-slate-400 text-sm mt-1">{description}</p>
          </div>
          {indicator.alert_triggered && (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-500/20 text-amber-400 rounded-full text-sm">
              <AlertTriangle className="w-4 h-4" />
              {t('indicators.requiresAttention')}
            </div>
          )}
        </div>

        {/* Period & Comparison Selectors */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Period selector */}
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

          {/* Comparison selector */}
          <div className="flex bg-slate-900 rounded-xl p-1">
            <button
              onClick={() => setComparisonType('mom')}
              className={`px-3 py-2 text-sm font-medium rounded-lg transition-all ${
                comparisonType === 'mom'
                  ? 'bg-cyan-600 text-white shadow-sm'
                  : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              MoM
            </button>
            <button
              onClick={() => setComparisonType('yoy')}
              className={`px-3 py-2 text-sm font-medium rounded-lg transition-all ${
                comparisonType === 'yoy'
                  ? 'bg-cyan-600 text-white shadow-sm'
                  : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              YoY
            </button>
          </div>
        </div>
      </div>

      {/* Main content grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Current Value Card */}
        <Card className="bg-slate-800/50 border-slate-700">
          <CardHeader>
            <CardTitle className="text-slate-300 text-sm">{t('detail.currentPeriod')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-end justify-between">
              <div>
                <p className="text-4xl font-bold text-white">
                  {formatValue(indicator.numeric_value ?? indicator.value?.value)}
                </p>
                {/* Use display_change_percent for comparison mode aware change */}
                {indicator.display_change_percent !== null && indicator.display_change_percent !== undefined && (
                  <div className="flex items-center gap-2 mt-2">
                    {indicator.display_direction === 'up' ? (
                      <TrendingUp className="w-5 h-5 text-green-400" />
                    ) : indicator.display_direction === 'down' ? (
                      <TrendingDown className="w-5 h-5 text-red-400" />
                    ) : (
                      <Minus className="w-5 h-5 text-slate-400" />
                    )}
                    <span className={`text-lg font-medium ${
                      indicator.display_change_percent > 0 ? 'text-green-400' :
                      indicator.display_change_percent < 0 ? 'text-red-400' : 'text-slate-400'
                    }`}>
                      {indicator.display_change_percent > 0 && '+'}{indicator.display_change_percent?.toFixed(1)}%
                    </span>
                  </div>
                )}
                {/* Show loading state for YoY when history is loading */}
                {indicator.yoy_loading && comparisonType === 'yoy' && (
                  <div className="flex items-center gap-2 mt-2">
                    <div className="w-5 h-5 animate-spin rounded-full border-2 border-slate-600 border-t-cyan-400" />
                    <span className="text-slate-500 text-sm">{t('common.loading')}</span>
                  </div>
                )}
                {/* Show "no data" for YoY if no historical data available */}
                {!indicator.yoy_loading && comparisonType === 'yoy' && indicator.display_change_percent === null && (
                  <div className="flex items-center gap-2 mt-2">
                    <span className="text-slate-500 text-sm">{t('detail.noYoyData')}</span>
                  </div>
                )}
                {/* Comparison badge - shows MoM or YoY */}
                <div className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 bg-slate-900 rounded-lg">
                  <span className="text-cyan-400 text-xs font-semibold">
                    {comparisonType === 'yoy' ? 'YoY' : 'MoM'}
                  </span>
                  <span className="text-slate-500 text-xs">
                    vs {comparisonType === 'yoy'
                      ? t('detail.lastYear')
                      : t('detail.previousPeriod')}
                  </span>
                </div>
              </div>
              <div className={`px-3 py-1.5 rounded-lg text-sm font-medium ${
                indicator.priority === 'critical' ? 'bg-red-500/20 text-red-400' :
                indicator.priority === 'high' ? 'bg-amber-500/20 text-amber-400' :
                indicator.priority === 'medium' ? 'bg-blue-500/20 text-blue-400' :
                'bg-slate-700 text-slate-400'
              }`}>
                {indicator.confidence}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Metadata Card */}
        <Card className="bg-slate-800/50 border-slate-700">
          <CardHeader>
            <CardTitle className="text-slate-300 text-sm">{t('detail.dataSource')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3">
              <Database className="w-5 h-5 text-slate-500" />
              <div>
                <p className="text-white font-medium">{dataSource}</p>
                <p className="text-slate-500 text-xs">Primary source</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Calendar className="w-5 h-5 text-slate-500" />
              <div>
                <p className="text-white font-medium">
                  {indicator.period_label === '7d' ? '7 days' :
                   indicator.period_label === '30d' ? '30 days' : '90 days'}
                </p>
                <p className="text-slate-500 text-xs">Period</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Clock className="w-5 h-5 text-slate-500" />
              <div>
                <p className="text-white font-medium">
                  {formatDate(indicator.calculated_at, {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </p>
                <p className="text-slate-500 text-xs">{t('detail.calculatedAt')}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Priority Card */}
        <Card className="bg-slate-800/50 border-slate-700">
          <CardHeader>
            <CardTitle className="text-slate-300 text-sm">Priority & Confidence</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-slate-500 text-xs mb-1">Priority</p>
              <p className={`font-medium ${
                indicator.priority === 'critical' ? 'text-red-400' :
                indicator.priority === 'high' ? 'text-amber-400' :
                indicator.priority === 'medium' ? 'text-blue-400' :
                'text-slate-400'
              }`}>
                {indicator.priority?.charAt(0).toUpperCase() + indicator.priority?.slice(1)}
              </p>
            </div>
            <div>
              <p className="text-slate-500 text-xs mb-1">Confidence</p>
              <p className="text-white font-medium">{indicator.confidence}</p>
            </div>
            <div>
              <p className="text-slate-500 text-xs mb-1">Direction</p>
              <div className="flex items-center gap-2">
                {indicator.direction === 'up' ? (
                  <>
                    <TrendingUp className="w-4 h-4 text-green-400" />
                    <span className="text-green-400">Upward</span>
                  </>
                ) : indicator.direction === 'down' ? (
                  <>
                    <TrendingDown className="w-4 h-4 text-red-400" />
                    <span className="text-red-400">Downward</span>
                  </>
                ) : (
                  <>
                    <Minus className="w-4 h-4 text-slate-400" />
                    <span className="text-slate-400">Stable</span>
                  </>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Trend Chart */}
      <Card className="bg-slate-800/50 border-slate-700 mt-6">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-cyan-400" />
            {t('detail.history')} ({t(`periods.${period}`)})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <IndicatorTrendChart
            indicatorId={indicatorId}
            days={chartDays}
            height={300}
            formatValue={formatValue}
          />
        </CardContent>
      </Card>

      {/* Related Alerts */}
      {relatedAlerts.length > 0 && (
        <div className="mt-6">
          <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-400" />
            {t('detail.relatedAlerts')} ({relatedAlerts.length})
          </h2>
          <div className="space-y-3">
            {relatedAlerts.map(alert => (
              <AlertItem key={alert.id} alert={alert} />
            ))}
          </div>
        </div>
      )}

      {/* How to Read Guide */}
      <Card className="bg-gradient-to-br from-slate-800/50 to-slate-900/50 border-slate-700 mt-6">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <HelpCircle className="w-5 h-5 text-cyan-400" />
            {t('detail.howToRead')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* What is this? */}
            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <div className="p-2 bg-blue-500/20 rounded-lg shrink-0">
                  <Info className="w-4 h-4 text-blue-400" />
                </div>
                <div>
                  <p className="text-slate-300 font-medium mb-1">Mitä tämä luku tarkoittaa?</p>
                  <p className="text-slate-400 text-sm">{t(`guide.${indicatorId}.whatIs`)}</p>
                </div>
              </div>
            </div>

            {/* Good vs Bad */}
            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <div className="p-2 bg-green-500/20 rounded-lg shrink-0">
                  <ThumbsUp className="w-4 h-4 text-green-400" />
                </div>
                <div>
                  <p className="text-green-400 font-medium mb-1">Hyvä arvo</p>
                  <p className="text-slate-400 text-sm">{t(`guide.${indicatorId}.goodValue`)}</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="p-2 bg-red-500/20 rounded-lg shrink-0">
                  <ThumbsDown className="w-4 h-4 text-red-400" />
                </div>
                <div>
                  <p className="text-red-400 font-medium mb-1">Huono arvo</p>
                  <p className="text-slate-400 text-sm">{t(`guide.${indicatorId}.badValue`)}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Action suggestion */}
          <div className="mt-6 p-4 bg-cyan-500/10 border border-cyan-500/30 rounded-xl">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-cyan-500/20 rounded-lg shrink-0">
                <Lightbulb className="w-4 h-4 text-cyan-400" />
              </div>
              <div>
                <p className="text-cyan-400 font-medium mb-1">Mitä voin tehdä?</p>
                <p className="text-slate-300 text-sm">{t(`guide.${indicatorId}.action`)}</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export default IndicatorDetailPage

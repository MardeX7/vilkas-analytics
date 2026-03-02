/**
 * ForecastCard - Tilikauden ennuste vs Tavoite
 *
 * Ennustealgoritmi (YoY-pohjainen):
 *   1. Ensisijainen: lastFY_total × (currentFY_YTD / lastFY_samePeriod)
 *   2. Fallback:     dailyAvg × daysInFY  (lineaarinen, jos ei edellisvuoden dataa)
 *
 * Tilikausi: 1.3. – 28/29.2.
 */

import { useState, useEffect, useMemo } from 'react'
import {
  TrendingUp,
  ChevronRight,
  AlertCircle
} from 'lucide-react'
import { useTranslation } from '@/lib/i18n'
import { useCurrentShop } from '@/config/storeConfig'
import { useMerchantGoals } from '@/hooks/useMerchantGoals'
import { supabase } from '@/lib/supabase'

/**
 * Fiscal year months in order (March → February)
 */
const FY_MONTHS = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 1, 2]

/**
 * Get fiscal year boundaries for a given date.
 * Fiscal year: March 1 – February 28/29.
 */
function getFiscalYear(date) {
  const year = date.getFullYear()
  const month = date.getMonth() + 1

  // March or later → FY starts this calendar year; Jan/Feb → FY started last year
  const fyStartYear = month >= 3 ? year : year - 1

  const start = new Date(fyStartYear, 2, 1) // March 1

  // End: Feb 28 or 29 of the following year
  const endYear = fyStartYear + 1
  const isLeap = new Date(endYear, 1, 29).getMonth() === 1
  const end = new Date(endYear, 1, isLeap ? 29 : 28)

  // Previous fiscal year
  const prevStart = new Date(fyStartYear - 1, 2, 1)
  const prevEndYear = fyStartYear
  const prevIsLeap = new Date(prevEndYear, 1, 29).getMonth() === 1
  const prevEnd = new Date(prevEndYear, 1, prevIsLeap ? 29 : 28)

  const label = `03/${fyStartYear}–02/${endYear}`
  const prevLabel = `03/${fyStartYear - 1}–02/${prevEndYear}`

  return { start, end, label, prevStart, prevEnd, prevLabel, fyStartYear }
}

/**
 * Days elapsed since fiscal year start (inclusive).
 */
function getDayOfFiscalYear(date) {
  const fy = getFiscalYear(date)
  const diff = date - fy.start
  return Math.floor(diff / (1000 * 60 * 60 * 24)) + 1
}

/**
 * Total days in the fiscal year.
 */
function getDaysInFiscalYear(date) {
  const fy = getFiscalYear(date)
  const diff = fy.end - fy.start
  return Math.floor(diff / (1000 * 60 * 60 * 24)) + 1
}

/**
 * Format date as YYYY-MM-DD
 */
function fmt(date) {
  return date.toISOString().split('T')[0]
}

/**
 * Calculate YoY-based fiscal year forecast
 *
 * Primary:  lastFY_total × (currentFY_YTD / lastFY_samePeriod)
 * Fallback: dailyAvg × daysInFY (linear)
 */
function calculateYoYForecast(currentYTD, lastFYSamePeriod, lastFYTotal, daysElapsed, daysInFY) {
  // Need at least 14 days of data
  if (daysElapsed < 14) return null

  const yearProgress = daysElapsed / daysInFY

  // Primary: YoY method
  if (lastFYSamePeriod > 0 && lastFYTotal > 0) {
    const yoyGrowthRate = currentYTD / lastFYSamePeriod
    const yoyForecast = Math.round(lastFYTotal * yoyGrowthRate)

    let confidence = 'low'
    if (yearProgress > 0.5) confidence = 'medium'
    if (yearProgress > 0.75) confidence = 'high'

    return {
      forecast: yoyForecast,
      method: 'yoy',
      confidence,
      daysElapsed,
      yearProgress: Math.round(yearProgress * 100),
      yoyGrowthRate: Math.round((yoyGrowthRate - 1) * 100),
      lastFYTotal,
      lastFYSamePeriod,
      dailyRunRate: Math.round(currentYTD / daysElapsed)
    }
  }

  // Fallback: linear
  const dailyAvg = currentYTD / daysElapsed
  const linearForecast = Math.round(dailyAvg * daysInFY)

  let confidence = 'low'
  if (yearProgress > 0.5) confidence = 'medium'
  if (yearProgress > 0.75) confidence = 'high'

  return {
    forecast: linearForecast,
    method: 'linear',
    confidence,
    daysElapsed,
    yearProgress: Math.round(yearProgress * 100),
    dailyRunRate: Math.round(dailyAvg)
  }
}

/**
 * Main ForecastCard Component
 */
export function ForecastCard() {
  const { t, formatCurrency, language } = useTranslation()
  const { storeId, ready } = useCurrentShop()
  const [showDetails, setShowDetails] = useState(false)

  const [ytdRevenue, setYtdRevenue] = useState(null)
  const [lastFYTotal, setLastFYTotal] = useState(null)
  const [lastFYSamePeriod, setLastFYSamePeriod] = useState(null)
  const [loading, setLoading] = useState(true)

  const now = new Date()
  const fy = getFiscalYear(now)
  const daysElapsed = getDayOfFiscalYear(now)
  const daysInFY = getDaysInFiscalYear(now)

  // Fetch revenue data from v_daily_sales
  useEffect(() => {
    async function fetchRevenueData() {
      setLoading(true)
      const today = fmt(now)

      // 1. Current FY YTD
      const fyStartStr = fmt(fy.start)
      const { data: ytdData } = await supabase
        .from('v_daily_sales')
        .select('total_revenue')
        .eq('store_id', storeId)
        .gte('sale_date', fyStartStr)
        .lte('sale_date', today)

      if (ytdData) {
        setYtdRevenue(ytdData.reduce((sum, d) => sum + (parseFloat(d.total_revenue) || 0), 0))
      }

      // 2. Last FY — same period (for YoY ratio)
      //    Same number of days from previous FY start
      const prevFYSameDayEnd = new Date(fy.prevStart)
      prevFYSameDayEnd.setDate(prevFYSameDayEnd.getDate() + daysElapsed - 1)

      const { data: lastPeriodData } = await supabase
        .from('v_daily_sales')
        .select('total_revenue')
        .eq('store_id', storeId)
        .gte('sale_date', fmt(fy.prevStart))
        .lte('sale_date', fmt(prevFYSameDayEnd))

      if (lastPeriodData) {
        setLastFYSamePeriod(lastPeriodData.reduce((sum, d) => sum + (parseFloat(d.total_revenue) || 0), 0))
      }

      // 3. Last FY — full year total
      const { data: lastFullData } = await supabase
        .from('v_daily_sales')
        .select('total_revenue')
        .eq('store_id', storeId)
        .gte('sale_date', fmt(fy.prevStart))
        .lte('sale_date', fmt(fy.prevEnd))

      if (lastFullData) {
        setLastFYTotal(lastFullData.reduce((sum, d) => sum + (parseFloat(d.total_revenue) || 0), 0))
      }

      setLoading(false)
    }

    if (!ready || !storeId) return
    fetchRevenueData()
  }, [storeId, ready])

  const { goals, loading: loadingGoals } = useMerchantGoals()

  // Find yearly revenue goal
  const revenueGoal = goals?.find(g =>
    g.goal_type === 'revenue' &&
    (g.period_type === 'yearly' || g.period_label === `${fy.fyStartYear}`)
  )

  // Calculate forecast
  const forecastData = useMemo(() => {
    if (ytdRevenue === null || ytdRevenue === 0) return null
    return calculateYoYForecast(ytdRevenue, lastFYSamePeriod, lastFYTotal, daysElapsed, daysInFY)
  }, [ytdRevenue, lastFYSamePeriod, lastFYTotal, daysElapsed, daysInFY])

  const isLoading = loading || loadingGoals

  if (isLoading) {
    return (
      <div className="bg-background-elevated border border-card-border rounded-lg p-6">
        <div className="animate-pulse">
          <div className="h-5 w-32 bg-background-subtle rounded mb-4" />
          <div className="h-8 w-48 bg-background-subtle rounded mb-2" />
          <div className="h-4 w-full bg-background-subtle rounded" />
        </div>
      </div>
    )
  }

  const targetValue = revenueGoal?.target_value || 0
  const forecastValue = forecastData?.forecast || 0

  // Difference to target
  const diffToTarget = forecastValue - targetValue
  const diffPercent = targetValue > 0
    ? Math.round((diffToTarget / targetValue) * 1000) / 10
    : 0

  // Progress percentage (YTD vs target)
  const progressPercent = targetValue > 0
    ? Math.min(Math.round((ytdRevenue / targetValue) * 100), 100)
    : 0

  const isFi = language === 'fi'

  const getConfidenceLabel = (conf) => {
    switch (conf) {
      case 'high': return t('forecast.confidenceLevels.high')
      case 'medium': return t('forecast.confidenceLevels.medium')
      case 'low': return t('forecast.confidenceLevels.low')
      default: return ''
    }
  }

  const getConfidenceColor = (conf) => {
    switch (conf) {
      case 'high': return 'text-emerald-500'
      case 'medium': return 'text-amber-500'
      case 'low': return 'text-rose-500'
      default: return 'text-muted-foreground'
    }
  }

  return (
    <div className="bg-background-elevated border border-card-border rounded-lg overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-card-border/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" />
            <div>
              <h3 className="font-semibold text-foreground">
                {t('forecast.title')}
              </h3>
              <p className="text-xs text-muted-foreground">
                {t('forecast.fiscalYear')} {fy.label}
              </p>
            </div>
          </div>
          {forecastData?.confidence && (
            <span className={`text-xs font-medium ${getConfidenceColor(forecastData.confidence)}`}>
              {getConfidenceLabel(forecastData.confidence)}
            </span>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="p-4 space-y-4">
        {!forecastData ? (
          <div className="text-center py-4">
            <AlertCircle className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">
              {t('forecast.notEnoughData')}
            </p>
          </div>
        ) : (
          <>
            {/* Main forecast */}
            <div className="space-y-2">
              <div className="flex items-end justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">
                    {forecastData.method === 'yoy'
                      ? (isFi ? 'Tilikauden ennuste (YoY)' : 'Räkenskapsårsprognos (YoY)')
                      : (isFi ? 'Tilikauden ennuste (lineaarinen)' : 'Räkenskapsårsprognos (linjär)')}
                  </p>
                  <p className="text-2xl font-bold text-foreground">
                    {formatCurrency(forecastValue)}
                  </p>
                </div>
                {targetValue > 0 && (
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">
                      {t('forecast.target')}
                    </p>
                    <p className="text-lg font-semibold text-muted-foreground">
                      {formatCurrency(targetValue)}
                    </p>
                  </div>
                )}
              </div>

              {/* YoY explanation */}
              {forecastData.method === 'yoy' ? (
                <p className="text-xs text-muted-foreground">
                  {isFi
                    ? `Edellinen tilikausi ${formatCurrency(forecastData.lastFYTotal)} × ${forecastData.yoyGrowthRate >= 0 ? '+' : ''}${forecastData.yoyGrowthRate}% kasvu`
                    : `Föregående räkenskapsår ${formatCurrency(forecastData.lastFYTotal)} × ${forecastData.yoyGrowthRate >= 0 ? '+' : ''}${forecastData.yoyGrowthRate}% tillväxt`}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  {isFi
                    ? `${formatCurrency(forecastData.dailyRunRate)}/päivä × ${daysInFY} päivää`
                    : `${formatCurrency(forecastData.dailyRunRate)}/dag × ${daysInFY} dagar`}
                </p>
              )}

              {/* Progress bar */}
              {targetValue > 0 && (
                <div className="relative">
                  <div className="h-2 bg-background-subtle rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        progressPercent >= 100
                          ? 'bg-emerald-500'
                          : progressPercent >= 75
                            ? 'bg-primary'
                            : progressPercent >= 50
                              ? 'bg-amber-500'
                              : 'bg-rose-500'
                      }`}
                      style={{ width: `${Math.min(progressPercent, 100)}%` }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 text-right">
                    {progressPercent}% {t('forecast.ofTarget')}
                  </p>
                </div>
              )}
            </div>

            {/* YTD comparison */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{isFi ? 'YTD toteutuma' : 'YTD utfall'}</span>
                <span className="text-foreground font-medium">
                  {formatCurrency(Math.round(ytdRevenue))}
                </span>
              </div>
              {forecastData.method === 'yoy' && lastFYSamePeriod > 0 && (
                <p className="text-xs text-muted-foreground">
                  {isFi
                    ? `vs. edellinen tilikausi sama aika: ${formatCurrency(Math.round(lastFYSamePeriod))} (${forecastData.yoyGrowthRate >= 0 ? '+' : ''}${forecastData.yoyGrowthRate}%)`
                    : `vs. föregående räkenskapsår samma tid: ${formatCurrency(Math.round(lastFYSamePeriod))} (${forecastData.yoyGrowthRate >= 0 ? '+' : ''}${forecastData.yoyGrowthRate}%)`}
                </p>
              )}
            </div>

            {/* Difference to target */}
            {targetValue > 0 && (
              <div className={`p-3 rounded-lg ${
                diffToTarget >= 0 ? 'bg-emerald-500/10' : 'bg-rose-500/10'
              }`}>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">
                    {t('forecast.differenceToTarget')}
                  </span>
                  <span className={`font-semibold ${
                    diffToTarget >= 0 ? 'text-emerald-500' : 'text-rose-500'
                  }`}>
                    {diffToTarget >= 0 ? '+' : ''}{formatCurrency(diffToTarget)}
                    <span className="text-xs ml-1">({diffPercent > 0 ? '+' : ''}{diffPercent}%)</span>
                  </span>
                </div>
              </div>
            )}

            {/* Details toggle */}
            <button
              onClick={() => setShowDetails(!showDetails)}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <ChevronRight className={`h-3 w-3 transition-transform ${showDetails ? 'rotate-90' : ''}`} />
              {t('forecast.showCalculation')}
            </button>

            {/* Details */}
            {showDetails && (
              <div className="text-xs text-muted-foreground space-y-1 pl-4 border-l-2 border-card-border">
                <p>{t('forecast.basedOn')}: {forecastData.yearProgress}% {t('forecast.ofYearComplete')}</p>
                <p>{isFi ? 'Päivittäinen keskiarvo' : 'Daglig genomsnitt'}: {formatCurrency(forecastData.dailyRunRate)}</p>
                {forecastData.method === 'yoy' && (
                  <>
                    <p>{isFi ? 'Menetelmä' : 'Metod'}: {isFi ? 'YoY-kasvu (edellinen tilikausi)' : 'YoY-tillväxt (föregående räkenskapsår)'}</p>
                    <p>{isFi ? 'Kaava' : 'Formel'}: {formatCurrency(forecastData.lastFYTotal)} × {((forecastData.yoyGrowthRate / 100) + 1).toFixed(2)}</p>
                  </>
                )}
                {forecastData.method === 'linear' && (
                  <p>{isFi ? 'Menetelmä' : 'Metod'}: {isFi ? 'Lineaarinen (ei edellisvuoden dataa)' : 'Linjär (ingen förra årets data)'}</p>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

export default ForecastCard

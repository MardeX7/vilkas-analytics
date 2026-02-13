/**
 * ForecastCard - Vuosiennuste vs Tavoite
 *
 * Näyttää:
 * - YoY-pohjaisen vuosiennusteen
 * - Eron tavoitteeseen
 * - Luottamustason
 * - Sesonkikorjauksen
 */

import { useState, useMemo } from 'react'
import {
  TrendingUp,
  Target,
  Calendar,
  Info,
  ChevronRight,
  AlertCircle
} from 'lucide-react'
import { useTranslation } from '@/lib/i18n'
import { useAnalytics } from '@/hooks/useAnalytics'
import { useMerchantGoals } from '@/hooks/useMerchantGoals'

/**
 * Seasonal factors by month (based on typical e-commerce patterns)
 * 1.0 = average month, >1 = above average, <1 = below average
 */
const SEASONAL_FACTORS = {
  1: 0.7,   // January - post-holiday slump
  2: 0.75,  // February
  3: 0.85,  // March
  4: 0.9,   // April
  5: 0.95,  // May
  6: 0.85,  // June - summer slowdown
  7: 0.8,   // July
  8: 0.85,  // August
  9: 1.0,   // September - back to normal
  10: 1.1,  // October
  11: 1.3,  // November - Black Friday
  12: 1.4   // December - Holiday peak
}

/**
 * Calculate year-end forecast based on YTD performance
 */
function calculateForecast(ytdRevenue, lastYearTotal, currentMonth, currentDayOfMonth) {
  if (!lastYearTotal || lastYearTotal <= 0) {
    return null
  }

  // Calculate how much of the year has passed
  const daysInYear = 365
  const dayOfYear = getDayOfYear(new Date())
  const yearProgress = dayOfYear / daysInYear

  // If less than 2 weeks of data, don't forecast
  if (dayOfYear < 14) {
    return null
  }

  // Calculate current run rate
  const dailyRunRate = ytdRevenue / dayOfYear

  // Apply seasonal adjustment for remaining months
  let remainingRevenue = 0
  const currentDate = new Date()

  for (let month = currentMonth; month <= 12; month++) {
    const daysInMonth = new Date(currentDate.getFullYear(), month, 0).getDate()
    const factor = SEASONAL_FACTORS[month] || 1.0

    if (month === currentMonth) {
      // Remaining days in current month
      const remainingDays = daysInMonth - currentDayOfMonth
      remainingRevenue += dailyRunRate * remainingDays * factor
    } else {
      // Full months
      remainingRevenue += dailyRunRate * daysInMonth * factor
    }
  }

  const yearEndForecast = ytdRevenue + remainingRevenue

  // Calculate confidence based on how much of the year has passed
  let confidence = 'low'
  if (yearProgress > 0.5) confidence = 'medium'
  if (yearProgress > 0.75) confidence = 'high'

  // YoY growth rate
  const yoyGrowthRate = lastYearTotal > 0
    ? ((ytdRevenue / (lastYearTotal * yearProgress)) - 1) * 100
    : 0

  return {
    yearEndForecast: Math.round(yearEndForecast),
    confidence,
    yoyGrowthRate: Math.round(yoyGrowthRate * 10) / 10,
    yearProgress: Math.round(yearProgress * 100),
    dailyRunRate: Math.round(dailyRunRate)
  }
}

/**
 * Get day of year (1-365)
 */
function getDayOfYear(date) {
  const start = new Date(date.getFullYear(), 0, 0)
  const diff = date - start
  const oneDay = 1000 * 60 * 60 * 24
  return Math.floor(diff / oneDay)
}

/**
 * Main ForecastCard Component
 */
export function ForecastCard() {
  const { t, formatCurrency, formatNumber, language } = useTranslation()
  const [showDetails, setShowDetails] = useState(false)

  // Get current year's data
  const currentYear = new Date().getFullYear()
  const yearStart = `${currentYear}-01-01`
  const today = new Date().toISOString().split('T')[0]

  // Get last year's data for comparison
  const lastYearStart = `${currentYear - 1}-01-01`
  const lastYearEnd = `${currentYear - 1}-12-31`

  const { summary: currentYearSummary, loading: loadingCurrent } = useAnalytics({
    startDate: yearStart,
    endDate: today
  })

  const { summary: lastYearSummary, loading: loadingLastYear } = useAnalytics({
    startDate: lastYearStart,
    endDate: lastYearEnd
  })

  const { goals, loading: loadingGoals } = useMerchantGoals()

  const loading = loadingCurrent || loadingLastYear || loadingGoals

  // Find yearly revenue goal
  const revenueGoal = goals?.find(g =>
    g.goal_type === 'revenue' &&
    (g.period_type === 'yearly' || g.period_label === `${currentYear}`)
  )

  // Calculate forecast
  const forecast = useMemo(() => {
    if (!currentYearSummary?.totalRevenue) return null

    const currentMonth = new Date().getMonth() + 1
    const currentDayOfMonth = new Date().getDate()

    return calculateForecast(
      currentYearSummary.totalRevenue,
      lastYearSummary?.totalRevenue || 0,
      currentMonth,
      currentDayOfMonth
    )
  }, [currentYearSummary, lastYearSummary])

  if (loading) {
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
  const forecastValue = forecast?.yearEndForecast || 0
  const ytdValue = currentYearSummary?.totalRevenue || 0

  // Calculate difference to target
  const diffToTarget = forecastValue - targetValue
  const diffPercent = targetValue > 0
    ? Math.round((diffToTarget / targetValue) * 1000) / 10
    : 0

  // Progress percentage
  const progressPercent = targetValue > 0
    ? Math.min(Math.round((ytdValue / targetValue) * 100), 100)
    : 0

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
            <h3 className="font-semibold text-foreground">
              {t('forecast.title')}
            </h3>
          </div>
          {forecast?.confidence && (
            <span className={`text-xs font-medium ${getConfidenceColor(forecast.confidence)}`}>
              {getConfidenceLabel(forecast.confidence)}
            </span>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="p-4 space-y-4">
        {!forecast ? (
          <div className="text-center py-4">
            <AlertCircle className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">
              {t('forecast.notEnoughData')}
            </p>
          </div>
        ) : (
          <>
            {/* Main forecast vs target */}
            <div className="space-y-2">
              <div className="flex items-end justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">
                    {t('forecast.yearEndForecast')}
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
                <p>{t('forecast.basedOn')}: {forecast.yearProgress}% {t('forecast.ofYearComplete')}</p>
                <p>{t('forecast.dailyRunRate')}: {formatCurrency(forecast.dailyRunRate)}</p>
                <p>{t('forecast.yoyGrowth')}: {forecast.yoyGrowthRate > 0 ? '+' : ''}{forecast.yoyGrowthRate}%</p>
                <p>{t('forecast.seasonalAdjustment')}: {t('forecast.applied')}</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

export default ForecastCard

/**
 * Analyysit-sivu (AI Analytics)
 *
 * Verkkokaupan "johtokeskus" - päätöksenteko yhdessä paikassa:
 * - Emma AI-analyytikko (hero)
 * - Kategorisoidut johtajakysymykset
 * - Viikkoanalyysi, ennusteet, toimenpidesuositukset
 *
 * Versio: 3.0 - Mobile-first, Apple-tyyli
 */

import { useState, useEffect } from 'react'
import {
  Brain,
  Calendar,
  Sparkles,
  MessageCircle,
  TrendingUp
} from 'lucide-react'
import { useTranslation } from '@/lib/i18n'
import { useGrowthEngine } from '@/hooks/useGrowthEngine'
import { useMerchantGoals } from '@/hooks/useMerchantGoals'
import { EmmaChatFullscreen } from '@/components/EmmaChatFullscreen'
import { ActionRecommendationsCard } from '@/components/ActionRecommendationsCard'
import { supabase } from '@/lib/supabase'
import { useCurrentShop } from '@/config/storeConfig'

export function InsightsPage() {
  const { storeId, ready } = useCurrentShop()
  const { t, language } = useTranslation()
  const isFi = language === 'fi'

  // Emma chat modal state
  const [isEmmaChatOpen, setIsEmmaChatOpen] = useState(false)
  const [emmaInitialMessage, setEmmaInitialMessage] = useState('')

  // Open Emma with a pre-filled question (e.g., from recommendation)
  const openEmmaWithQuestion = (question) => {
    setEmmaInitialMessage(question)
    setIsEmmaChatOpen(true)
  }

  // Date range for data
  const [dateRange] = useState(() => {
    const end = new Date()
    const start = new Date()
    start.setDate(start.getDate() - 30)
    return {
      startDate: start.toISOString().split('T')[0],
      endDate: end.toISOString().split('T')[0]
    }
  })

  // Growth Engine data
  const {
    overallIndex: growthIndex,
    demandGrowth,
    trafficQuality,
    salesEfficiency,
    productLeverage,
    isLoading
  } = useGrowthEngine(dateRange)

  // Week number for display
  const now = new Date()
  const startOfYear = new Date(now.getFullYear(), 0, 1)
  const days = Math.floor((now - startOfYear) / (24 * 60 * 60 * 1000))
  const weekNumber = Math.ceil((days + startOfYear.getDay() + 1) / 7)
  const year = now.getFullYear()


  // Goals
  const { goals } = useMerchantGoals()
  const revenueGoal = goals?.find(g => g.goal_type === 'revenue')

  // Fetch YTD revenue AND last year's data for YoY forecast
  const [ytdRevenue, setYtdRevenue] = useState(null)
  const [lastYearTotal, setLastYearTotal] = useState(null)
  const [lastYearSamePeriod, setLastYearSamePeriod] = useState(null)

  useEffect(() => {
    async function fetchRevenueData() {
      const now = new Date()
      const currentYear = now.getFullYear()
      const lastYear = currentYear - 1
      const today = now.toISOString().split('T')[0]
      const dayOfYear = Math.floor((now - new Date(currentYear, 0, 1)) / (1000 * 60 * 60 * 24)) + 1

      // Current year YTD
      const startOfYear = `${currentYear}-01-01`
      const { data: ytdData, error: ytdError } = await supabase
        .from('v_daily_sales')
        .select('total_revenue')
        .eq('store_id', storeId)
        .gte('sale_date', startOfYear)
        .lte('sale_date', today)

      if (!ytdError && ytdData) {
        const total = ytdData.reduce((sum, d) => sum + (parseFloat(d.total_revenue) || 0), 0)
        setYtdRevenue(total)
      }

      // Last year - same period (for YoY comparison)
      const lastYearStart = `${lastYear}-01-01`
      const lastYearSameDay = new Date(lastYear, now.getMonth(), now.getDate())
      const lastYearSameDayStr = lastYearSameDay.toISOString().split('T')[0]

      const { data: lastYearPeriodData, error: lastYearPeriodError } = await supabase
        .from('v_daily_sales')
        .select('total_revenue')
        .eq('store_id', storeId)
        .gte('sale_date', lastYearStart)
        .lte('sale_date', lastYearSameDayStr)

      if (!lastYearPeriodError && lastYearPeriodData) {
        const total = lastYearPeriodData.reduce((sum, d) => sum + (parseFloat(d.total_revenue) || 0), 0)
        setLastYearSamePeriod(total)
      }

      // Last year - full year total
      const lastYearEnd = `${lastYear}-12-31`
      const { data: lastYearFullData, error: lastYearFullError } = await supabase
        .from('v_daily_sales')
        .select('total_revenue')
        .eq('store_id', storeId)
        .gte('sale_date', lastYearStart)
        .lte('sale_date', lastYearEnd)

      if (!lastYearFullError && lastYearFullData) {
        const total = lastYearFullData.reduce((sum, d) => sum + (parseFloat(d.total_revenue) || 0), 0)
        setLastYearTotal(total)
      }
    }
    if (!ready || !storeId) return
    fetchRevenueData()
  }, [storeId, ready])

  // Calculate YoY-based forecast (accounts for seasonality)
  const calculateYoYForecast = (currentYTD, lastYearSamePeriod, lastYearTotal, targetValue) => {
    const now = new Date()
    const startOfYear = new Date(now.getFullYear(), 0, 1)
    const daysElapsed = Math.max(1, Math.floor((now - startOfYear) / (1000 * 60 * 60 * 24)) + 1)

    // If we have last year's data, use YoY method
    if (lastYearSamePeriod > 0 && lastYearTotal > 0) {
      // YoY growth rate (current YTD vs last year same period)
      const yoyGrowthRate = currentYTD / lastYearSamePeriod

      // YoY forecast = last year total × growth rate
      const yoyForecast = Math.round(lastYearTotal * yoyGrowthRate)

      // Also calculate what % of last year's total we've achieved at this point
      const lastYearPacePercent = (lastYearSamePeriod / lastYearTotal) * 100

      return {
        forecast: yoyForecast,
        method: 'yoy',
        daysElapsed,
        yoyGrowthRate: Math.round((yoyGrowthRate - 1) * 100), // as percentage change
        lastYearTotal,
        lastYearSamePeriod,
        lastYearPacePercent: Math.round(lastYearPacePercent),
        onTrack: yoyForecast >= targetValue * 0.9
      }
    }

    // Fallback to linear if no last year data
    const dailyAvg = currentYTD / daysElapsed
    const linearForecast = Math.round(dailyAvg * 365)

    return {
      forecast: linearForecast,
      method: 'linear',
      daysElapsed,
      dailyAvg: Math.round(dailyAvg),
      onTrack: linearForecast >= targetValue * 0.9
    }
  }

  // Use real YTD revenue for forecast
  const actualYTD = ytdRevenue ?? revenueGoal?.current_value ?? 0
  const forecastData = revenueGoal
    ? calculateYoYForecast(actualYTD, lastYearSamePeriod, lastYearTotal, revenueGoal.target_value)
    : null

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-500/20 to-primary/20 flex items-center justify-center">
            <Brain className="w-8 h-8 text-violet-500 animate-pulse" />
          </div>
          <p className="text-foreground-subtle text-sm">{t('common.loading')}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Minimal Header */}
      <header className="border-b border-border/30 bg-background/80 backdrop-blur-md sticky top-0 z-20">
        <div className="px-4 py-3 flex items-center justify-between max-w-4xl mx-auto">
          <div className="flex items-center gap-2">
            <Brain className="w-5 h-5 text-violet-500" />
            <span className="font-semibold text-foreground">{t('nav.insights')}</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-foreground-muted bg-background-subtle px-2.5 py-1 rounded-full">
            <Calendar className="w-3.5 h-3.5" />
            <span>{isFi ? 'Vk' : 'V'} {weekNumber} / {year}</span>
          </div>
        </div>
      </header>

      {/* Emma Chat Fullscreen Modal */}
      <EmmaChatFullscreen
        isOpen={isEmmaChatOpen}
        onClose={() => {
          setIsEmmaChatOpen(false)
          setEmmaInitialMessage('') // Clear initial message on close
        }}
        dateRange={dateRange}
        growthEngineData={{
          demandGrowth,
          trafficQuality,
          salesEfficiency,
          productLeverage,
          overallIndex: growthIndex
        }}
        initialMessage={emmaInitialMessage}
      />

      {/* Main Content - Single column, mobile optimized */}
      <main className="max-w-4xl mx-auto px-4 py-6 space-y-6">

        {/* Emma CTA Card - Opens fullscreen chat */}
        <button
          onClick={() => setIsEmmaChatOpen(true)}
          className="w-full bg-gradient-to-br from-violet-500/10 via-background-elevated to-primary/5
                   rounded-2xl border border-violet-500/20 hover:border-violet-500/40
                   p-6 text-left transition-all hover:shadow-lg hover:shadow-violet-500/10 group"
        >
          <div className="flex items-center gap-4">
            <div className="p-3 bg-gradient-to-br from-violet-500/20 to-violet-600/20 rounded-xl group-hover:scale-110 transition-transform">
              <MessageCircle className="h-6 w-6 text-violet-500" />
            </div>
            <div className="flex-1">
              <h2 className="font-semibold text-foreground flex items-center gap-2 text-lg">
                {isFi ? 'Kysy Emmalta' : 'Fråga Emma'}
                <Sparkles className="h-4 w-4 text-violet-400" />
              </h2>
              <p className="text-sm text-muted-foreground mt-0.5">
                {isFi
                  ? 'Henkilökohtainen analyytikkosi - analysoi dataa, vastaa kysymyksiin, antaa suosituksia'
                  : 'Din personliga analytiker - analyserar data, svarar på frågor, ger rekommendationer'}
              </p>
            </div>
            <div className="text-violet-500 group-hover:translate-x-1 transition-transform">
              →
            </div>
          </div>
        </button>

        {/* Winner & Attention Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Week's Winner */}
          <WeekHighlightCard
            type="winner"
            demandGrowth={demandGrowth}
            trafficQuality={trafficQuality}
            salesEfficiency={salesEfficiency}
            productLeverage={productLeverage}
            isFi={isFi}
          />

          {/* Needs Attention */}
          <WeekHighlightCard
            type="attention"
            demandGrowth={demandGrowth}
            trafficQuality={trafficQuality}
            salesEfficiency={salesEfficiency}
            productLeverage={productLeverage}
            isFi={isFi}
          />
        </div>

        {/* Forecast + Actions Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Forecast Card */}
          {revenueGoal && forecastData && (
            <section className="bg-background-elevated border border-card-border rounded-2xl overflow-hidden">
              <div className="px-5 py-4 border-b border-border/50 flex items-center gap-3">
                <div className="p-2 bg-blue-500/10 rounded-lg">
                  <TrendingUp className="h-5 w-5 text-blue-500" />
                </div>
                <h3 className="font-semibold text-foreground">{isFi ? 'Ennuste' : 'Prognos'}</h3>
              </div>
              <div className="p-5 space-y-4">
                {/* Year Forecast */}
                <div>
                  <p className="text-xs text-muted-foreground mb-1">
                    {forecastData.method === 'yoy'
                      ? (isFi ? 'Vuosiennuste (YoY-pohjainen)' : 'Årsprognos (YoY-baserad)')
                      : (isFi ? 'Vuosiennuste (lineaarinen)' : 'Årsprognos (linjär)')}
                  </p>
                  <p className="text-3xl font-bold text-foreground">
                    {forecastData.forecast.toLocaleString('sv-SE')} SEK
                  </p>
                  {forecastData.method === 'yoy' ? (
                    <p className="text-xs text-muted-foreground mt-1">
                      {isFi
                        ? `Viime vuosi ${forecastData.lastYearTotal?.toLocaleString('sv-SE')} kr × ${forecastData.yoyGrowthRate >= 0 ? '+' : ''}${forecastData.yoyGrowthRate}% kasvu`
                        : `Förra året ${forecastData.lastYearTotal?.toLocaleString('sv-SE')} kr × ${forecastData.yoyGrowthRate >= 0 ? '+' : ''}${forecastData.yoyGrowthRate}% tillväxt`}
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground mt-1">
                      {isFi
                        ? `${forecastData.dailyAvg?.toLocaleString('sv-SE') || '—'} kr/päivä × 365 päivää`
                        : `${forecastData.dailyAvg?.toLocaleString('sv-SE') || '—'} kr/dag × 365 dagar`}
                    </p>
                  )}
                </div>

                {/* YTD Comparison */}
                <div className="pt-3 border-t border-border/30">
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="text-muted-foreground">{isFi ? 'YTD toteutuma' : 'YTD utfall'}</span>
                    <span className="text-foreground font-medium">
                      {Math.round(actualYTD).toLocaleString('sv-SE')} SEK
                    </span>
                  </div>
                  {forecastData.method === 'yoy' && forecastData.lastYearSamePeriod > 0 ? (
                    <p className="text-xs text-muted-foreground">
                      {isFi
                        ? `vs. viime vuosi sama aika: ${forecastData.lastYearSamePeriod?.toLocaleString('sv-SE')} kr (${forecastData.yoyGrowthRate >= 0 ? '+' : ''}${forecastData.yoyGrowthRate}%)`
                        : `vs. förra året samma tid: ${forecastData.lastYearSamePeriod?.toLocaleString('sv-SE')} kr (${forecastData.yoyGrowthRate >= 0 ? '+' : ''}${forecastData.yoyGrowthRate}%)`}
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      {isFi ? `${forecastData.daysElapsed} päivää kulunut` : `${forecastData.daysElapsed} dagar gått`}
                    </p>
                  )}
                </div>

                {/* Target comparison */}
                <div className="pt-3 border-t border-border/30">
                  <div className="flex items-center justify-between text-sm mb-2">
                    <span className="text-muted-foreground">{isFi ? 'Tavoite' : 'Mål'}</span>
                    <span className="text-foreground font-medium">
                      {Math.round(revenueGoal.target_value || 0).toLocaleString('sv-SE')} SEK
                    </span>
                  </div>
                  <div className="h-2 bg-background-subtle rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        forecastData.onTrack
                          ? 'bg-gradient-to-r from-emerald-500 to-emerald-400'
                          : 'bg-gradient-to-r from-amber-500 to-amber-400'
                      }`}
                      style={{ width: `${Math.min((forecastData.forecast / revenueGoal.target_value) * 100, 100)}%` }}
                    />
                  </div>
                  <p className={`text-xs mt-2 text-right ${forecastData.onTrack ? 'text-emerald-500' : 'text-amber-500'}`}>
                    {isFi
                      ? `Ennuste ${Math.round((forecastData.forecast / revenueGoal.target_value) * 100)}% tavoitteesta`
                      : `Prognos ${Math.round((forecastData.forecast / revenueGoal.target_value) * 100)}% av målet`}
                  </p>
                </div>
              </div>
            </section>
          )}

          {/* Action Recommendations - Full component with tracking */}
          <ActionRecommendationsCard onAskEmma={openEmmaWithQuestion} />
        </div>
      </main>

      {/* Floating Emma FAB */}
      <button
        onClick={() => setIsEmmaChatOpen(true)}
        className="fixed bottom-6 right-6 z-40 p-4 bg-gradient-to-r from-violet-500 to-violet-600
                   hover:from-violet-600 hover:to-violet-700 text-white rounded-full
                   shadow-lg shadow-violet-500/30 transition-all hover:scale-105
                   flex items-center gap-2"
        title={isFi ? 'Kysy Emmalta' : 'Fråga Emma'}
      >
        <MessageCircle className="h-6 w-6" />
        <Sparkles className="h-4 w-4 absolute -top-1 -right-1 text-amber-300" />
      </button>
    </div>
  )
}

/**
 * WeekHighlightCard - Shows week's winner or needs attention metric
 */
function WeekHighlightCard({ type, demandGrowth, trafficQuality, salesEfficiency, productLeverage, isFi }) {
  // Collect all metrics with their YoY changes
  const allMetrics = []

  // Metric labels in Finnish and Swedish
  const metricLabels = {
    organicClicks: { fi: 'Orgaaniset klikkaukset', sv: 'Organiska klick' },
    impressions: { fi: 'Näyttökerrat', sv: 'Visningar' },
    top10Keywords: { fi: 'Top 10 -avainsanat', sv: 'Top 10-nyckelord' },
    engagementRate: { fi: 'Sitoutumisaste', sv: 'Engagemangsgrad' },
    organicShare: { fi: 'Orgaaninen osuus', sv: 'Organisk andel' },
    bounceRate: { fi: 'Poistumisprosentti', sv: 'Avvisningsfrekvens' },
    conversionRate: { fi: 'Konversio', sv: 'Konvertering' },
    aov: { fi: 'Keskiostos', sv: 'Genomsnittsorder' },
    orderCount: { fi: 'Tilaukset', sv: 'Beställningar' },
    revenue: { fi: 'Liikevaihto', sv: 'Omsättning' },
    uniqueCustomers: { fi: 'Uniikkiasiakkaat', sv: 'Unika kunder' },
    avgPosition: { fi: 'Keskisijoitus', sv: 'Genomsnittsposition' },
    avgCTR: { fi: 'Keskimääräinen CTR', sv: 'Genomsnittlig CTR' },
    top10Pages: { fi: 'Top 10 -sivut', sv: 'Top 10-sidor' }
  }

  // Minimum threshold for significant change (avoid noise)
  const MIN_CHANGE_THRESHOLD = 5 // At least ±5% to be considered significant

  // Helper to add metrics from a KPI area
  const addMetrics = (area, areaName) => {
    if (!area?.metrics) return
    Object.entries(area.metrics).forEach(([key, metric]) => {
      // Only include metrics with significant changes (above threshold)
      if (metric && typeof metric.yoyChange === 'number' && Math.abs(metric.yoyChange) >= MIN_CHANGE_THRESHOLD) {
        // For bounce rate, lower is better (invert the logic)
        const effectiveChange = key === 'bounceRate' ? -metric.yoyChange : metric.yoyChange
        allMetrics.push({
          key,
          area: areaName,
          label: metricLabels[key]?.[isFi ? 'fi' : 'sv'] || key,
          yoyChange: metric.yoyChange,
          effectiveChange, // Used for sorting (positive = good)
          current: metric.current,
          previous: metric.previous
        })
      }
    })
  }

  addMetrics(demandGrowth, isFi ? 'Kysyntä' : 'Efterfrågan')
  addMetrics(trafficQuality, isFi ? 'Liikenne' : 'Trafik')
  addMetrics(salesEfficiency, isFi ? 'Myynti' : 'Försäljning')
  addMetrics(productLeverage, isFi ? 'Tuotteet' : 'Produkter')

  // Sort by effective change
  const sorted = [...allMetrics].sort((a, b) => b.effectiveChange - a.effectiveChange)

  // Get winner (highest positive) or attention (lowest/most negative)
  const highlight = type === 'winner'
    ? sorted.find(m => m.effectiveChange > 0) // Best positive change
    : sorted.reverse().find(m => m.effectiveChange < 0) // Worst negative change

  if (!highlight) {
    return (
      <div className={`rounded-xl p-5 border ${
        type === 'winner'
          ? 'bg-emerald-500/5 border-emerald-500/20'
          : 'bg-amber-500/5 border-amber-500/20'
      }`}>
        <div className="flex items-center gap-2 mb-2">
          <span className="text-lg">{type === 'winner' ? '🏆' : '⚠️'}</span>
          <p className="text-sm font-medium text-muted-foreground">
            {type === 'winner'
              ? (isFi ? 'Viikon voittaja' : 'Veckans vinnare')
              : (isFi ? 'Vaatii huomiota' : 'Kräver uppmärksamhet')}
          </p>
        </div>
        <p className="text-muted-foreground text-sm">
          {isFi ? 'Ei merkittäviä muutoksia' : 'Inga betydande förändringar'}
        </p>
      </div>
    )
  }

  const isPositive = highlight.yoyChange > 0
  const changeText = `${isPositive ? '+' : ''}${Math.round(highlight.yoyChange)}%`

  return (
    <div className={`rounded-xl p-5 border ${
      type === 'winner'
        ? 'bg-emerald-500/5 border-emerald-500/20'
        : 'bg-amber-500/5 border-amber-500/20'
    }`}>
      <div className="flex items-center gap-2 mb-3">
        <span className="text-lg">{type === 'winner' ? '🏆' : '⚠️'}</span>
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          {type === 'winner'
            ? (isFi ? 'Viikon voittaja' : 'Veckans vinnare')
            : (isFi ? 'Vaatii huomiota' : 'Kräver uppmärksamhet')}
        </p>
      </div>

      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-lg font-semibold text-foreground">
            {highlight.label}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {highlight.area}
          </p>
        </div>
        <div className={`text-2xl font-bold ${
          type === 'winner' ? 'text-emerald-500' : 'text-amber-500'
        }`}>
          {changeText}
        </div>
      </div>
    </div>
  )
}

export default InsightsPage

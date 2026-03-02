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
  const { storeId, ready, currencySymbol } = useCurrentShop()
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

  // --- Fiscal Year helpers ---
  const getFY = (date) => {
    const y = date.getFullYear(), m = date.getMonth() + 1
    const fy = m >= 3 ? y : y - 1
    const start = new Date(fy, 2, 1)
    const endY = fy + 1
    const isLeap = new Date(endY, 1, 29).getMonth() === 1
    const end = new Date(endY, 1, isLeap ? 29 : 28)
    const prevStart = new Date(fy - 1, 2, 1)
    const prevIsLeap = new Date(fy, 1, 29).getMonth() === 1
    const prevEnd = new Date(fy, 1, prevIsLeap ? 29 : 28)
    const label = `03/${fy}–02/${endY}`
    const prevLabel = `03/${fy - 1}–02/${fy}`
    return { start, end, prevStart, prevEnd, label, prevLabel, fy }
  }
  const fmtD = (d) => d.toISOString().split('T')[0]
  const nowDate = new Date()
  const fy = getFY(nowDate)
  const fyDaysElapsed = Math.floor((nowDate - fy.start) / (1000 * 60 * 60 * 24)) + 1
  const fyTotalDays = Math.floor((fy.end - fy.start) / (1000 * 60 * 60 * 24)) + 1

  // Fetch fiscal year revenue data from v_daily_sales
  const [ytdRevenue, setYtdRevenue] = useState(null)
  const [lastFYTotal, setLastFYTotal] = useState(null)
  const [lastFYSamePeriod, setLastFYSamePeriod] = useState(null)

  useEffect(() => {
    async function fetchRevenueData() {
      const today = fmtD(nowDate)

      // 1. Current FY YTD
      const { data: ytdData } = await supabase
        .from('v_daily_sales')
        .select('total_revenue')
        .eq('store_id', storeId)
        .gte('sale_date', fmtD(fy.start))
        .lte('sale_date', today)

      if (ytdData) {
        setYtdRevenue(ytdData.reduce((sum, d) => sum + (parseFloat(d.total_revenue) || 0), 0))
      }

      // 2. Previous FY — same number of days from start
      const prevSameDayEnd = new Date(fy.prevStart)
      prevSameDayEnd.setDate(prevSameDayEnd.getDate() + fyDaysElapsed - 1)

      const { data: prevPeriodData } = await supabase
        .from('v_daily_sales')
        .select('total_revenue')
        .eq('store_id', storeId)
        .gte('sale_date', fmtD(fy.prevStart))
        .lte('sale_date', fmtD(prevSameDayEnd))

      if (prevPeriodData) {
        setLastFYSamePeriod(prevPeriodData.reduce((sum, d) => sum + (parseFloat(d.total_revenue) || 0), 0))
      }

      // 3. Previous FY — full year total
      const { data: prevFullData } = await supabase
        .from('v_daily_sales')
        .select('total_revenue')
        .eq('store_id', storeId)
        .gte('sale_date', fmtD(fy.prevStart))
        .lte('sale_date', fmtD(fy.prevEnd))

      if (prevFullData) {
        setLastFYTotal(prevFullData.reduce((sum, d) => sum + (parseFloat(d.total_revenue) || 0), 0))
      }
    }
    if (!ready || !storeId) return
    fetchRevenueData()
  }, [storeId, ready])

  // Calculate YoY forecast (fiscal year based)
  const actualYTD = ytdRevenue ?? 0
  const canForecast = fyDaysElapsed >= 14 && lastFYSamePeriod > 0 && lastFYTotal > 0
  const yoyGrowthRate = canForecast ? actualYTD / lastFYSamePeriod : null
  const forecastValue = canForecast ? Math.round(lastFYTotal * yoyGrowthRate) : null
  const yoyChangePercent = canForecast ? Math.round((yoyGrowthRate - 1) * 100) : null

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
          {/* Fiscal Year Forecast Card */}
          <section className="bg-background-elevated border border-card-border rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-border/50 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-500/10 rounded-lg">
                  <TrendingUp className="h-5 w-5 text-blue-500" />
                </div>
                <div>
                  <h3 className="font-semibold text-foreground">{isFi ? 'Tilikausi' : 'Räkenskapsår'}</h3>
                  <p className="text-xs text-muted-foreground">{fy.label}</p>
                </div>
              </div>
              {canForecast && (
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                  fyDaysElapsed > fyTotalDays * 0.75 ? 'bg-emerald-500/10 text-emerald-500'
                  : fyDaysElapsed > fyTotalDays * 0.5 ? 'bg-amber-500/10 text-amber-500'
                  : 'bg-blue-500/10 text-blue-500'
                }`}>
                  {Math.round((fyDaysElapsed / fyTotalDays) * 100)}% {isFi ? 'kulunut' : 'förbi'}
                </span>
              )}
            </div>
            <div className="p-5 space-y-4">

              {/* Previous fiscal year — always show as anchor */}
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">{isFi ? 'Edellinen tilikausi' : 'Föregående räkenskapsår'}</p>
                  <p className="text-xs text-muted-foreground/70">{fy.prevLabel}</p>
                </div>
                <p className="text-lg font-semibold text-foreground">
                  {lastFYTotal !== null ? `${Math.round(lastFYTotal).toLocaleString('sv-SE')} ${currencySymbol}` : '—'}
                </p>
              </div>

              {/* YTD vs same period */}
              <div className="pt-3 border-t border-border/30 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">
                    YTD ({fyDaysElapsed} {isFi ? 'pv' : 'dagar'})
                  </span>
                  <span className="text-sm font-medium text-foreground">
                    {Math.round(actualYTD).toLocaleString('sv-SE')} {currencySymbol}
                  </span>
                </div>
                {lastFYSamePeriod !== null && lastFYSamePeriod > 0 && (
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>{isFi ? 'Ed. TK sama aika' : 'Föreg. RÅ samma tid'}</span>
                    <span>
                      {Math.round(lastFYSamePeriod).toLocaleString('sv-SE')} {currencySymbol}
                      {' '}
                      <span className={yoyChangePercent >= 0 ? 'text-emerald-500' : 'text-rose-500'}>
                        ({yoyChangePercent >= 0 ? '+' : ''}{yoyChangePercent}%)
                      </span>
                    </span>
                  </div>
                )}
              </div>

              {/* Forecast — only when enough data */}
              {canForecast ? (
                <div className="pt-3 border-t border-border/30">
                  <p className="text-xs text-muted-foreground mb-1">
                    {isFi ? 'Tilikauden ennuste (YoY)' : 'Räkenskapsårsprognos (YoY)'}
                  </p>
                  <p className="text-2xl font-bold text-foreground">
                    {forecastValue.toLocaleString('sv-SE')} {currencySymbol}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {isFi
                      ? `${Math.round(lastFYTotal).toLocaleString('sv-SE')} ${currencySymbol} × ${yoyChangePercent >= 0 ? '+' : ''}${yoyChangePercent}%`
                      : `${Math.round(lastFYTotal).toLocaleString('sv-SE')} ${currencySymbol} × ${yoyChangePercent >= 0 ? '+' : ''}${yoyChangePercent}%`}
                  </p>
                </div>
              ) : (
                <div className="pt-3 border-t border-border/30">
                  <p className="text-xs text-muted-foreground/70 italic">
                    {isFi
                      ? `Ennuste näytetään kun dataa on kertynyt ~14 päivää (nyt ${fyDaysElapsed} pv)`
                      : `Prognos visas när ~14 dagars data finns (nu ${fyDaysElapsed} dagar)`}
                  </p>
                </div>
              )}

              {/* Target — if goal exists */}
              {revenueGoal && (
                <div className="pt-3 border-t border-border/30">
                  <div className="flex items-center justify-between text-sm mb-2">
                    <span className="text-muted-foreground">{isFi ? 'Tavoite' : 'Mål'}</span>
                    <span className="text-foreground font-medium">
                      {Math.round(revenueGoal.target_value || 0).toLocaleString('sv-SE')} {currencySymbol}
                    </span>
                  </div>
                  <div className="h-2 bg-background-subtle rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        canForecast && forecastValue >= revenueGoal.target_value * 0.9
                          ? 'bg-gradient-to-r from-emerald-500 to-emerald-400'
                          : 'bg-gradient-to-r from-blue-500 to-blue-400'
                      }`}
                      style={{ width: `${Math.min(Math.round((actualYTD / revenueGoal.target_value) * 100), 100)}%` }}
                    />
                  </div>
                  {canForecast ? (
                    <p className={`text-xs mt-2 text-right ${
                      forecastValue >= revenueGoal.target_value * 0.9 ? 'text-emerald-500' : 'text-amber-500'
                    }`}>
                      {isFi
                        ? `Ennuste ${Math.round((forecastValue / revenueGoal.target_value) * 100)}% tavoitteesta`
                        : `Prognos ${Math.round((forecastValue / revenueGoal.target_value) * 100)}% av målet`}
                    </p>
                  ) : (
                    <p className="text-xs mt-2 text-right text-muted-foreground">
                      {Math.round((actualYTD / revenueGoal.target_value) * 100)}% {isFi ? 'tavoitteesta' : 'av målet'}
                    </p>
                  )}
                </div>
              )}
            </div>
          </section>

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

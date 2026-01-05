import { useState, useEffect } from 'react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  TrendingUp,
  TrendingDown,
  Minus,
  AlertTriangle,
  RefreshCw,
  BarChart3,
  Search,
  DollarSign,
  Target
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { calculateAllIndicators, getIndicatorSummary } from '@/lib/indicators'

// Store ID (will be dynamic later)
const STORE_ID = 'a28836f6-9487-4b67-9194-e907eaf94b69'

export function IndicatorsPage() {
  const [indicators, setIndicators] = useState([])
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  async function fetchAndCalculate() {
    setLoading(true)
    setError(null)

    try {
      // Calculate date ranges
      const now = new Date()
      const periodEnd = new Date(now)
      const periodStart = new Date(now)
      periodStart.setDate(periodStart.getDate() - 30)

      const comparisonEnd = new Date(periodStart)
      comparisonEnd.setDate(comparisonEnd.getDate() - 1)
      const comparisonStart = new Date(comparisonEnd)
      comparisonStart.setDate(comparisonStart.getDate() - 30)

      // Fetch orders (ePages MASTER)
      const { data: orders, error: ordersError } = await supabase
        .from('orders')
        .select('id, creation_date, grand_total, status, order_line_items(product_name, product_number, total_price)')
        .eq('store_id', STORE_ID)
        .neq('status', 'cancelled')
        .gte('creation_date', comparisonStart.toISOString())
        .order('creation_date', { ascending: false })

      if (ordersError) throw ordersError

      // Fetch GSC data
      const { data: gscData } = await supabase
        .from('gsc_search_analytics')
        .select('*')
        .eq('store_id', STORE_ID)
        .gte('date', periodStart.toISOString().split('T')[0])
        .lte('date', periodEnd.toISOString().split('T')[0])

      // Fetch previous GSC data
      const { data: previousGscData } = await supabase
        .from('gsc_search_analytics')
        .select('*')
        .eq('store_id', STORE_ID)
        .gte('date', comparisonStart.toISOString().split('T')[0])
        .lte('date', comparisonEnd.toISOString().split('T')[0])

      // Calculate indicators
      const calculatedIndicators = calculateAllIndicators({
        orders: orders || [],
        products: [],
        gscData: gscData || [],
        previousGscData: previousGscData || [],
        periodStart,
        periodEnd,
        comparisonStart,
        comparisonEnd,
        periodLabel: '30d'
      })

      setIndicators(calculatedIndicators)
      setSummary(getIndicatorSummary(calculatedIndicators))
    } catch (err) {
      console.error('Error calculating indicators:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchAndCalculate()
  }, [])

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-400 mx-auto mb-4"></div>
          <p className="text-slate-400">Beräknar indikatorer...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-950 p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Target className="w-6 h-6 text-cyan-400" />
            Analyser & Indikatorer
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Automatiska insikter baserade på din data
          </p>
        </div>
        <Button
          onClick={fetchAndCalculate}
          variant="outline"
          className="bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700"
        >
          <RefreshCw className="w-4 h-4 mr-2" />
          Uppdatera
        </Button>
      </div>

      {error && (
        <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-4 mb-6">
          <p className="text-red-400">Fel: {error}</p>
        </div>
      )}

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <SummaryCard
            title="Indikatorer"
            value={summary.total}
            icon={BarChart3}
            color="cyan"
          />
          <SummaryCard
            title="Försäljning"
            value={summary.by_category.sales || 0}
            icon={DollarSign}
            color="green"
          />
          <SummaryCard
            title="SEO"
            value={summary.by_category.seo || 0}
            icon={Search}
            color="purple"
          />
          <SummaryCard
            title="Varningar"
            value={summary.alerts.length}
            icon={AlertTriangle}
            color={summary.alerts.length > 0 ? 'red' : 'slate'}
          />
        </div>
      )}

      {/* Alerts */}
      {summary?.alerts.length > 0 && (
        <div className="mb-8">
          <h2 className="text-lg font-semibold text-white mb-4">Aktiva varningar</h2>
          <div className="space-y-2">
            {summary.alerts.map((alert, i) => (
              <div
                key={i}
                className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4 flex items-center gap-3"
              >
                <AlertTriangle className="w-5 h-5 text-yellow-400 flex-shrink-0" />
                <div>
                  <p className="text-white font-medium">{alert.indicator_name}</p>
                  <p className="text-slate-400 text-sm">{alert.message}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Indicator Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {indicators.map(indicator => (
          <IndicatorCard key={indicator.id} indicator={indicator} />
        ))}
      </div>

      {indicators.length === 0 && !loading && (
        <div className="text-center py-12">
          <Target className="w-12 h-12 text-slate-600 mx-auto mb-4" />
          <p className="text-slate-400">
            Inga indikatorer kunde beräknas. Kontrollera att du har data.
          </p>
        </div>
      )}
    </div>
  )
}

function SummaryCard({ title, value, icon: Icon, color }) {
  const colorClasses = {
    cyan: 'text-cyan-400 bg-cyan-500/20',
    green: 'text-green-400 bg-green-500/20',
    purple: 'text-purple-400 bg-purple-500/20',
    red: 'text-red-400 bg-red-500/20',
    slate: 'text-slate-400 bg-slate-500/20'
  }

  return (
    <Card className="bg-slate-800/50 border-slate-700">
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-slate-400">{title}</p>
            <p className="text-2xl font-bold text-white">{value}</p>
          </div>
          <div className={`p-3 rounded-lg ${colorClasses[color]}`}>
            <Icon className="w-6 h-6" />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function IndicatorCard({ indicator }) {
  const DirectionIcon = indicator.direction === 'up' ? TrendingUp
    : indicator.direction === 'down' ? TrendingDown
    : Minus

  const directionColor = indicator.direction === 'up' ? 'text-green-400'
    : indicator.direction === 'down' ? 'text-red-400'
    : 'text-slate-400'

  const priorityColors = {
    critical: 'bg-red-500/20 text-red-400 border-red-500/50',
    high: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50',
    medium: 'bg-blue-500/20 text-blue-400 border-blue-500/50',
    low: 'bg-slate-500/20 text-slate-400 border-slate-500/50'
  }

  const categoryIcons = {
    sales: DollarSign,
    seo: Search,
    combined: Target
  }

  const CategoryIcon = categoryIcons[indicator.category] || BarChart3

  return (
    <Card className="bg-slate-800/50 border-slate-700">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CategoryIcon className="w-5 h-5 text-slate-400" />
            <CardTitle className="text-white text-lg">{indicator.name}</CardTitle>
          </div>
          <span className={`px-2 py-1 rounded text-xs border ${priorityColors[indicator.priority]}`}>
            {indicator.priority}
          </span>
        </div>
      </CardHeader>
      <CardContent>
        {/* Main value */}
        <div className="flex items-baseline gap-3 mb-4">
          <span className="text-3xl font-bold text-white">
            {typeof indicator.value === 'number'
              ? indicator.value.toLocaleString('sv-SE')
              : indicator.value}
          </span>
          {indicator.unit && (
            <span className="text-slate-400">{indicator.unit}</span>
          )}

          {indicator.change_percent !== null && (
            <div className={`flex items-center gap-1 ${directionColor}`}>
              <DirectionIcon className="w-4 h-4" />
              <span className="text-sm font-medium">
                {indicator.change_percent > 0 ? '+' : ''}{indicator.change_percent}%
              </span>
            </div>
          )}
        </div>

        {/* Metrics */}
        {indicator.metrics && (
          <div className="grid grid-cols-2 gap-3 text-sm">
            {Object.entries(indicator.metrics)
              .filter(([key]) => !key.includes('significant') && !key.includes('distribution'))
              .slice(0, 4)
              .map(([key, value]) => (
                <div key={key} className="bg-slate-900/50 rounded p-2">
                  <p className="text-slate-500 text-xs">
                    {formatMetricLabel(key)}
                  </p>
                  <p className="text-white font-medium">
                    {typeof value === 'number' ? value.toLocaleString('sv-SE') : value}
                  </p>
                </div>
              ))}
          </div>
        )}

        {/* Alerts for this indicator */}
        {indicator.alerts?.length > 0 && (
          <div className="mt-4 space-y-2">
            {indicator.alerts.map((alert, i) => (
              <div
                key={i}
                className={`p-2 rounded text-sm ${
                  alert.severity === 'critical'
                    ? 'bg-red-500/20 text-red-300'
                    : 'bg-yellow-500/20 text-yellow-300'
                }`}
              >
                {alert.details}
              </div>
            ))}
          </div>
        )}

        {/* Confidence & freshness */}
        <div className="mt-4 flex items-center justify-between text-xs text-slate-500">
          <span>Konfidens: {indicator.confidence}</span>
          <span>{indicator.data_freshness}</span>
        </div>
      </CardContent>
    </Card>
  )
}

function formatMetricLabel(key) {
  const labels = {
    current_revenue: 'Nuvarande intäkt',
    previous_revenue: 'Föregående intäkt',
    revenue_change_percent: 'Intäktförändring',
    current_orders: 'Ordrar',
    previous_orders: 'Föreg. ordrar',
    orders_change_percent: 'Orderförändring',
    daily_average: 'Snitt/dag',
    current_aov: 'Nuvarande AOV',
    previous_aov: 'Föregående AOV',
    median_order_value: 'Median ordervärde',
    improved_queries: 'Förbättrade',
    declined_queries: 'Försämrade',
    total_clicks: 'Totala klick',
    total_orders: 'Totala ordrar',
    overall_conversion_rate: 'Konversionsgrad',
    revenue_per_click: 'Intäkt/klick'
  }
  return labels[key] || key.replace(/_/g, ' ')
}

export default IndicatorsPage

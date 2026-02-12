import { useInventory } from '@/hooks/useInventory'
import { useKPIDashboard } from '@/hooks/useKPIDashboard'
import { useTranslation } from '@/lib/i18n'
import { MetricCard, MetricCardGroup } from '@/components/MetricCard'
import { Button } from '@/components/ui/button'
import {
  Package,
  AlertTriangle,
  RefreshCw,
  Loader2,
  Warehouse,
  Clock,
  ShoppingCart,
  Archive,
  BarChart3,
  TrendingUp,
  FolderOpen,
  PackageX,
  ClipboardList,
  Info
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, LineChart, Line, XAxis, YAxis, CartesianGrid } from 'recharts'
import { useState } from 'react'
import { exportToCSV, INVENTORY_COLUMNS } from '@/lib/csvExport'
import { Download } from 'lucide-react'

// Format currency (SEK for Swedish store)
function formatCurrency(value, currency = 'SEK') {
  return new Intl.NumberFormat('sv-SE', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(value)
}

// Format number
function formatNumber(value) {
  return new Intl.NumberFormat('fi-FI').format(value)
}

// Colors for charts - Billackering brand palette
const COLORS = {
  A: '#00b4e9', // brand blue - best performers
  B: '#2dd4bf', // teal - good performers
  C: '#64748b', // slate - other
  categories: ['#00b4e9', '#2dd4bf', '#fded12', '#d82c32', '#8b5cf6', '#f472b6', '#06b6d4', '#84cc16']
}

// Time range options
const TIME_RANGES = [
  { value: 7, label: '7 pv' },
  { value: 14, label: '14 pv' },
  { value: 30, label: '30 pv' },
  { value: 90, label: '90 pv' }
]

/**
 * InfoTooltip - Inline (i) icon with hover tooltip
 */
function InfoTooltip({ text }) {
  const [show, setShow] = useState(false)
  return (
    <span className="relative inline-flex items-center ml-1">
      <Info
        className="w-3.5 h-3.5 text-foreground-muted cursor-help"
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
      />
      {show && (
        <span className="absolute left-5 top-0 z-[9999] w-56 p-2 text-xs bg-background-elevated border border-card-border rounded-lg shadow-lg text-foreground-muted whitespace-normal">
          {text}
        </span>
      )}
    </span>
  )
}

export function InventoryPage() {
  const { t } = useTranslation()
  const [stockHistoryRange, setStockHistoryRange] = useState(14)
  const {
    summary,
    reorderAlerts,
    slowMovers,
    topSellersAtRisk,
    stockHistory,
    abcAnalysis,
    turnoverMetrics,
    categoryBreakdown,
    stockoutHistory,
    orderRecommendations,
    valueChanges,
    loading,
    error,
    refresh
  } = useInventory()

  // Get profitability data for products
  const {
    topDrivers,
    capitalTraps
  } = useKPIDashboard({ granularity: 'week' })

  if (loading) {
    return (
      <div className="min-h-screen bg-background-dark flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto mb-4" />
          <p className="text-foreground-muted">{t('common.loading')}</p>
        </div>
      </div>
    )
  }

  // Prepare ABC data for pie chart
  const abcPieData = [
    { name: 'A', value: abcAnalysis.A.stockValue, count: abcAnalysis.A.count, revenue: abcAnalysis.A.revenue },
    { name: 'B', value: abcAnalysis.B.stockValue, count: abcAnalysis.B.count, revenue: abcAnalysis.B.revenue },
    { name: 'C', value: abcAnalysis.C.stockValue, count: abcAnalysis.C.count, revenue: abcAnalysis.C.revenue }
  ].filter(d => d.value > 0)

  // Prepare category data for pie chart
  const categoryPieData = categoryBreakdown.slice(0, 6).map((cat, i) => ({
    name: cat.name,
    value: cat.stockValue,
    color: COLORS.categories[i % COLORS.categories.length]
  }))

  return (
    <div className="min-h-screen bg-background-dark">
      <main className="container mx-auto px-4 py-6 max-w-7xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Warehouse className="w-6 h-6 text-primary" />
            <div>
              <h1 className="text-xl font-bold text-foreground">{t('inventory.title')}</h1>
              <p className="text-sm text-foreground-muted">{t('inventory.subtitle')}</p>
            </div>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={refresh}
            disabled={loading}
            className="gap-2"
          >
            <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
            {t('common.refresh')}
          </Button>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-destructive/10 border border-destructive/30 rounded-xl">
            <p className="text-destructive text-sm">{error}</p>
          </div>
        )}

        {/* KPI Cards */}
        <MetricCardGroup className="mb-8">
          <MetricCard
            label={t('inventory.totalValue')}
            value={summary.totalValue}
            suffix="kr"
            subValue={t('inventory.atCostPrice')}
          />
          <MetricCard
            label={<span className="inline-flex items-center">{t('inventory.productsInStock')}<InfoTooltip text={t('inventory.stockTrackingInfo')} /></span>}
            value={summary.productsInStock}
            subValue={`${formatNumber(summary.totalProducts)} ${t('inventory.totalProducts')}`}
          />
          <MetricCard
            label={t('inventory.lowStock')}
            value={summary.lowStockCount}
            subValue={t('inventory.needsReorder')}
          />
          <MetricCard
            label={t('inventory.outOfStock')}
            value={summary.outOfStockCount}
            subValue={t('inventory.withDemand')}
          />
        </MetricCardGroup>

        {/* Value Changes Card */}
        <div className="bg-background-elevated rounded-xl border border-card-border p-4 mb-8">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-semibold text-foreground">{t('inventory.valueChanges')}</h2>
          </div>
          <p className="text-xs text-foreground-muted mb-4">{t('inventory.valueChangesDesc')}</p>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {[
              { key: 'day1', label: '1 pv' },
              { key: 'day7', label: '7 pv' },
              { key: 'day30', label: '30 pv' },
              { key: 'day90', label: '90 pv' },
              { key: 'day180', label: '180 pv' },
              { key: 'day360', label: '360 pv' }
            ].map(({ key, label }) => {
              const data = valueChanges[key]
              const hasData = data?.value !== null && data?.value !== 0
              const isPositive = data?.changePercent > 0
              const isNegative = data?.changePercent < 0

              return (
                <div
                  key={key}
                  className={cn(
                    'p-3 rounded-xl border text-center',
                    hasData && isPositive && 'bg-success/10 border-success/30',
                    hasData && isNegative && 'bg-destructive/10 border-destructive/30',
                    hasData && !isPositive && !isNegative && 'bg-background-subtle border-border',
                    !hasData && 'bg-background-subtle border-border opacity-50'
                  )}
                >
                  <div className="text-xs text-foreground-muted mb-1">{label}</div>
                  {hasData ? (
                    <>
                      <div className={cn(
                        'text-lg font-bold',
                        isPositive && 'text-success',
                        isNegative && 'text-destructive',
                        !isPositive && !isNegative && 'text-foreground'
                      )}>
                        {isPositive && '+'}{data.changePercent}%
                      </div>
                      <div className={cn(
                        'text-xs',
                        isPositive && 'text-success/80',
                        isNegative && 'text-destructive/80',
                        !isPositive && !isNegative && 'text-foreground-muted'
                      )}>
                        {isPositive && '+'}{formatCurrency(data.change)}
                      </div>
                    </>
                  ) : (
                    <div className="text-sm text-foreground-muted">—</div>
                  )}
                </div>
              )
            })}
          </div>

          {/* Current value reference */}
          <div className="mt-4 pt-4 border-t border-border flex items-center justify-between">
            <span className="text-sm text-foreground-muted">{t('inventory.currentValue')}</span>
            <span className="text-lg font-semibold text-primary">{formatCurrency(summary.totalValue)}</span>
          </div>
        </div>

        {/* Stock History Chart */}
        {stockHistory.length > 1 && (
          <div className="bg-background-elevated rounded-xl border border-card-border p-4 mb-8">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-primary" />
                <h2 className="text-lg font-semibold text-foreground">{t('inventory.stockTrend')}</h2>
              </div>
              {/* Time range selector */}
              <div className="flex gap-1">
                {TIME_RANGES.map(range => (
                  <button
                    key={range.value}
                    onClick={() => setStockHistoryRange(range.value)}
                    className={cn(
                      'px-3 py-1 text-xs font-medium rounded-md transition-colors',
                      stockHistoryRange === range.value
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-background-subtle text-foreground-muted hover:bg-background-subtle/80'
                    )}
                  >
                    {range.label}
                  </button>
                ))}
              </div>
            </div>
            <p className="text-xs text-foreground-muted mb-4">{t('inventory.stockTrendDesc')}</p>

            {/* Line Chart */}
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={stockHistory.slice(-stockHistoryRange)}
                  margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#2d3544" opacity={0.5} />
                  <XAxis
                    dataKey="date"
                    tick={{ fill: '#94a3b8', fontSize: 11 }}
                    tickFormatter={(value) => {
                      const d = new Date(value)
                      return `${d.getDate()}.${d.getMonth() + 1}`
                    }}
                  />
                  <YAxis
                    tick={{ fill: '#94a3b8', fontSize: 11 }}
                    tickFormatter={(value) => `${Math.round(value / 1000)}k`}
                    domain={[
                      (dataMin) => Math.floor(dataMin * 0.9 / 50000) * 50000,
                      (dataMax) => Math.ceil(dataMax * 1.05 / 50000) * 50000
                    ]}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#171c24',
                      border: '1px solid #2d3544',
                      borderRadius: '12px',
                      boxShadow: '0 10px 25px rgba(0,0,0,0.3)'
                    }}
                    labelStyle={{ color: '#fafafa', fontWeight: 500 }}
                    formatter={(value) => [formatCurrency(value), t('inventory.totalValue')]}
                    labelFormatter={(label) => {
                      const d = new Date(label)
                      return d.toLocaleDateString('fi-FI')
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="totalValue"
                    stroke="#00b4e9"
                    strokeWidth={2}
                    dot={{ fill: '#00b4e9', strokeWidth: 0, r: 3 }}
                    activeDot={{ r: 5, fill: '#00b4e9' }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* ABC Analysis + Category Breakdown */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* ABC Analysis */}
          <div className="bg-background-elevated rounded-xl border border-card-border p-4">
            <div className="flex items-center gap-2 mb-4">
              <BarChart3 className="w-5 h-5 text-primary" />
              <h2 className="text-lg font-semibold text-foreground">{t('inventory.abcAnalysis')}</h2>
            </div>
            <p className="text-xs text-foreground-muted mb-4">{t('inventory.abcAnalysisDesc')}</p>

            <div className="flex items-center gap-6">
              {/* Pie Chart */}
              <div className="w-32 h-32">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={abcPieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={25}
                      outerRadius={50}
                      dataKey="value"
                    >
                      {abcPieData.map((entry) => (
                        <Cell key={entry.name} fill={COLORS[entry.name]} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value) => formatCurrency(value)}
                      contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              {/* Legend */}
              <div className="flex-1 space-y-2">
                {['A', 'B', 'C'].map(cls => (
                  <div key={cls} className="flex items-center justify-between p-2 bg-background-subtle rounded">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded" style={{ backgroundColor: COLORS[cls] }} />
                      <span className="text-sm font-medium text-foreground">
                        {t(`inventory.abc${cls}`)}
                      </span>
                      <span className="text-xs text-foreground-muted">
                        ({abcAnalysis[cls].count} {t('inventory.products')})
                      </span>
                    </div>
                    <span className="text-sm font-semibold text-foreground">
                      {formatCurrency(abcAnalysis[cls].stockValue)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Category Breakdown */}
          <div className="bg-background-elevated rounded-xl border border-card-border p-4">
            <div className="flex items-center gap-2 mb-4">
              <FolderOpen className="w-5 h-5 text-primary" />
              <h2 className="text-lg font-semibold text-foreground">{t('inventory.categoryBreakdown')}</h2>
            </div>
            <p className="text-xs text-foreground-muted mb-4">{t('inventory.categoryBreakdownDesc')}</p>

            {categoryBreakdown.length > 0 ? (
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {categoryBreakdown.map((cat, i) => {
                  const maxValue = categoryBreakdown[0]?.stockValue || 1
                  const percentage = (cat.stockValue / maxValue) * 100

                  return (
                    <div key={cat.name} className="flex items-center gap-3">
                      <div className="w-3 h-3 rounded" style={{ backgroundColor: COLORS.categories[i % COLORS.categories.length] }} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm text-foreground truncate">{cat.name}</span>
                          <span className="text-sm font-medium text-foreground ml-2">{formatCurrency(cat.stockValue)}</span>
                        </div>
                        <div className="h-1.5 bg-background-subtle rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{ width: `${percentage}%`, backgroundColor: COLORS.categories[i % COLORS.categories.length] }}
                          />
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="py-8 text-center">
                <FolderOpen className="w-10 h-10 text-foreground-muted mx-auto mb-2 opacity-50" />
                <p className="text-sm text-foreground-muted">{t('inventory.noCategories')}</p>
              </div>
            )}
          </div>
        </div>

        {/* Turnover Rate (Full Width) */}
        <div className="bg-background-elevated rounded-xl border border-card-border p-4 mb-8">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-semibold text-foreground">{t('inventory.turnoverRate')}</h2>
          </div>
          <p className="text-xs text-foreground-muted mb-4">{t('inventory.turnoverRateDesc')}</p>

          {/* Average + Grid Layout */}
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
            {/* Average Turnover - Larger */}
            <div className="p-4 bg-background-subtle rounded-xl text-center">
              <div className="text-3xl font-bold text-foreground">{turnoverMetrics.avgTurnover}x</div>
              <div className="text-xs text-foreground-muted">{t('inventory.avgTurnoverYear')}</div>
            </div>

            {/* Fast Products */}
            <div className="p-3 bg-success/5 border border-success/20 rounded-xl">
              <h3 className="text-sm font-medium text-success mb-2">{t('inventory.fastestProducts')}</h3>
              <div className="space-y-1">
                {turnoverMetrics.fastMovers?.slice(0, 5).map((p, i) => (
                  <div key={p.id || i} className="flex items-center justify-between text-xs">
                    <span className="text-foreground-muted truncate flex-1 pr-2">{p.name}</span>
                    <span className="text-success font-medium">{p.turnoverRate}x</span>
                  </div>
                ))}
                {(!turnoverMetrics.fastMovers || turnoverMetrics.fastMovers.length === 0) && (
                  <span className="text-xs text-foreground-muted">—</span>
                )}
              </div>
            </div>

            {/* Slow Products */}
            <div className="p-3 bg-destructive/5 border border-destructive/20 rounded-xl">
              <h3 className="text-sm font-medium text-destructive mb-2">{t('inventory.slowestProducts')}</h3>
              <div className="space-y-1">
                {turnoverMetrics.slowTurnover?.slice(0, 5).map((p, i) => (
                  <div key={p.id || i} className="flex items-center justify-between text-xs">
                    <span className="text-foreground-muted truncate flex-1 pr-2">{p.name}</span>
                    <span className="text-destructive font-medium">{p.turnoverRate}x</span>
                  </div>
                ))}
                {(!turnoverMetrics.slowTurnover || turnoverMetrics.slowTurnover.length === 0) && (
                  <span className="text-xs text-foreground-muted">—</span>
                )}
              </div>
            </div>

            {/* Fast Categories */}
            <div className="p-3 bg-success/5 border border-success/20 rounded-xl">
              <h3 className="text-sm font-medium text-success mb-2">{t('inventory.fastestCategories')}</h3>
              <div className="space-y-1">
                {turnoverMetrics.fastCategories?.slice(0, 5).map((c, i) => (
                  <div key={c.name || i} className="flex items-center justify-between text-xs">
                    <span className="text-foreground-muted truncate flex-1 pr-2">{c.name}</span>
                    <span className="text-success font-medium">{c.turnoverRate}x</span>
                  </div>
                ))}
                {(!turnoverMetrics.fastCategories || turnoverMetrics.fastCategories.length === 0) && (
                  <span className="text-xs text-foreground-muted">—</span>
                )}
              </div>
            </div>

            {/* Slow Categories */}
            <div className="p-3 bg-destructive/5 border border-destructive/20 rounded-xl">
              <h3 className="text-sm font-medium text-destructive mb-2">{t('inventory.slowestCategories')}</h3>
              <div className="space-y-1">
                {turnoverMetrics.slowCategories?.slice(0, 5).map((c, i) => (
                  <div key={c.name || i} className="flex items-center justify-between text-xs">
                    <span className="text-foreground-muted truncate flex-1 pr-2">{c.name}</span>
                    <span className="text-destructive font-medium">{c.turnoverRate}x</span>
                  </div>
                ))}
                {(!turnoverMetrics.slowCategories || turnoverMetrics.slowCategories.length === 0) && (
                  <span className="text-xs text-foreground-muted">—</span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Order Recommendations */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">

          {/* Order Recommendations */}
          <div className="bg-background-elevated rounded-xl border border-card-border p-4">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <ClipboardList className="w-5 h-5 text-primary" />
                <h2 className="text-lg font-semibold text-foreground">{t('inventory.orderRecommendations')}</h2>
                <InfoTooltip text={t('inventory.orderTrackingInfo')} />
              </div>
              {orderRecommendations.length > 0 && (
                <button
                  onClick={() => exportToCSV(orderRecommendations, INVENTORY_COLUMNS.orderRecommendations, 'tilaussuositukset')}
                  className="flex items-center gap-1 text-xs text-foreground-muted hover:text-primary transition-colors"
                  title="Lataa CSV"
                >
                  <Download className="w-4 h-4" />
                  CSV
                </button>
              )}
            </div>
            <p className="text-xs text-foreground-muted mb-4">{t('inventory.orderRecommendationsDesc')}</p>

            {orderRecommendations.length > 0 ? (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {orderRecommendations.slice(0, 10).map((p, i) => (
                  <div
                    key={p.id || i}
                    className={cn(
                      'p-2 rounded-md border',
                      p.urgency === 'critical' && 'bg-destructive/10 border-destructive/30',
                      p.urgency === 'high' && 'bg-warning/10 border-warning/30',
                      p.urgency === 'medium' && 'bg-primary/5 border-primary/30'
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{p.name}</p>
                        <p className="text-xs text-foreground-muted">{p.product_number}</p>
                      </div>
                      <div className="text-right">
                        <p className={cn(
                          'text-sm font-semibold',
                          p.urgency === 'critical' && 'text-destructive',
                          p.urgency === 'high' && 'text-warning',
                          p.urgency === 'medium' && 'text-primary'
                        )}>
                          +{p.orderQty} {t('inventory.pcs')}
                        </p>
                        <p className="text-xs text-foreground-muted">{formatCurrency(p.orderValue)}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-foreground-muted">
                      <span>{t('inventory.current')}: {p.stock_level}</span>
                      <span>{t('inventory.optimal')}: {p.optimalStock}</span>
                      <span>{t('inventory.daysLeft')}: {p.daysUntilStockout}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-8 text-center">
                <ClipboardList className="w-10 h-10 text-success mx-auto mb-2 opacity-50" />
                <p className="text-sm text-foreground-muted">{t('inventory.noOrdersNeeded')}</p>
              </div>
            )}

            {orderRecommendations.length > 0 && (
              <div className="mt-4 pt-4 border-t border-border">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-foreground-muted">{t('inventory.totalOrderValue')}</span>
                  <span className="text-lg font-semibold text-primary">
                    {formatCurrency(orderRecommendations.reduce((sum, p) => sum + p.orderValue, 0))}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Stockout History */}
          <div className="bg-background-elevated rounded-xl border border-card-border p-4">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <PackageX className="w-5 h-5 text-destructive" />
                <h2 className="text-lg font-semibold text-foreground">{t('inventory.stockoutHistory')}</h2>
                <InfoTooltip text={t('inventory.stockoutTrackingInfo')} />
              </div>
              {stockoutHistory.length > 0 && (
                <button
                  onClick={() => exportToCSV(stockoutHistory, INVENTORY_COLUMNS.stockoutHistory, 'loppu_varastosta')}
                  className="flex items-center gap-1 text-xs text-foreground-muted hover:text-primary transition-colors"
                  title="Lataa CSV"
                >
                  <Download className="w-4 h-4" />
                  CSV
                </button>
              )}
            </div>
            <p className="text-xs text-foreground-muted mb-4">{t('inventory.stockoutHistoryDesc')}</p>

            {stockoutHistory.length > 0 ? (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {stockoutHistory.map((p, i) => (
                  <div key={p.id || i} className="p-2 rounded-md border bg-destructive/5 border-destructive/20">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{p.name}</p>
                        <p className="text-xs text-foreground-muted">{p.product_number}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold text-destructive">
                          {t('inventory.outOfStock')}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-foreground-muted">
                      <span>{t('inventory.sales30d')}: {p.salesLast30Days}</span>
                      <span className="text-destructive">{t('inventory.lostSales')}: ~{formatCurrency(p.estimatedLostSales)}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-8 text-center">
                <Package className="w-10 h-10 text-success mx-auto mb-2 opacity-50" />
                <p className="text-sm text-foreground-muted">{t('inventory.noStockouts')}</p>
              </div>
            )}

            {stockoutHistory.length > 0 && (
              <div className="mt-4 pt-4 border-t border-border">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-foreground-muted">{t('inventory.estimatedLostTotal')}</span>
                  <span className="text-lg font-semibold text-destructive">
                    {formatCurrency(stockoutHistory.reduce((sum, p) => sum + p.estimatedLostSales, 0))}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Alert Section - Reorder Alerts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* Reorder Alerts */}
          <div className="bg-background-elevated rounded-xl border border-card-border p-4">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-warning" />
                <h2 className="text-lg font-semibold text-foreground">{t('inventory.reorderAlerts')}</h2>
              </div>
              {reorderAlerts.length > 0 && (
                <button
                  onClick={() => exportToCSV(reorderAlerts, INVENTORY_COLUMNS.reorderAlerts, 'taydennyshälytykset')}
                  className="flex items-center gap-1 text-xs text-foreground-muted hover:text-primary transition-colors"
                  title="Lataa CSV"
                >
                  <Download className="w-4 h-4" />
                  CSV
                </button>
              )}
            </div>
            <p className="text-xs text-foreground-muted mb-4">{t('inventory.reorderAlertsDesc')}</p>

            {reorderAlerts.length > 0 ? (
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {reorderAlerts.map((product, i) => (
                  <div
                    key={product.id || i}
                    className={cn(
                      'p-3 rounded-md border',
                      product.daysUntilStockout <= 7
                        ? 'bg-destructive/10 border-destructive/30'
                        : 'bg-warning/10 border-warning/30'
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate" title={product.name}>
                          {product.name}
                        </p>
                        <p className="text-xs text-foreground-muted">{product.product_number}</p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className={cn(
                          'text-sm font-semibold',
                          product.daysUntilStockout <= 7 ? 'text-destructive' : 'text-warning'
                        )}>
                          {product.daysUntilStockout === 0
                            ? t('inventory.outOfStockNow')
                            : `${product.daysUntilStockout} ${t('inventory.daysLeft')}`}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 mt-2 text-xs text-foreground-muted">
                      <span>{t('inventory.stock')}: {product.stock_level}</span>
                      <span>{t('inventory.sales30d')}: {product.salesLast30Days}</span>
                      <span>{t('inventory.velocity')}: {product.dailyVelocity}/pv</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-8 text-center">
                <Package className="w-10 h-10 text-success mx-auto mb-2 opacity-50" />
                <p className="text-sm text-foreground-muted">{t('inventory.noAlerts')}</p>
              </div>
            )}
          </div>

          {/* Top Sellers at Risk */}
          <div className="bg-background-elevated rounded-xl border border-card-border p-4">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <ShoppingCart className="w-5 h-5 text-primary" />
                <h2 className="text-lg font-semibold text-foreground">{t('inventory.topSellersAtRisk')}</h2>
              </div>
              {topSellersAtRisk.length > 0 && (
                <button
                  onClick={() => exportToCSV(topSellersAtRisk, INVENTORY_COLUMNS.topSellersAtRisk, 'hittituotteet_riskissa')}
                  className="flex items-center gap-1 text-xs text-foreground-muted hover:text-primary transition-colors"
                  title="Lataa CSV"
                >
                  <Download className="w-4 h-4" />
                  CSV
                </button>
              )}
            </div>
            <p className="text-xs text-foreground-muted mb-4">{t('inventory.topSellersAtRiskDesc')}</p>

            {topSellersAtRisk.length > 0 ? (
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {topSellersAtRisk.map((product, i) => (
                  <div
                    key={product.id || i}
                    className="p-3 rounded-md border bg-primary/5 border-primary/30"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate" title={product.name}>
                          {product.name}
                        </p>
                        <p className="text-xs text-foreground-muted">{product.product_number}</p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-sm font-semibold text-primary">
                          {product.salesLast30Days} {t('inventory.soldIn30d')}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 mt-2 text-xs text-foreground-muted">
                      <span className={cn(
                        product.daysUntilStockout <= 14 && 'text-warning font-medium'
                      )}>
                        {t('inventory.stock')}: {product.stock_level}
                      </span>
                      <span>{t('inventory.runoutIn')}: {product.daysUntilStockout} pv</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-8 text-center">
                <ShoppingCart className="w-10 h-10 text-foreground-muted mx-auto mb-2 opacity-50" />
                <p className="text-sm text-foreground-muted">{t('inventory.noTopSellersAtRisk')}</p>
              </div>
            )}
          </div>
        </div>

        {/* Slow Movers / Capital Traps */}
        <div className="bg-background-elevated rounded-xl border border-card-border p-4 mb-8">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Archive className="w-5 h-5 text-foreground-muted" />
              <h2 className="text-lg font-semibold text-foreground">{t('inventory.slowMovers')}</h2>
              <span className="text-sm text-foreground-muted">— {t('inventory.slowMoversSubtitle')}</span>
            </div>
            {slowMovers.length > 0 && (
              <button
                onClick={() => exportToCSV(slowMovers, INVENTORY_COLUMNS.slowMovers, 'hitaasti_liikkuvat')}
                className="flex items-center gap-1 text-xs text-foreground-muted hover:text-primary transition-colors"
                title="Lataa CSV"
              >
                <Download className="w-4 h-4" />
                CSV
              </button>
            )}
          </div>
          <p className="text-xs text-foreground-muted mb-4">{t('inventory.slowMoversDesc')}</p>

          {slowMovers.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {slowMovers.map((product, i) => (
                <div
                  key={product.id || i}
                  className="p-3 rounded-md border bg-background-subtle border-border"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate" title={product.name}>
                        {product.name}
                      </p>
                      <p className="text-xs text-foreground-muted">{product.product_number}</p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-xs text-foreground-muted">
                      {t('inventory.stock')}: {product.stock_level}
                    </span>
                    <span className="text-sm font-semibold text-warning">
                      {formatCurrency(product.stockValue)}
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-foreground-muted">
                    {t('inventory.sales30d')}: {product.salesLast30Days}
                    {product.salesLast30Days === 0 && (
                      <span className="text-destructive ml-1">({t('inventory.noSales')})</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-8 text-center">
              <Archive className="w-10 h-10 text-success mx-auto mb-2 opacity-50" />
              <p className="text-sm text-foreground-muted">{t('inventory.noSlowMovers')}</p>
            </div>
          )}

          {slowMovers.length > 0 && (
            <div className="mt-4 pt-4 border-t border-border">
              <div className="flex items-center justify-between text-sm">
                <span className="text-foreground-muted">{t('inventory.totalCapitalTied')}</span>
                <span className="text-lg font-semibold text-warning">
                  {formatCurrency(slowMovers.reduce((sum, p) => sum + p.stockValue, 0))}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Top Profit Drivers + Capital Traps */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* Menestystuotteet / Top Profit Drivers */}
          <ProductsCard
            title={t('kpi.products.topDrivers')}
            subtitle={t('kpi.products.topDriversDesc')}
            products={topDrivers}
            type="drivers"
            t={t}
          />

          {/* Pääomaloukut / Capital Traps */}
          <ProductsCard
            title={t('kpi.products.capitalTraps')}
            subtitle={t('kpi.products.capitalTrapsDesc')}
            products={capitalTraps}
            type="traps"
            t={t}
          />
        </div>

      </main>
    </div>
  )
}

/**
 * Products Card - Shows top drivers or capital traps
 */
function ProductsCard({ title, subtitle, products, type, t }) {
  if (!products || products.length === 0) {
    return (
      <div className="bg-background-elevated border border-card-border rounded-lg p-6">
        <h3 className="text-lg font-semibold text-foreground mb-1">{title}</h3>
        <p className="text-foreground-subtle text-sm mb-4">{subtitle}</p>
        <p className="text-foreground-subtle text-sm">{t('kpi.products.noData')}</p>
      </div>
    )
  }

  // Format stock days for display
  const formatStockDays = (days) => {
    if (days >= 999) return t('kpi.products.noSales')
    if (days >= 365) return `${Math.round(days / 365)} ${t('kpi.products.years')}`
    if (days >= 90) return `${Math.round(days / 30)} ${t('kpi.products.months')}`
    return `${Math.round(days)} ${t('kpi.products.days')}`
  }

  return (
    <div className="bg-background-elevated border border-card-border rounded-lg p-6">
      <h3 className="text-lg font-semibold text-foreground mb-1">{title}</h3>
      <p className="text-foreground-subtle text-sm mb-4">{subtitle}</p>

      <div className="space-y-2">
        {products.slice(0, 10).map((product, i) => (
          <div key={product.product_id || i} className="flex items-center gap-3">
            <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold ${
              type === 'drivers' ? 'bg-success-muted text-success' : 'bg-destructive-muted text-destructive'
            }`}>
              {i + 1}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-foreground text-sm truncate">
                {product.products?.name || product.product_name || 'N/A'}
              </p>
              <p className="text-foreground-subtle text-xs">
                {product.products?.product_number || product.sku || ''}
              </p>
            </div>
            <div className="text-right">
              {type === 'drivers' ? (
                <p className="text-success text-sm font-medium tabular-nums">
                  {product.total_score?.toFixed(0) ?? '—'}/100
                </p>
              ) : (
                <p className="text-destructive text-sm font-medium tabular-nums">
                  {formatStockDays(product.stock_days)}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default InventoryPage

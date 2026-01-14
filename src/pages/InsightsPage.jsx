import { useState } from 'react'
import { TrendingUp, Lightbulb, Target, Package, Truck, CreditCard, Eye, ShoppingCart, AlertTriangle, Sparkles, BarChart3, RefreshCw } from 'lucide-react'
import { useTranslation } from '@/lib/i18n'
import { useCategoryMargin } from '@/hooks/useCategoryMargin'
import { useShippingPaymentAnalysis } from '@/hooks/useShippingPaymentAnalysis'
import { useBrowseAnalysis } from '@/hooks/useBrowseAnalysis'
import { DateRangePicker, getDateRange, formatDateISO } from '@/components/DateRangePicker'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export function InsightsPage() {
  const { t, language } = useTranslation()
  const [activeTab, setActiveTab] = useState('category')
  const [dateRange, setDateRange] = useState(() => {
    const range = getDateRange('last30')
    return {
      preset: 'last30',
      startDate: formatDateISO(range.startDate),
      endDate: formatDateISO(range.endDate)
    }
  })

  const categoryMargin = useCategoryMargin(dateRange)
  const shippingPayment = useShippingPaymentAnalysis(dateRange)
  const browseAnalysis = useBrowseAnalysis(dateRange)

  const formatCurrency = (value) => {
    return Math.round(value).toLocaleString(language === 'fi' ? 'fi-FI' : 'sv-SE')
  }

  const formatPercent = (value) => {
    return value.toFixed(1)
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-background-elevated/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="px-4 sm:px-6 lg:px-8 py-4 sm:py-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex-shrink-0">
              <h1 className="text-lg sm:text-xl lg:text-2xl font-semibold text-foreground flex items-center gap-2">
                <TrendingUp className="w-5 h-5 sm:w-6 sm:h-6 text-primary flex-shrink-0" />
                {t('nav.insights')}
              </h1>
              <p className="text-foreground-muted text-xs sm:text-sm mt-1 hidden sm:block">
                {t('insights.subtitle')}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
              <DateRangePicker
                value={dateRange.preset}
                onChange={setDateRange}
              />
              <Button
                onClick={() => {
                  categoryMargin.refresh()
                  shippingPayment.refresh()
                  browseAnalysis.refresh()
                }}
                variant="outline"
                size="sm"
                className="bg-background-elevated border-border text-foreground-muted hover:bg-background-subtle hover:text-foreground p-2"
              >
                <RefreshCw className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              </Button>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 mt-4 overflow-x-auto">
            <button
              onClick={() => setActiveTab('category')}
              className={cn(
                'px-4 py-2 text-sm font-medium rounded-t-lg transition-colors whitespace-nowrap flex items-center gap-2',
                activeTab === 'category'
                  ? 'bg-background text-foreground border-t border-l border-r border-border'
                  : 'text-foreground-muted hover:text-foreground hover:bg-background-subtle'
              )}
            >
              <Package className="w-4 h-4" />
              {t('insights.tabs.category')}
            </button>
            <button
              onClick={() => setActiveTab('shipping')}
              className={cn(
                'px-4 py-2 text-sm font-medium rounded-t-lg transition-colors whitespace-nowrap flex items-center gap-2',
                activeTab === 'shipping'
                  ? 'bg-background text-foreground border-t border-l border-r border-border'
                  : 'text-foreground-muted hover:text-foreground hover:bg-background-subtle'
              )}
            >
              <Truck className="w-4 h-4" />
              {t('insights.tabs.shipping')}
            </button>
            <button
              onClick={() => setActiveTab('browse')}
              className={cn(
                'px-4 py-2 text-sm font-medium rounded-t-lg transition-colors whitespace-nowrap flex items-center gap-2',
                activeTab === 'browse'
                  ? 'bg-background text-foreground border-t border-l border-r border-border'
                  : 'text-foreground-muted hover:text-foreground hover:bg-background-subtle'
              )}
            >
              <Eye className="w-4 h-4" />
              {t('insights.tabs.browse')}
            </button>
          </div>
        </div>
      </header>

      <main className="px-4 sm:px-6 lg:px-8 py-6 sm:py-8 max-w-7xl mx-auto">
        {/* Category Margin Tab */}
        {activeTab === 'category' && (
          <CategoryMarginView data={categoryMargin} formatCurrency={formatCurrency} formatPercent={formatPercent} t={t} />
        )}

        {/* Shipping & Payment Tab */}
        {activeTab === 'shipping' && (
          <ShippingPaymentView data={shippingPayment} formatCurrency={formatCurrency} formatPercent={formatPercent} t={t} />
        )}

        {/* Browse Analysis Tab */}
        {activeTab === 'browse' && (
          <BrowseAnalysisView data={browseAnalysis} formatCurrency={formatCurrency} formatPercent={formatPercent} t={t} />
        )}
      </main>
    </div>
  )
}

// Category Margin View Component
function CategoryMarginView({ data, formatCurrency, formatPercent, t }) {
  if (data.loading) {
    return <LoadingState message={t('insights.loading.category')} />
  }

  if (data.error) {
    return <ErrorState message={data.error} />
  }

  const { categoryMargins, totalMargin, topCategories, bottomCategories } = data

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard
          icon={<BarChart3 className="w-5 h-5" />}
          label={t('insights.category.totalSales')}
          value={`${formatCurrency(totalMargin.revenue)} kr`}
        />
        <SummaryCard
          icon={<TrendingUp className="w-5 h-5" />}
          label={t('insights.category.totalMargin')}
          value={`${formatPercent(totalMargin.percent)}%`}
          subValue={`${formatCurrency(totalMargin.profit)} kr`}
        />
        <SummaryCard
          icon={<Package className="w-5 h-5" />}
          label={t('insights.category.categoriesCount')}
          value={categoryMargins.length}
        />
        <SummaryCard
          icon={<Target className="w-5 h-5" />}
          label={t('insights.category.bestMargin')}
          value={topCategories[0] ? `${formatPercent(topCategories[0].marginPercent)}%` : '—'}
          subValue={topCategories[0]?.category}
        />
      </div>

      {/* Top 10 Categories by Margin */}
      <div className="bg-background-elevated rounded-lg border border-border overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <h3 className="text-lg font-medium text-foreground flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-green-400" />
            {t('insights.category.topMargins')}
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-background-subtle">
              <tr>
                <th className="text-left px-4 py-3 text-sm font-medium text-foreground-muted">{t('insights.category.category')}</th>
                <th className="text-right px-4 py-3 text-sm font-medium text-foreground-muted">{t('insights.category.sales')}</th>
                <th className="text-right px-4 py-3 text-sm font-medium text-foreground-muted">{t('insights.category.cost')}</th>
                <th className="text-right px-4 py-3 text-sm font-medium text-foreground-muted">{t('insights.category.profit')}</th>
                <th className="text-right px-4 py-3 text-sm font-medium text-foreground-muted">{t('insights.category.marginPercent')}</th>
                <th className="text-right px-4 py-3 text-sm font-medium text-foreground-muted">{t('insights.category.products')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {topCategories.map((cat) => (
                <tr key={cat.category} className="hover:bg-background-subtle/50">
                  <td className="px-4 py-3">
                    <span className="text-foreground font-medium">{cat.category}</span>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-foreground">
                    {formatCurrency(cat.revenue)} kr
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-foreground-muted">
                    {formatCurrency(cat.cost)} kr
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    <span className={cat.profit >= 0 ? 'text-green-400' : 'text-red-400'}>
                      {formatCurrency(cat.profit)} kr
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <MarginBadge value={cat.marginPercent} />
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-foreground-muted">
                    {cat.productCount}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Bottom 10 Categories by Margin */}
      <div className="bg-background-elevated rounded-lg border border-border overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <h3 className="text-lg font-medium text-foreground flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-orange-400" />
            {t('insights.category.bottomMargins')}
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-background-subtle">
              <tr>
                <th className="text-left px-4 py-3 text-sm font-medium text-foreground-muted">{t('insights.category.category')}</th>
                <th className="text-right px-4 py-3 text-sm font-medium text-foreground-muted">{t('insights.category.sales')}</th>
                <th className="text-right px-4 py-3 text-sm font-medium text-foreground-muted">{t('insights.category.cost')}</th>
                <th className="text-right px-4 py-3 text-sm font-medium text-foreground-muted">{t('insights.category.profit')}</th>
                <th className="text-right px-4 py-3 text-sm font-medium text-foreground-muted">{t('insights.category.marginPercent')}</th>
                <th className="text-right px-4 py-3 text-sm font-medium text-foreground-muted">{t('insights.category.products')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {bottomCategories.map((cat) => (
                <tr key={cat.category} className="hover:bg-background-subtle/50">
                  <td className="px-4 py-3">
                    <span className="text-foreground font-medium">{cat.category}</span>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-foreground">
                    {formatCurrency(cat.revenue)} kr
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-foreground-muted">
                    {formatCurrency(cat.cost)} kr
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    <span className={cat.profit >= 0 ? 'text-green-400' : 'text-red-400'}>
                      {formatCurrency(cat.profit)} kr
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <MarginBadge value={cat.marginPercent} />
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-foreground-muted">
                    {cat.productCount}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// Shipping & Payment View Component
function ShippingPaymentView({ data, formatCurrency, formatPercent, t }) {
  if (data.loading) {
    return <LoadingState message={t('insights.loading.shipping')} />
  }

  if (data.error) {
    return <ErrorState message={data.error} />
  }

  const { shippingSummary, paymentSummary, crossAnalysis, insights } = data

  return (
    <div className="space-y-6">
      {/* Insights Cards */}
      {insights.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {insights.map((insight, i) => (
            <div key={i} className="bg-primary/10 border border-primary/30 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <Lightbulb className="w-4 h-4 text-primary" />
                <span className="text-sm font-medium text-primary">{insight.title}</span>
              </div>
              <p className="text-foreground text-sm">{insight.message}</p>
            </div>
          ))}
        </div>
      )}

      {/* Shipping Summary */}
      <div className="bg-background-elevated rounded-lg border border-border overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <h3 className="text-lg font-medium text-foreground flex items-center gap-2">
            <Truck className="w-5 h-5 text-primary" />
            {t('insights.shipping.title')}
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-background-subtle">
              <tr>
                <th className="text-left px-4 py-3 text-sm font-medium text-foreground-muted">{t('insights.shipping.method')}</th>
                <th className="text-right px-4 py-3 text-sm font-medium text-foreground-muted">{t('insights.shipping.orders')}</th>
                <th className="text-right px-4 py-3 text-sm font-medium text-foreground-muted">{t('insights.shipping.share')}</th>
                <th className="text-right px-4 py-3 text-sm font-medium text-foreground-muted">{t('insights.shipping.avgOrder')}</th>
                <th className="text-right px-4 py-3 text-sm font-medium text-foreground-muted">{t('insights.shipping.minMax')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {shippingSummary.map((s) => (
                <tr key={s.method} className="hover:bg-background-subtle/50">
                  <td className="px-4 py-3 text-foreground font-medium">{s.method}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-foreground">{s.count}</td>
                  <td className="px-4 py-3 text-right">
                    <span className="px-2 py-1 bg-primary/20 rounded text-sm text-primary">
                      {formatPercent(s.percentage)}%
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-foreground">{formatCurrency(s.avgValue)} €</td>
                  <td className="px-4 py-3 text-right tabular-nums text-foreground-muted text-sm">
                    {formatCurrency(s.minValue)} - {formatCurrency(s.maxValue)} €
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Payment Summary */}
      <div className="bg-background-elevated rounded-lg border border-border overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <h3 className="text-lg font-medium text-foreground flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-primary" />
            {t('insights.payment.title')}
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-background-subtle">
              <tr>
                <th className="text-left px-4 py-3 text-sm font-medium text-foreground-muted">{t('insights.payment.method')}</th>
                <th className="text-right px-4 py-3 text-sm font-medium text-foreground-muted">{t('insights.payment.orders')}</th>
                <th className="text-right px-4 py-3 text-sm font-medium text-foreground-muted">{t('insights.payment.share')}</th>
                <th className="text-right px-4 py-3 text-sm font-medium text-foreground-muted">{t('insights.payment.avgOrder')}</th>
                <th className="text-right px-4 py-3 text-sm font-medium text-foreground-muted">{t('insights.payment.minMax')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {paymentSummary.map((p) => (
                <tr key={p.method} className="hover:bg-background-subtle/50">
                  <td className="px-4 py-3 text-foreground font-medium">{p.method}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-foreground">{p.count}</td>
                  <td className="px-4 py-3 text-right">
                    <span className="px-2 py-1 bg-primary/20 rounded text-sm text-primary">
                      {formatPercent(p.percentage)}%
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-foreground">{formatCurrency(p.avgValue)} €</td>
                  <td className="px-4 py-3 text-right tabular-nums text-foreground-muted text-sm">
                    {formatCurrency(p.minValue)} - {formatCurrency(p.maxValue)} €
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Cross Analysis */}
      <div className="bg-background-elevated rounded-lg border border-border overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <h3 className="text-lg font-medium text-foreground flex items-center gap-2">
            <Target className="w-5 h-5 text-primary" />
            {t('insights.cross.title')}
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-background-subtle">
              <tr>
                <th className="text-left px-4 py-3 text-sm font-medium text-foreground-muted">{t('insights.cross.shipping')}</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-foreground-muted">{t('insights.cross.payment')}</th>
                <th className="text-right px-4 py-3 text-sm font-medium text-foreground-muted">{t('insights.cross.count')}</th>
                <th className="text-right px-4 py-3 text-sm font-medium text-foreground-muted">{t('insights.cross.share')}</th>
                <th className="text-right px-4 py-3 text-sm font-medium text-foreground-muted">{t('insights.cross.avgOrder')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {crossAnalysis.slice(0, 10).map((c, i) => (
                <tr key={i} className="hover:bg-background-subtle/50">
                  <td className="px-4 py-3 text-foreground">{c.shipping}</td>
                  <td className="px-4 py-3 text-foreground">{c.payment}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-foreground">{c.count}</td>
                  <td className="px-4 py-3 text-right">
                    <span className="px-2 py-1 bg-background-subtle rounded text-sm text-foreground-muted">
                      {formatPercent(c.percentage)}%
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-foreground">{formatCurrency(c.avgValue)} €</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// Browse Analysis View Component
function BrowseAnalysisView({ data, formatCurrency, formatPercent, t }) {
  if (data.loading) {
    return <LoadingState message={t('insights.loading.browse')} />
  }

  if (data.error) {
    return <ErrorState message={data.error} />
  }

  const { opportunityProducts, hiddenGems, funnelSummary, categoryConversions, recommendations } = data

  if (!funnelSummary) {
    return (
      <div className="bg-background-elevated rounded-lg border border-border p-8 text-center">
        <Eye className="w-12 h-12 text-foreground-muted mx-auto mb-4" />
        <h3 className="text-lg font-medium text-foreground mb-2">{t('insights.browse.noData')}</h3>
        <p className="text-foreground-muted">{t('insights.browse.noDataDesc')}</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Funnel Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        <SummaryCard
          icon={<Eye className="w-5 h-5" />}
          label={t('insights.browse.views')}
          value={formatCurrency(funnelSummary.totalViews)}
        />
        <SummaryCard
          icon={<ShoppingCart className="w-5 h-5" />}
          label={t('insights.browse.addedToCart')}
          value={formatCurrency(funnelSummary.totalAddedToCart)}
          subValue={`${formatPercent(funnelSummary.viewToCartRate)}%`}
        />
        <SummaryCard
          icon={<Package className="w-5 h-5" />}
          label={t('insights.browse.purchased')}
          value={formatCurrency(funnelSummary.totalPurchased)}
          subValue={`${formatPercent(funnelSummary.cartToPurchaseRate)}%`}
        />
        <SummaryCard
          icon={<Target className="w-5 h-5" />}
          label={t('insights.browse.overallConversion')}
          value={`${formatPercent(funnelSummary.overallConversion)}%`}
        />
        <SummaryCard
          icon={<TrendingUp className="w-5 h-5" />}
          label={t('insights.browse.sales')}
          value={`${formatCurrency(funnelSummary.totalRevenue)} €`}
        />
        <SummaryCard
          icon={<BarChart3 className="w-5 h-5" />}
          label={t('insights.browse.avgRevenuePerPurchase')}
          value={`${formatCurrency(funnelSummary.avgRevenuePerPurchase)} €`}
        />
      </div>

      {/* Recommendations */}
      {recommendations.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {recommendations.map((rec, i) => (
            <div
              key={i}
              className={cn(
                'rounded-lg border p-4',
                rec.priority === 'high' ? 'bg-orange-500/10 border-orange-500/30' :
                rec.priority === 'medium' ? 'bg-primary/10 border-primary/30' :
                'bg-background-subtle border-border'
              )}
            >
              <div className="flex items-center gap-2 mb-2">
                <Sparkles className={cn(
                  'w-4 h-4',
                  rec.priority === 'high' ? 'text-orange-400' :
                  rec.priority === 'medium' ? 'text-primary' :
                  'text-foreground-muted'
                )} />
                <span className={cn(
                  'text-sm font-medium',
                  rec.priority === 'high' ? 'text-orange-400' :
                  rec.priority === 'medium' ? 'text-primary' :
                  'text-foreground'
                )}>{rec.title}</span>
              </div>
              <p className="text-foreground text-sm mb-2">{rec.suggestion}</p>
              {rec.products && (
                <div className="flex flex-wrap gap-1">
                  {rec.products.map((p, j) => (
                    <span key={j} className="px-2 py-0.5 bg-background-elevated rounded text-xs text-foreground-muted">
                      {p}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Opportunity Products */}
      {opportunityProducts.length > 0 && (
        <div className="bg-background-elevated rounded-lg border border-border overflow-hidden">
          <div className="px-4 py-3 border-b border-border">
            <h3 className="text-lg font-medium text-foreground flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-orange-400" />
              {t('insights.browse.opportunities')}
            </h3>
            <p className="text-sm text-foreground-muted">{t('insights.browse.opportunitiesDesc')}</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-background-subtle">
                <tr>
                  <th className="text-left px-4 py-3 text-sm font-medium text-foreground-muted">{t('insights.browse.product')}</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-foreground-muted">{t('insights.browse.category')}</th>
                  <th className="text-right px-4 py-3 text-sm font-medium text-foreground-muted">{t('insights.browse.views')}</th>
                  <th className="text-right px-4 py-3 text-sm font-medium text-foreground-muted">{t('insights.browse.inCart')}</th>
                  <th className="text-right px-4 py-3 text-sm font-medium text-foreground-muted">{t('insights.browse.purchased')}</th>
                  <th className="text-right px-4 py-3 text-sm font-medium text-foreground-muted">{t('insights.browse.conversion')}</th>
                  <th className="text-right px-4 py-3 text-sm font-medium text-foreground-muted">{t('insights.browse.lostPotential')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {opportunityProducts.map((p, i) => (
                  <tr key={i} className="hover:bg-background-subtle/50">
                    <td className="px-4 py-3 text-foreground font-medium max-w-xs truncate">{p.name}</td>
                    <td className="px-4 py-3 text-foreground-muted text-sm">{p.category}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-foreground">{p.views}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-foreground-muted">{p.addedToCart}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-foreground-muted">{p.purchased}</td>
                    <td className="px-4 py-3 text-right">
                      <span className="px-2 py-1 bg-red-500/20 rounded text-sm text-red-400">
                        {formatPercent(p.overallConversion)}%
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-orange-400">
                      ~{p.lostPotential} {t('insights.browse.pcs')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Hidden Gems */}
      {hiddenGems.length > 0 && (
        <div className="bg-background-elevated rounded-lg border border-border overflow-hidden">
          <div className="px-4 py-3 border-b border-border">
            <h3 className="text-lg font-medium text-foreground flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-green-400" />
              {t('insights.browse.hiddenGems')}
            </h3>
            <p className="text-sm text-foreground-muted">{t('insights.browse.hiddenGemsDesc')}</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-background-subtle">
                <tr>
                  <th className="text-left px-4 py-3 text-sm font-medium text-foreground-muted">{t('insights.browse.product')}</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-foreground-muted">{t('insights.browse.category')}</th>
                  <th className="text-right px-4 py-3 text-sm font-medium text-foreground-muted">{t('insights.browse.views')}</th>
                  <th className="text-right px-4 py-3 text-sm font-medium text-foreground-muted">{t('insights.browse.purchased')}</th>
                  <th className="text-right px-4 py-3 text-sm font-medium text-foreground-muted">{t('insights.browse.conversion')}</th>
                  <th className="text-right px-4 py-3 text-sm font-medium text-foreground-muted">{t('insights.browse.revenue')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {hiddenGems.map((p, i) => (
                  <tr key={i} className="hover:bg-background-subtle/50">
                    <td className="px-4 py-3 text-foreground font-medium max-w-xs truncate">{p.name}</td>
                    <td className="px-4 py-3 text-foreground-muted text-sm">{p.category}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-foreground">{p.views}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-foreground">{p.purchased}</td>
                    <td className="px-4 py-3 text-right">
                      <span className="px-2 py-1 bg-green-500/20 rounded text-sm text-green-400">
                        {formatPercent(p.overallConversion)}%
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-foreground">{formatCurrency(p.revenue)} €</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Category Conversions */}
      <div className="bg-background-elevated rounded-lg border border-border overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <h3 className="text-lg font-medium text-foreground flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-primary" />
            {t('insights.browse.categoryConversions')}
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-background-subtle">
              <tr>
                <th className="text-left px-4 py-3 text-sm font-medium text-foreground-muted">{t('insights.browse.category')}</th>
                <th className="text-right px-4 py-3 text-sm font-medium text-foreground-muted">{t('insights.browse.views')}</th>
                <th className="text-right px-4 py-3 text-sm font-medium text-foreground-muted">{t('insights.browse.viewToCart')}</th>
                <th className="text-right px-4 py-3 text-sm font-medium text-foreground-muted">{t('insights.browse.cartToPurchase')}</th>
                <th className="text-right px-4 py-3 text-sm font-medium text-foreground-muted">{t('insights.browse.totalConversion')}</th>
                <th className="text-right px-4 py-3 text-sm font-medium text-foreground-muted">{t('insights.browse.revenue')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {categoryConversions.slice(0, 15).map((c, i) => (
                <tr key={i} className="hover:bg-background-subtle/50">
                  <td className="px-4 py-3 text-foreground font-medium">{c.category}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-foreground">{c.views}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-foreground-muted">
                    {formatPercent(c.viewToCartRate)}%
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-foreground-muted">
                    {formatPercent(c.cartToPurchaseRate)}%
                  </td>
                  <td className="px-4 py-3 text-right">
                    <ConversionBadge value={c.overallConversion} />
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-foreground">{formatCurrency(c.revenue)} €</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// Helper Components
function SummaryCard({ icon, label, value, subValue }) {
  return (
    <div className="bg-background-elevated rounded-lg border border-border p-4">
      <div className="flex items-center gap-2 mb-2 text-foreground-muted">
        {icon}
        <span className="text-sm">{label}</span>
      </div>
      <div className="text-2xl font-bold text-foreground">{value}</div>
      {subValue && <div className="text-sm text-foreground-muted mt-1">{subValue}</div>}
    </div>
  )
}

function MarginBadge({ value }) {
  const color = value >= 50 ? 'bg-green-500/20 text-green-400' :
                value >= 30 ? 'bg-primary/20 text-primary' :
                value >= 15 ? 'bg-orange-500/20 text-orange-400' :
                'bg-red-500/20 text-red-400'

  return (
    <span className={cn('px-2 py-1 rounded text-sm tabular-nums', color)}>
      {value.toFixed(1)}%
    </span>
  )
}

function ConversionBadge({ value }) {
  const color = value >= 5 ? 'bg-green-500/20 text-green-400' :
                value >= 2 ? 'bg-primary/20 text-primary' :
                value >= 1 ? 'bg-orange-500/20 text-orange-400' :
                'bg-red-500/20 text-red-400'

  return (
    <span className={cn('px-2 py-1 rounded text-sm tabular-nums', color)}>
      {value.toFixed(2)}%
    </span>
  )
}

function LoadingState({ message }) {
  return (
    <div className="flex items-center justify-center py-12">
      <div className="text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
        <p className="text-foreground-muted">{message}</p>
      </div>
    </div>
  )
}

function ErrorState({ message }) {
  return (
    <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 text-center">
      <AlertTriangle className="w-8 h-8 text-red-400 mx-auto mb-2" />
      <p className="text-red-400">{message}</p>
    </div>
  )
}

/**
 * BrowseAnalysisCard - Browse/funnel analysis for visitors page
 *
 * Shows product views, cart additions, and purchase funnel data.
 */

import { Eye, ShoppingCart, Package, Target, TrendingUp, BarChart3, AlertTriangle, Sparkles } from 'lucide-react'
import { useTranslation } from '@/lib/i18n'
import { useBrowseAnalysis } from '@/hooks/useBrowseAnalysis'
import { cn } from '@/lib/utils'
import { useCurrentShop } from '@/config/storeConfig'

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

/**
 * BrowseAnalysisCard - Full browse/funnel analysis card
 *
 * @param {object} props
 * @param {string} props.startDate - Start date (YYYY-MM-DD)
 * @param {string} props.endDate - End date (YYYY-MM-DD)
 * @param {string} props.className
 */
export function BrowseAnalysisCard({ startDate, endDate, className }) {
  const { t, language } = useTranslation()
  const { currencySymbol } = useCurrentShop()

  const dateRange = { startDate, endDate }
  const {
    opportunityProducts,
    hiddenGems,
    funnelSummary,
    categoryConversions,
    recommendations,
    loading,
    error
  } = useBrowseAnalysis(dateRange)

  const formatCurrency = (value) => {
    return Math.round(value).toLocaleString(language === 'fi' ? 'fi-FI' : 'sv-SE')
  }

  const formatPercent = (value) => {
    return value.toFixed(1)
  }

  if (loading) {
    return (
      <div className={cn('rounded-lg border border-card-border bg-background-elevated p-5', className)}>
        <LoadingState message={t('insights.loading.browse')} />
      </div>
    )
  }

  if (error) {
    return (
      <div className={cn('rounded-lg border border-destructive/30 bg-background-elevated p-5', className)}>
        <ErrorState message={error} />
      </div>
    )
  }

  if (!funnelSummary) {
    return (
      <div className={cn('bg-background-elevated rounded-lg border border-border p-8 text-center', className)}>
        <Eye className="w-12 h-12 text-foreground-muted mx-auto mb-4" />
        <h3 className="text-lg font-medium text-foreground mb-2">{t('insights.browse.noData')}</h3>
        <p className="text-foreground-muted">{t('insights.browse.noDataDesc')}</p>
      </div>
    )
  }

  return (
    <div className={cn('space-y-6', className)}>
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
          value={`${formatCurrency(funnelSummary.totalRevenue)} ${currencySymbol}`}
        />
        <SummaryCard
          icon={<BarChart3 className="w-5 h-5" />}
          label={t('insights.browse.avgRevenuePerPurchase')}
          value={`${formatCurrency(funnelSummary.avgRevenuePerPurchase)} ${currencySymbol}`}
        />
      </div>

      {/* Recommendations */}
      {recommendations && recommendations.length > 0 && (
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
      {opportunityProducts && opportunityProducts.length > 0 && (
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
      {hiddenGems && hiddenGems.length > 0 && (
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
                    <td className="px-4 py-3 text-right tabular-nums text-foreground">{formatCurrency(p.revenue)} {currencySymbol}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Category Conversions */}
      {categoryConversions && categoryConversions.length > 0 && (
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
                    <td className="px-4 py-3 text-right tabular-nums text-foreground">{formatCurrency(c.revenue)} {currencySymbol}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

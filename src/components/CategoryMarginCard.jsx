/**
 * CategoryMarginCard - Product category margin analysis
 *
 * Shows top and bottom categories by margin percentage.
 */

import { AlertTriangle, Sparkles } from 'lucide-react'
import { useTranslation } from '@/lib/i18n'
import { useCategoryMargin } from '@/hooks/useCategoryMargin'
import { cn } from '@/lib/utils'

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
 * CategoryMarginCard - Full category margin analysis card
 *
 * @param {object} props
 * @param {string} props.startDate - Start date (YYYY-MM-DD)
 * @param {string} props.endDate - End date (YYYY-MM-DD)
 * @param {string} props.className
 */
export function CategoryMarginCard({ startDate, endDate, className }) {
  const { t, language } = useTranslation()

  const dateRange = { startDate, endDate }
  const { categoryMargins, totalMargin, topCategories, bottomCategories, loading, error } = useCategoryMargin(dateRange)

  const formatCurrency = (value) => {
    return Math.round(value).toLocaleString(language === 'fi' ? 'fi-FI' : 'sv-SE')
  }

  const formatPercent = (value) => {
    return value.toFixed(1)
  }

  if (loading) {
    return (
      <div className={cn('rounded-lg border border-card-border bg-background-elevated p-5', className)}>
        <LoadingState message={t('insights.loading.category')} />
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

  if (!totalMargin || categoryMargins.length === 0) {
    return null
  }

  return (
    <div className={cn('space-y-6', className)}>
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

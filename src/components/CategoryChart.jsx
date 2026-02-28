/**
 * CategoryChart - Displays category sales as a horizontal bar chart
 */

import { TrendingUp, TrendingDown, Minus, Package } from 'lucide-react'
import { useTranslation } from '@/lib/i18n'
import { useCurrentShop } from '@/config/storeConfig'

// Billackering brand-inspired color palette - primary first, then variations
const COLORS = [
  '#01a7da', // Billackering blue (primary)
  '#22c55e', // green (success)
  '#eee000', // Billackering yellow
  '#3b82f6', // blue
  '#8b5cf6', // purple
  '#14b8a6', // teal
  '#f59e0b', // amber
  '#ec4899', // pink
  '#84cc16', // lime
  '#f97316', // orange
]

export function CategoryChart({ categories, maxItems = 10, title }) {
  const { t, locale } = useTranslation()
  const { currency } = useCurrentShop()
  const displayTitle = title || t('charts.topCategories')

  const formatCurrency = (value) => {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value)
  }

  if (!categories || categories.length === 0) {
    return (
      <div className="bg-background-elevated rounded-lg border border-card-border p-5">
        <h3 className="text-base font-medium text-foreground mb-4 flex items-center gap-2">
          <Package className="w-5 h-5 text-primary" />
          {displayTitle}
        </h3>
        <p className="text-foreground-subtle text-center py-8">{t('common.loading')}</p>
      </div>
    )
  }

  // Get top categories and calculate max for scaling
  const topCategories = categories.slice(0, maxItems)
  const maxRevenue = Math.max(...topCategories.map(c => parseFloat(c.revenue || 0)))

  return (
    <div className="bg-background-elevated rounded-lg border border-card-border p-5">
      <h3 className="text-base font-medium text-foreground mb-4 flex items-center gap-2">
        <Package className="w-5 h-5 text-primary" />
        {displayTitle}
      </h3>

      <div className="space-y-3">
        {topCategories.map((cat, index) => {
          const revenue = parseFloat(cat.revenue || 0)
          const share = parseFloat(cat.revenue_share || 0)
          const trend = cat.trend_vs_previous
          const width = maxRevenue > 0 ? (revenue / maxRevenue) * 100 : 0

          return (
            <div key={cat.category + index}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm text-foreground truncate max-w-[180px]">
                  {cat.display_name || cat.category}
                </span>
                <div className="flex items-center gap-3">
                  {/* Trend indicator */}
                  {trend !== null && (
                    <span className={`flex items-center gap-1 text-xs tabular-nums ${
                      trend > 0 ? 'text-success' :
                      trend < 0 ? 'text-destructive' :
                      'text-foreground-subtle'
                    }`}>
                      {trend > 0 ? <TrendingUp className="w-3 h-3" /> :
                       trend < 0 ? <TrendingDown className="w-3 h-3" /> :
                       <Minus className="w-3 h-3" />}
                      {trend > 0 ? '+' : ''}{trend}%
                    </span>
                  )}
                  {/* Revenue share */}
                  <span className="text-xs text-foreground-subtle w-12 text-right tabular-nums">
                    {share}%
                  </span>
                  {/* Revenue amount */}
                  <span className="text-sm font-medium text-foreground w-20 text-right tabular-nums">
                    {formatCurrency(revenue)}
                  </span>
                </div>
              </div>
              {/* Bar */}
              <div className="h-1.5 bg-background-subtle rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${width}%`,
                    backgroundColor: COLORS[index % COLORS.length]
                  }}
                />
              </div>
            </div>
          )
        })}
      </div>

      {/* Summary footer */}
      {categories.length > maxItems && (
        <p className="text-xs text-foreground-subtle mt-4 text-center">
          +{categories.length - maxItems} {t('charts.moreCategories')}
        </p>
      )}
    </div>
  )
}

export default CategoryChart

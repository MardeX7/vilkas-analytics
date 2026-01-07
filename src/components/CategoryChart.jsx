/**
 * CategoryChart - Displays category sales as a horizontal bar chart
 */

import { TrendingUp, TrendingDown, Minus, Package } from 'lucide-react'

// Color palette for categories
const COLORS = [
  '#22c55e', // green
  '#3b82f6', // blue
  '#f59e0b', // amber
  '#ec4899', // pink
  '#8b5cf6', // purple
  '#06b6d4', // cyan
  '#ef4444', // red
  '#f97316', // orange
  '#84cc16', // lime
  '#14b8a6', // teal
]

function formatCurrency(value) {
  return new Intl.NumberFormat('sv-SE', {
    style: 'currency',
    currency: 'SEK',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(value)
}

export function CategoryChart({ categories, maxItems = 10, title = 'Kategorier' }) {
  if (!categories || categories.length === 0) {
    return (
      <div className="bg-slate-900 rounded-xl border border-slate-800 p-6">
        <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <Package className="w-5 h-5 text-cyan-400" />
          {title}
        </h3>
        <p className="text-slate-500 text-center py-8">Ingen kategoridata</p>
      </div>
    )
  }

  // Get top categories and calculate max for scaling
  const topCategories = categories.slice(0, maxItems)
  const maxRevenue = Math.max(...topCategories.map(c => parseFloat(c.revenue || 0)))

  return (
    <div className="bg-slate-900 rounded-xl border border-slate-800 p-6">
      <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
        <Package className="w-5 h-5 text-cyan-400" />
        {title}
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
                <span className="text-sm text-slate-300 truncate max-w-[180px]">
                  {cat.display_name || cat.category}
                </span>
                <div className="flex items-center gap-3">
                  {/* Trend indicator */}
                  {trend !== null && (
                    <span className={`flex items-center gap-1 text-xs ${
                      trend > 0 ? 'text-green-400' :
                      trend < 0 ? 'text-red-400' :
                      'text-slate-500'
                    }`}>
                      {trend > 0 ? <TrendingUp className="w-3 h-3" /> :
                       trend < 0 ? <TrendingDown className="w-3 h-3" /> :
                       <Minus className="w-3 h-3" />}
                      {trend > 0 ? '+' : ''}{trend}%
                    </span>
                  )}
                  {/* Revenue share */}
                  <span className="text-xs text-slate-500 w-12 text-right">
                    {share}%
                  </span>
                  {/* Revenue amount */}
                  <span className="text-sm font-medium text-white w-20 text-right">
                    {formatCurrency(revenue)}
                  </span>
                </div>
              </div>
              {/* Bar */}
              <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
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
        <p className="text-xs text-slate-500 mt-4 text-center">
          +{categories.length - maxItems} fler kategorier
        </p>
      )}
    </div>
  )
}

export default CategoryChart

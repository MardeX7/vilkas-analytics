import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { useTranslation } from '@/lib/i18n'
import { ShoppingCart } from 'lucide-react'
import { cn } from '@/lib/utils'

export function TopProducts({ products, previousProducts = [], compare = false, comparisonMode = 'yoy' }) {
  const { t, locale } = useTranslation()
  const maxRevenue = Math.max(...products.map(p => p.total_revenue || 0))

  // Build a map of previous products for quick lookup by product_number
  const prevProductMap = new Map()
  previousProducts.forEach(p => {
    const key = p.product_number || p.product_name
    prevProductMap.set(key, p)
  })

  // Calculate change percentage
  const getChange = (current, previous) => {
    if (!previous || previous === 0) return null
    return ((current - previous) / previous) * 100
  }

  // Render change indicator - inline after the number
  const ChangeIndicator = ({ change, suffix = '%' }) => {
    if (change === null || change === undefined) return null
    const isPositive = change > 0
    const isNegative = change < 0

    return (
      <span className={cn(
        'ml-1 text-[10px] tabular-nums whitespace-nowrap',
        isPositive && 'text-success',
        isNegative && 'text-destructive',
        !isPositive && !isNegative && 'text-foreground-subtle'
      )}>
        {isPositive ? '+' : ''}{change.toFixed(0)}{suffix}
      </span>
    )
  }

  return (
    <Card className="bg-background-elevated border-card-border">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-foreground text-base font-medium">{t('charts.topProducts')}</CardTitle>
          {compare && (
            <span className="text-xs text-foreground-subtle px-2 py-0.5 bg-background-subtle rounded">
              {comparisonMode.toUpperCase()}
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {products.slice(0, 10).map((product, index) => {
            const key = product.product_number || product.product_name
            const prevProduct = prevProductMap.get(key)
            const revenueChange = compare ? getChange(product.total_revenue, prevProduct?.total_revenue) : null
            const quantityChange = compare ? getChange(product.total_quantity, prevProduct?.total_quantity) : null
            const marginChange = compare ? getChange(product.gross_margin, prevProduct?.gross_margin) : null

            return (
              <div key={product.product_number || index} className="flex items-center gap-3">
                <span className="text-sm font-medium text-foreground-subtle w-6">{index + 1}.</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-foreground truncate" title={product.product_name}>
                    {product.product_name?.substring(0, 35)}
                    {product.product_name?.length > 35 && '...'}
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    <div className="flex-1 h-1.5 bg-background-subtle rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full"
                        style={{ width: `${(product.total_revenue / maxRevenue) * 100}%` }}
                      />
                    </div>
                  </div>
                </div>
                {/* Data columns - compact but readable */}
                <div className="flex items-center gap-3 shrink-0">
                  {/* Kpl (quantity sold) */}
                  <div className="text-right min-w-[50px]">
                    <p className="text-[10px] text-foreground-subtle">{t('charts.pcs')}</p>
                    <p className="text-xs font-medium text-foreground tabular-nums">
                      {product.total_quantity}
                      {quantityChange !== null && <ChangeIndicator change={quantityChange} />}
                    </p>
                  </div>
                  {/* Tilauksia (orders containing this product) */}
                  <div className="text-right min-w-[30px] group relative">
                    <p className="text-[10px] text-foreground-subtle flex items-center justify-end cursor-help">
                      <ShoppingCart className="w-2.5 h-2.5" />
                    </p>
                    <p className="text-xs font-medium text-foreground tabular-nums">
                      {product.order_count || 0}
                    </p>
                    {/* Tooltip */}
                    <div className="absolute bottom-full right-0 mb-1 hidden group-hover:block z-50 w-28 p-1 text-[10px] bg-background-elevated border border-card-border rounded shadow-lg text-foreground-muted whitespace-nowrap">
                      {t('charts.ordersContaining')}
                    </div>
                  </div>
                  {/* Kate SEK */}
                  <div className="text-right min-w-[70px]">
                    <p className="text-[10px] text-foreground-subtle">{t('charts.margin')}</p>
                    <p className={`text-xs font-medium tabular-nums ${product.gross_margin > 0 ? 'text-success' : 'text-foreground-muted'}`}>
                      {product.gross_margin > 0 ? product.gross_margin?.toLocaleString(locale, { maximumFractionDigits: 0 }) : '—'}
                      {marginChange !== null && product.gross_margin > 0 && <ChangeIndicator change={marginChange} />}
                    </p>
                  </div>
                  {/* Myynti SEK */}
                  <div className="text-right min-w-[80px]">
                    <p className="text-[10px] text-foreground-subtle">{t('charts.revenue')}</p>
                    <p className="text-sm font-medium text-foreground tabular-nums">
                      {product.total_revenue?.toLocaleString(locale, { maximumFractionDigits: 0 })}
                      {revenueChange !== null && <ChangeIndicator change={revenueChange} />}
                    </p>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}

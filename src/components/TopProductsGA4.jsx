import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { useTranslation } from '@/lib/i18n'
import { ShoppingCart, Eye } from 'lucide-react'
import { cn } from '@/lib/utils'

export function TopProductsGA4({ products, previousProducts = [], compare = false, comparisonMode = 'yoy' }) {
  const { t, locale } = useTranslation()
  const maxRevenue = Math.max(...products.map(p => p.item_revenue || 0))

  // Build a map of previous products for quick lookup by item_name
  const prevProductMap = new Map()
  previousProducts.forEach(p => {
    prevProductMap.set(p.item_name, p)
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
          <CardTitle className="text-foreground text-base font-medium flex items-center gap-2">
            <Eye className="w-5 h-5 text-primary" />
            {t('ga4.ecommerce.topProductsRevenue')}
          </CardTitle>
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
            const prevProduct = prevProductMap.get(product.item_name)
            const revenueChange = compare ? getChange(product.item_revenue, prevProduct?.item_revenue) : null
            const viewsChange = compare ? getChange(product.items_viewed, prevProduct?.items_viewed) : null
            const purchasedChange = compare ? getChange(product.items_purchased, prevProduct?.items_purchased) : null

            return (
              <div key={product.item_name || index} className="flex items-center gap-3">
                <span className="text-sm font-medium text-foreground-subtle w-5">{index + 1}.</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-foreground truncate" title={product.item_name}>
                    {product.item_name?.substring(0, 30)}
                    {product.item_name?.length > 30 && '...'}
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    <div className="flex-1 h-1.5 bg-background-subtle rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full"
                        style={{ width: `${maxRevenue > 0 ? (product.item_revenue / maxRevenue) * 100 : 0}%` }}
                      />
                    </div>
                  </div>
                </div>
                {/* Data columns - compact but readable */}
                <div className="flex items-center gap-3 shrink-0">
                  {/* Views */}
                  <div className="text-right min-w-[50px]">
                    <p className="text-[10px] text-foreground-subtle">{t('ga4.ecommerce.views')}</p>
                    <p className="text-xs font-medium text-foreground tabular-nums">
                      {product.items_viewed}
                      {viewsChange !== null && <ChangeIndicator change={viewsChange} />}
                    </p>
                  </div>
                  {/* Cart */}
                  <div className="text-right min-w-[30px] group relative">
                    <p className="text-[10px] text-foreground-subtle flex items-center justify-end cursor-help">
                      <ShoppingCart className="w-2.5 h-2.5" />
                    </p>
                    <p className="text-xs font-medium text-foreground tabular-nums">
                      {product.items_added_to_cart || 0}
                    </p>
                    {/* Tooltip */}
                    <div className="absolute bottom-full right-0 mb-1 hidden group-hover:block z-50 w-24 p-1 text-[10px] bg-background-elevated border border-card-border rounded shadow-lg text-foreground-muted whitespace-nowrap">
                      {t('ga4.ecommerce.addedToCart')}
                    </div>
                  </div>
                  {/* Purchased */}
                  <div className="text-right min-w-[50px]">
                    <p className="text-[10px] text-foreground-subtle">{t('ga4.ecommerce.sold')}</p>
                    <p className={`text-xs font-medium tabular-nums ${product.items_purchased > 0 ? 'text-success' : 'text-foreground-muted'}`}>
                      {product.items_purchased > 0 ? product.items_purchased : '—'}
                      {purchasedChange !== null && product.items_purchased > 0 && <ChangeIndicator change={purchasedChange} />}
                    </p>
                  </div>
                  {/* Revenue */}
                  <div className="text-right min-w-[80px]">
                    <p className="text-[10px] text-foreground-subtle">{t('charts.revenue')}</p>
                    <p className="text-sm font-medium text-foreground tabular-nums">
                      {product.item_revenue > 0 ? `kr${product.item_revenue?.toLocaleString(locale, { maximumFractionDigits: 0 })}` : '—'}
                      {revenueChange !== null && product.item_revenue > 0 && <ChangeIndicator change={revenueChange} />}
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

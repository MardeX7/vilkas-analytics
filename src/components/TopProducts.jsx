import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { useTranslation } from '@/lib/i18n'
import { ShoppingCart } from 'lucide-react'

export function TopProducts({ products }) {
  const { t, locale } = useTranslation()
  const maxRevenue = Math.max(...products.map(p => p.total_revenue || 0))

  return (
    <Card className="bg-background-elevated border-card-border">
      <CardHeader className="pb-2">
        <CardTitle className="text-foreground text-base font-medium">{t('charts.topProducts')}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {products.slice(0, 10).map((product, index) => (
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
              {/* Data columns */}
              <div className="flex items-center gap-4 shrink-0">
                {/* Kpl (quantity sold) */}
                <div className="text-right w-12">
                  <p className="text-xs text-foreground-subtle">{t('charts.pcs')}</p>
                  <p className="text-xs font-medium text-foreground tabular-nums">
                    {product.total_quantity}
                  </p>
                </div>
                {/* Tilauksia (orders containing this product) */}
                <div className="text-right w-12 group relative">
                  <p className="text-xs text-foreground-subtle flex items-center justify-end gap-1 cursor-help">
                    <ShoppingCart className="w-3 h-3" />
                  </p>
                  <p className="text-xs font-medium text-foreground tabular-nums">
                    {product.order_count || 0}
                  </p>
                  {/* Tooltip */}
                  <div className="absolute bottom-full right-0 mb-1 hidden group-hover:block z-50 w-32 p-1.5 text-xs bg-background-elevated border border-card-border rounded shadow-lg text-foreground-muted whitespace-nowrap">
                    {t('charts.ordersContaining')}
                  </div>
                </div>
                {/* Kate SEK */}
                <div className="text-right w-14">
                  <p className="text-xs text-foreground-subtle">{t('charts.margin')}</p>
                  <p className={`text-xs font-medium tabular-nums ${product.gross_margin > 0 ? 'text-success' : 'text-foreground-muted'}`}>
                    {product.gross_margin > 0 ? product.gross_margin?.toLocaleString(locale, { maximumFractionDigits: 0 }) : '—'}
                  </p>
                </div>
                {/* Myynti SEK */}
                <div className="text-right w-20">
                  <p className="text-xs text-foreground-subtle">{t('charts.revenue')}</p>
                  <p className="text-sm font-medium text-foreground tabular-nums">
                    {product.total_revenue?.toLocaleString(locale, { maximumFractionDigits: 0 })}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

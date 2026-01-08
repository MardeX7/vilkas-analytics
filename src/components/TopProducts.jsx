import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { useTranslation } from '@/lib/i18n'

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
              <div className="flex-1">
                <p className="text-sm text-foreground truncate" title={product.product_name}>
                  {product.product_name?.substring(0, 40)}
                  {product.product_name?.length > 40 && '...'}
                </p>
                <div className="flex items-center gap-2 mt-1">
                  <div className="flex-1 h-1.5 bg-background-subtle rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full"
                      style={{ width: `${(product.total_revenue / maxRevenue) * 100}%` }}
                    />
                  </div>
                  <span className="text-xs text-foreground-subtle w-20 text-right tabular-nums">
                    {product.total_quantity} {t('charts.pcs')}
                  </span>
                </div>
              </div>
              <div className="text-right min-w-24">
                <p className="text-sm font-medium text-foreground tabular-nums">
                  {product.total_revenue?.toLocaleString(locale)} SEK
                </p>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

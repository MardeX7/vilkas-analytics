import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'

export function TopProducts({ products }) {
  const maxRevenue = Math.max(...products.map(p => p.total_revenue || 0))

  return (
    <Card className="bg-slate-800/50 border-slate-700">
      <CardHeader>
        <CardTitle className="text-white text-lg">Bästsäljande produkter</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {products.slice(0, 10).map((product, index) => (
            <div key={product.product_number || index} className="flex items-center gap-3">
              <span className="text-sm font-medium text-slate-400 w-6">{index + 1}.</span>
              <div className="flex-1">
                <p className="text-sm text-white truncate" title={product.product_name}>
                  {product.product_name?.substring(0, 40)}
                  {product.product_name?.length > 40 && '...'}
                </p>
                <div className="flex items-center gap-2 mt-1">
                  <div className="flex-1 h-2 bg-slate-700 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-cyan-500 to-cyan-400 rounded-full"
                      style={{ width: `${(product.total_revenue / maxRevenue) * 100}%` }}
                    />
                  </div>
                  <span className="text-xs text-slate-400 w-20 text-right">
                    {product.total_quantity} st
                  </span>
                </div>
              </div>
              <div className="text-right min-w-24">
                <p className="text-sm font-medium text-white">
                  {product.total_revenue?.toLocaleString('sv-SE')} SEK
                </p>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

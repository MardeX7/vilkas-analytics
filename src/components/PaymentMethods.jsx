import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, Cell } from 'recharts'
import { useTranslation } from '@/lib/i18n'
import { CreditCard, Truck } from 'lucide-react'

// Billackering brand colors
const COLORS = ['#01a7da', '#8b5cf6', '#22c55e', '#eee000', '#d92d33', '#ec4899']
const TOOLTIP_STYLE = { backgroundColor: '#0d1117', border: '1px solid #1a2230', borderRadius: '8px' }

export function PaymentMethodsChart({ data }) {
  const { t } = useTranslation()
  const chartData = data.map(d => ({
    name: d.payment_method?.substring(0, 15) + (d.payment_method?.length > 15 ? '...' : ''),
    fullName: d.payment_method,
    value: d.order_count,
    revenue: d.total_revenue,
    percentage: d.percentage
  }))

  const maxValue = Math.max(...chartData.map(d => d.percentage))

  return (
    <Card className="bg-background-elevated border-card-border">
      <CardHeader className="pb-2">
        <CardTitle className="text-foreground text-base font-medium flex items-center gap-2">
          <CreditCard className="w-5 h-5 text-primary" />
          {t('charts.paymentMethods')}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {chartData.map((item, index) => (
            <div key={item.fullName}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm text-foreground truncate max-w-[180px]" title={item.fullName}>
                  {item.fullName}
                </span>
                <span className="text-sm font-medium text-foreground tabular-nums">{item.percentage}%</span>
              </div>
              <div className="h-2 bg-background-subtle rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${(item.percentage / maxValue) * 100}%`,
                    backgroundColor: COLORS[index % COLORS.length]
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

export function ShippingMethodsChart({ data }) {
  const { t } = useTranslation()
  const chartData = data.map(d => ({
    name: d.shipping_method?.substring(0, 15) + (d.shipping_method?.length > 15 ? '...' : ''),
    fullName: d.shipping_method,
    value: d.order_count,
    revenue: d.total_revenue,
    percentage: d.percentage
  }))

  const maxValue = Math.max(...chartData.map(d => d.percentage))

  return (
    <Card className="bg-background-elevated border-card-border">
      <CardHeader className="pb-2">
        <CardTitle className="text-foreground text-base font-medium flex items-center gap-2">
          <Truck className="w-5 h-5 text-primary" />
          {t('charts.shippingMethods')}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {chartData.map((item, index) => (
            <div key={item.fullName}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm text-foreground truncate max-w-[180px]" title={item.fullName}>
                  {item.fullName}
                </span>
                <span className="text-sm font-medium text-foreground tabular-nums">{item.percentage}%</span>
              </div>
              <div className="h-2 bg-background-subtle rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${(item.percentage / maxValue) * 100}%`,
                    backgroundColor: COLORS[index % COLORS.length]
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

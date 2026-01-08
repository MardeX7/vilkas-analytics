import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts'

// Billackering brand colors
const COLORS = ['#01a7da', '#8b5cf6', '#22c55e', '#eee000', '#d92d33', '#ec4899']
const TOOLTIP_STYLE = { backgroundColor: '#0d1117', border: '1px solid #1a2230', borderRadius: '8px' }

export function PaymentMethodsChart({ data }) {
  const chartData = data.map(d => ({
    name: d.payment_method,
    value: d.order_count,
    revenue: d.total_revenue,
    percentage: d.percentage
  }))

  return (
    <Card className="bg-background-elevated border-card-border">
      <CardHeader className="pb-2">
        <CardTitle className="text-foreground text-base font-medium">Betalningsmetoder</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={chartData}
                cx="50%"
                cy="50%"
                innerRadius={40}
                outerRadius={70}
                paddingAngle={2}
                dataKey="value"
              >
                {chartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                formatter={(value, name, props) => [`${value} ordrar (${props.payload.percentage}%)`, props.payload.name]}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-4 space-y-2">
          {chartData.slice(0, 4).map((item, index) => (
            <div key={item.name} className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: COLORS[index % COLORS.length] }}
                />
                <span className="text-foreground truncate max-w-32" title={item.name}>
                  {item.name?.substring(0, 20)}
                  {item.name?.length > 20 && '...'}
                </span>
              </div>
              <span className="text-foreground font-medium tabular-nums">{item.percentage}%</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

export function ShippingMethodsChart({ data }) {
  const chartData = data.map(d => ({
    name: d.shipping_method,
    value: d.order_count,
    revenue: d.total_revenue,
    percentage: d.percentage
  }))

  return (
    <Card className="bg-background-elevated border-card-border">
      <CardHeader className="pb-2">
        <CardTitle className="text-foreground text-base font-medium">Fraktmetoder</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={chartData}
                cx="50%"
                cy="50%"
                innerRadius={40}
                outerRadius={70}
                paddingAngle={2}
                dataKey="value"
              >
                {chartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                formatter={(value, name, props) => [`${value} ordrar (${props.payload.percentage}%)`, props.payload.name]}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-4 space-y-2">
          {chartData.slice(0, 4).map((item, index) => (
            <div key={item.name} className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: COLORS[index % COLORS.length] }}
                />
                <span className="text-foreground truncate max-w-32" title={item.name}>
                  {item.name?.substring(0, 20)}
                  {item.name?.length > 20 && '...'}
                </span>
              </div>
              <span className="text-foreground font-medium tabular-nums">{item.percentage}%</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

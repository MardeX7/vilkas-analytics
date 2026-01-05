import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import {
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Line,
  ComposedChart,
  Legend
} from 'recharts'

export function DailySalesChart({ data, previousData = null, compare = false }) {
  // Reverse to show oldest first
  const currentData = [...data].reverse()

  // If comparing, merge previous data with current
  let chartData
  if (compare && previousData && previousData.length > 0) {
    const prevReversed = [...previousData].reverse()
    chartData = currentData.map((d, i) => ({
      date: new Date(d.sale_date).toLocaleDateString('sv-SE', { month: 'short', day: 'numeric' }),
      revenue: d.total_revenue,
      orders: d.order_count,
      previousRevenue: prevReversed[i]?.total_revenue || null,
      previousDate: prevReversed[i] ? new Date(prevReversed[i].sale_date).toLocaleDateString('sv-SE', { month: 'short', day: 'numeric' }) : null
    }))
  } else {
    chartData = currentData.map(d => ({
      date: new Date(d.sale_date).toLocaleDateString('sv-SE', { month: 'short', day: 'numeric' }),
      revenue: d.total_revenue,
      orders: d.order_count
    }))
  }

  const showComparison = compare && previousData && previousData.length > 0

  return (
    <Card className="bg-slate-800/50 border-slate-700">
      <CardHeader>
        <CardTitle className="text-white text-lg">Daglig försäljning</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData}>
              <defs>
                <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#06b6d4" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="date" stroke="#94a3b8" fontSize={12} />
              <YAxis stroke="#94a3b8" fontSize={12} tickFormatter={(v) => `${(v/1000).toFixed(0)}k`} />
              <Tooltip
                contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }}
                labelStyle={{ color: '#f8fafc' }}
                formatter={(value, name) => {
                  if (name === 'revenue') return [`${value?.toLocaleString()} SEK`, 'Nuvarande']
                  if (name === 'previousRevenue') return [`${value?.toLocaleString()} SEK`, 'Föregående']
                  return [value, name]
                }}
              />
              {showComparison && (
                <Legend
                  wrapperStyle={{ paddingTop: '10px' }}
                  formatter={(value) => value === 'revenue' ? 'Nuvarande period' : 'Föregående period'}
                />
              )}
              <Area
                type="monotone"
                dataKey="revenue"
                stroke="#06b6d4"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#colorRevenue)"
              />
              {showComparison && (
                <Line
                  type="monotone"
                  dataKey="previousRevenue"
                  stroke="#64748b"
                  strokeWidth={2}
                  strokeDasharray="5 5"
                  dot={false}
                />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  )
}

export function WeekdayChart({ data }) {
  const weekdays = ['Söndag', 'Måndag', 'Tisdag', 'Onsdag', 'Torsdag', 'Fredag', 'Lördag']

  const chartData = data.map(d => ({
    name: weekdays[d.day_of_week] || d.weekday_name,
    revenue: d.total_revenue,
    orders: d.order_count
  }))

  return (
    <Card className="bg-slate-800/50 border-slate-700">
      <CardHeader>
        <CardTitle className="text-white text-lg">Försäljning per veckodag</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="name" stroke="#94a3b8" fontSize={11} />
              <YAxis stroke="#94a3b8" fontSize={12} tickFormatter={(v) => `${(v/1000).toFixed(0)}k`} />
              <Tooltip
                contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }}
                labelStyle={{ color: '#f8fafc' }}
                formatter={(value) => [`${value.toLocaleString()} SEK`, 'Försäljning']}
              />
              <Bar dataKey="revenue" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  )
}

export function HourlyChart({ data }) {
  const chartData = data.map(d => ({
    hour: `${String(d.hour_of_day).padStart(2, '0')}:00`,
    revenue: d.total_revenue,
    orders: d.order_count
  }))

  return (
    <Card className="bg-slate-800/50 border-slate-700">
      <CardHeader>
        <CardTitle className="text-white text-lg">Försäljning per timme</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="hour" stroke="#94a3b8" fontSize={10} interval={2} />
              <YAxis stroke="#94a3b8" fontSize={12} tickFormatter={(v) => `${(v/1000).toFixed(0)}k`} />
              <Tooltip
                contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }}
                labelStyle={{ color: '#f8fafc' }}
                formatter={(value) => [`${value.toLocaleString()} SEK`, 'Försäljning']}
              />
              <Bar dataKey="revenue" fill="#22c55e" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  )
}

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
  Legend,
  Cell
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

/**
 * KPI Index History Chart - Like Vilkas Insights monthly bars
 * Shows index values over time with color coding
 */
export function KPIHistoryChart({ data, title = 'Kehitys viimeisen 12 kk aikana', indexKey = 'overall_index' }) {
  if (!data || data.length === 0) {
    return (
      <Card className="bg-slate-800/50 border-slate-700">
        <CardHeader>
          <CardTitle className="text-white text-lg">{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-64 flex items-center justify-center text-slate-400">
            Ei historiaa
          </div>
        </CardContent>
      </Card>
    )
  }

  // Get color based on index value
  const getBarColor = (value) => {
    if (value >= 70) return '#22c55e' // green-500
    if (value >= 50) return '#84cc16' // lime-500
    if (value >= 40) return '#eab308' // yellow-500
    if (value >= 30) return '#f97316' // orange-500
    return '#ef4444' // red-500
  }

  // Format data for chart
  const chartData = data.map(d => {
    const date = new Date(d.period_end)
    const month = date.toLocaleDateString('sv-SE', { month: 'short' })
    const value = d[indexKey] || d.overall_index || 0

    return {
      month,
      value,
      fill: getBarColor(value),
      fullDate: d.period_end
    }
  })

  return (
    <Card className="bg-slate-800/50 border-slate-700">
      <CardHeader>
        <CardTitle className="text-white text-lg">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis
                dataKey="month"
                stroke="#94a3b8"
                fontSize={11}
                tickLine={false}
                axisLine={{ stroke: '#334155' }}
              />
              <YAxis
                domain={[0, 100]}
                stroke="#94a3b8"
                fontSize={12}
                tickLine={false}
                axisLine={{ stroke: '#334155' }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#1e293b',
                  border: '1px solid #334155',
                  borderRadius: '8px'
                }}
                labelStyle={{ color: '#f8fafc' }}
                formatter={(value) => [`${value}`, 'Index']}
                labelFormatter={(label, payload) => {
                  if (payload && payload[0]) {
                    const date = new Date(payload[0].payload.fullDate)
                    return date.toLocaleDateString('sv-SE', { year: 'numeric', month: 'long' })
                  }
                  return label
                }}
              />
              <Bar
                dataKey="value"
                radius={[4, 4, 0, 0]}
                maxBarSize={40}
              >
                {chartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Legend */}
        <div className="flex justify-center gap-4 mt-4 text-xs text-slate-400">
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-sm bg-green-500" />
            <span>70+ Utmärkt</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-sm bg-lime-500" />
            <span>50-69 Bra</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-sm bg-yellow-500" />
            <span>40-49 Godkänt</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-sm bg-orange-500" />
            <span>30-39 Svag</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-sm bg-red-500" />
            <span>&lt;30 Kritisk</span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

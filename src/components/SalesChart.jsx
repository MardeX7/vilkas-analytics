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

// Billackering brand colors
const COLORS = {
  primary: '#01a7da',     // Billackering blue
  destructive: '#d92d33', // Billackering red
  warning: '#eee000',     // Billackering yellow
  success: '#22c55e',     // Green for positive
  muted: '#6b7685',       // Subtle text/lines
  grid: '#1a2230',        // Subtle grid lines
  cardBg: '#141a22',      // Card background
  tooltip: '#0d1117',     // Tooltip background
  text: '#f8fafc',        // Primary text
}

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
    <Card className="bg-background-elevated border-card-border">
      <CardHeader className="pb-2">
        <CardTitle className="text-foreground text-base font-medium">Daglig försäljning</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData}>
              <defs>
                <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={COLORS.primary} stopOpacity={0.25}/>
                  <stop offset="95%" stopColor={COLORS.primary} stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={COLORS.grid} vertical={false} />
              <XAxis dataKey="date" stroke={COLORS.muted} fontSize={11} tickLine={false} axisLine={false} />
              <YAxis stroke={COLORS.muted} fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => `${(v/1000).toFixed(0)}k`} />
              <Tooltip
                contentStyle={{ backgroundColor: COLORS.tooltip, border: `1px solid ${COLORS.grid}`, borderRadius: '8px' }}
                labelStyle={{ color: COLORS.text }}
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
                stroke={COLORS.primary}
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#colorRevenue)"
              />
              {showComparison && (
                <Line
                  type="monotone"
                  dataKey="previousRevenue"
                  stroke={COLORS.muted}
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
    <Card className="bg-background-elevated border-card-border">
      <CardHeader className="pb-2">
        <CardTitle className="text-foreground text-base font-medium">Försäljning per veckodag</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke={COLORS.grid} vertical={false} />
              <XAxis dataKey="name" stroke={COLORS.muted} fontSize={11} tickLine={false} axisLine={false} />
              <YAxis stroke={COLORS.muted} fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => `${(v/1000).toFixed(0)}k`} />
              <Tooltip
                contentStyle={{ backgroundColor: COLORS.tooltip, border: `1px solid ${COLORS.grid}`, borderRadius: '8px' }}
                labelStyle={{ color: COLORS.text }}
                formatter={(value) => [`${value.toLocaleString()} SEK`, 'Försäljning']}
              />
              <Bar dataKey="revenue" fill={COLORS.primary} radius={[4, 4, 0, 0]} />
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
    <Card className="bg-background-elevated border-card-border">
      <CardHeader className="pb-2">
        <CardTitle className="text-foreground text-base font-medium">Försäljning per timme</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke={COLORS.grid} vertical={false} />
              <XAxis dataKey="hour" stroke={COLORS.muted} fontSize={10} tickLine={false} axisLine={false} interval={2} />
              <YAxis stroke={COLORS.muted} fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => `${(v/1000).toFixed(0)}k`} />
              <Tooltip
                contentStyle={{ backgroundColor: COLORS.tooltip, border: `1px solid ${COLORS.grid}`, borderRadius: '8px' }}
                labelStyle={{ color: COLORS.text }}
                formatter={(value) => [`${value.toLocaleString()} SEK`, 'Försäljning']}
              />
              <Bar dataKey="revenue" fill={COLORS.success} radius={[4, 4, 0, 0]} />
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
export function KPIHistoryChart({ data, title = 'Kehitys viimeisen 12 kk aikana', indexKey = 'overall_index', granularity = 'month' }) {
  if (!data || data.length === 0) {
    return (
      <Card className="bg-background-elevated border-card-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-foreground text-base font-medium">{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-64 flex items-center justify-center text-foreground-muted">
            Ei historiaa
          </div>
        </CardContent>
      </Card>
    )
  }

  // Get color based on index value
  const getBarColor = (value) => {
    if (value >= 70) return COLORS.success
    if (value >= 50) return '#84cc16' // lime
    if (value >= 40) return COLORS.warning
    if (value >= 30) return '#f97316' // orange
    return COLORS.destructive
  }

  // Get ISO week number from date
  const getWeekNumber = (date) => {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
    const dayNum = d.getUTCDay() || 7
    d.setUTCDate(d.getUTCDate() + 4 - dayNum)
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
    return Math.ceil((((d - yearStart) / 86400000) + 1) / 7)
  }

  // Format data for chart
  const chartData = data.map(d => {
    const date = new Date(d.period_end)
    const value = d[indexKey] || d.overall_index || 0

    // Format label based on granularity
    let label
    if (granularity === 'week') {
      const weekNum = getWeekNumber(date)
      label = `v${weekNum}`
    } else {
      label = date.toLocaleDateString('sv-SE', { month: 'short' })
    }

    return {
      label,
      value,
      fill: getBarColor(value),
      fullDate: d.period_end
    }
  })

  return (
    <Card className="bg-background-elevated border-card-border">
      <CardHeader className="pb-2">
        <CardTitle className="text-foreground text-base font-medium">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={COLORS.grid} vertical={false} />
              <XAxis
                dataKey="label"
                stroke={COLORS.muted}
                fontSize={11}
                tickLine={false}
                axisLine={false}
                interval={granularity === 'week' ? 3 : 0}
              />
              <YAxis
                domain={[0, 100]}
                stroke={COLORS.muted}
                fontSize={11}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: COLORS.tooltip,
                  border: `1px solid ${COLORS.grid}`,
                  borderRadius: '8px'
                }}
                labelStyle={{ color: COLORS.text }}
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
        <div className="flex justify-center gap-4 mt-4 text-xs text-foreground-subtle">
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: COLORS.success }} />
            <span>70+ Utmärkt</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-sm bg-lime-500" />
            <span>50-69 Bra</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: COLORS.warning }} />
            <span>40-49 Godkänt</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-sm bg-orange-500" />
            <span>30-39 Svag</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: COLORS.destructive }} />
            <span>&lt;30 Kritisk</span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

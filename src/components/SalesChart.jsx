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
import { useTranslation } from '@/lib/i18n'

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
  const { t, locale } = useTranslation()
  // Reverse to show oldest first
  const currentData = [...data].reverse()

  // If comparing, merge previous data with current
  let chartData
  if (compare && previousData && previousData.length > 0) {
    const prevReversed = [...previousData].reverse()
    chartData = currentData.map((d, i) => ({
      date: new Date(d.sale_date).toLocaleDateString(locale, { month: 'short', day: 'numeric' }),
      revenue: d.total_revenue,
      orders: d.order_count,
      previousRevenue: prevReversed[i]?.total_revenue || null,
      previousDate: prevReversed[i] ? new Date(prevReversed[i].sale_date).toLocaleDateString(locale, { month: 'short', day: 'numeric' }) : null
    }))
  } else {
    chartData = currentData.map(d => ({
      date: new Date(d.sale_date).toLocaleDateString(locale, { month: 'short', day: 'numeric' }),
      revenue: d.total_revenue,
      orders: d.order_count
    }))
  }

  const showComparison = compare && previousData && previousData.length > 0

  return (
    <Card className="bg-background-elevated border-card-border">
      <CardHeader className="pb-2">
        <CardTitle className="text-foreground text-base font-medium">{t('charts.dailySales')}</CardTitle>
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
                  if (name === 'revenue') return [`${value?.toLocaleString()} SEK`, t('charts.current')]
                  if (name === 'previousRevenue') return [`${value?.toLocaleString()} SEK`, t('charts.previous')]
                  return [value, name]
                }}
              />
              {showComparison && (
                <Legend
                  wrapperStyle={{ paddingTop: '10px' }}
                  formatter={(value) => value === 'revenue' ? t('charts.currentPeriod') : t('charts.previousPeriod')}
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

export function DailyMarginChart({ data }) {
  const { t, locale } = useTranslation()
  // Reverse to show oldest first
  const chartData = [...data].reverse().map(d => ({
    date: new Date(d.sale_date).toLocaleDateString(locale, { month: 'short', day: 'numeric' }),
    grossProfit: d.gross_profit,
    marginPercent: d.margin_percent
  }))

  return (
    <Card className="bg-background-elevated border-card-border">
      <CardHeader className="pb-2">
        <CardTitle className="text-foreground text-base font-medium">{t('charts.dailyMargin')}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData}>
              <defs>
                <linearGradient id="colorMargin" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={COLORS.success} stopOpacity={0.25}/>
                  <stop offset="95%" stopColor={COLORS.success} stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={COLORS.grid} vertical={false} />
              <XAxis dataKey="date" stroke={COLORS.muted} fontSize={11} tickLine={false} axisLine={false} />
              <YAxis stroke={COLORS.muted} fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => `${(v/1000).toFixed(0)}k`} />
              <Tooltip
                contentStyle={{ backgroundColor: COLORS.tooltip, border: `1px solid ${COLORS.grid}`, borderRadius: '8px' }}
                labelStyle={{ color: COLORS.text }}
                formatter={(value, name) => {
                  if (name === 'grossProfit') return [`${value?.toLocaleString()} SEK`, t('charts.grossProfit')]
                  return [value, name]
                }}
              />
              <Area
                type="monotone"
                dataKey="grossProfit"
                stroke={COLORS.success}
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#colorMargin)"
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  )
}

export function WeekdayChart({ data }) {
  const { t } = useTranslation()
  const weekdayKeys = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']

  // Aggregate by day_of_week (handle multiple currencies)
  const aggregated = {}
  data.forEach(d => {
    const dow = d.day_of_week
    if (!aggregated[dow]) {
      aggregated[dow] = { day_of_week: dow, total_revenue: 0, order_count: 0 }
    }
    aggregated[dow].total_revenue += d.total_revenue || 0
    aggregated[dow].order_count += d.order_count || 0
  })

  // Convert to sorted array (0=Sunday ... 6=Saturday)
  const chartData = Object.values(aggregated)
    .sort((a, b) => a.day_of_week - b.day_of_week)
    .map(d => ({
      name: t(`weekdays.${weekdayKeys[d.day_of_week]}`),
      revenue: d.total_revenue,
      orders: d.order_count
    }))

  return (
    <Card className="bg-background-elevated border-card-border">
      <CardHeader className="pb-2">
        <CardTitle className="text-foreground text-base font-medium">{t('charts.salesByWeekday')}</CardTitle>
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
                formatter={(value) => [`${value.toLocaleString()} SEK`, t('charts.sales')]}
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
  const { t } = useTranslation()

  // Aggregate by hour_of_day (handle multiple currencies)
  const aggregated = {}
  data.forEach(d => {
    const hour = d.hour_of_day
    if (!aggregated[hour]) {
      aggregated[hour] = { hour_of_day: hour, total_revenue: 0, order_count: 0 }
    }
    aggregated[hour].total_revenue += d.total_revenue || 0
    aggregated[hour].order_count += d.order_count || 0
  })

  // Convert to sorted array (0-23)
  const chartData = Object.values(aggregated)
    .sort((a, b) => a.hour_of_day - b.hour_of_day)
    .map(d => ({
      hour: `${String(d.hour_of_day).padStart(2, '0')}:00`,
      revenue: d.total_revenue,
      orders: d.order_count
    }))

  return (
    <Card className="bg-background-elevated border-card-border">
      <CardHeader className="pb-2">
        <CardTitle className="text-foreground text-base font-medium">{t('charts.salesByHour')}</CardTitle>
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
                formatter={(value) => [`${value.toLocaleString()} SEK`, t('charts.sales')]}
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
export function KPIHistoryChart({ data, title, indexKey = 'overall_index', granularity = 'month' }) {
  const { t, locale } = useTranslation()
  const displayTitle = title || t('charts.noHistory')

  if (!data || data.length === 0) {
    return (
      <Card className="bg-background-elevated border-card-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-foreground text-base font-medium">{displayTitle}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-64 flex items-center justify-center text-foreground-muted">
            {t('charts.noHistory')}
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
      label = date.toLocaleDateString(locale, { month: 'short' })
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
                formatter={(value) => [`${value}`, t('charts.index')]}
                labelFormatter={(label, payload) => {
                  if (payload && payload[0]) {
                    const date = new Date(payload[0].payload.fullDate)
                    return date.toLocaleDateString(locale, { year: 'numeric', month: 'long' })
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
            <span>70+ {t('charts.legend.excellent')}</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-sm bg-lime-500" />
            <span>50-69 {t('charts.legend.good')}</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: COLORS.warning }} />
            <span>40-49 {t('charts.legend.ok')}</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-sm bg-orange-500" />
            <span>30-39 {t('charts.legend.weak')}</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: COLORS.destructive }} />
            <span>&lt;30 {t('charts.legend.critical')}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

/**
 * IndicatorTrendChart - Displays trend chart for indicator history
 *
 * Shows historical data as an area chart with gradient fill.
 * Used in IndicatorDetailPage and as mini sparklines in cards.
 */

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine
} from 'recharts'
import { useTranslation } from '@/lib/i18n'
import { useIndicatorHistory } from '@/hooks/useIndicators'

// Color configurations for different indicators
const INDICATOR_COLORS = {
  sales_trend: { primary: '#06b6d4', gradient: 'cyan' },
  aov: { primary: '#22c55e', gradient: 'green' },
  gross_margin: { primary: '#a855f7', gradient: 'purple' },
  position_change: { primary: '#3b82f6', gradient: 'blue' },
  brand_vs_nonbrand: { primary: '#f59e0b', gradient: 'amber' },
  organic_conversion_rate: { primary: '#10b981', gradient: 'emerald' },
  stock_availability_risk: { primary: '#ef4444', gradient: 'red' }
}

/**
 * Custom Tooltip
 */
function CustomTooltip({ active, payload, label, formatValue, t }) {
  if (!active || !payload || !payload.length) return null

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-lg p-3 shadow-lg">
      <p className="text-slate-400 text-xs mb-1">{label}</p>
      <p className="text-white font-semibold">
        {formatValue(payload[0].value)}
      </p>
      {payload[0].payload.direction && (
        <p className={`text-xs mt-1 ${
          payload[0].payload.direction === 'up' ? 'text-green-400' :
          payload[0].payload.direction === 'down' ? 'text-red-400' : 'text-slate-400'
        }`}>
          {payload[0].payload.direction === 'up' ? '↑' :
           payload[0].payload.direction === 'down' ? '↓' : '→'}
        </p>
      )}
    </div>
  )
}

/**
 * Main IndicatorTrendChart Component
 */
export function IndicatorTrendChart({
  indicatorId,
  storeId,
  days = 90,
  height = 200,
  showAxis = true,
  showGrid = true,
  showTooltip = true,
  formatValue = (v) => v?.toFixed(1) ?? '—',
  className = ''
}) {
  const { locale } = useTranslation()
  const { history, isLoading, error } = useIndicatorHistory(indicatorId, { storeId, days })

  const colors = INDICATOR_COLORS[indicatorId] || INDICATOR_COLORS.sales_trend

  // Transform data for chart
  const chartData = (history || []).map(item => ({
    date: new Date(item.date).toLocaleDateString(locale, { month: 'short', day: 'numeric' }),
    value: item.value,
    direction: item.direction
  }))

  if (isLoading) {
    return (
      <div className={`flex items-center justify-center ${className}`} style={{ height }}>
        <div className="animate-pulse bg-slate-800 rounded w-full h-full" />
      </div>
    )
  }

  if (error || chartData.length === 0) {
    return (
      <div className={`flex items-center justify-center text-slate-500 text-sm ${className}`} style={{ height }}>
        {error ? 'Error loading data' : 'No history data'}
      </div>
    )
  }

  // Calculate average for reference line
  const values = chartData.map(d => d.value).filter(v => v !== null)
  const average = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : null

  return (
    <div className={className} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData} margin={{ top: 5, right: 5, left: showAxis ? 0 : -20, bottom: 5 }}>
          <defs>
            <linearGradient id={`gradient-${indicatorId}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={colors.primary} stopOpacity={0.3} />
              <stop offset="95%" stopColor={colors.primary} stopOpacity={0} />
            </linearGradient>
          </defs>

          {showGrid && (
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
          )}

          {showAxis && (
            <>
              <XAxis
                dataKey="date"
                stroke="#64748b"
                fontSize={10}
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                stroke="#64748b"
                fontSize={10}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => v?.toFixed(0)}
                width={35}
              />
            </>
          )}

          {showTooltip && (
            <Tooltip
              content={<CustomTooltip formatValue={formatValue} />}
              cursor={{ stroke: '#64748b', strokeDasharray: '3 3' }}
            />
          )}

          {average !== null && showAxis && (
            <ReferenceLine
              y={average}
              stroke="#64748b"
              strokeDasharray="3 3"
              label={{
                value: `Avg: ${formatValue(average)}`,
                position: 'right',
                fill: '#64748b',
                fontSize: 10
              }}
            />
          )}

          <Area
            type="monotone"
            dataKey="value"
            stroke={colors.primary}
            strokeWidth={2}
            fill={`url(#gradient-${indicatorId})`}
            dot={false}
            activeDot={{ r: 4, fill: colors.primary, stroke: '#1e293b', strokeWidth: 2 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

/**
 * MiniSparkline - Small inline chart for cards
 */
export function MiniSparkline({
  indicatorId,
  storeId,
  days = 30,
  width = 80,
  height = 24
}) {
  const { history, isLoading } = useIndicatorHistory(indicatorId, { storeId, days })

  const colors = INDICATOR_COLORS[indicatorId] || INDICATOR_COLORS.sales_trend

  const chartData = (history || []).slice(-14).map(item => ({
    value: item.value
  }))

  if (isLoading || chartData.length === 0) {
    return <div style={{ width, height }} className="bg-slate-800/50 rounded" />
  }

  return (
    <div style={{ width, height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={`spark-${indicatorId}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={colors.primary} stopOpacity={0.3} />
              <stop offset="95%" stopColor={colors.primary} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area
            type="monotone"
            dataKey="value"
            stroke={colors.primary}
            strokeWidth={1.5}
            fill={`url(#spark-${indicatorId})`}
            dot={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

export default IndicatorTrendChart

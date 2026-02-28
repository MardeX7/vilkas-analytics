/**
 * OrderBucketChart - Order value distribution chart
 *
 * Näyttää tilausten jakautuman arvo-bucketeihin pylväskaaviona.
 */

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Cell } from 'recharts'
import { cn } from '@/lib/utils'
import { useOrderBuckets } from '@/hooks/useOrderBuckets'
import { useCurrentShop } from '@/config/storeConfig'

/**
 * Custom tooltip
 */
function CustomTooltip({ active, payload, label, currencySymbol }) {
  if (!active || !payload?.length) return null

  const data = payload[0]?.payload

  return (
    <div className="bg-background-elevated border border-card-border rounded-lg p-3 shadow-lg">
      <p className="font-semibold text-foreground mb-2">{label} {currencySymbol}</p>
      <div className="space-y-1 text-sm">
        <div className="flex justify-between gap-4">
          <span className="text-foreground-muted">Tilaukset:</span>
          <span className="font-medium tabular-nums">{data?.tilaukset}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-foreground-muted">Liikevaihto:</span>
          <span className="font-medium tabular-nums">{data?.liikevaihto?.toLocaleString('sv-SE')} {currencySymbol}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-foreground-muted">Keskiostos:</span>
          <span className="font-medium tabular-nums">{data?.keskiostos?.toLocaleString('sv-SE')} {currencySymbol}</span>
        </div>
        <div className="border-t border-card-border pt-1 mt-1">
          <div className="flex justify-between gap-4">
            <span className="text-foreground-muted">B2C:</span>
            <span className="font-medium tabular-nums">{data?.b2c}</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-foreground-muted">B2B:</span>
            <span className="font-medium tabular-nums">{data?.b2b}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * OrderBucketChart
 *
 * @param {object} props
 * @param {string} props.startDate - Start date (YYYY-MM-DD)
 * @param {string} props.endDate - End date (YYYY-MM-DD)
 * @param {string} props.label - Period label to display
 * @param {string} props.metric - 'tilaukset' | 'liikevaihto'
 * @param {string} props.className
 */
export function OrderBucketChart({ startDate, endDate, label, metric = 'tilaukset', className }) {
  const { currencySymbol } = useCurrentShop()
  const { chartData, summary, isLoading, error } = useOrderBuckets({ startDate, endDate })

  if (isLoading) {
    return (
      <div className={cn('rounded-lg border border-card-border bg-background-elevated p-5', className)}>
        <div className="animate-pulse">
          <div className="h-5 w-40 bg-background-subtle rounded mb-4" />
          <div className="h-64 bg-background-subtle rounded" />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className={cn('rounded-lg border border-destructive/30 bg-background-elevated p-5', className)}>
        <p className="text-sm text-destructive">Bucket-data ei saatavilla</p>
      </div>
    )
  }

  if (!chartData || chartData.length === 0) {
    return (
      <div className={cn('rounded-lg border border-card-border bg-background-elevated p-5', className)}>
        <p className="text-sm text-foreground-muted">Ei tilauksia valitulla aikavälillä</p>
      </div>
    )
  }

  // Colors for buckets
  const colors = ['#3b82f6', '#8b5cf6', '#06b6d4']

  return (
    <div className={cn('rounded-lg border border-card-border bg-background-elevated p-5', className)}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-semibold text-foreground">Tilausten jakautuma</h3>
          <p className="text-xs text-foreground-muted mt-0.5">
            Tilausarvon mukaan {label && `(${label})`}
          </p>
        </div>
        {summary && (
          <div className="text-right">
            <p className="text-sm font-medium text-foreground">{summary.totalOrders} tilausta</p>
            <p className="text-xs text-foreground-muted">
              {Math.round(summary.totalRevenue).toLocaleString('sv-SE')} {currencySymbol}
            </p>
          </div>
        )}
      </div>

      {/* Chart */}
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--card-border)" vertical={false} />
            <XAxis
              dataKey="name"
              tick={{ fill: 'var(--foreground-muted)', fontSize: 12 }}
              tickLine={false}
              axisLine={{ stroke: 'var(--card-border)' }}
            />
            <YAxis
              tick={{ fill: 'var(--foreground-muted)', fontSize: 12 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(value) => metric === 'liikevaihto' ? `${(value / 1000).toFixed(0)}k` : value}
              label={{
                value: metric === 'liikevaihto' ? currencySymbol : 'kpl',
                angle: -90,
                position: 'insideLeft',
                fill: 'var(--foreground-muted)',
                fontSize: 11,
                offset: 15
              }}
            />
            <Tooltip content={<CustomTooltip currencySymbol={currencySymbol} />} cursor={{ fill: 'transparent' }} />
            <Bar
              dataKey={metric}
              radius={[4, 4, 0, 0]}
              maxBarSize={60}
            >
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Legend */}
      <div className="flex items-center justify-center gap-6 mt-4 pt-3 border-t border-card-border">
        {chartData.map((bucket, index) => (
          <div key={bucket.name} className="flex items-center gap-2">
            <div
              className="w-3 h-3 rounded"
              style={{ backgroundColor: colors[index % colors.length] }}
            />
            <span className="text-xs text-foreground-muted">{bucket.name} {currencySymbol}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * OrderBucketSummary - Compact summary for dashboard
 */
export function OrderBucketSummary({ period = '30d', className }) {
  const { currencySymbol } = useCurrentShop()
  const { chartData, isLoading } = useOrderBuckets({ period })

  if (isLoading || !chartData || chartData.length === 0) {
    return null
  }

  // Find the bucket with most orders
  const topBucket = chartData.reduce((max, b) => b.tilaukset > max.tilaukset ? b : max, chartData[0])

  return (
    <div className={cn('text-sm', className)}>
      <span className="text-foreground-muted">Yleisin tilausarvo: </span>
      <span className="font-medium text-foreground">{topBucket.name} {currencySymbol}</span>
      <span className="text-foreground-muted"> ({topBucket.tilaukset} kpl)</span>
    </div>
  )
}

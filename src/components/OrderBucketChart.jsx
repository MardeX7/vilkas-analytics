/**
 * OrderBucketChart - Order value distribution histogram
 *
 * Näyttää tilausten jakautuman histogrammina dynaamisilla intervalleilla.
 */

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { cn } from '@/lib/utils'
import { useOrderBuckets } from '@/hooks/useOrderBuckets'
import { useCurrentShop } from '@/config/storeConfig'
import { useTranslation } from '@/lib/i18n'

/**
 * Custom tooltip
 */
function CustomTooltip({ active, payload, currencySymbol, bucketSize }) {
  if (!active || !payload?.length) return null

  const data = payload[0]?.payload
  const label = data?.name?.includes('+')
    ? `${data.name} ${currencySymbol}`
    : `${data.name}–${parseInt(data.name) + bucketSize} ${currencySymbol}`

  return (
    <div className="bg-background-elevated border border-card-border rounded-lg p-3 shadow-lg">
      <p className="font-semibold text-foreground mb-2">{label}</p>
      <div className="space-y-1 text-sm">
        <div className="flex justify-between gap-4">
          <span className="text-foreground-muted">Tilaukset:</span>
          <span className="font-medium tabular-nums">{data?.tilaukset}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-foreground-muted">Liikevaihto:</span>
          <span className="font-medium tabular-nums">{data?.liikevaihto?.toLocaleString('fi-FI')} {currencySymbol}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-foreground-muted">Keskiostos:</span>
          <span className="font-medium tabular-nums">{data?.keskiostos?.toLocaleString('fi-FI')} {currencySymbol}</span>
        </div>
        {(data?.b2b > 0 || data?.b2c > 0) && (
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
        )}
      </div>
    </div>
  )
}

/**
 * OrderBucketChart
 */
export function OrderBucketChart({ startDate, endDate, label, className }) {
  const { currencySymbol, language } = useCurrentShop()
  const { chartData, summary, bucketSize, isLoading, error } = useOrderBuckets({ startDate, endDate })

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
        <p className="text-sm text-destructive">Tilausdata ei saatavilla</p>
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

  // Show every Nth label on X-axis to avoid crowding
  const tickInterval = chartData.length > 15 ? Math.ceil(chartData.length / 10) : 0

  const locale = language === 'fi' ? 'fi-FI' : 'sv-SE'

  return (
    <div className={cn('rounded-lg border border-card-border bg-background-elevated p-5', className)}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-semibold text-foreground">Tilausten jakautuma</h3>
          <p className="text-xs text-foreground-muted mt-0.5">
            {bucketSize} {currencySymbol} intervalli
          </p>
        </div>
        {summary && (
          <div className="text-right">
            <p className="text-sm font-medium text-foreground">{summary.totalOrders} tilausta</p>
            <p className="text-xs text-foreground-muted">
              {language === 'fi' ? 'Mediaani' : 'Median'} {summary.medianOrderValue?.toLocaleString(locale)} {currencySymbol}
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
              tick={{ fill: 'var(--foreground-muted)', fontSize: 11 }}
              tickLine={false}
              axisLine={{ stroke: 'var(--card-border)' }}
              interval={tickInterval}
              label={{
                value: currencySymbol,
                position: 'insideBottomRight',
                fill: 'var(--foreground-muted)',
                fontSize: 11,
                offset: -5
              }}
            />
            <YAxis
              tick={{ fill: 'var(--foreground-muted)', fontSize: 12 }}
              tickLine={false}
              axisLine={false}
              label={{
                value: 'kpl',
                angle: -90,
                position: 'insideLeft',
                fill: 'var(--foreground-muted)',
                fontSize: 11,
                offset: 15
              }}
            />
            <Tooltip content={<CustomTooltip currencySymbol={currencySymbol} bucketSize={bucketSize} />} cursor={{ fill: 'rgba(255,255,255,0.05)' }} />
            <Bar
              dataKey="tilaukset"
              fill="#3b82f6"
              radius={[2, 2, 0, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

/**
 * CustomerSegmentCard - B2B/B2C segment breakdown
 *
 * Näyttää asiakassegmenttien jakautuman ja avainluvut.
 */

import { Building2, User, TrendingUp, TrendingDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useCustomerSegments } from '@/hooks/useCustomerSegments'
import { useCurrentShop } from '@/config/storeConfig'

/**
 * Muutosindikaattori (MoM/YoY)
 */
function ChangeIndicator({ value, small = false }) {
  if (value === null || value === undefined) return null

  const isPositive = value > 0
  const Icon = isPositive ? TrendingUp : TrendingDown

  return (
    <span className={cn(
      'inline-flex items-center gap-0.5 tabular-nums',
      small ? 'text-[10px]' : 'text-xs',
      isPositive ? 'text-green-400' : 'text-red-400'
    )}>
      <Icon className={small ? 'w-2.5 h-2.5' : 'w-3 h-3'} />
      {isPositive ? '+' : ''}{value.toFixed(1)}%
    </span>
  )
}

/**
 * Yksittäinen segmenttirivi
 */
function SegmentRow({ icon: Icon, label, orders, revenue, margin, marginPercent, percentage, color, revenueChange, marginChange, currencySymbol }) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-card-border last:border-0">
      <div className="flex items-center gap-2.5">
        <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center', color)}>
          <Icon className="w-4 h-4" />
        </div>
        <div>
          <p className="font-medium text-foreground text-sm">{label}</p>
          <p className="text-xs text-foreground-muted">{orders} tilaukset</p>
        </div>
      </div>
      <div className="text-right min-w-[100px]">
        <p className="font-semibold text-foreground tabular-nums">
          {Math.round(revenue).toLocaleString('sv-SE')} {currencySymbol}
        </p>
        <div className="flex items-center justify-end gap-1">
          <span className="text-xs text-foreground-muted">{percentage}%</span>
          <ChangeIndicator value={revenueChange} small />
        </div>
      </div>
      <div className="text-right min-w-[100px]">
        <p className="font-semibold text-green-400 tabular-nums">
          {Math.round(margin).toLocaleString('sv-SE')} {currencySymbol}
        </p>
        <div className="flex items-center justify-end gap-1">
          <span className="text-xs text-foreground-muted">{marginPercent}%</span>
          <ChangeIndicator value={marginChange} small />
        </div>
      </div>
    </div>
  )
}

/**
 * CustomerSegmentCard
 *
 * @param {object} props
 * @param {string} props.startDate - Start date (YYYY-MM-DD)
 * @param {string} props.endDate - End date (YYYY-MM-DD)
 * @param {string} props.previousStartDate - Previous period start (for MoM/YoY)
 * @param {string} props.previousEndDate - Previous period end (for MoM/YoY)
 * @param {boolean} props.compare - Enable comparison
 * @param {string} props.label - Period label to display
 * @param {string} props.className
 */
export function CustomerSegmentCard({ startDate, endDate, previousStartDate, previousEndDate, compare = false, label, className }) {
  const { currencySymbol } = useCurrentShop()
  const { summary, percentages, comparison, isLoading, error } = useCustomerSegments({
    startDate,
    endDate,
    previousStartDate,
    previousEndDate,
    compare
  })

  if (isLoading) {
    return (
      <div className={cn('rounded-lg border border-card-border bg-background-elevated p-5', className)}>
        <div className="animate-pulse">
          <div className="h-5 w-32 bg-background-subtle rounded mb-4" />
          <div className="space-y-3">
            <div className="h-12 bg-background-subtle rounded" />
            <div className="h-12 bg-background-subtle rounded" />
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className={cn('rounded-lg border border-destructive/30 bg-background-elevated p-5', className)}>
        <p className="text-sm text-destructive">Segmenttidata ei saatavilla</p>
      </div>
    )
  }

  if (!summary) {
    return null
  }

  return (
    <div className={cn('rounded-lg border border-card-border bg-background-elevated p-5', className)}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-foreground">Asiakassegmentit</h3>
        {label && (
          <span className="text-xs text-foreground-muted px-2 py-1 bg-background-subtle rounded">
            {label}
          </span>
        )}
      </div>

      {/* Header */}
      <div className="flex items-center justify-between text-xs text-foreground-muted pb-2 border-b border-card-border mb-1">
        <span className="flex-1">Segmentti</span>
        <span className="text-right min-w-[90px]">Myynti</span>
        <span className="text-right min-w-[90px]">Kate</span>
      </div>

      {/* Segments */}
      <div className="divide-y divide-card-border">
        <SegmentRow
          icon={User}
          label="B2C (Kuluttajat)"
          orders={summary.b2c.orders}
          revenue={summary.b2c.revenue}
          margin={summary.b2c.margin || 0}
          marginPercent={summary.b2c.marginPercent || 0}
          percentage={percentages?.b2c.revenuePercent || 0}
          color="bg-primary/10 text-primary"
          revenueChange={comparison?.b2c.revenueChange}
          marginChange={comparison?.b2c.marginChange}
          currencySymbol={currencySymbol}
        />
        <SegmentRow
          icon={Building2}
          label="B2B (Yritykset)"
          orders={summary.b2b.orders}
          revenue={summary.b2b.revenue}
          margin={summary.b2b.margin || 0}
          marginPercent={summary.b2b.marginPercent || 0}
          percentage={percentages?.b2b.revenuePercent || 0}
          color="bg-accent/10 text-accent"
          revenueChange={comparison?.b2b.revenueChange}
          marginChange={comparison?.b2b.marginChange}
          currencySymbol={currencySymbol}
        />
      </div>

      {/* Total */}
      <div className="mt-4 pt-3 border-t border-card-border">
        <div className="flex items-center justify-between">
          <span className="text-sm text-foreground-muted">Yhteensä</span>
          <div className="text-right min-w-[100px]">
            <span className="font-semibold text-foreground tabular-nums">
              {Math.round(summary.total.revenue).toLocaleString('sv-SE')} {currencySymbol}
            </span>
            <div className="flex items-center justify-end gap-1">
              <span className="text-xs text-foreground-muted">({summary.total.orders})</span>
              <ChangeIndicator value={comparison?.total.revenueChange} small />
            </div>
          </div>
          <div className="text-right min-w-[100px]">
            <span className="font-semibold text-green-400 tabular-nums">
              {Math.round(summary.total.margin || 0).toLocaleString('sv-SE')} {currencySymbol}
            </span>
            <div className="flex items-center justify-end gap-1">
              <span className="text-xs text-foreground-muted">({summary.total.marginPercent || 0}%)</span>
              <ChangeIndicator value={comparison?.total.marginChange} small />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * CustomerSegmentSummary - Compact version for indicators page
 */
export function CustomerSegmentSummary({ period = '30d', className }) {
  const { percentages, isLoading } = useCustomerSegments({ period })

  if (isLoading || !percentages) {
    return null
  }

  return (
    <div className={cn('flex items-center gap-4', className)}>
      <div className="flex items-center gap-1.5">
        <User className="w-4 h-4 text-primary" />
        <span className="text-sm font-medium">{percentages.b2c.revenuePercent}% B2C</span>
      </div>
      <div className="flex items-center gap-1.5">
        <Building2 className="w-4 h-4 text-accent" />
        <span className="text-sm font-medium">{percentages.b2b.revenuePercent}% B2B</span>
      </div>
    </div>
  )
}

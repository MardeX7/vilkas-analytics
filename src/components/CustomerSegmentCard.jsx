/**
 * CustomerSegmentCard - B2B/B2C segment breakdown
 *
 * Näyttää asiakassegmenttien jakautuman ja avainluvut.
 */

import { Building2, User } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useCustomerSegments } from '@/hooks/useCustomerSegments'

/**
 * Yksittäinen segmenttirivi
 */
function SegmentRow({ icon: Icon, label, orders, revenue, margin, marginPercent, percentage, color }) {
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
      <div className="text-right">
        <p className="font-semibold text-foreground tabular-nums">
          {Math.round(revenue).toLocaleString('sv-SE')} kr
        </p>
        <p className="text-xs text-foreground-muted">{percentage}%</p>
      </div>
      <div className="text-right min-w-[90px]">
        <p className="font-semibold text-green-400 tabular-nums">
          {Math.round(margin).toLocaleString('sv-SE')} kr
        </p>
        <p className="text-xs text-foreground-muted">{marginPercent}%</p>
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
 * @param {string} props.label - Period label to display
 * @param {string} props.className
 */
export function CustomerSegmentCard({ startDate, endDate, label, className }) {
  const { summary, percentages, isLoading, error } = useCustomerSegments({ startDate, endDate })

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
        />
      </div>

      {/* Total */}
      <div className="mt-4 pt-3 border-t border-card-border">
        <div className="flex items-center justify-between">
          <span className="text-sm text-foreground-muted">Yhteensä</span>
          <div className="text-right min-w-[90px]">
            <span className="font-semibold text-foreground tabular-nums">
              {Math.round(summary.total.revenue).toLocaleString('sv-SE')} kr
            </span>
            <span className="text-xs text-foreground-muted ml-1">
              ({summary.total.orders})
            </span>
          </div>
          <div className="text-right min-w-[90px]">
            <span className="font-semibold text-green-400 tabular-nums">
              {Math.round(summary.total.margin || 0).toLocaleString('sv-SE')} kr
            </span>
            <span className="text-xs text-foreground-muted ml-1">
              ({summary.total.marginPercent || 0}%)
            </span>
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

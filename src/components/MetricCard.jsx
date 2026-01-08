import { TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * MetricCard - Clean, minimal KPI card
 *
 * Design principles:
 * - One hero metric per card
 * - Optional delta (change indicator)
 * - Optional sparkline (future)
 * - Calm, readable, executive-friendly
 */
export function MetricCard({
  label,
  value,
  delta,
  deltaLabel,
  previousValue, // Absolute value from comparison period
  subValue, // Additional info shown below value (e.g., "123 456 kr")
  suffix = '',
  prefix = '',
  invertDelta = false,
  size = 'default',
  className,
}) {
  const deltaValue = parseFloat(delta) || 0
  const hasDelta = delta !== undefined && delta !== null

  // Color logic - for metrics like position where lower is better
  const isPositive = invertDelta ? deltaValue < 0 : deltaValue > 0
  const isNegative = invertDelta ? deltaValue > 0 : deltaValue < 0
  const isNeutral = deltaValue === 0

  const formatValue = (val) => {
    if (typeof val !== 'number') return val
    return val.toLocaleString('sv-SE', { maximumFractionDigits: 0 })
  }

  const sizeClasses = {
    small: {
      card: 'p-4',
      label: 'text-xs',
      value: 'text-xl',
      suffix: 'text-sm',
      delta: 'text-xs',
    },
    default: {
      card: 'p-5',
      label: 'text-sm',
      value: 'text-2xl',
      suffix: 'text-base',
      delta: 'text-sm',
    },
    large: {
      card: 'p-6',
      label: 'text-sm',
      value: 'text-3xl',
      suffix: 'text-lg',
      delta: 'text-sm',
    },
  }

  const s = sizeClasses[size]

  return (
    <div
      className={cn(
        'rounded-lg border border-card-border bg-background-elevated',
        'transition-colors duration-200',
        s.card,
        className
      )}
    >
      {/* Label */}
      <p className={cn('text-foreground-muted font-medium mb-2', s.label)}>
        {label}
      </p>

      {/* Value */}
      <div className="flex items-baseline gap-1">
        {prefix && (
          <span className={cn('text-foreground-subtle', s.suffix)}>
            {prefix}
          </span>
        )}
        <span className={cn('font-semibold text-foreground tabular-nums', s.value)}>
          {formatValue(value)}
        </span>
        {suffix && (
          <span className={cn('text-foreground-subtle', s.suffix)}>
            {suffix}
          </span>
        )}
      </div>

      {/* Sub value (e.g., gross profit in currency) */}
      {subValue && (
        <p className="text-xs text-foreground-subtle mt-0.5 tabular-nums">
          ({subValue})
        </p>
      )}

      {/* Delta */}
      {hasDelta && (
        <div className="flex items-center gap-1.5 mt-2 flex-wrap">
          {isPositive && <TrendingUp className="w-3.5 h-3.5 text-success" />}
          {isNegative && <TrendingDown className="w-3.5 h-3.5 text-destructive" />}
          {isNeutral && <Minus className="w-3.5 h-3.5 text-foreground-subtle" />}

          <span
            className={cn(
              s.delta,
              'font-medium tabular-nums',
              isPositive && 'text-success',
              isNegative && 'text-destructive',
              isNeutral && 'text-foreground-subtle'
            )}
          >
            {deltaValue > 0 && '+'}
            {deltaValue.toFixed(1)}%
          </span>

          {/* Show previous absolute value in parentheses */}
          {previousValue !== undefined && previousValue !== null && (
            <span className="text-xs text-foreground-subtle tabular-nums">
              ({prefix}{formatValue(previousValue)}{suffix})
            </span>
          )}

          {deltaLabel && (
            <span className="text-xs text-foreground-subtle ml-0.5">
              {deltaLabel}
            </span>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * MetricCardSkeleton - Loading state
 */
export function MetricCardSkeleton({ size = 'default', className }) {
  const sizeClasses = {
    small: 'p-4',
    default: 'p-5',
    large: 'p-6',
  }

  return (
    <div
      className={cn(
        'rounded-lg border border-card-border bg-background-elevated animate-pulse',
        sizeClasses[size],
        className
      )}
    >
      <div className="h-4 w-20 bg-background-subtle rounded mb-3" />
      <div className="h-7 w-28 bg-background-subtle rounded mb-2" />
      <div className="h-4 w-16 bg-background-subtle rounded" />
    </div>
  )
}

/**
 * MetricCardGroup - Container for metric cards with consistent spacing
 */
export function MetricCardGroup({ children, columns = 4, className }) {
  const gridCols = {
    2: 'grid-cols-1 sm:grid-cols-2',
    3: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
    4: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4',
    5: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-5',
  }

  return (
    <div className={cn('grid gap-4', gridCols[columns], className)}>
      {children}
    </div>
  )
}

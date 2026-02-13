/**
 * StrategicIndexCard - Apple-tyylinen indeksikortti
 *
 * Näyttää yhden strategisen indeksin arvon, tulkinnan ja komponentit.
 * Suunniteltu Steve Jobsin "less is more" -filosofialla.
 */

import { TrendingUp, TrendingDown, Minus, Users, Search, Package, ChevronDown, ChevronUp } from 'lucide-react'
import { useState } from 'react'
import { cn } from '@/lib/utils'

const ICONS = {
  TrendingUp,
  Users,
  Search,
  Package
}

/**
 * Get color classes based on interpretation level
 */
function getColorClasses(level, variant = 'default') {
  const colors = {
    excellent: {
      default: 'text-emerald-400',
      bg: 'bg-emerald-500/10',
      border: 'border-emerald-500/30',
      progress: 'bg-emerald-500'
    },
    good: {
      default: 'text-green-400',
      bg: 'bg-green-500/10',
      border: 'border-green-500/30',
      progress: 'bg-green-500'
    },
    fair: {
      default: 'text-amber-400',
      bg: 'bg-amber-500/10',
      border: 'border-amber-500/30',
      progress: 'bg-amber-500'
    },
    poor: {
      default: 'text-orange-400',
      bg: 'bg-orange-500/10',
      border: 'border-orange-500/30',
      progress: 'bg-orange-500'
    },
    critical: {
      default: 'text-red-400',
      bg: 'bg-red-500/10',
      border: 'border-red-500/30',
      progress: 'bg-red-500'
    },
    unknown: {
      default: 'text-gray-400',
      bg: 'bg-gray-500/10',
      border: 'border-gray-500/30',
      progress: 'bg-gray-500'
    }
  }

  return colors[level]?.[variant] || colors.unknown[variant]
}

/**
 * Format YoY change for display
 */
function formatYoYChange(value) {
  if (value === null || value === undefined) return null
  const sign = value >= 0 ? '+' : ''
  return `${sign}${value.toFixed(1)}%`
}

/**
 * Main Overall Index Card - Large hero display
 */
export function OverallStrategicIndex({ value, interpretation, indices }) {
  const colorClass = getColorClasses(interpretation?.level)
  const progressColor = getColorClasses(interpretation?.level, 'progress')

  return (
    <div className={cn(
      "relative overflow-hidden rounded-2xl p-8",
      "bg-gradient-to-br from-background-elevated via-background to-background-elevated",
      "border border-card-border"
    )}>
      {/* Subtle gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent pointer-events-none" />

      {/* Content */}
      <div className="relative">
        {/* Label */}
        <p className="text-foreground-muted text-sm font-medium tracking-wide uppercase mb-2">
          Kokonaisindeksi
        </p>

        {/* Main Value */}
        <div className="flex items-end gap-4 mb-4">
          <span className={cn("text-8xl font-bold tabular-nums", colorClass)}>
            {value ?? '—'}
          </span>
          <span className="text-4xl text-foreground-subtle font-light mb-3">/ 100</span>
        </div>

        {/* Interpretation */}
        <div className="flex items-center gap-3 mb-8">
          <span className={cn("text-xl font-semibold", colorClass)}>
            {interpretation?.label || 'Ei dataa'}
          </span>
        </div>

        {/* Progress Bar */}
        <div className="mb-8">
          <div className="h-3 bg-background-subtle rounded-full overflow-hidden">
            <div
              className={cn("h-full rounded-full transition-all duration-700 ease-out", progressColor)}
              style={{ width: `${value || 0}%` }}
            />
          </div>
          <div className="flex justify-between mt-2 text-xs text-foreground-subtle">
            <span>0</span>
            <span>50</span>
            <span>100</span>
          </div>
        </div>

        {/* Mini Index Cards */}
        <div className="grid grid-cols-4 gap-3">
          {indices && Object.values(indices).filter(i => i.id).map(index => (
            <div
              key={index.id}
              className="bg-background/50 rounded-lg px-3 py-2 border border-border/50"
            >
              <p className="text-foreground-subtle text-xs truncate">{index.shortName}</p>
              <p className={cn("text-lg font-bold tabular-nums", getColorClasses(index.interpretation?.level))}>
                {index.value ?? '—'}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/**
 * Strategic Index Card - Sub-index display with expandable components
 */
export function StrategicIndexCard({ index, className }) {
  const [isExpanded, setIsExpanded] = useState(false)

  if (!index) return null

  const { name, shortName, description, value, interpretation, components, icon, weight } = index
  const Icon = ICONS[icon] || TrendingUp
  const colorClass = getColorClasses(interpretation?.level)
  const bgClass = getColorClasses(interpretation?.level, 'bg')
  const progressColor = getColorClasses(interpretation?.level, 'progress')

  return (
    <div className={cn(
      "group relative overflow-hidden",
      "bg-background-elevated hover:bg-background-subtle",
      "border border-card-border hover:border-border",
      "rounded-xl transition-all duration-200",
      className
    )}>
      {/* Main Content */}
      <div className="p-5">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className={cn("w-11 h-11 rounded-xl flex items-center justify-center", bgClass)}>
            <Icon className={cn("w-5 h-5", colorClass)} />
          </div>
          <div className="text-right">
            <span className="text-foreground-subtle text-xs">
              Paino: {Math.round(weight * 100)}%
            </span>
          </div>
        </div>

        {/* Title & Value */}
        <p className="text-foreground-muted text-sm font-medium mb-1">{shortName}</p>
        <div className="flex items-baseline gap-2 mb-2">
          <span className={cn("text-4xl font-bold tabular-nums", colorClass)}>
            {value ?? '—'}
          </span>
          <span className="text-foreground-subtle text-sm">/ 100</span>
        </div>

        {/* Status */}
        <p className={cn("text-sm font-medium mb-4", colorClass)}>
          {interpretation?.label || 'Ei dataa'}
        </p>

        {/* Progress Bar */}
        <div className="mb-4">
          <div className="h-2 bg-background-subtle rounded-full overflow-hidden">
            <div
              className={cn("h-full rounded-full transition-all duration-500", progressColor)}
              style={{ width: `${value || 0}%` }}
            />
          </div>
        </div>

        {/* Expand Button */}
        {components && components.length > 0 && (
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="w-full flex items-center justify-center gap-1 text-foreground-subtle hover:text-foreground text-xs py-2 transition-colors"
          >
            <span>{isExpanded ? 'Piilota komponentit' : 'Näytä komponentit'}</span>
            {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
        )}
      </div>

      {/* Expanded Components */}
      {isExpanded && components && components.length > 0 && (
        <div className="px-5 pb-5 pt-2 border-t border-border">
          <div className="space-y-3">
            {components.map(comp => (
              <ComponentRow key={comp.id} component={comp} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * Component Row - Shows a single metric component
 */
function ComponentRow({ component }) {
  const { label, value, raw, weight } = component

  // Determine trend
  const TrendIcon = raw === null ? Minus : (raw >= 0 ? TrendingUp : TrendingDown)
  const trendColor = raw === null ? 'text-foreground-subtle' : (raw >= 0 ? 'text-emerald-400' : 'text-red-400')

  return (
    <div className="flex items-center gap-3">
      {/* Label */}
      <div className="flex-1 min-w-0">
        <p className="text-foreground-muted text-xs truncate">{label}</p>
      </div>

      {/* Raw Change Value */}
      <div className={cn("flex items-center gap-1 text-xs font-medium tabular-nums", trendColor)}>
        <TrendIcon className="w-3 h-3" />
        <span>{formatYoYChange(raw) || '—'}</span>
      </div>

      {/* Index Score */}
      <div className="w-10 text-right">
        <span className={cn(
          "text-sm font-bold tabular-nums",
          value === null ? 'text-foreground-subtle' :
          value >= 60 ? 'text-emerald-400' :
          value >= 40 ? 'text-amber-400' : 'text-red-400'
        )}>
          {value?.toFixed(0) ?? '—'}
        </span>
      </div>

      {/* Weight */}
      <div className="w-10 text-right text-foreground-subtle text-xs">
        {Math.round(weight * 100)}%
      </div>
    </div>
  )
}

/**
 * Period Info Banner - Shows the comparison period
 */
export function PeriodInfoBanner({ dateRanges, className }) {
  if (!dateRanges) return null

  return (
    <div className={cn(
      "flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 px-4 py-3 rounded-lg",
      "bg-background-elevated/50 border border-border/50",
      className
    )}>
      <div className="flex items-center gap-2 text-sm">
        <span className="font-semibold text-foreground">{dateRanges.label || 'Nykyinen jakso'}</span>
        <span className="text-foreground-subtle text-xs">
          ({dateRanges.current.start} — {dateRanges.current.end})
        </span>
      </div>
      <div className="flex items-center gap-2 text-sm">
        <span className="text-foreground-muted">vs.</span>
        <span className="font-medium text-foreground-muted">{dateRanges.yoyLabel || 'Viime vuosi'}</span>
        <span className="text-foreground-subtle text-xs">
          ({dateRanges.yoy.start} — {dateRanges.yoy.end})
        </span>
        <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-medium">YoY</span>
      </div>
    </div>
  )
}

export default StrategicIndexCard

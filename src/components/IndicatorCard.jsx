/**
 * IndicatorCard Component
 *
 * Displays a single indicator with value, trend, and alert status.
 * Supports all 7 MVP indicators from the Indicator Engine.
 */

import { useNavigate } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  TrendingUp,
  TrendingDown,
  Minus,
  AlertTriangle,
  ShoppingCart,
  DollarSign,
  Percent,
  Search,
  Tag,
  Package,
  BarChart3
} from 'lucide-react'
import { useTranslation } from '@/lib/i18n'
import { useCurrentShop } from '@/config/storeConfig'

// Indicator metadata (icons and formatting only - titles come from i18n)
const INDICATOR_CONFIG = {
  sales_trend: {
    icon: ShoppingCart,
    color: 'cyan',
    format: 'trend'
  },
  aov: {
    icon: DollarSign,
    color: 'green',
    format: 'currency'
  },
  gross_margin: {
    icon: Percent,
    color: 'purple',
    format: 'percent'
  },
  position_change: {
    icon: Search,
    color: 'blue',
    format: 'positions'
  },
  brand_vs_nonbrand: {
    icon: Tag,
    color: 'amber',
    format: 'percent'
  },
  organic_conversion_rate: {
    icon: BarChart3,
    color: 'emerald',
    format: 'percent'
  },
  stock_availability_risk: {
    icon: Package,
    color: 'red',
    format: 'currency'
  }
}

// Color mappings using design tokens (Billackering brand)
const COLOR_CLASSES = {
  cyan: {
    bg: 'bg-primary-muted',
    text: 'text-primary',
    border: 'border-primary/30'
  },
  green: {
    bg: 'bg-success-muted',
    text: 'text-success',
    border: 'border-success/30'
  },
  purple: {
    bg: 'bg-purple-500/20',
    text: 'text-purple-400',
    border: 'border-purple-500/30'
  },
  blue: {
    bg: 'bg-info-muted',
    text: 'text-info',
    border: 'border-info/30'
  },
  amber: {
    bg: 'bg-warning-muted',
    text: 'text-warning',
    border: 'border-warning/30'
  },
  emerald: {
    bg: 'bg-success-muted',
    text: 'text-success',
    border: 'border-success/30'
  },
  red: {
    bg: 'bg-destructive-muted',
    text: 'text-destructive',
    border: 'border-destructive/30'
  }
}

/**
 * Format value based on indicator type
 */
function formatValue(value, format, unit, locale = 'fi-FI') {
  if (value === null || value === undefined) return '—'

  switch (format) {
    case 'currency':
      return `${Number(value).toLocaleString(locale, { maximumFractionDigits: 0 })} ${unit || ''}`
    case 'percent':
      return `${Number(value).toFixed(1)}%`
    case 'positions':
      const pos = Number(value)
      return pos > 0 ? `+${pos.toFixed(1)}` : pos.toFixed(1)
    case 'trend':
      return value // Already formatted as 'growing', 'declining', 'stable'
    default:
      return String(value)
  }
}

/**
 * Get direction icon
 */
function DirectionIcon({ direction, className = '' }) {
  switch (direction) {
    case 'up':
      return <TrendingUp className={`${className} text-success`} />
    case 'down':
      return <TrendingDown className={`${className} text-destructive`} />
    default:
      return <Minus className={`${className} text-foreground-subtle`} />
  }
}

/**
 * IndicatorCard Component
 */
export function IndicatorCard({
  indicator,
  onClick,
  compact = false
}) {
  const { t, locale } = useTranslation()
  const { currencySymbol } = useCurrentShop()
  const navigate = useNavigate()

  if (!indicator) return null

  // Handle click - navigate to detail page or use custom onClick
  const handleClick = () => {
    if (onClick) {
      onClick(indicator)
    } else {
      navigate(`/indicators/${indicator.indicator_id}`)
    }
  }

  const config = INDICATOR_CONFIG[indicator.indicator_id] || {
    icon: BarChart3,
    color: 'cyan',
    format: 'number'
  }

  const Icon = config.icon
  const colors = COLOR_CLASSES[config.color] || COLOR_CLASSES.cyan

  // Get translated title and description
  const title = t(`indicators.types.${indicator.indicator_id}.title`) || indicator.indicator_id
  const description = t(`indicators.types.${indicator.indicator_id}.description`)

  // Get display value - use dynamic currencySymbol for currency format
  const displayValue = formatValue(
    indicator.numeric_value ?? indicator.value?.value,
    config.format,
    config.format === 'currency' ? currencySymbol : config.unit,
    locale
  )

  // Get change text
  const changeValue = indicator.change_percent
  const hasChange = changeValue !== null && changeValue !== undefined

  if (compact) {
    return (
      <div
        className={`flex items-center gap-3 p-3 rounded-lg bg-background-elevated border ${colors.border} cursor-pointer hover:bg-background-subtle transition-colors`}
        onClick={handleClick}
      >
        <div className={`p-2 rounded-lg ${colors.bg}`}>
          <Icon className={`w-4 h-4 ${colors.text}`} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-foreground-muted truncate">{title}</p>
          <p className="text-sm font-semibold text-foreground">{displayValue}</p>
        </div>
        {indicator.alert_triggered && (
          <AlertTriangle className="w-4 h-4 text-warning flex-shrink-0" />
        )}
        <DirectionIcon direction={indicator.direction} className="w-4 h-4 flex-shrink-0" />
      </div>
    )
  }

  return (
    <Card
      className={`bg-background-elevated border-card-border cursor-pointer hover:border-border transition-colors ${
        indicator.alert_triggered ? 'ring-1 ring-warning/50' : ''
      }`}
      onClick={handleClick}
    >
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className={`p-2 rounded-lg ${colors.bg}`}>
              <Icon className={`w-5 h-5 ${colors.text}`} />
            </div>
            <CardTitle className="text-sm font-medium text-foreground-muted">
              {title}
            </CardTitle>
          </div>
          {indicator.alert_triggered && (
            <AlertTriangle className="w-5 h-5 text-warning" />
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-end justify-between">
          <div>
            <p className="text-2xl font-bold text-foreground tabular-nums">
              {displayValue}
            </p>
            {hasChange && (
              <div className="flex items-center gap-1 mt-1">
                <DirectionIcon direction={indicator.direction} className="w-4 h-4" />
                <span className={`text-sm tabular-nums ${
                  changeValue > 0 ? 'text-success' :
                  changeValue < 0 ? 'text-destructive' : 'text-foreground-subtle'
                }`}>
                  {changeValue > 0 && '+'}{changeValue.toFixed(1)}%
                </span>
              </div>
            )}
          </div>
          <div className={`px-2 py-1 rounded text-xs font-medium ${
            indicator.priority === 'critical' ? 'bg-destructive-muted text-destructive' :
            indicator.priority === 'high' ? 'bg-warning-muted text-warning' :
            'bg-background-subtle text-foreground-subtle'
          }`}>
            {indicator.confidence}
          </div>
        </div>
        <p className="text-xs text-foreground-subtle mt-3">
          {description}
        </p>
      </CardContent>
    </Card>
  )
}

/**
 * IndicatorGrid - Display multiple indicators in a grid
 */
export function IndicatorGrid({
  indicators,
  onIndicatorClick,
  columns = 4
}) {
  const { t } = useTranslation()

  if (!indicators || indicators.length === 0) {
    return (
      <div className="text-center py-8 text-foreground-muted">
        {t('indicators.noData')}
      </div>
    )
  }

  return (
    <div className={`grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-${columns}`}>
      {indicators.map(indicator => (
        <IndicatorCard
          key={indicator.indicator_id}
          indicator={indicator}
          onClick={() => onIndicatorClick?.(indicator)}
        />
      ))}
    </div>
  )
}

/**
 * AlertBadge - Shows alert count
 */
export function AlertBadge({ count, onClick }) {
  const { t } = useTranslation()

  if (!count || count === 0) return null

  const label = count === 1
    ? t('alerts.countOne')
    : t('alerts.count', { count })

  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 px-3 py-1.5 bg-warning-muted text-warning rounded-full text-sm font-medium hover:bg-warning/20 transition-colors"
    >
      <AlertTriangle className="w-4 h-4" />
      {label}
    </button>
  )
}

export default IndicatorCard

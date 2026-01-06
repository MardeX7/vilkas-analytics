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
    format: 'currency',
    unit: 'SEK'
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
    format: 'currency',
    unit: 'SEK'
  }
}

// Color mappings for Tailwind
const COLOR_CLASSES = {
  cyan: {
    bg: 'bg-cyan-500/20',
    text: 'text-cyan-400',
    border: 'border-cyan-500/30'
  },
  green: {
    bg: 'bg-green-500/20',
    text: 'text-green-400',
    border: 'border-green-500/30'
  },
  purple: {
    bg: 'bg-purple-500/20',
    text: 'text-purple-400',
    border: 'border-purple-500/30'
  },
  blue: {
    bg: 'bg-blue-500/20',
    text: 'text-blue-400',
    border: 'border-blue-500/30'
  },
  amber: {
    bg: 'bg-amber-500/20',
    text: 'text-amber-400',
    border: 'border-amber-500/30'
  },
  emerald: {
    bg: 'bg-emerald-500/20',
    text: 'text-emerald-400',
    border: 'border-emerald-500/30'
  },
  red: {
    bg: 'bg-red-500/20',
    text: 'text-red-400',
    border: 'border-red-500/30'
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
      return <TrendingUp className={`${className} text-green-400`} />
    case 'down':
      return <TrendingDown className={`${className} text-red-400`} />
    default:
      return <Minus className={`${className} text-slate-400`} />
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

  // Get display value
  const displayValue = formatValue(
    indicator.numeric_value ?? indicator.value?.value,
    config.format,
    config.unit,
    locale
  )

  // Get change text
  const changeValue = indicator.change_percent
  const hasChange = changeValue !== null && changeValue !== undefined

  if (compact) {
    return (
      <div
        className={`flex items-center gap-3 p-3 rounded-lg bg-slate-800/50 border ${colors.border} cursor-pointer hover:bg-slate-800 transition-colors`}
        onClick={handleClick}
      >
        <div className={`p-2 rounded-lg ${colors.bg}`}>
          <Icon className={`w-4 h-4 ${colors.text}`} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-slate-400 truncate">{title}</p>
          <p className="text-sm font-semibold text-white">{displayValue}</p>
        </div>
        {indicator.alert_triggered && (
          <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0" />
        )}
        <DirectionIcon direction={indicator.direction} className="w-4 h-4 flex-shrink-0" />
      </div>
    )
  }

  return (
    <Card
      className={`bg-slate-800/50 border-slate-700 cursor-pointer hover:border-slate-600 transition-colors ${
        indicator.alert_triggered ? 'ring-1 ring-amber-500/50' : ''
      }`}
      onClick={handleClick}
    >
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className={`p-2 rounded-lg ${colors.bg}`}>
              <Icon className={`w-5 h-5 ${colors.text}`} />
            </div>
            <CardTitle className="text-sm font-medium text-slate-300">
              {title}
            </CardTitle>
          </div>
          {indicator.alert_triggered && (
            <AlertTriangle className="w-5 h-5 text-amber-400" />
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-end justify-between">
          <div>
            <p className="text-2xl font-bold text-white">
              {displayValue}
            </p>
            {hasChange && (
              <div className="flex items-center gap-1 mt-1">
                <DirectionIcon direction={indicator.direction} className="w-4 h-4" />
                <span className={`text-sm ${
                  changeValue > 0 ? 'text-green-400' :
                  changeValue < 0 ? 'text-red-400' : 'text-slate-400'
                }`}>
                  {changeValue > 0 && '+'}{changeValue.toFixed(1)}%
                </span>
              </div>
            )}
          </div>
          <div className={`px-2 py-1 rounded text-xs font-medium ${
            indicator.priority === 'critical' ? 'bg-red-500/20 text-red-400' :
            indicator.priority === 'high' ? 'bg-amber-500/20 text-amber-400' :
            'bg-slate-700 text-slate-400'
          }`}>
            {indicator.confidence}
          </div>
        </div>
        <p className="text-xs text-slate-500 mt-3">
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
      <div className="text-center py-8 text-slate-400">
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
      className="flex items-center gap-2 px-3 py-1.5 bg-amber-500/20 text-amber-400 rounded-full text-sm font-medium hover:bg-amber-500/30 transition-colors"
    >
      <AlertTriangle className="w-4 h-4" />
      {label}
    </button>
  )
}

export default IndicatorCard

/**
 * TrafficChart - Interactive stacked bar chart with channel breakdown
 *
 * Features:
 * - Stacked bars showing channel distribution
 * - Trend line overlay
 * - Day/Week/Month aggregation toggle
 * - Hover tooltips with detailed breakdown
 */

import { useState, useMemo } from 'react'
import { TrendingUp, BarChart3, Calendar } from 'lucide-react'
import { useTranslation } from '@/lib/i18n'

// Channel colors matching GA4Page
const CHANNEL_COLORS = {
  'Organic Search': '#22c55e',
  'Direct': '#01a7da',
  'Paid Search': '#eee000',
  'Paid Social': '#ec4899',
  'Organic Social': '#8b5cf6',
  'Referral': '#14b8a6',
  'Email': '#d92d33',
  'Cross-network': '#f97316',
  'Unassigned': '#6b7685'
}

// Aggregation modes
const MODES = {
  day: { label: 'Päivä', labelSv: 'Dag' },
  week: { label: 'Viikko', labelSv: 'Vecka' },
  month: { label: 'Kuukausi', labelSv: 'Månad' }
}

export function TrafficChart({
  dailySummary = [],
  channelData = [],
  showTrend = true
}) {
  const { t, language } = useTranslation()
  const [mode, setMode] = useState('day')
  const [hoveredBar, setHoveredBar] = useState(null)

  // Get unique channels from data
  const channels = useMemo(() => {
    const channelSet = new Set()
    channelData.forEach(row => {
      if (row.session_default_channel_grouping) {
        channelSet.add(row.session_default_channel_grouping)
      }
    })
    // Sort by importance
    const order = ['Organic Search', 'Direct', 'Paid Search', 'Paid Social', 'Organic Social', 'Cross-network', 'Referral', 'Email', 'Unassigned']
    return order.filter(ch => channelSet.has(ch))
  }, [channelData])

  // Aggregate data by mode (day/week/month)
  const aggregatedData = useMemo(() => {
    if (dailySummary.length === 0) return []

    // Group channel data by date
    const channelByDate = {}
    channelData.forEach(row => {
      const date = row.date
      const channel = row.session_default_channel_grouping || 'Direct'
      const sessions = row.sessions || 0

      if (!channelByDate[date]) {
        channelByDate[date] = {}
      }
      channelByDate[date][channel] = (channelByDate[date][channel] || 0) + sessions
    })

    // Create base data with channel breakdown
    let data = dailySummary.map(day => {
      const channels = channelByDate[day.date] || {}
      return {
        date: day.date,
        total: day.total_sessions || 0,
        channels
      }
    }).reverse() // Oldest first

    // Aggregate if needed
    if (mode === 'week') {
      const weeks = {}
      data.forEach(d => {
        const date = new Date(d.date)
        // Get week start (Monday)
        const day = date.getDay()
        const diff = date.getDate() - day + (day === 0 ? -6 : 1)
        const weekStart = new Date(date.setDate(diff))
        const weekKey = weekStart.toISOString().split('T')[0]

        if (!weeks[weekKey]) {
          weeks[weekKey] = { date: weekKey, total: 0, channels: {} }
        }
        weeks[weekKey].total += d.total
        Object.entries(d.channels).forEach(([ch, val]) => {
          weeks[weekKey].channels[ch] = (weeks[weekKey].channels[ch] || 0) + val
        })
      })
      data = Object.values(weeks).sort((a, b) => a.date.localeCompare(b.date))
    } else if (mode === 'month') {
      const months = {}
      data.forEach(d => {
        const monthKey = d.date.slice(0, 7) // YYYY-MM
        if (!months[monthKey]) {
          months[monthKey] = { date: monthKey, total: 0, channels: {} }
        }
        months[monthKey].total += d.total
        Object.entries(d.channels).forEach(([ch, val]) => {
          months[monthKey].channels[ch] = (months[monthKey].channels[ch] || 0) + val
        })
      })
      data = Object.values(months).sort((a, b) => a.date.localeCompare(b.date))
    }

    return data
  }, [dailySummary, channelData, mode])

  // Calculate max for scaling
  const maxTotal = useMemo(() => {
    return Math.max(...aggregatedData.map(d => d.total), 1)
  }, [aggregatedData])

  // Calculate trend line points
  const trendPoints = useMemo(() => {
    if (!showTrend || aggregatedData.length < 2) return null

    const points = aggregatedData.map((d, i) => {
      const x = (i / (aggregatedData.length - 1)) * 100
      const y = 100 - (d.total / maxTotal) * 100
      return `${x},${y}`
    })

    return points.join(' ')
  }, [aggregatedData, maxTotal, showTrend])

  // Format date for display
  const formatDate = (dateStr) => {
    if (mode === 'month') {
      const [year, month] = dateStr.split('-')
      const months = ['Tammi', 'Helmi', 'Maalis', 'Huhti', 'Touko', 'Kesä', 'Heinä', 'Elo', 'Syys', 'Loka', 'Marras', 'Joulu']
      const monthsSv = ['Jan', 'Feb', 'Mar', 'Apr', 'Maj', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dec']
      const monthArr = language === 'sv' ? monthsSv : months
      return `${monthArr[parseInt(month) - 1]} ${year.slice(2)}`
    }
    if (mode === 'week') {
      const date = new Date(dateStr)
      const weekNum = getWeekNumber(date)
      return language === 'sv' ? `V${weekNum}` : `Vk ${weekNum}`
    }
    // Day: just show day number
    return dateStr.split('-')[2]
  }

  const getWeekNumber = (date) => {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
    const dayNum = d.getUTCDay() || 7
    d.setUTCDate(d.getUTCDate() + 4 - dayNum)
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
    return Math.ceil((((d - yearStart) / 86400000) + 1) / 7)
  }

  if (aggregatedData.length === 0) {
    return (
      <div className="bg-background-elevated rounded-lg border border-card-border p-5">
        <div className="h-64 flex items-center justify-center">
          <p className="text-foreground-subtle">{t('ga4.noDataForPeriod')}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-background-elevated rounded-lg border border-card-border p-5">
      {/* Header with mode toggle */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-medium text-foreground flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-primary" />
          {t('ga4.dailyTraffic')}
        </h3>

        {/* Aggregation mode toggle */}
        <div className="flex items-center gap-1 bg-background-subtle rounded-lg p-1">
          {Object.entries(MODES).map(([key, { label, labelSv }]) => (
            <button
              key={key}
              onClick={() => setMode(key)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                mode === key
                  ? 'bg-primary text-primary-foreground'
                  : 'text-foreground-muted hover:text-foreground hover:bg-background-elevated'
              }`}
            >
              {language === 'sv' ? labelSv : label}
            </button>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 mb-4">
        {channels.slice(0, 6).map(channel => (
          <div key={channel} className="flex items-center gap-1.5">
            <div
              className="w-3 h-3 rounded-sm"
              style={{ backgroundColor: CHANNEL_COLORS[channel] || '#6b7685' }}
            />
            <span className="text-xs text-foreground-muted">{channel}</span>
          </div>
        ))}
        {channels.length > 6 && (
          <span className="text-xs text-foreground-subtle">+{channels.length - 6} {language === 'sv' ? 'till' : 'muuta'}</span>
        )}
      </div>

      {/* Chart */}
      <div className="relative h-56">
        {/* Trend line SVG overlay */}
        {showTrend && trendPoints && (
          <svg
            className="absolute inset-0 w-full h-full pointer-events-none z-10"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
          >
            <polyline
              points={trendPoints}
              fill="none"
              stroke="rgba(255,255,255,0.4)"
              strokeWidth="0.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}

        {/* Stacked bars */}
        <div className="flex items-end h-full gap-0.5">
          {aggregatedData.map((bar, i) => {
            const heightPercent = (bar.total / maxTotal) * 100
            const isHovered = hoveredBar === i

            // Calculate stacked segments
            let currentY = 0
            const segments = channels.map(channel => {
              const value = bar.channels[channel] || 0
              const segmentHeight = bar.total > 0 ? (value / bar.total) * heightPercent : 0
              const segment = { channel, value, y: currentY, height: segmentHeight }
              currentY += segmentHeight
              return segment
            }).filter(s => s.value > 0)

            return (
              <div
                key={i}
                className="flex-1 relative group cursor-pointer"
                style={{ height: '100%' }}
                onMouseEnter={() => setHoveredBar(i)}
                onMouseLeave={() => setHoveredBar(null)}
              >
                {/* Stacked bar */}
                <div
                  className="absolute bottom-0 left-0 right-0 flex flex-col-reverse transition-all duration-150"
                  style={{ height: `${heightPercent}%`, minHeight: bar.total > 0 ? '2px' : '0' }}
                >
                  {segments.map((seg, j) => (
                    <div
                      key={j}
                      className="w-full transition-opacity"
                      style={{
                        height: `${(seg.value / bar.total) * 100}%`,
                        backgroundColor: CHANNEL_COLORS[seg.channel] || '#6b7685',
                        opacity: isHovered ? 1 : 0.7
                      }}
                    />
                  ))}
                </div>

                {/* Tooltip */}
                {isHovered && (
                  <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-background-subtle border border-border rounded-lg p-3 shadow-xl z-20 min-w-[160px]">
                    <p className="text-sm font-medium text-foreground mb-2">
                      {mode === 'day' ? bar.date : formatDate(bar.date)}
                    </p>
                    <p className="text-lg font-bold text-foreground mb-2">
                      {bar.total.toLocaleString()} {t('ga4.sessions').toLowerCase()}
                    </p>
                    <div className="space-y-1 border-t border-border pt-2">
                      {segments.slice(0, 5).map((seg, j) => (
                        <div key={j} className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-1.5">
                            <div
                              className="w-2 h-2 rounded-sm"
                              style={{ backgroundColor: CHANNEL_COLORS[seg.channel] }}
                            />
                            <span className="text-foreground-muted">{seg.channel}</span>
                          </div>
                          <span className="text-foreground font-medium">{seg.value}</span>
                        </div>
                      ))}
                      {segments.length > 5 && (
                        <p className="text-xs text-foreground-subtle">
                          +{segments.length - 5} {language === 'sv' ? 'till' : 'muuta'}
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* X-axis labels */}
      <div className="flex justify-between mt-2 text-xs text-foreground-subtle">
        <span>{formatDate(aggregatedData[0]?.date)}</span>
        {aggregatedData.length > 2 && (
          <span>{formatDate(aggregatedData[Math.floor(aggregatedData.length / 2)]?.date)}</span>
        )}
        <span>{formatDate(aggregatedData[aggregatedData.length - 1]?.date)}</span>
      </div>

      {/* Summary stats */}
      <div className="flex items-center gap-6 mt-4 pt-4 border-t border-border">
        <div>
          <p className="text-xs text-foreground-muted">{language === 'sv' ? 'Totalt' : 'Yhteensä'}</p>
          <p className="text-lg font-bold text-foreground">
            {aggregatedData.reduce((sum, d) => sum + d.total, 0).toLocaleString()}
          </p>
        </div>
        <div>
          <p className="text-xs text-foreground-muted">{language === 'sv' ? 'Medel/dag' : 'Ka./päivä'}</p>
          <p className="text-lg font-bold text-foreground">
            {mode === 'day'
              ? Math.round(aggregatedData.reduce((sum, d) => sum + d.total, 0) / aggregatedData.length).toLocaleString()
              : '—'
            }
          </p>
        </div>
        <div>
          <p className="text-xs text-foreground-muted">{language === 'sv' ? 'Bästa dag' : 'Paras päivä'}</p>
          <p className="text-lg font-bold text-foreground">
            {maxTotal.toLocaleString()}
          </p>
        </div>
      </div>
    </div>
  )
}

export default TrafficChart

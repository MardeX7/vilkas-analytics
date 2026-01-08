import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useTranslation } from '@/lib/i18n'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell
} from 'recharts'
import { Search, Globe, Smartphone, Monitor, Tablet } from 'lucide-react'

// Billackering brand colors
const COLORS = {
  primary: '#01a7da',
  secondary: '#8b5cf6',
  success: '#22c55e',
  warning: '#eee000',
  destructive: '#d92d33',
  muted: '#6b7685',
  grid: '#1a2230',
  tooltip: '#0d1117',
  text: '#f8fafc',
}

const DEVICE_COLORS = {
  'DESKTOP': COLORS.primary,
  'MOBILE': COLORS.secondary,
  'TABLET': COLORS.success
}

const COUNTRY_COLORS = [COLORS.primary, COLORS.secondary, COLORS.success, '#f59e0b', COLORS.destructive, '#ec4899', '#14b8a6', '#6366f1']

// GSC Connect Card (shown when not connected)
export function GSCConnectCard({ onConnect }) {
  const { t } = useTranslation()
  return (
    <Card className="bg-background-elevated border-card-border">
      <CardContent className="pt-6">
        <div className="text-center py-8">
          <div className="p-4 bg-background-subtle rounded-full w-16 h-16 mx-auto mb-4 flex items-center justify-center">
            <Search className="w-8 h-8 text-foreground-subtle" />
          </div>
          <h3 className="text-lg font-medium text-foreground mb-2">{t('gsc.notConnected')}</h3>
          <p className="text-sm text-foreground-muted mb-6 max-w-md mx-auto">
            {t('gsc.connectDescription')}
          </p>
          <Button
            onClick={onConnect}
            className="bg-primary hover:bg-primary/90 text-primary-foreground"
          >
            <Search className="w-4 h-4 mr-2" />
            {t('gsc.connect')}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

// Daily Clicks & Impressions Chart
export function GSCDailyChart({ data, previousData = [], comparisonEnabled = false }) {
  const { t, language } = useTranslation()
  // Combine current and previous data if comparison is enabled
  const chartData = [...data].reverse().map((d, index) => {
    const prevItem = previousData && previousData.length > 0
      ? [...previousData].reverse()[index]
      : null

    return {
      date: new Date(d.date).toLocaleDateString(language === 'fi' ? 'fi-FI' : 'sv-SE', { month: 'short', day: 'numeric' }),
      clicks: d.total_clicks,
      impressions: d.total_impressions,
      position: d.avg_position,
      prevClicks: prevItem?.total_clicks || null,
      prevImpressions: prevItem?.total_impressions || null
    }
  })

  const showComparison = comparisonEnabled && previousData && previousData.length > 0

  return (
    <Card className="bg-background-elevated border-card-border">
      <CardHeader className="pb-2">
        <CardTitle className="text-foreground text-base font-medium flex items-center gap-2">
          <Search className="w-5 h-5 text-primary" />
          {t('gsc.title')}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="colorClicks" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={COLORS.primary} stopOpacity={0.25}/>
                  <stop offset="95%" stopColor={COLORS.primary} stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="colorImpressions" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={COLORS.secondary} stopOpacity={0.25}/>
                  <stop offset="95%" stopColor={COLORS.secondary} stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={COLORS.grid} vertical={false} />
              <XAxis dataKey="date" stroke={COLORS.muted} fontSize={11} tickLine={false} axisLine={false} />
              <YAxis stroke={COLORS.muted} fontSize={11} tickLine={false} axisLine={false} />
              <Tooltip
                contentStyle={{ backgroundColor: COLORS.tooltip, border: `1px solid ${COLORS.grid}`, borderRadius: '8px' }}
                labelStyle={{ color: COLORS.text }}
              />
              {/* Previous period data (dashed lines) */}
              {showComparison && (
                <>
                  <Area
                    type="monotone"
                    dataKey="prevClicks"
                    name={`${t('gsc.clicks')} (${t('charts.previous')})`}
                    stroke={COLORS.primary}
                    strokeWidth={1.5}
                    strokeDasharray="5 5"
                    fillOpacity={0}
                    dot={false}
                  />
                  <Area
                    type="monotone"
                    dataKey="prevImpressions"
                    name={`${t('gsc.impressions')} (${t('charts.previous')})`}
                    stroke={COLORS.secondary}
                    strokeWidth={1.5}
                    strokeDasharray="5 5"
                    fillOpacity={0}
                    dot={false}
                  />
                </>
              )}
              {/* Current period data */}
              <Area
                type="monotone"
                dataKey="clicks"
                name={t('gsc.clicks')}
                stroke={COLORS.primary}
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#colorClicks)"
              />
              <Area
                type="monotone"
                dataKey="impressions"
                name={t('gsc.impressions')}
                stroke={COLORS.secondary}
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#colorImpressions)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <div className="flex justify-center gap-6 mt-4 text-sm">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS.primary }}></div>
            <span className="text-foreground-muted">{t('gsc.clicks')}</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS.secondary }}></div>
            <span className="text-foreground-muted">{t('gsc.impressions')}</span>
          </div>
          {showComparison && (
            <div className="flex items-center gap-2">
              <div className="w-6 h-0 border border-dashed border-foreground-subtle"></div>
              <span className="text-foreground-subtle">{t('charts.previousPeriod')}</span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

// Top Queries Table
export function GSCTopQueries({ queries }) {
  const { t } = useTranslation()
  return (
    <Card className="bg-background-elevated border-card-border">
      <CardHeader className="pb-2">
        <CardTitle className="text-foreground text-base font-medium">{t('gsc.topQueries')}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-1 max-h-80 overflow-y-auto">
          {queries.slice(0, 15).map((q, index) => (
            <div
              key={q.query}
              className="flex items-center justify-between p-2 rounded-lg hover:bg-background-subtle transition-colors"
            >
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <span className="text-sm text-foreground-subtle w-5">{index + 1}.</span>
                <span className="text-sm text-foreground truncate" title={q.query}>
                  {q.query}
                </span>
              </div>
              <div className="flex items-center gap-4 text-sm">
                <div className="text-right w-16">
                  <span className="text-primary font-medium tabular-nums">{q.clicks}</span>
                </div>
                <div className="text-right w-16">
                  <span className="text-foreground-muted tabular-nums">{(q.ctr * 100).toFixed(1)}%</span>
                </div>
                <div className="text-right w-12">
                  <span className="text-foreground-muted tabular-nums">{q.position.toFixed(1)}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="flex justify-end gap-4 mt-4 text-xs text-foreground-subtle pr-2">
          <span>{t('gsc.ctr')}</span>
          <span>{t('gsc.position')}</span>
        </div>
      </CardContent>
    </Card>
  )
}

// Top Pages Table
export function GSCTopPages({ pages }) {
  const { t } = useTranslation()
  // Extract just the path from URL
  const formatPath = (url) => {
    try {
      const path = new URL(url).pathname
      return path.length > 40 ? path.substring(0, 40) + '...' : path
    } catch {
      return url.substring(0, 40)
    }
  }

  return (
    <Card className="bg-background-elevated border-card-border">
      <CardHeader className="pb-2">
        <CardTitle className="text-foreground text-base font-medium">{t('gsc.topPages')}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-1 max-h-80 overflow-y-auto">
          {pages.slice(0, 15).map((p, index) => (
            <div
              key={p.page}
              className="flex items-center justify-between p-2 rounded-lg hover:bg-background-subtle transition-colors"
            >
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <span className="text-sm text-foreground-subtle w-5">{index + 1}.</span>
                <span className="text-sm text-foreground truncate" title={p.page}>
                  {formatPath(p.page)}
                </span>
              </div>
              <div className="flex items-center gap-4 text-sm">
                <div className="text-right w-16">
                  <span className="text-primary font-medium tabular-nums">{p.clicks}</span>
                </div>
                <div className="text-right w-20">
                  <span className="text-foreground-muted tabular-nums">{p.impressions.toLocaleString()}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="flex justify-end gap-4 mt-4 text-xs text-foreground-subtle pr-2">
          <span>{t('gsc.impressions')}</span>
        </div>
      </CardContent>
    </Card>
  )
}

// Device Breakdown
export function GSCDeviceChart({ devices }) {
  const { t } = useTranslation()
  const deviceIcons = {
    'DESKTOP': Monitor,
    'MOBILE': Smartphone,
    'TABLET': Tablet
  }

  const total = devices.reduce((sum, d) => sum + d.clicks, 0)

  return (
    <Card className="bg-background-elevated border-card-border">
      <CardHeader className="pb-2">
        <CardTitle className="text-foreground text-base font-medium">{t('gsc.deviceBreakdown')}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {devices.map(device => {
            const Icon = deviceIcons[device.device] || Monitor
            const percentage = total > 0 ? (device.clicks / total * 100) : 0

            return (
              <div key={device.device} className="flex items-center gap-3">
                <div className="p-2 bg-background-subtle rounded-lg">
                  <Icon className="w-4 h-4 text-foreground-muted" />
                </div>
                <div className="flex-1">
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-foreground capitalize">{device.device.toLowerCase()}</span>
                    <span className="text-foreground-muted tabular-nums">{percentage.toFixed(1)}%</span>
                  </div>
                  <div className="h-1.5 bg-background-subtle rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${percentage}%`,
                        backgroundColor: DEVICE_COLORS[device.device] || COLORS.primary
                      }}
                    />
                  </div>
                </div>
                <div className="text-right w-16">
                  <span className="text-sm text-primary font-medium tabular-nums">{device.clicks}</span>
                </div>
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}

// Country Breakdown
export function GSCCountryChart({ countries }) {
  const { t } = useTranslation()
  const total = countries.reduce((sum, c) => sum + c.clicks, 0)

  const chartData = countries.slice(0, 6).map(c => ({
    name: c.country,
    value: c.clicks,
    percentage: total > 0 ? (c.clicks / total * 100).toFixed(1) : 0
  }))

  return (
    <Card className="bg-background-elevated border-card-border">
      <CardHeader className="pb-2">
        <CardTitle className="text-foreground text-base font-medium flex items-center gap-2">
          <Globe className="w-5 h-5 text-primary" />
          {t('gsc.countries')}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex gap-4">
          <div className="w-32 h-32">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={chartData}
                  cx="50%"
                  cy="50%"
                  innerRadius={25}
                  outerRadius={50}
                  dataKey="value"
                >
                  {chartData.map((entry, index) => (
                    <Cell key={entry.name} fill={COUNTRY_COLORS[index % COUNTRY_COLORS.length]} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex-1 space-y-2">
            {chartData.map((c, index) => (
              <div key={c.name} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <div
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: COUNTRY_COLORS[index % COUNTRY_COLORS.length] }}
                  />
                  <span className="text-foreground">{c.name}</span>
                </div>
                <span className="text-foreground-muted tabular-nums">{c.percentage}%</span>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

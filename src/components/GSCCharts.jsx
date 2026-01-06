import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell
} from 'recharts'
import { Search, ExternalLink, Globe, Smartphone, Monitor, Tablet } from 'lucide-react'

const DEVICE_COLORS = {
  'DESKTOP': '#06b6d4',
  'MOBILE': '#8b5cf6',
  'TABLET': '#22c55e'
}

const COUNTRY_COLORS = ['#06b6d4', '#8b5cf6', '#22c55e', '#f59e0b', '#ef4444', '#ec4899', '#14b8a6', '#6366f1']

// GSC Connect Card (shown when not connected)
export function GSCConnectCard({ onConnect }) {
  return (
    <Card className="bg-slate-800/50 border-slate-700">
      <CardContent className="pt-6">
        <div className="text-center py-8">
          <div className="p-4 bg-slate-700/50 rounded-full w-16 h-16 mx-auto mb-4 flex items-center justify-center">
            <Search className="w-8 h-8 text-slate-400" />
          </div>
          <h3 className="text-lg font-medium text-white mb-2">Connect Google Search Console</h3>
          <p className="text-sm text-slate-400 mb-6 max-w-md mx-auto">
            Se vilka sökord som driver trafik till din webshop. Anslut Google Search Console för att se klick, visningar och positioner.
          </p>
          <Button
            onClick={onConnect}
            className="bg-cyan-600 hover:bg-cyan-700 text-white"
          >
            <Search className="w-4 h-4 mr-2" />
            Anslut Search Console
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

// Daily Clicks & Impressions Chart
export function GSCDailyChart({ data, previousData = [], comparisonEnabled = false }) {
  // Combine current and previous data if comparison is enabled
  const chartData = [...data].reverse().map((d, index) => {
    const prevItem = previousData && previousData.length > 0
      ? [...previousData].reverse()[index]
      : null

    return {
      date: new Date(d.date).toLocaleDateString('sv-SE', { month: 'short', day: 'numeric' }),
      clicks: d.total_clicks,
      impressions: d.total_impressions,
      position: d.avg_position,
      prevClicks: prevItem?.total_clicks || null,
      prevImpressions: prevItem?.total_impressions || null
    }
  })

  const showComparison = comparisonEnabled && previousData && previousData.length > 0

  return (
    <Card className="bg-slate-800/50 border-slate-700">
      <CardHeader>
        <CardTitle className="text-white text-lg flex items-center gap-2">
          <Search className="w-5 h-5 text-cyan-400" />
          Sökprestanda
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="colorClicks" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#06b6d4" stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="colorImpressions" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="date" stroke="#94a3b8" fontSize={11} />
              <YAxis stroke="#94a3b8" fontSize={12} />
              <Tooltip
                contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }}
                labelStyle={{ color: '#f8fafc' }}
              />
              {/* Previous period data (dashed lines) */}
              {showComparison && (
                <>
                  <Area
                    type="monotone"
                    dataKey="prevClicks"
                    name="Klick (föreg.)"
                    stroke="#06b6d4"
                    strokeWidth={1.5}
                    strokeDasharray="5 5"
                    fillOpacity={0}
                    dot={false}
                  />
                  <Area
                    type="monotone"
                    dataKey="prevImpressions"
                    name="Visningar (föreg.)"
                    stroke="#8b5cf6"
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
                name="Klick"
                stroke="#06b6d4"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#colorClicks)"
              />
              <Area
                type="monotone"
                dataKey="impressions"
                name="Visningar"
                stroke="#8b5cf6"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#colorImpressions)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <div className="flex justify-center gap-6 mt-4 text-sm">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-cyan-500"></div>
            <span className="text-slate-400">Klick</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-violet-500"></div>
            <span className="text-slate-400">Visningar</span>
          </div>
          {showComparison && (
            <div className="flex items-center gap-2">
              <div className="w-6 h-0 border border-dashed border-slate-400"></div>
              <span className="text-slate-500">Föreg. period</span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

// Top Queries Table
export function GSCTopQueries({ queries }) {
  return (
    <Card className="bg-slate-800/50 border-slate-700">
      <CardHeader>
        <CardTitle className="text-white text-lg">Top sökord</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2 max-h-80 overflow-y-auto">
          {queries.slice(0, 15).map((q, index) => (
            <div
              key={q.query}
              className="flex items-center justify-between p-2 rounded-lg hover:bg-slate-700/50 transition-colors"
            >
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <span className="text-sm text-slate-500 w-5">{index + 1}.</span>
                <span className="text-sm text-white truncate" title={q.query}>
                  {q.query}
                </span>
              </div>
              <div className="flex items-center gap-4 text-sm">
                <div className="text-right w-16">
                  <span className="text-cyan-400 font-medium">{q.clicks}</span>
                  <span className="text-slate-500 text-xs ml-1">klick</span>
                </div>
                <div className="text-right w-16">
                  <span className="text-slate-400">{(q.ctr * 100).toFixed(1)}%</span>
                </div>
                <div className="text-right w-12">
                  <span className="text-slate-400">{q.position.toFixed(1)}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="flex justify-end gap-4 mt-4 text-xs text-slate-500 pr-2">
          <span>CTR</span>
          <span>Pos</span>
        </div>
      </CardContent>
    </Card>
  )
}

// Top Pages Table
export function GSCTopPages({ pages }) {
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
    <Card className="bg-slate-800/50 border-slate-700">
      <CardHeader>
        <CardTitle className="text-white text-lg">Top sidor</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2 max-h-80 overflow-y-auto">
          {pages.slice(0, 15).map((p, index) => (
            <div
              key={p.page}
              className="flex items-center justify-between p-2 rounded-lg hover:bg-slate-700/50 transition-colors"
            >
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <span className="text-sm text-slate-500 w-5">{index + 1}.</span>
                <span className="text-sm text-white truncate" title={p.page}>
                  {formatPath(p.page)}
                </span>
              </div>
              <div className="flex items-center gap-4 text-sm">
                <div className="text-right w-16">
                  <span className="text-cyan-400 font-medium">{p.clicks}</span>
                  <span className="text-slate-500 text-xs ml-1">klick</span>
                </div>
                <div className="text-right w-20">
                  <span className="text-slate-400">{p.impressions.toLocaleString()}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="flex justify-end gap-4 mt-4 text-xs text-slate-500 pr-2">
          <span>Visningar</span>
        </div>
      </CardContent>
    </Card>
  )
}

// Device Breakdown
export function GSCDeviceChart({ devices }) {
  const deviceIcons = {
    'DESKTOP': Monitor,
    'MOBILE': Smartphone,
    'TABLET': Tablet
  }

  const total = devices.reduce((sum, d) => sum + d.clicks, 0)

  return (
    <Card className="bg-slate-800/50 border-slate-700">
      <CardHeader>
        <CardTitle className="text-white text-lg">Enhetsfördelning</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {devices.map(device => {
            const Icon = deviceIcons[device.device] || Monitor
            const percentage = total > 0 ? (device.clicks / total * 100) : 0

            return (
              <div key={device.device} className="flex items-center gap-3">
                <div className="p-2 bg-slate-700/50 rounded-lg">
                  <Icon className="w-4 h-4 text-slate-400" />
                </div>
                <div className="flex-1">
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-white capitalize">{device.device.toLowerCase()}</span>
                    <span className="text-slate-400">{percentage.toFixed(1)}%</span>
                  </div>
                  <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${percentage}%`,
                        backgroundColor: DEVICE_COLORS[device.device] || '#06b6d4'
                      }}
                    />
                  </div>
                </div>
                <div className="text-right w-16">
                  <span className="text-sm text-cyan-400 font-medium">{device.clicks}</span>
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
  const total = countries.reduce((sum, c) => sum + c.clicks, 0)

  const chartData = countries.slice(0, 6).map(c => ({
    name: c.country,
    value: c.clicks,
    percentage: total > 0 ? (c.clicks / total * 100).toFixed(1) : 0
  }))

  return (
    <Card className="bg-slate-800/50 border-slate-700">
      <CardHeader>
        <CardTitle className="text-white text-lg flex items-center gap-2">
          <Globe className="w-5 h-5 text-cyan-400" />
          Länder
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
                  <span className="text-slate-300">{c.name}</span>
                </div>
                <span className="text-slate-400">{c.percentage}%</span>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

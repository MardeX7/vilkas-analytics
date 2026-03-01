import { useSupport } from '@/hooks/useSupport'
import { useTranslation } from '@/lib/i18n'
import { useCurrentShop } from '@/config/storeConfig'
import { MetricCard } from '@/components/MetricCard'
import {
  Headphones,
  Loader2,
  AlertTriangle,
  Clock,
  ShieldCheck,
  CheckCircle2,
  ArrowUpRight,
  ArrowDownRight,
  Info,
} from 'lucide-react'

function formatDuration(ms) {
  if (!ms) return '—'
  const hours = Math.floor(ms / (1000 * 60 * 60))
  const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60))
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
}

function formatDate(dateStr) {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  return `${d.getDate()}.${d.getMonth() + 1}.${d.getFullYear()}`
}

function getBusinessDays(startDate) {
  let count = 0
  const current = new Date(startDate)
  current.setHours(0, 0, 0, 0)
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  while (current < now) {
    current.setDate(current.getDate() + 1)
    const day = current.getDay()
    if (day !== 0 && day !== 6) count++
  }
  return count
}

function PriorityBadge({ priority }) {
  const colors = {
    Highest: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    High: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
    Medium: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
    Low: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    Lowest: 'bg-gray-100 text-gray-600 dark:bg-gray-800/30 dark:text-gray-400',
  }

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${colors[priority] || colors.Medium}`}>
      {priority || 'Medium'}
    </span>
  )
}

function fillDays(dailyStats, days = 30) {
  // Ensure we have an entry for every day in the range
  const map = {}
  for (const d of dailyStats || []) {
    if (d.date) map[d.date] = d
  }
  const result = []
  for (let i = days; i >= 0; i--) {
    const date = new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    result.push(map[date] || { date, tickets_created: 0, tickets_resolved: 0, tickets_open: 0 })
  }
  return result
}

function TicketVolumeChart({ dailyStats: rawStats }) {
  const dailyStats = fillDays(rawStats, 30)

  const maxVal = Math.max(
    ...dailyStats.map(d => Math.max(d.tickets_created || 0, d.tickets_resolved || 0)),
    1
  )

  // Build SVG line paths for created and resolved
  const createdPoints = dailyStats.map((day, i) => {
    const x = (i / (dailyStats.length - 1)) * 100
    const y = 100 - ((day.tickets_created || 0) / maxVal) * 100
    return { x, y }
  })
  const resolvedPoints = dailyStats.map((day, i) => {
    const x = (i / (dailyStats.length - 1)) * 100
    const y = 100 - ((day.tickets_resolved || 0) / maxVal) * 100
    return { x, y }
  })

  const createdLine = createdPoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')
  const resolvedLine = resolvedPoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')
  const createdArea = `${createdLine} L 100 100 L 0 100 Z`
  const resolvedArea = `${resolvedLine} L 100 100 L 0 100 Z`

  return (
    <div className="bg-background-elevated rounded-xl border border-card-border p-5">
      <h3 className="text-sm font-semibold text-foreground mb-4">Tikettimäärä (30pv)</h3>
      <div className="relative h-32">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-full">
          <defs>
            <linearGradient id="createdGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgb(59, 130, 246)" stopOpacity="0.25" />
              <stop offset="100%" stopColor="rgb(59, 130, 246)" stopOpacity="0.02" />
            </linearGradient>
            <linearGradient id="resolvedGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgb(16, 185, 129)" stopOpacity="0.25" />
              <stop offset="100%" stopColor="rgb(16, 185, 129)" stopOpacity="0.02" />
            </linearGradient>
          </defs>
          <path d={createdArea} fill="url(#createdGradient)" />
          <path d={createdLine} fill="none" stroke="rgb(59, 130, 246)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
          <path d={resolvedArea} fill="url(#resolvedGradient)" />
          <path d={resolvedLine} fill="none" stroke="rgb(16, 185, 129)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
        </svg>
        <div className="absolute top-0 right-0 text-[10px] text-foreground-muted">{maxVal}</div>
        <div className="absolute bottom-0 right-0 text-[10px] text-foreground-muted">0</div>
      </div>
      <div className="flex items-center justify-between mt-3 text-xs text-foreground-muted">
        <span>{dailyStats[0]?.date?.slice(5)}</span>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-sm bg-blue-500/70" />
            <span>Uudet</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-sm bg-emerald-500/70" />
            <span>Ratkaistut</span>
          </div>
        </div>
        <span>{dailyStats[dailyStats.length - 1]?.date?.slice(5)}</span>
      </div>
    </div>
  )
}

function BacklogTrendChart({ dailyStats: rawStats }) {
  const dailyStats = fillDays(rawStats, 30)

  const withData = dailyStats.filter(d => d.tickets_open > 0)
  if (!withData.length) return null

  const maxOpen = Math.max(...dailyStats.map(d => d.tickets_open || 0), 1)
  const minOpen = Math.min(...dailyStats.filter(d => d.tickets_open > 0).map(d => d.tickets_open))
  // Scale from slightly below min to max for better visualization
  const scaleMin = Math.max(0, minOpen - 2)
  const scaleRange = maxOpen - scaleMin || 1

  // Build SVG line path
  const points = dailyStats.map((day, i) => {
    const x = (i / (dailyStats.length - 1)) * 100
    const y = 100 - (((day.tickets_open || 0) - scaleMin) / scaleRange) * 100
    return { x, y, date: day.date, open: day.tickets_open || 0 }
  })

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')
  const areaPath = `${linePath} L 100 100 L 0 100 Z`

  // Trend: compare last 7 days avg to previous 7 days avg
  const last7 = dailyStats.slice(-7)
  const prev7 = dailyStats.slice(-14, -7)
  const avgLast = last7.reduce((s, d) => s + (d.tickets_open || 0), 0) / (last7.length || 1)
  const avgPrev = prev7.length ? prev7.reduce((s, d) => s + (d.tickets_open || 0), 0) / prev7.length : avgLast
  const trendDown = avgLast < avgPrev

  return (
    <div className="bg-background-elevated rounded-xl border border-card-border p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-foreground">Avoimet tiketit (30pv)</h3>
          <div className="group relative">
            <Info className="w-3.5 h-3.5 text-foreground-muted cursor-help" />
            <div className="hidden group-hover:block absolute left-1/2 -translate-x-1/2 top-6 z-10 w-56 p-2.5 bg-background-elevated border border-card-border rounded-lg shadow-lg text-xs text-foreground-muted leading-relaxed">
              Näyttää avointen tikettien määrän kehityksen. Laskeva trendi tarkoittaa, että tiimi ratkaisee tikettejä nopeammin kuin uusia saapuu.
            </div>
          </div>
        </div>
        {prev7.length > 0 && (
          <div className={`flex items-center gap-1 text-xs font-medium ${trendDown ? 'text-success' : 'text-amber-500'}`}>
            {trendDown ? <ArrowDownRight className="w-3.5 h-3.5" /> : <ArrowUpRight className="w-3.5 h-3.5" />}
            <span>{trendDown ? 'Laskeva' : 'Nouseva'}</span>
          </div>
        )}
      </div>
      <div className="relative h-32">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-full">
          <defs>
            <linearGradient id="backlogGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgb(168, 85, 247)" stopOpacity="0.3" />
              <stop offset="100%" stopColor="rgb(168, 85, 247)" stopOpacity="0.02" />
            </linearGradient>
          </defs>
          <path d={areaPath} fill="url(#backlogGradient)" />
          <path d={linePath} fill="none" stroke="rgb(168, 85, 247)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
        </svg>
        {/* Y-axis labels */}
        <div className="absolute top-0 right-0 text-[10px] text-foreground-muted">{maxOpen}</div>
        <div className="absolute bottom-0 right-0 text-[10px] text-foreground-muted">{scaleMin}</div>
      </div>
      <div className="flex items-center justify-between mt-3 text-xs text-foreground-muted">
        <span>{dailyStats[0]?.date?.slice(5)}</span>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm bg-purple-500/70" />
          <span>Avoimet tiketit</span>
        </div>
        <span>{dailyStats[dailyStats.length - 1]?.date?.slice(5)}</span>
      </div>
    </div>
  )
}

export function SupportPage() {
  const { t } = useTranslation()
  const { shopName } = useCurrentShop()
  const { summary, openTickets, dailyStats, isLoading, error } = useSupport()

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 text-foreground-muted animate-spin" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-2 text-foreground-muted">
        <AlertTriangle className="w-6 h-6" />
        <p className="text-sm">{error.message}</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-background-elevated/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="px-4 sm:px-6 lg:px-8 py-4 max-w-7xl mx-auto">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-purple-600 flex items-center justify-center shadow-lg shadow-purple-500/20">
              <Headphones className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-foreground">Asiakaspalvelu</h1>
              <p className="text-xs text-foreground-muted">{shopName} &middot; Jira-tiketit</p>
            </div>
          </div>
        </div>
      </header>

      <main className="px-4 sm:px-6 lg:px-8 py-6 max-w-7xl mx-auto space-y-6">
        {/* KPI Grid – unified metrics */}
        {(() => {
          const s = summary || {}
          const wowDelta = (curr, prev) =>
            prev > 0 ? ((curr - prev) / prev) * 100 : undefined

          return (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Row 1: Volyymi */}
              <MetricCard
                label="Avoimet tiketit"
                value={s.openCount ?? 0}
                size="small"
              />
              <MetricCard
                label="Uudet tiketit (7pv)"
                value={s.weekCreated ?? 0}
                delta={wowDelta(s.weekCreated, s.prevWeekCreated)}
                deltaLabel="vv"
                previousValue={s.prevWeekCreated}
                invertDelta
                size="small"
              />
              <MetricCard
                label="Ratkaistut (7pv)"
                value={s.weekResolved ?? 0}
                delta={wowDelta(s.weekResolved, s.prevWeekResolved)}
                deltaLabel="vv"
                previousValue={s.prevWeekResolved}
                size="small"
              />
              <MetricCard
                label="Ratkaistu eilen"
                value={s.resolvedYesterday ?? 0}
                size="small"
              />

              {/* Row 2: Laatu & suhdeluvut */}
              <MetricCard
                label="Keskim. vasteaika (7pv)"
                value={s.avgFirstResponseMs ? formatDuration(s.avgFirstResponseMs) : '—'}
                size="small"
              />
              <MetricCard
                label="SLA compliance (7pv)"
                value={s.slaCompliance != null ? s.slaCompliance : '—'}
                suffix={s.slaCompliance != null ? '%' : ''}
                size="small"
              />
              <MetricCard
                label="Ratkaisuprosentti"
                value={s.resolutionRate != null ? s.resolutionRate : '—'}
                suffix={s.resolutionRate != null ? '%' : ''}
                delta={s.prevResolutionRate != null && s.resolutionRate != null
                  ? s.resolutionRate - s.prevResolutionRate : undefined}
                deltaLabel="pp vv"
                size="small"
              />
              <MetricCard
                label="Tikettejä / 100 tilausta"
                value={s.ticketsPer100Orders != null ? s.ticketsPer100Orders : '—'}
                delta={wowDelta(s.ticketsPer100Orders, s.prevTicketsPer100Orders)}
                deltaLabel="vv"
                invertDelta
                size="small"
              />
            </div>
          )
        })()}

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <TicketVolumeChart dailyStats={dailyStats} />
          <BacklogTrendChart dailyStats={dailyStats} />
        </div>

        {/* Open Tickets Table */}
        <div className="bg-background-elevated rounded-xl border border-card-border overflow-hidden">
          <div className="px-5 py-4 border-b border-card-border">
            <h3 className="text-sm font-semibold text-foreground">
              Avoimet tiketit ({openTickets?.length || 0})
            </h3>
          </div>

          {!openTickets?.length ? (
            <div className="px-5 py-8 text-center text-foreground-muted text-sm">
              <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-success" />
              Ei avoimia tikettejä
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-foreground-muted text-xs uppercase tracking-wider border-b border-card-border">
                    <th className="px-5 py-3 font-medium">Tiketti</th>
                    <th className="px-5 py-3 font-medium">Aihe</th>
                    <th className="px-5 py-3 font-medium">Prioriteetti</th>
                    <th className="px-5 py-3 font-medium">Status</th>
                    <th className="px-5 py-3 font-medium">Luotu</th>
                    <th className="px-5 py-3 font-medium">Odotusaika</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-card-border">
                  {openTickets
                    .sort((a, b) => {
                      const prio = { Highest: 0, High: 1, Medium: 2, Low: 3, Lowest: 4 }
                      return (prio[a.priority] ?? 2) - (prio[b.priority] ?? 2)
                    })
                    .map(ticket => (
                      <tr key={ticket.id} className="hover:bg-background-subtle transition-colors">
                        <td className="px-5 py-3">
                          <span className="font-mono text-xs text-foreground-muted">{ticket.jira_issue_key}</span>
                        </td>
                        <td className="px-5 py-3 text-foreground max-w-xs truncate">
                          {ticket.summary}
                        </td>
                        <td className="px-5 py-3">
                          <PriorityBadge priority={ticket.priority} />
                        </td>
                        <td className="px-5 py-3 text-foreground-muted text-xs">
                          {ticket.status}
                        </td>
                        <td className="px-5 py-3 text-foreground-muted text-xs">
                          {formatDate(ticket.created_at)}
                        </td>
                        <td className="px-5 py-3">
                          {(() => {
                            const days = getBusinessDays(ticket.created_at)
                            const isOverdue = days > 2
                            return (
                              <span className={`text-xs font-medium ${isOverdue ? 'text-destructive' : 'text-foreground-muted'}`}>
                                {days} arkipv
                              </span>
                            )
                          })()}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}

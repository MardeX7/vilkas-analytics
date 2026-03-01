import { useSupport } from '@/hooks/useSupport'
import { useTranslation } from '@/lib/i18n'
import { useCurrentShop } from '@/config/storeConfig'
import { MetricCard, MetricCardGroup } from '@/components/MetricCard'
import {
  Headphones,
  Loader2,
  AlertTriangle,
  Clock,
  ShieldCheck,
  CheckCircle2,
  ArrowUpRight,
  ArrowDownRight,
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

function TicketVolumeChart({ dailyStats }) {
  if (!dailyStats?.length) return null

  const maxVal = Math.max(
    ...dailyStats.map(d => Math.max(d.tickets_created || 0, d.tickets_resolved || 0)),
    1
  )

  return (
    <div className="bg-background-elevated rounded-xl border border-card-border p-5">
      <h3 className="text-sm font-semibold text-foreground mb-4">Tikettimäärä (30pv)</h3>
      <div className="flex items-end gap-0.5 h-32">
        {dailyStats.map((day, i) => {
          const created = day.tickets_created || 0
          const resolved = day.tickets_resolved || 0
          const createdH = Math.max((created / maxVal) * 100, 2)
          const resolvedH = Math.max((resolved / maxVal) * 100, 2)

          return (
            <div key={day.date || i} className="flex-1 flex flex-col items-center gap-0.5 group relative">
              <div className="w-full flex flex-col items-center gap-0.5">
                <div
                  className="w-full bg-blue-500/70 rounded-t-sm transition-all"
                  style={{ height: `${createdH}%` }}
                  title={`${day.date}: ${created} uutta`}
                />
                <div
                  className="w-full bg-emerald-500/70 rounded-b-sm transition-all"
                  style={{ height: `${resolvedH}%` }}
                  title={`${day.date}: ${resolved} ratkaistua`}
                />
              </div>
            </div>
          )
        })}
      </div>
      <div className="flex items-center justify-center gap-6 mt-3 text-xs text-foreground-muted">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm bg-blue-500/70" />
          <span>Uudet</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm bg-emerald-500/70" />
          <span>Ratkaistut</span>
        </div>
      </div>
    </div>
  )
}

function ResponseTimeChart({ dailyStats }) {
  if (!dailyStats?.length) return null

  const withData = dailyStats.filter(d => d.avg_first_response_ms)
  if (!withData.length) return null

  const maxMs = Math.max(...withData.map(d => d.avg_first_response_ms), 1)

  return (
    <div className="bg-background-elevated rounded-xl border border-card-border p-5">
      <h3 className="text-sm font-semibold text-foreground mb-4">Vasteaika (30pv)</h3>
      <div className="flex items-end gap-0.5 h-32">
        {dailyStats.map((day, i) => {
          const ms = day.avg_first_response_ms || 0
          const h = ms > 0 ? Math.max((ms / maxMs) * 100, 4) : 0

          return (
            <div key={day.date || i} className="flex-1">
              <div
                className="w-full bg-amber-500/60 rounded-t-sm transition-all"
                style={{ height: `${h}%` }}
                title={`${day.date}: ${formatDuration(ms)}`}
              />
            </div>
          )
        })}
      </div>
      <div className="flex items-center justify-center gap-6 mt-3 text-xs text-foreground-muted">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm bg-amber-500/60" />
          <span>Keskim. vasteaika</span>
        </div>
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
        {/* KPI Cards */}
        <MetricCardGroup>
          <MetricCard
            label="Avoimet tiketit"
            value={summary?.openCount ?? 0}
          />
          <MetricCard
            label="Keskim. vasteaika (7pv)"
            value={summary?.avgFirstResponseMs ? formatDuration(summary.avgFirstResponseMs) : '—'}
          />
          <MetricCard
            label="SLA compliance (7pv)"
            value={summary?.slaCompliance != null ? summary.slaCompliance : '—'}
            suffix={summary?.slaCompliance != null ? '%' : ''}
          />
          <MetricCard
            label="Ratkaistu eilen"
            value={summary?.resolvedYesterday ?? 0}
          />
        </MetricCardGroup>

        {/* 7-day summary */}
        <div className="bg-background-elevated rounded-xl border border-card-border p-5">
          <h3 className="text-sm font-semibold text-foreground mb-3">Viimeisen 7 päivän yhteenveto</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-foreground">{summary?.weekCreated ?? 0}</div>
              <div className="text-xs text-foreground-muted mt-1">Uutta tikettiä</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-success">{summary?.weekResolved ?? 0}</div>
              <div className="text-xs text-foreground-muted mt-1">Ratkaistua</div>
            </div>
            <div className="text-center">
              <div className={`text-2xl font-bold ${summary?.weekBreaches > 0 ? 'text-destructive' : 'text-foreground'}`}>
                {summary?.weekBreaches ?? 0}
              </div>
              <div className="text-xs text-foreground-muted mt-1">SLA-rikkomusta</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-foreground">
                {summary?.avgFirstResponseMs ? formatDuration(summary.avgFirstResponseMs) : '—'}
              </div>
              <div className="text-xs text-foreground-muted mt-1">Keskim. vasteaika</div>
            </div>
          </div>
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <TicketVolumeChart dailyStats={dailyStats} />
          <ResponseTimeChart dailyStats={dailyStats} />
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

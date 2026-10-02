/**
 * NewPackageBuyersCard - Uudet pakettiostajat viikossa
 *
 * Hiljaisen kauden päämittari: uusien asiakkaiden pakettitilaukset viikoittain
 * vs sama viikko vuotta aiemmin. Laskenta: get_new_package_buyers_weekly.
 * Viikko, jota data ei kata kokonaan (tilausrivit tai 12 kk takautuma), näytetään
 * viivana eikä nollana.
 */

import { useState } from 'react'
import { Package } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Cell } from 'recharts'
import { useNewPackageBuyers } from '@/hooks/useNewPackageBuyers'
import { useCurrentShop } from '@/config/storeConfig'
import { useTranslation } from '@/lib/i18n'
import { cn } from '@/lib/utils'

const COLORS = {
  current: '#00b4e9',   // brand blue
  previous: '#6b7685',  // neutral: the year-earlier baseline
  grid: '#1a2230',
  muted: '#6b7685',
  tooltip: '#0d1117',
  text: '#f8fafc'
}

// ISO 8601 week number of a YYYY-MM-DD date
function isoWeek(ymd) {
  const d = new Date(ymd + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + 3 - ((d.getUTCDay() + 6) % 7))
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4))
  firstThursday.setUTCDate(firstThursday.getUTCDate() + 3 - ((firstThursday.getUTCDay() + 6) % 7))
  return 1 + Math.round((d - firstThursday) / (7 * 86400000))
}

const noon = ymd => new Date(ymd + 'T12:00:00')

function pctChange(current, previous) {
  if (!previous) return null
  return ((current - previous) / previous) * 100
}

function ChangeBadge({ change }) {
  if (change === null || change === undefined) return null
  const positive = change >= 0
  return (
    <span className={cn(
      'text-xs font-medium px-2 py-0.5 rounded-full tabular-nums',
      positive ? 'bg-success-muted text-success' : 'bg-destructive-muted text-destructive'
    )}>
      {positive ? '+' : ''}{change.toFixed(1)}%
    </span>
  )
}

function Stat({ label, sublabel, orders, sales, prevOrders, prevSales, comparable, formatNumber, formatMoney, t }) {
  return (
    <div className="p-4 bg-background-subtle rounded-lg">
      <p className="text-xs text-foreground-muted uppercase tracking-wide">{label}</p>
      {sublabel && <p className="text-xs text-foreground-subtle">{sublabel}</p>}
      <div className="flex items-baseline gap-2 mt-2">
        <span className="text-3xl font-bold text-foreground tabular-nums">{formatNumber(orders)}</span>
        <span className="text-sm text-foreground-muted">{t('kpi.newPackageBuyers.orders')}</span>
        {comparable && <ChangeBadge change={pctChange(orders, prevOrders)} />}
      </div>
      <div className="flex items-baseline gap-2 mt-1">
        <span className="text-lg font-semibold text-foreground tabular-nums">{formatMoney(sales)}</span>
        {comparable && <ChangeBadge change={pctChange(sales, prevSales)} />}
      </div>
      <p className="text-xs text-foreground-subtle mt-2 tabular-nums">
        {comparable
          ? `${t('kpi.newPackageBuyers.yearEarlier')}: ${formatNumber(prevOrders)} ${t('kpi.newPackageBuyers.orders')}, ${formatMoney(prevSales)}`
          : t('kpi.newPackageBuyers.noComparison')}
      </p>
    </div>
  )
}

export function NewPackageBuyersCard() {
  const { t, formatNumber, formatCurrency, formatDate } = useTranslation()
  const { currency } = useCurrentShop()
  const { weeks, isLoading, error } = useNewPackageBuyers({ weeks: 13 })
  const [metric, setMetric] = useState('orders')
  const [showTable, setShowTable] = useState(false)

  // No package category for this shop: the KPI does not apply
  if (!isLoading && !error && weeks.length === 0) return null

  const formatMoney = value => formatCurrency(value, currency)
  const dayMonth = date => formatDate(date, { day: 'numeric', month: 'numeric' })
  const weekEnd = ymd => new Date(noon(ymd).getTime() + 6 * 86400000)
  const weekRange = ymd => `${dayMonth(noon(ymd))}–${dayMonth(weekEnd(ymd))}`

  const full = weeks.filter(w => !w.isCurrent)
  const last = full[full.length - 1]
  const current = weeks.find(w => w.isCurrent)
  const lastFour = full.slice(-4)
  const sum = (rows, key) => rows.reduce((s, r) => s + r[key], 0)
  const fourComplete = lastFour.length === 4 && lastFour.every(w => w.complete)
  const fourComparable = fourComplete && lastFour.every(w => w.prevComplete)

  const chartData = weeks.map(w => ({
    week: `${t('kpi.newPackageBuyers.weekShort')} ${isoWeek(w.weekStart)}`,
    range: weekRange(w.weekStart),
    isCurrent: w.isCurrent,
    current: w.complete ? (metric === 'orders' ? w.orders : w.sales) : null,
    previous: w.prevComplete ? (metric === 'orders' ? w.prevOrders : w.prevSales) : null
  }))
  const formatValue = v => (metric === 'orders' ? formatNumber(v) : formatMoney(v))

  return (
    <div className="mt-6 mb-6">
      <div className="bg-background-elevated border border-card-border rounded-lg p-6">
        {/* Header */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between mb-5">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Package className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-foreground">{t('kpi.newPackageBuyers.title')}</h2>
              <p className="text-xs text-foreground-muted mt-0.5">{t('kpi.newPackageBuyers.subtitle')}</p>
            </div>
          </div>
          <div className="flex bg-background-subtle rounded-lg p-0.5 self-start">
            {['orders', 'sales'].map(m => (
              <button
                key={m}
                onClick={() => setMetric(m)}
                className={cn(
                  'px-3 py-1.5 text-xs font-medium rounded-md transition-all',
                  metric === m ? 'bg-primary text-primary-foreground shadow-sm' : 'text-foreground-muted hover:text-foreground'
                )}
              >
                {t(`kpi.newPackageBuyers.metric.${m}`)}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <p className="text-destructive text-sm">{error.message}</p>
        )}

        {isLoading && (
          <div className="animate-pulse grid grid-cols-1 md:grid-cols-3 gap-4">
            {[0, 1, 2].map(i => <div key={i} className="h-32 rounded-lg bg-background-subtle" />)}
          </div>
        )}

        {!isLoading && !error && last && (
          <>
            {/* Headline numbers */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {last.complete && (
              <Stat
                label={`${t('kpi.newPackageBuyers.lastWeek')} ${isoWeek(last.weekStart)}`}
                sublabel={weekRange(last.weekStart)}
                orders={last.orders}
                sales={last.sales}
                prevOrders={last.prevOrders}
                prevSales={last.prevSales}
                comparable={last.prevComplete}
                formatNumber={formatNumber}
                formatMoney={formatMoney}
                t={t}
              />
              )}
              {fourComplete && (
                <Stat
                  label={t('kpi.newPackageBuyers.lastFourWeeks')}
                  sublabel={`${dayMonth(noon(lastFour[0].weekStart))}–${dayMonth(weekEnd(lastFour[3].weekStart))}`}
                  orders={sum(lastFour, 'orders')}
                  sales={sum(lastFour, 'sales')}
                  prevOrders={sum(lastFour, 'prevOrders')}
                  prevSales={sum(lastFour, 'prevSales')}
                  comparable={fourComparable}
                  formatNumber={formatNumber}
                  formatMoney={formatMoney}
                  t={t}
                />
              )}
              {current && current.complete && (
                <Stat
                  label={t('kpi.newPackageBuyers.currentWeek')}
                  sublabel={t('kpi.newPackageBuyers.currentWeekNote')}
                  orders={current.orders}
                  sales={current.sales}
                  prevOrders={current.prevOrders}
                  prevSales={current.prevSales}
                  comparable={current.prevComplete}
                  formatNumber={formatNumber}
                  formatMoney={formatMoney}
                  t={t}
                />
              )}
            </div>

            {/* Weekly chart */}
            <div className="h-64 mt-6">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} barGap={2} barCategoryGap="20%">
                  <CartesianGrid strokeDasharray="3 3" stroke={COLORS.grid} vertical={false} />
                  <XAxis dataKey="week" stroke={COLORS.muted} fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis
                    stroke={COLORS.muted}
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    width={metric === 'orders' ? 32 : 48}
                    tickFormatter={v => (metric === 'orders' ? v : `${Math.round(v / 1000)}k`)}
                  />
                  <Tooltip
                    contentStyle={{ backgroundColor: COLORS.tooltip, border: `1px solid ${COLORS.grid}`, borderRadius: '8px' }}
                    labelStyle={{ color: COLORS.text }}
                    itemStyle={{ color: COLORS.text }}
                    cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                    labelFormatter={(label, payload) => {
                      const p = payload?.[0]?.payload
                      if (!p) return label
                      return `${label} (${p.range})${p.isCurrent ? ` – ${t('kpi.newPackageBuyers.inProgress')}` : ''}`
                    }}
                    formatter={(value, name) => [value === null ? '—' : formatValue(value), name]}
                  />
                  <Legend wrapperStyle={{ fontSize: 12, color: COLORS.muted }} iconType="square" iconSize={10} />
                  <Bar dataKey="previous" name={t('kpi.newPackageBuyers.yearEarlier')} fill={COLORS.previous} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="current" name={t('kpi.newPackageBuyers.thisYear')} fill={COLORS.current} radius={[4, 4, 0, 0]}>
                    {chartData.map(d => (
                      <Cell key={d.week} fillOpacity={d.isCurrent ? 0.45 : 1} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Table view */}
            <div className="mt-4 flex items-center justify-between gap-4">
              <p className="text-xs text-foreground-subtle">{t('kpi.newPackageBuyers.definition')}</p>
              <button
                onClick={() => setShowTable(s => !s)}
                className="text-xs font-medium text-primary hover:text-primary/80 whitespace-nowrap"
              >
                {showTable ? t('kpi.newPackageBuyers.hideTable') : t('kpi.newPackageBuyers.showTable')}
              </button>
            </div>

            {showTable && (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-sm tabular-nums">
                  <thead>
                    <tr className="text-xs text-foreground-muted border-b border-border">
                      <th className="text-left font-medium py-2 pr-3">{t('kpi.newPackageBuyers.week')}</th>
                      <th className="text-right font-medium py-2 px-3">{t('kpi.newPackageBuyers.metric.orders')}</th>
                      <th className="text-right font-medium py-2 px-3">{t('kpi.newPackageBuyers.metric.sales')}</th>
                      <th className="text-right font-medium py-2 px-3">{t('kpi.newPackageBuyers.yearEarlier')}</th>
                      <th className="text-right font-medium py-2 px-3"></th>
                      <th className="text-right font-medium py-2 pl-3">{t('kpi.newPackageBuyers.changeSales')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...weeks].reverse().map(w => (
                      <tr key={w.weekStart} className="border-b border-border/50">
                        <td className="py-2 pr-3 text-foreground whitespace-nowrap">
                          {t('kpi.newPackageBuyers.weekShort')} {isoWeek(w.weekStart)}
                          <span className="text-foreground-subtle ml-2">{weekRange(w.weekStart)}</span>
                          {w.isCurrent && <span className="text-foreground-subtle ml-1">*</span>}
                        </td>
                        <td className="py-2 px-3 text-right text-foreground">{w.complete ? formatNumber(w.orders) : '—'}</td>
                        <td className="py-2 px-3 text-right text-foreground">{w.complete ? formatMoney(w.sales) : '—'}</td>
                        <td className="py-2 px-3 text-right text-foreground-muted">{w.prevComplete ? formatNumber(w.prevOrders) : '—'}</td>
                        <td className="py-2 px-3 text-right text-foreground-muted">{w.prevComplete ? formatMoney(w.prevSales) : '—'}</td>
                        <td className="py-2 pl-3 text-right">
                          {w.complete && w.prevComplete ? <ChangeBadge change={pctChange(w.sales, w.prevSales)} /> : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="text-xs text-foreground-subtle mt-2">{t('kpi.newPackageBuyers.tableNote')}</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

export default NewPackageBuyersCard

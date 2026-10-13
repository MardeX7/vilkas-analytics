/**
 * FreeShippingLimitCard - Ilmaisen toimituksen raja
 *
 * Seuraa 13.10.2026 tehtyä rajan laskua: mitä tilauksesta jää (kate + toimitusmaksut),
 * täydentävätkö asiakkaat koria uuden rajan yli ja mitä muutos maksaa.
 * Laskenta: get_free_shipping_limit_weekly. Vaikutus tilauksen katteeseen on pienempi
 * kuin viikkovaihtelu, joten otsikkoluvut ovat jaksolta muutoksesta alkaen
 * (enintään 8 viikkoa), eivät yksittäiseltä viikolta.
 */

import { useState } from 'react'
import { Truck } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Cell } from 'recharts'
import { useFreeShippingLimit } from '@/hooks/useFreeShippingLimit'
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

const HEADLINE_WEEKS = 8

// ISO 8601 week number of a YYYY-MM-DD date
function isoWeek(ymd) {
  const d = new Date(ymd + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + 3 - ((d.getUTCDay() + 6) % 7))
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4))
  firstThursday.setUTCDate(firstThursday.getUTCDate() + 3 - ((firstThursday.getUTCDay() + 6) % 7))
  return 1 + Math.round((d - firstThursday) / (7 * 86400000))
}

const noon = ymd => new Date(ymd + 'T12:00:00')
const sum = (rows, key) => rows.reduce((s, r) => s + r[key], 0)
const ratio = (a, b) => (b > 0 ? a / b : null)

// neutral: for a figure whose weekly noise is larger than the effect being followed
function Badge({ value, suffix, neutral = false }) {
  if (value === null || value === undefined) return null
  const positive = value >= 0
  return (
    <span className={cn(
      'text-xs font-medium px-2 py-0.5 rounded-full tabular-nums',
      neutral ? 'bg-background text-foreground-muted'
        : positive ? 'bg-success-muted text-success' : 'bg-destructive-muted text-destructive'
    )}>
      {positive ? '+' : ''}{value.toFixed(1)}{suffix}
    </span>
  )
}

function Tile({ label, sublabel, value, badge, note }) {
  return (
    <div className="p-4 bg-background-subtle rounded-lg">
      <p className="text-xs text-foreground-muted uppercase tracking-wide">{label}</p>
      {sublabel && <p className="text-xs text-foreground-subtle">{sublabel}</p>}
      <div className="flex items-baseline gap-2 mt-2">
        <span className="text-3xl font-bold text-foreground tabular-nums">{value}</span>
        {badge}
      </div>
      <p className="text-xs text-foreground-subtle mt-2 tabular-nums">{note}</p>
    </div>
  )
}

export function FreeShippingLimitCard() {
  const { t, formatNumber, formatCurrency, formatDate } = useTranslation()
  const { currency } = useCurrentShop()
  const { weeks, isLoading, error } = useFreeShippingLimit({ weeks: 13 })
  const [metric, setMetric] = useState('perOrder')
  const [showTable, setShowTable] = useState(false)

  // No change to follow for this shop: the KPI does not apply
  if (!isLoading && !error && weeks.length === 0) return null

  const config = weeks[0] || {}
  const decimals = currency === 'SEK' ? 0 : 2
  const formatMoney = value => formatCurrency(value, currency)
  const formatPerOrder = value => (value === null ? '—' : formatNumber(value, {
    style: 'currency', currency, minimumFractionDigits: decimals, maximumFractionDigits: decimals
  }))
  const formatShare = value => (value === null ? '—' : `${formatNumber(value * 100, { maximumFractionDigits: 0 })} %`)
  const dayMonth = date => formatDate(date, { day: 'numeric', month: 'numeric' })
  const weekEnd = ymd => new Date(noon(ymd).getTime() + 6 * 86400000)
  const weekRange = ymd => `${dayMonth(noon(ymd))}–${dayMonth(weekEnd(ymd))}`

  // Headline: the weeks since the change that the data covers, at most the latest eight
  const since = weeks.filter(w => w.phase !== 'before' && w.complete)
  const headline = since.slice(-HEADLINE_WEEKS)
  const comparable = headline.length > 0 && headline.every(w => w.prevComplete)
  const orders = sum(headline, 'orders')
  const perOrder = ratio(sum(headline, 'contribution'), orders)
  const prevPerOrder = ratio(sum(headline, 'prevContribution'), sum(headline, 'prevOrders'))
  const near = sum(headline, 'nearBelow') + sum(headline, 'nearAbove')
  const share = ratio(sum(headline, 'nearAbove'), near)
  const prevNear = sum(headline, 'prevNearBelow') + sum(headline, 'prevNearAbove')
  const prevShare = ratio(sum(headline, 'prevNearAbove'), prevNear)
  // Since the change, whatever the weeks shown: the function returns it on every row
  const feeGivenUp = config.feeGivenUpTotal ?? 0
  const freeOrders = config.freeOrdersTotal ?? 0
  const period = headline.length > 0
    ? `${dayMonth(headline[0].phase === 'change' ? noon(config.changedOn) : noon(headline[0].weekStart))}–${dayMonth(new Date())}`
    : ''

  const perOrderOf = (contribution, n) => ratio(contribution, n)
  const shareOf = (above, below) => {
    const r = ratio(above, above + below)
    return r === null ? null : r * 100
  }
  const chartData = weeks.map(w => ({
    week: `${t('kpi.freeShippingLimit.weekShort')} ${isoWeek(w.weekStart)}`,
    range: weekRange(w.weekStart),
    isCurrent: w.isCurrent,
    phase: w.phase,
    current: !w.complete ? null
      : metric === 'perOrder' ? perOrderOf(w.contribution, w.orders) : shareOf(w.nearAbove, w.nearBelow),
    previous: !w.prevComplete ? null
      : metric === 'perOrder' ? perOrderOf(w.prevContribution, w.prevOrders) : shareOf(w.prevNearAbove, w.prevNearBelow)
  }))
  const formatValue = v => (metric === 'perOrder' ? formatPerOrder(v) : `${formatNumber(v, { maximumFractionDigits: 0 })} %`)
  const limits = {
    date: config.changedOn ? formatDate(noon(config.changedOn), { day: 'numeric', month: 'numeric', year: 'numeric' }) : '',
    old: formatMoney(config.oldLimit),
    new: formatMoney(config.newLimit),
    newPlain: formatNumber(config.newLimit),
    from: formatNumber(config.nearFrom),
    to: formatMoney(config.nearTo)
  }

  return (
    <div className="mt-6 mb-6">
      <div className="bg-background-elevated border border-card-border rounded-lg p-6">
        {/* Header */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between mb-5">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Truck className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-foreground">{t('kpi.freeShippingLimit.title')}</h2>
              {config.changedOn && (
                <p className="text-xs text-foreground-muted mt-0.5">{t('kpi.freeShippingLimit.subtitle', limits)}</p>
              )}
            </div>
          </div>
          <div className="flex bg-background-subtle rounded-lg p-0.5 self-start">
            {['perOrder', 'share'].map(m => (
              <button
                key={m}
                onClick={() => setMetric(m)}
                className={cn(
                  'px-3 py-1.5 text-xs font-medium rounded-md transition-all',
                  metric === m ? 'bg-primary text-primary-foreground shadow-sm' : 'text-foreground-muted hover:text-foreground'
                )}
              >
                {t(`kpi.freeShippingLimit.metric.${m}`)}
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

        {!isLoading && !error && weeks.length > 0 && (
          <>
            {headline.length === 0 ? (
              <p className="text-sm text-foreground-muted">{t('kpi.freeShippingLimit.noData')}</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Tile
                  label={t('kpi.freeShippingLimit.perOrder')}
                  sublabel={`${period} · ${formatNumber(orders)} ${t('kpi.freeShippingLimit.orders')}`}
                  value={formatPerOrder(perOrder)}
                  badge={comparable && perOrder !== null && prevPerOrder
                    ? <Badge value={(perOrder / prevPerOrder - 1) * 100} suffix="%" neutral /> : null}
                  note={comparable
                    ? `${t('kpi.freeShippingLimit.yearEarlier')}: ${formatPerOrder(prevPerOrder)}`
                    : t('kpi.freeShippingLimit.noComparison')}
                />
                <Tile
                  label={t('kpi.freeShippingLimit.share', limits)}
                  sublabel={t('kpi.freeShippingLimit.shareSub', { ...limits, count: formatNumber(near) })}
                  value={formatShare(share)}
                  badge={comparable && share !== null && prevShare !== null
                    ? <Badge value={(share - prevShare) * 100} suffix={` ${t('kpi.freeShippingLimit.points')}`} /> : null}
                  note={comparable
                    ? `${t('kpi.freeShippingLimit.yearEarlier')}: ${formatShare(prevShare)}`
                    : t('kpi.freeShippingLimit.noComparison')}
                />
                <Tile
                  label={t('kpi.freeShippingLimit.feeGivenUp')}
                  sublabel={t('kpi.freeShippingLimit.feeGivenUpSub', limits)}
                  value={formatMoney(feeGivenUp)}
                  note={`${formatNumber(freeOrders)} ${t('kpi.freeShippingLimit.freeOrders', limits)}`}
                />
              </div>
            )}

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
                    width={40}
                    tickFormatter={v => (metric === 'perOrder' ? Math.round(v) : `${Math.round(v)} %`)}
                  />
                  <Tooltip
                    contentStyle={{ backgroundColor: COLORS.tooltip, border: `1px solid ${COLORS.grid}`, borderRadius: '8px' }}
                    labelStyle={{ color: COLORS.text }}
                    itemStyle={{ color: COLORS.text }}
                    cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                    labelFormatter={(label, payload) => {
                      const p = payload?.[0]?.payload
                      if (!p) return label
                      const tags = [
                        p.phase === 'change' ? t('kpi.freeShippingLimit.changeWeek') : null,
                        p.isCurrent ? t('kpi.freeShippingLimit.inProgress') : null
                      ].filter(Boolean)
                      return `${label} (${p.range})${tags.length ? ` – ${tags.join(', ')}` : ''}`
                    }}
                    formatter={(value, name) => [value === null ? '—' : formatValue(value), name]}
                  />
                  <Legend wrapperStyle={{ fontSize: 12, color: COLORS.muted }} iconType="square" iconSize={10} />
                  <Bar dataKey="previous" name={t('kpi.freeShippingLimit.yearEarlier')} fill={COLORS.previous} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="current" name={t('kpi.freeShippingLimit.thisYear')} fill={COLORS.current} radius={[4, 4, 0, 0]}>
                    {chartData.map(d => (
                      <Cell key={d.week} fillOpacity={d.phase === 'before' || d.isCurrent ? 0.45 : 1} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Table view */}
            <div className="mt-4 flex items-start justify-between gap-4">
              <p className="text-xs text-foreground-subtle">{t('kpi.freeShippingLimit.definition', limits)}</p>
              <button
                onClick={() => setShowTable(s => !s)}
                className="text-xs font-medium text-primary hover:text-primary/80 whitespace-nowrap"
              >
                {showTable ? t('kpi.freeShippingLimit.hideTable') : t('kpi.freeShippingLimit.showTable')}
              </button>
            </div>

            {showTable && (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-sm tabular-nums">
                  <thead>
                    <tr className="text-xs text-foreground-muted border-b border-border">
                      <th className="text-left font-medium py-2 pr-3">{t('kpi.freeShippingLimit.week')}</th>
                      <th className="text-right font-medium py-2 px-3">{t('kpi.freeShippingLimit.ordersColumn')}</th>
                      <th className="text-right font-medium py-2 px-3">{t('kpi.freeShippingLimit.metric.perOrder')}</th>
                      <th className="text-right font-medium py-2 px-3">{t('kpi.freeShippingLimit.yearEarlier')}</th>
                      <th className="text-right font-medium py-2 px-3">{t('kpi.freeShippingLimit.metric.share')}</th>
                      <th className="text-right font-medium py-2 px-3">{t('kpi.freeShippingLimit.yearEarlier')}</th>
                      <th className="text-right font-medium py-2 px-3">{t('kpi.freeShippingLimit.feeGivenUp')}</th>
                      <th className="text-right font-medium py-2 pl-3">{t('kpi.freeShippingLimit.campaignDays')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...weeks].reverse().map(w => (
                      <tr key={w.weekStart} className="border-b border-border/50">
                        <td className="py-2 pr-3 text-foreground whitespace-nowrap">
                          {t('kpi.freeShippingLimit.weekShort')} {isoWeek(w.weekStart)}
                          <span className="text-foreground-subtle ml-2">{weekRange(w.weekStart)}</span>
                          {w.isCurrent && <span className="text-foreground-subtle ml-1">*</span>}
                          {w.phase === 'change' && <span className="text-foreground-subtle ml-1">†</span>}
                        </td>
                        <td className="py-2 px-3 text-right text-foreground">{w.complete ? formatNumber(w.orders) : '—'}</td>
                        <td className="py-2 px-3 text-right text-foreground">
                          {w.complete ? formatPerOrder(perOrderOf(w.contribution, w.orders)) : '—'}
                        </td>
                        <td className="py-2 px-3 text-right text-foreground-muted">
                          {w.prevComplete ? formatPerOrder(perOrderOf(w.prevContribution, w.prevOrders)) : '—'}
                        </td>
                        <td className="py-2 px-3 text-right text-foreground">
                          {w.complete ? `${formatShare(ratio(w.nearAbove, w.nearAbove + w.nearBelow))} (${w.nearAbove}/${w.nearAbove + w.nearBelow})` : '—'}
                        </td>
                        <td className="py-2 px-3 text-right text-foreground-muted">
                          {w.prevComplete ? formatShare(ratio(w.prevNearAbove, w.prevNearAbove + w.prevNearBelow)) : '—'}
                        </td>
                        <td className="py-2 px-3 text-right text-foreground">
                          {w.phase === 'before' || !w.complete ? '—' : formatMoney(w.feeGivenUp)}
                        </td>
                        <td className="py-2 pl-3 text-right text-foreground-muted">
                          {w.campaignDays} / {w.prevCampaignDays}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="text-xs text-foreground-subtle mt-2">{t('kpi.freeShippingLimit.tableNote')}</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

export default FreeShippingLimitCard

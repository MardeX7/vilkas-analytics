/**
 * ShippingPaymentCard - Shipping and payment methods analysis
 *
 * Shows shipping and payment methods breakdown with cross-analysis.
 */

import { Truck, CreditCard, Target, Lightbulb, AlertTriangle } from 'lucide-react'
import { useTranslation } from '@/lib/i18n'
import { useShippingPaymentAnalysis } from '@/hooks/useShippingPaymentAnalysis'
import { cn } from '@/lib/utils'

function LoadingState({ message }) {
  return (
    <div className="flex items-center justify-center py-12">
      <div className="text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
        <p className="text-foreground-muted">{message}</p>
      </div>
    </div>
  )
}

function ErrorState({ message }) {
  return (
    <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 text-center">
      <AlertTriangle className="w-8 h-8 text-red-400 mx-auto mb-2" />
      <p className="text-red-400">{message}</p>
    </div>
  )
}

/**
 * ShippingPaymentCard - Full shipping and payment analysis card
 *
 * @param {object} props
 * @param {string} props.startDate - Start date (YYYY-MM-DD)
 * @param {string} props.endDate - End date (YYYY-MM-DD)
 * @param {string} props.className
 */
export function ShippingPaymentCard({ startDate, endDate, className }) {
  const { t, language } = useTranslation()

  const dateRange = { startDate, endDate }
  const { shippingSummary, paymentSummary, crossAnalysis, insights, loading, error } = useShippingPaymentAnalysis(dateRange)

  const formatCurrency = (value) => {
    return Math.round(value).toLocaleString(language === 'fi' ? 'fi-FI' : 'sv-SE')
  }

  const formatPercent = (value) => {
    return value.toFixed(1)
  }

  if (loading) {
    return (
      <div className={cn('rounded-lg border border-card-border bg-background-elevated p-5', className)}>
        <LoadingState message={t('insights.loading.shipping')} />
      </div>
    )
  }

  if (error) {
    return (
      <div className={cn('rounded-lg border border-destructive/30 bg-background-elevated p-5', className)}>
        <ErrorState message={error} />
      </div>
    )
  }

  if (!shippingSummary || shippingSummary.length === 0) {
    return null
  }

  return (
    <div className={cn('space-y-6', className)}>
      {/* Insights Cards */}
      {insights && insights.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {insights.map((insight, i) => (
            <div key={i} className="bg-primary/10 border border-primary/30 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <Lightbulb className="w-4 h-4 text-primary" />
                <span className="text-sm font-medium text-primary">{insight.title}</span>
              </div>
              <p className="text-foreground text-sm">{insight.message}</p>
            </div>
          ))}
        </div>
      )}

      {/* Shipping Summary */}
      <div className="bg-background-elevated rounded-lg border border-border overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <h3 className="text-lg font-medium text-foreground flex items-center gap-2">
            <Truck className="w-5 h-5 text-primary" />
            {t('insights.shipping.title')}
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-background-subtle">
              <tr>
                <th className="text-left px-4 py-3 text-sm font-medium text-foreground-muted">{t('insights.shipping.method')}</th>
                <th className="text-right px-4 py-3 text-sm font-medium text-foreground-muted">{t('insights.shipping.orders')}</th>
                <th className="text-right px-4 py-3 text-sm font-medium text-foreground-muted">{t('insights.shipping.share')}</th>
                <th className="text-right px-4 py-3 text-sm font-medium text-foreground-muted">{t('insights.shipping.avgOrder')}</th>
                <th className="text-right px-4 py-3 text-sm font-medium text-foreground-muted">{t('insights.shipping.minMax')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {shippingSummary.map((s) => (
                <tr key={s.method} className="hover:bg-background-subtle/50">
                  <td className="px-4 py-3 text-foreground font-medium">{s.method}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-foreground">{s.count}</td>
                  <td className="px-4 py-3 text-right">
                    <span className="px-2 py-1 bg-primary/20 rounded text-sm text-primary">
                      {formatPercent(s.percentage)}%
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-foreground">{formatCurrency(s.avgValue)} kr</td>
                  <td className="px-4 py-3 text-right tabular-nums text-foreground-muted text-sm">
                    {formatCurrency(s.minValue)} - {formatCurrency(s.maxValue)} kr
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Payment Summary */}
      <div className="bg-background-elevated rounded-lg border border-border overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <h3 className="text-lg font-medium text-foreground flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-primary" />
            {t('insights.payment.title')}
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-background-subtle">
              <tr>
                <th className="text-left px-4 py-3 text-sm font-medium text-foreground-muted">{t('insights.payment.method')}</th>
                <th className="text-right px-4 py-3 text-sm font-medium text-foreground-muted">{t('insights.payment.orders')}</th>
                <th className="text-right px-4 py-3 text-sm font-medium text-foreground-muted">{t('insights.payment.share')}</th>
                <th className="text-right px-4 py-3 text-sm font-medium text-foreground-muted">{t('insights.payment.avgOrder')}</th>
                <th className="text-right px-4 py-3 text-sm font-medium text-foreground-muted">{t('insights.payment.minMax')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {paymentSummary.map((p) => (
                <tr key={p.method} className="hover:bg-background-subtle/50">
                  <td className="px-4 py-3 text-foreground font-medium">{p.method}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-foreground">{p.count}</td>
                  <td className="px-4 py-3 text-right">
                    <span className="px-2 py-1 bg-primary/20 rounded text-sm text-primary">
                      {formatPercent(p.percentage)}%
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-foreground">{formatCurrency(p.avgValue)} kr</td>
                  <td className="px-4 py-3 text-right tabular-nums text-foreground-muted text-sm">
                    {formatCurrency(p.minValue)} - {formatCurrency(p.maxValue)} kr
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Cross Analysis */}
      {crossAnalysis && crossAnalysis.length > 0 && (
        <div className="bg-background-elevated rounded-lg border border-border overflow-hidden">
          <div className="px-4 py-3 border-b border-border">
            <h3 className="text-lg font-medium text-foreground flex items-center gap-2">
              <Target className="w-5 h-5 text-primary" />
              {t('insights.cross.title')}
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-background-subtle">
                <tr>
                  <th className="text-left px-4 py-3 text-sm font-medium text-foreground-muted">{t('insights.cross.shipping')}</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-foreground-muted">{t('insights.cross.payment')}</th>
                  <th className="text-right px-4 py-3 text-sm font-medium text-foreground-muted">{t('insights.cross.count')}</th>
                  <th className="text-right px-4 py-3 text-sm font-medium text-foreground-muted">{t('insights.cross.share')}</th>
                  <th className="text-right px-4 py-3 text-sm font-medium text-foreground-muted">{t('insights.cross.avgOrder')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {crossAnalysis.slice(0, 10).map((c, i) => (
                  <tr key={i} className="hover:bg-background-subtle/50">
                    <td className="px-4 py-3 text-foreground">{c.shipping}</td>
                    <td className="px-4 py-3 text-foreground">{c.payment}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-foreground">{c.count}</td>
                    <td className="px-4 py-3 text-right">
                      <span className="px-2 py-1 bg-background-subtle rounded text-sm text-foreground-muted">
                        {formatPercent(c.percentage)}%
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-foreground">{formatCurrency(c.avgValue)} kr</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

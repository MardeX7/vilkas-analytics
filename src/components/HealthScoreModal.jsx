/**
 * HealthScoreModal - Explains how health score is calculated
 */

import { X, Activity, TrendingUp, TrendingDown, AlertTriangle, CheckCircle, Info } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { useTranslation } from '@/lib/i18n'
import { useCurrentShop } from '@/config/storeConfig'

// Scoring factors based on useIndicators.js calculateHealthScore
const SCORING_FACTORS = {
  positive: [
    {
      condition: 'sales_trend_up',
      indicator: 'sales_trend',
      points: 8,
      description: 'Sales trend is going up'
    },
    {
      condition: 'organic_cr_up',
      indicator: 'organic_conversion_rate',
      points: 8,
      description: 'Organic conversion rate is improving'
    },
    {
      condition: 'good_nonbrand',
      indicator: 'brand_vs_nonbrand',
      points: 5,
      description: 'Non-brand search share >= 40%'
    }
  ],
  negative: [
    {
      condition: 'alert_triggered',
      points: -10,
      description: 'Each active alert'
    },
    {
      condition: 'sales_down',
      indicator: 'sales_trend',
      points: -8,
      description: 'Sales trend is declining'
    },
    {
      condition: 'aov_down',
      indicator: 'aov',
      points: -8,
      description: 'Average order value is declining'
    },
    {
      condition: 'high_stock_risk',
      indicator: 'stock_availability_risk',
      points: -10,
      description: 'Stock risk > 5000 {currency}'
    }
  ]
}

export function HealthScoreModal({
  isOpen,
  onClose,
  score,
  indicators = []
}) {
  const { t } = useTranslation()
  const { currencySymbol } = useCurrentShop()

  if (!isOpen) return null

  // Analyze which factors are active
  const activeFactors = analyzeFactors(indicators)

  // Get score level
  const getScoreLevel = (s) => {
    if (s >= 70) return { label: t('healthScore.levels.excellent'), color: 'text-green-400', bg: 'bg-green-500/20' }
    if (s >= 50) return { label: t('healthScore.levels.good'), color: 'text-cyan-400', bg: 'bg-cyan-500/20' }
    if (s >= 30) return { label: t('healthScore.levels.fair'), color: 'text-amber-400', bg: 'bg-amber-500/20' }
    return { label: t('healthScore.levels.poor'), color: 'text-red-400', bg: 'bg-red-500/20' }
  }

  const level = getScoreLevel(score)

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="w-full max-w-lg bg-slate-900 border border-slate-700 rounded-xl shadow-2xl max-h-[90vh] overflow-y-auto">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-slate-800">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${level.bg}`}>
                <Activity className={`w-5 h-5 ${level.color}`} />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-white">{t('healthScore.title')}</h2>
                <p className="text-slate-400 text-xs">{t('healthScore.subtitle')}</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Score Display */}
          <div className="p-6 text-center border-b border-slate-800">
            <div className="inline-flex items-center justify-center w-32 h-32 rounded-full bg-slate-800 border-4 border-slate-700 mb-4">
              <div>
                <p className={`text-4xl font-bold ${level.color}`}>{score}</p>
                <p className="text-slate-500 text-xs mt-1">/100</p>
              </div>
            </div>
            <p className={`text-lg font-medium ${level.color}`}>{level.label}</p>
          </div>

          {/* Breakdown */}
          <div className="p-4 space-y-4">
            {/* How it works */}
            <div className="bg-slate-800/50 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-3">
                <Info className="w-4 h-4 text-blue-400" />
                <h3 className="text-sm font-medium text-white">How it works</h3>
              </div>
              <p className="text-slate-400 text-sm">
                Base score starts at 50. Positive factors add points, negative factors subtract points.
                Score is clamped between 0-100.
              </p>
            </div>

            {/* Positive Factors */}
            <div>
              <h3 className="text-sm font-medium text-white mb-3 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-green-400" />
                {t('healthScore.positive')}
              </h3>
              <div className="space-y-2">
                {SCORING_FACTORS.positive.map((factor, idx) => {
                  const isActive = activeFactors.positive.includes(factor.condition)
                  return (
                    <FactorRow
                      key={idx}
                      factor={factor}
                      isActive={isActive}
                      isPositive={true}
                      t={t}
                      currencySymbol={currencySymbol}
                    />
                  )
                })}
              </div>
            </div>

            {/* Negative Factors */}
            <div>
              <h3 className="text-sm font-medium text-white mb-3 flex items-center gap-2">
                <TrendingDown className="w-4 h-4 text-red-400" />
                {t('healthScore.negative')}
              </h3>
              <div className="space-y-2">
                {SCORING_FACTORS.negative.map((factor, idx) => {
                  const isActive = activeFactors.negative.includes(factor.condition)
                  return (
                    <FactorRow
                      key={idx}
                      factor={factor}
                      isActive={isActive}
                      isPositive={false}
                      t={t}
                      currencySymbol={currencySymbol}
                    />
                  )
                })}
              </div>
            </div>

            {/* Recommendations */}
            {activeFactors.negative.length > 0 && (
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4">
                <h3 className="text-sm font-medium text-amber-400 mb-2 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4" />
                  {t('healthScore.recommendations')}
                </h3>
                <ul className="text-slate-300 text-sm space-y-1">
                  {activeFactors.negative.includes('sales_down') && (
                    <li>• Focus on marketing campaigns to boost sales</li>
                  )}
                  {activeFactors.negative.includes('aov_down') && (
                    <li>• Consider upselling and bundling strategies</li>
                  )}
                  {activeFactors.negative.includes('high_stock_risk') && (
                    <li>• Restock high-traffic SEO products</li>
                  )}
                  {activeFactors.negative.includes('alert_triggered') && (
                    <li>• Review and address active alerts</li>
                  )}
                </ul>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="p-4 border-t border-slate-800">
            <button
              onClick={onClose}
              className="w-full px-4 py-2 bg-slate-800 text-white rounded-lg hover:bg-slate-700 transition-colors"
            >
              {t('common.close')}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}

function FactorRow({ factor, isActive, isPositive, t, currencySymbol }) {
  return (
    <div className={`flex items-center justify-between p-3 rounded-lg ${
      isActive
        ? isPositive ? 'bg-green-500/10 border border-green-500/30' : 'bg-red-500/10 border border-red-500/30'
        : 'bg-slate-800/50'
    }`}>
      <div className="flex items-center gap-3">
        {isActive ? (
          <CheckCircle className={`w-4 h-4 ${isPositive ? 'text-green-400' : 'text-red-400'}`} />
        ) : (
          <div className="w-4 h-4 rounded-full border border-slate-600" />
        )}
        <div>
          <p className={`text-sm ${isActive ? 'text-white' : 'text-slate-400'}`}>
            {factor.description.replace('{currency}', currencySymbol)}
          </p>
          {factor.indicator && (
            <p className="text-xs text-slate-500">
              {t(`indicators.types.${factor.indicator}.title`)}
            </p>
          )}
        </div>
      </div>
      <span className={`text-sm font-medium ${
        isActive
          ? isPositive ? 'text-green-400' : 'text-red-400'
          : 'text-slate-500'
      }`}>
        {factor.points > 0 ? '+' : ''}{factor.points}
      </span>
    </div>
  )
}

/**
 * Analyze which scoring factors are active based on indicators
 */
function analyzeFactors(indicators) {
  const positive = []
  const negative = []

  for (const ind of indicators) {
    // Positive: sales_trend up
    if (ind.indicator_id === 'sales_trend' && ind.direction === 'up') {
      positive.push('sales_trend_up')
    }

    // Positive: organic_conversion_rate up
    if (ind.indicator_id === 'organic_conversion_rate' && ind.direction === 'up') {
      positive.push('organic_cr_up')
    }

    // Positive: good non-brand share
    if (ind.indicator_id === 'brand_vs_nonbrand' && ind.numeric_value >= 40) {
      positive.push('good_nonbrand')
    }

    // Negative: alert triggered
    if (ind.alert_triggered) {
      negative.push('alert_triggered')
    }

    // Negative: sales_trend down
    if (ind.indicator_id === 'sales_trend' && ind.direction === 'down') {
      negative.push('sales_down')
    }

    // Negative: aov down
    if (ind.indicator_id === 'aov' && ind.direction === 'down') {
      negative.push('aov_down')
    }

    // Negative: high stock risk
    if (ind.indicator_id === 'stock_availability_risk' && ind.numeric_value > 5000) {
      negative.push('high_stock_risk')
    }
  }

  return { positive: [...new Set(positive)], negative: [...new Set(negative)] }
}

export default HealthScoreModal

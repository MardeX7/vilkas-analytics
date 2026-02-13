/**
 * ConversionFunnel - Visual e-commerce conversion funnel
 *
 * Shows:
 * - Product views → Add to cart → Purchase flow
 * - Conversion rates between steps
 * - Abandoned carts indicator
 * - Revenue summary
 */

import { ShoppingCart, Eye, Package, DollarSign, AlertTriangle } from 'lucide-react'
import { useTranslation } from '@/lib/i18n'

export function ConversionFunnel({
  productFunnel = {},
  currency = 'kr'
}) {
  const { language } = useTranslation()

  const {
    totalViews = 0,
    totalAddToCart = 0,
    totalPurchased = 0,
    totalRevenue = 0,
    viewToCartRate = 0,
    cartToPurchaseRate = 0
  } = productFunnel

  // Calculate overall conversion rate
  const overallConversion = totalViews > 0
    ? (totalPurchased / totalViews) * 100
    : 0

  // Abandoned carts
  const abandonedCarts = totalAddToCart - totalPurchased
  const abandonRate = totalAddToCart > 0
    ? (abandonedCarts / totalAddToCart) * 100
    : 0

  // Average order value
  const avgOrderValue = totalPurchased > 0
    ? totalRevenue / totalPurchased
    : 0

  // Funnel steps data
  const steps = [
    {
      id: 'views',
      label: language === 'sv' ? 'Produktvisningar' : 'Tuotenäytöt',
      value: totalViews,
      icon: Eye,
      color: '#01a7da', // Primary blue
      percentage: 100
    },
    {
      id: 'cart',
      label: language === 'sv' ? 'Lagt i varukorg' : 'Lisätty koriin',
      value: totalAddToCart,
      icon: ShoppingCart,
      color: '#eee000', // Warning yellow
      percentage: totalViews > 0 ? (totalAddToCart / totalViews) * 100 : 0,
      conversionFromPrev: viewToCartRate * 100
    },
    {
      id: 'purchased',
      label: language === 'sv' ? 'Köpt' : 'Ostettu',
      value: totalPurchased,
      icon: Package,
      color: '#22c55e', // Success green
      percentage: totalViews > 0 ? (totalPurchased / totalViews) * 100 : 0,
      conversionFromPrev: cartToPurchaseRate * 100
    }
  ]

  // No data state
  if (totalViews === 0) {
    return (
      <div className="bg-background-elevated rounded-lg border border-card-border p-5">
        <div className="flex items-center gap-2 mb-4">
          <ShoppingCart className="w-5 h-5 text-primary" />
          <h3 className="text-base font-medium text-foreground">
            {language === 'sv' ? 'Konverteringstratt' : 'Konversiosuppilo'}
          </h3>
        </div>
        <div className="h-40 flex items-center justify-center">
          <p className="text-foreground-muted text-sm">
            {language === 'sv' ? 'Ingen e-handelsdata' : 'Ei verkkokauppadataa'}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-background-elevated rounded-lg border border-card-border p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <ShoppingCart className="w-5 h-5 text-primary" />
          <h3 className="text-base font-medium text-foreground">
            {language === 'sv' ? 'Konverteringstratt' : 'Konversiosuppilo'}
          </h3>
        </div>
        <div className="text-right">
          <p className="text-xs text-foreground-muted">
            {language === 'sv' ? 'Total konvertering' : 'Kokonaiskonversio'}
          </p>
          <p className="text-lg font-bold text-foreground">
            {overallConversion.toFixed(1)}%
          </p>
        </div>
      </div>

      {/* Visual Funnel */}
      <div className="space-y-3">
        {steps.map((step, index) => {
          const widthPercent = Math.max(step.percentage, 5) // Minimum 5% width for visibility
          const Icon = step.icon

          return (
            <div key={step.id}>
              {/* Conversion arrow between steps */}
              {index > 0 && step.conversionFromPrev != null && (
                <div className="flex items-center justify-center py-1">
                  <div className="flex items-center gap-1 text-xs text-foreground-muted">
                    <span>↓</span>
                    <span className={step.conversionFromPrev >= 10 ? 'text-success' : 'text-warning'}>
                      {step.conversionFromPrev.toFixed(1)}%
                    </span>
                  </div>
                </div>
              )}

              {/* Funnel bar */}
              <div className="relative">
                {/* Background bar */}
                <div className="h-12 bg-background-subtle rounded-lg overflow-hidden">
                  {/* Filled portion */}
                  <div
                    className="h-full rounded-lg transition-all duration-500 flex items-center px-3"
                    style={{
                      width: `${widthPercent}%`,
                      backgroundColor: step.color,
                      opacity: 0.85
                    }}
                  >
                    <Icon className="w-4 h-4 text-background flex-shrink-0" />
                  </div>
                </div>

                {/* Label overlay */}
                <div className="absolute inset-0 flex items-center justify-between px-3">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-foreground ml-8">
                      {step.label}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-foreground-muted">
                      ({step.percentage.toFixed(1)}%)
                    </span>
                    <span className="text-lg font-bold text-foreground tabular-nums">
                      {step.value.toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Bottom stats */}
      <div className="grid grid-cols-3 gap-4 mt-6 pt-4 border-t border-border">
        {/* Revenue */}
        <div className="text-center">
          <div className="flex items-center justify-center gap-1 mb-1">
            <DollarSign className="w-4 h-4 text-success" />
            <span className="text-xs text-foreground-muted">
              {language === 'sv' ? 'Intäkter' : 'Liikevaihto'}
            </span>
          </div>
          <p className="text-lg font-bold text-foreground">
            {currency}{totalRevenue.toLocaleString('sv-SE', {
              minimumFractionDigits: 0,
              maximumFractionDigits: 0
            })}
          </p>
        </div>

        {/* Average Order Value */}
        <div className="text-center">
          <div className="flex items-center justify-center gap-1 mb-1">
            <Package className="w-4 h-4 text-primary" />
            <span className="text-xs text-foreground-muted">
              {language === 'sv' ? 'Snittorder' : 'Keskiostos'}
            </span>
          </div>
          <p className="text-lg font-bold text-foreground">
            {currency}{avgOrderValue.toLocaleString('sv-SE', {
              minimumFractionDigits: 0,
              maximumFractionDigits: 0
            })}
          </p>
        </div>

        {/* Abandoned Carts */}
        <div className="text-center">
          <div className="flex items-center justify-center gap-1 mb-1">
            <AlertTriangle className="w-4 h-4 text-warning" />
            <span className="text-xs text-foreground-muted">
              {language === 'sv' ? 'Övergivna' : 'Hylätyt korit'}
            </span>
          </div>
          <p className={`text-lg font-bold ${abandonRate > 80 ? 'text-warning' : 'text-foreground'}`}>
            {abandonedCarts} <span className="text-sm font-normal text-foreground-muted">({abandonRate.toFixed(0)}%)</span>
          </p>
        </div>
      </div>
    </div>
  )
}

export default ConversionFunnel

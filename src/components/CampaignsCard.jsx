/**
 * CampaignsCard - Display campaign performance
 *
 * Näyttää kuponkikampanjoiden tehokkuuden ja tilastot.
 */

import { Tag, Calendar, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useCampaigns, CAMPAIGN_TYPES } from '@/hooks/useCampaigns'
import { useCurrentShop } from '@/config/storeConfig'

/**
 * Single campaign item
 */
function CampaignItem({ campaign, currencySymbol }) {
  const config = CAMPAIGN_TYPES[campaign.campaign_type] || CAMPAIGN_TYPES.discount

  const formatDate = (date) => {
    return new Date(date).toLocaleDateString('fi-FI', { day: 'numeric', month: 'short' })
  }

  const formatCurrency = (value) => {
    return (value || 0).toLocaleString('sv-SE', { maximumFractionDigits: 0 })
  }

  // Calculate campaign-specific metrics
  const revenue = parseFloat(campaign.revenue) || 0
  const discountGiven = parseFloat(campaign.discount_given) || 0
  const ordersCount = campaign.orders_count || 0
  const avgOrderValue = ordersCount > 0 ? revenue / ordersCount : 0
  const campaignROI = discountGiven > 0 ? ((revenue / discountGiven) - 1) * 100 : 0

  return (
    <div className="p-3 bg-background-subtle rounded-lg">
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0', config.color)}>
            <Tag className="w-4 h-4 text-white" />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">{campaign.coupon_code}</p>
            <p className="text-xs text-foreground-muted">{campaign.name}</p>
          </div>
        </div>
        {campaign.discount_value > 0 && (
          <span className="text-xs px-2 py-0.5 bg-primary/10 text-primary rounded-full">
            -{campaign.discount_type === 'percentage' ? `${campaign.discount_value}%` : `${campaign.discount_value} ${currencySymbol}`}
          </span>
        )}
      </div>

      <div className="grid grid-cols-4 gap-2 text-xs">
        <div>
          <p className="text-foreground-muted mb-0.5">Tilauksia</p>
          <p className="font-medium text-foreground">{campaign.orders_count}</p>
        </div>
        <div>
          <p className="text-foreground-muted mb-0.5">Myynti</p>
          <p className="font-medium text-foreground">{formatCurrency(revenue)} {currencySymbol}</p>
        </div>
        <div>
          <p className="text-foreground-muted mb-0.5">KM/tilaus</p>
          <p className="font-medium text-foreground">{formatCurrency(avgOrderValue)} {currencySymbol}</p>
        </div>
        <div>
          <p className="text-foreground-muted mb-0.5">ROI</p>
          <p className={cn('font-medium', campaignROI >= 500 ? 'text-green-500' : campaignROI >= 200 ? 'text-primary' : 'text-orange-500')}>
            {campaignROI.toFixed(0)}%
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between mt-2 text-[10px] text-foreground-muted">
        <div className="flex items-center gap-1">
          <Calendar className="w-3 h-3" />
          <span>
            {formatDate(campaign.start_date)}
            {campaign.start_date !== campaign.end_date && ` - ${formatDate(campaign.end_date)}`}
          </span>
        </div>
        <span>Alennus: {formatCurrency(discountGiven)} {currencySymbol}</span>
      </div>
    </div>
  )
}

/**
 * Summary stats header
 */
function CampaignSummary({ campaigns, currencySymbol }) {
  const totalOrders = campaigns.reduce((sum, c) => sum + (c.orders_count || 0), 0)
  const totalRevenue = campaigns.reduce((sum, c) => sum + parseFloat(c.revenue || 0), 0)
  const totalDiscount = campaigns.reduce((sum, c) => sum + parseFloat(c.discount_given || 0), 0)
  const roi = totalDiscount > 0 ? ((totalRevenue / totalDiscount) - 1) * 100 : 0

  const formatCurrency = (value) => {
    return value.toLocaleString('sv-SE', { maximumFractionDigits: 0 })
  }

  return (
    <div className="grid grid-cols-2 gap-3 p-3 bg-background rounded-lg border border-card-border mb-3">
      <div>
        <p className="text-xs text-foreground-muted">Kampanjatilauksia</p>
        <p className="text-lg font-semibold text-foreground">{totalOrders}</p>
      </div>
      <div>
        <p className="text-xs text-foreground-muted">Liikevaihto</p>
        <p className="text-lg font-semibold text-foreground">{formatCurrency(totalRevenue)} {currencySymbol}</p>
      </div>
      <div>
        <p className="text-xs text-foreground-muted">Alennukset</p>
        <p className="text-lg font-semibold text-destructive">-{formatCurrency(totalDiscount)} {currencySymbol}</p>
      </div>
      <div>
        <p className="text-xs text-foreground-muted">ROI</p>
        <p className={cn('text-lg font-semibold', roi >= 0 ? 'text-green-500' : 'text-destructive')}>
          {roi.toFixed(0)}%
        </p>
      </div>
    </div>
  )
}

/**
 * CampaignsCard
 */
export function CampaignsCard({ startDate, endDate, className }) {
  const { currencySymbol } = useCurrentShop()
  const {
    campaigns,
    isLoading,
    error,
    refetch
  } = useCampaigns({ startDate, endDate })

  if (isLoading) {
    return (
      <div className={cn('rounded-lg border border-card-border bg-background-elevated p-5', className)}>
        <div className="animate-pulse">
          <div className="h-5 w-32 bg-background-subtle rounded mb-4" />
          <div className="space-y-3">
            <div className="h-24 bg-background-subtle rounded" />
            <div className="h-16 bg-background-subtle rounded" />
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className={cn('rounded-lg border border-destructive/30 bg-background-elevated p-5', className)}>
        <p className="text-sm text-destructive">Kampanjoita ei voitu ladata</p>
      </div>
    )
  }

  return (
    <div className={cn('rounded-lg border border-card-border bg-background-elevated p-5', className)}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Tag className="w-5 h-5 text-primary" />
          <h3 className="font-semibold text-foreground">Kampanjat</h3>
        </div>
        <button
          onClick={() => refetch()}
          className="p-1 text-foreground-muted hover:text-foreground transition-colors"
          title="Päivitä"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Content */}
      {campaigns.length === 0 ? (
        <div className="text-center py-4">
          <Tag className="w-8 h-8 text-foreground-muted mx-auto mb-2" />
          <p className="text-sm text-foreground-muted">Ei kampanjoita tälle jaksolle</p>
          <p className="text-xs text-foreground-muted mt-1">
            Kampanjat synkataan tilauksista automaattisesti
          </p>
        </div>
      ) : (
        <>
          <CampaignSummary campaigns={campaigns} currencySymbol={currencySymbol} />

          <div className="space-y-2">
            {campaigns.slice(0, 5).map((campaign) => (
              <CampaignItem key={campaign.id} campaign={campaign} currencySymbol={currencySymbol} />
            ))}
          </div>

          {campaigns.length > 5 && (
            <p className="text-xs text-foreground-muted mt-3 text-center">
              + {campaigns.length - 5} muuta kampanjaa
            </p>
          )}
        </>
      )}
    </div>
  )
}

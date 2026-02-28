/**
 * ProductRolesCard - Display product role classification
 *
 * Näyttää tuotteiden roolijakauman: Veturit, Ankkurit, Täyttäjät, Häntä
 */

import { useState } from 'react'
import { Star, Anchor, Package, TrendingDown, RefreshCw, ChevronDown, ChevronUp, Info } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useProductRoles, PRODUCT_ROLES } from '@/hooks/useProductRoles'
import { useCurrentShop } from '@/config/storeConfig'

const RoleIcons = {
  hero: Star,
  anchor: Anchor,
  filler: Package,
  longtail: TrendingDown
}

/**
 * Single role summary row
 */
function RoleRow({ role, data, isExpanded, onToggle, currencySymbol }) {
  const [showTooltip, setShowTooltip] = useState(false)
  const config = PRODUCT_ROLES[role] || PRODUCT_ROLES.filler
  const Icon = RoleIcons[role] || Package

  const formatCurrency = (value) => {
    return (parseFloat(value) || 0).toLocaleString('sv-SE', { maximumFractionDigits: 0 })
  }

  const topProducts = data.top_products || []

  return (
    <div className="border border-card-border rounded-lg relative">
      {/* Tooltip - rendered outside button */}
      {showTooltip && (
        <div className="absolute left-44 top-2 z-[9999] w-48 p-2 text-xs bg-background-elevated border border-card-border rounded shadow-lg text-foreground-muted">
          {config.description}
        </div>
      )}

      {/* Header row - clickable */}
      <button
        onClick={onToggle}
        className="w-full p-3 bg-background-subtle hover:bg-background-subtle/80 transition-colors flex items-center gap-3 rounded-t-lg"
      >
        <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0', config.color)}>
          <Icon className="w-4 h-4 text-white" />
        </div>

        <div className="flex-1 text-left">
          <div className="flex items-center gap-1">
            <p className="text-sm font-medium text-foreground">{config.label}</p>
            <Info
              className="w-3 h-3 text-foreground-muted cursor-help"
              onMouseEnter={() => setShowTooltip(true)}
              onMouseLeave={() => setShowTooltip(false)}
            />
          </div>
          <p className="text-xs text-foreground-muted">{data.product_count} tuotetta</p>
        </div>

        <div className="grid grid-cols-3 gap-4 text-right text-xs">
          <div>
            <p className="text-foreground-muted">Myynti</p>
            <p className="font-medium text-foreground">{formatCurrency(data.total_revenue)} {currencySymbol}</p>
          </div>
          <div>
            <p className="text-foreground-muted">Kpl</p>
            <p className="font-medium text-foreground">{parseInt(data.total_units || 0)}</p>
          </div>
          <div>
            <p className="text-foreground-muted">Kate</p>
            <p className="font-medium text-foreground">
              {data.avg_margin ? `${parseFloat(data.avg_margin).toFixed(0)}%` : '—'}
            </p>
          </div>
        </div>

        <div className="ml-2">
          {isExpanded ? (
            <ChevronUp className="w-4 h-4 text-foreground-muted" />
          ) : (
            <ChevronDown className="w-4 h-4 text-foreground-muted" />
          )}
        </div>
      </button>

      {/* Expanded content - top products */}
      {isExpanded && topProducts.length > 0 && (
        <div className="border-t border-card-border bg-background p-3">
          <p className="text-xs text-foreground-muted mb-2">Top 5 tuotetta:</p>
          <div className="space-y-1.5">
            {topProducts.map((product, idx) => (
              <div key={product.product_id || idx} className="flex items-center justify-between text-xs">
                <span className="text-foreground truncate max-w-[200px]">
                  {idx + 1}. {product.name}
                </span>
                <div className="flex items-center gap-3 text-foreground-muted">
                  <span>{product.units_sold} kpl</span>
                  <span className="font-medium text-foreground">{formatCurrency(product.revenue)} {currencySymbol}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * Summary bar showing distribution
 */
function RoleDistributionBar({ roles, totals }) {
  if (!roles.length || totals.revenue === 0) return null

  return (
    <div className="mb-4">
      <div className="flex h-3 rounded-full overflow-hidden bg-background-subtle">
        {roles.map((role) => {
          const config = PRODUCT_ROLES[role.role]
          const percentage = (parseFloat(role.total_revenue) / totals.revenue) * 100
          if (percentage < 1) return null

          return (
            <div
              key={role.role}
              className={cn('h-full', config?.color || 'bg-gray-500')}
              style={{ width: `${percentage}%` }}
              title={`${config?.label}: ${percentage.toFixed(0)}%`}
            />
          )
        })}
      </div>
      <div className="flex justify-between mt-1 text-[10px] text-foreground-muted">
        {roles.map((role) => {
          const config = PRODUCT_ROLES[role.role]
          const percentage = (parseFloat(role.total_revenue) / totals.revenue) * 100
          return (
            <span key={role.role} className={config?.textColor}>
              {config?.label}: {percentage.toFixed(0)}%
            </span>
          )
        })}
      </div>
    </div>
  )
}

/**
 * ProductRolesCard
 */
export function ProductRolesCard({ startDate, endDate, className }) {
  const { currencySymbol } = useCurrentShop()
  const [expandedRole, setExpandedRole] = useState(null)

  const {
    roles,
    totals,
    calculatedAt,
    isLoading,
    error,
    refetch
  } = useProductRoles({ startDate, endDate })

  // Format calculated date
  const formatCalculatedDate = (dateStr) => {
    if (!dateStr) return null
    const date = new Date(dateStr)
    return date.toLocaleDateString('fi-FI', { day: 'numeric', month: 'short' })
  }

  const toggleRole = (role) => {
    setExpandedRole(expandedRole === role ? null : role)
  }

  if (isLoading) {
    return (
      <div className={cn('rounded-lg border border-card-border bg-background-elevated p-5', className)}>
        <div className="animate-pulse">
          <div className="h-5 w-32 bg-background-subtle rounded mb-4" />
          <div className="space-y-3">
            <div className="h-16 bg-background-subtle rounded" />
            <div className="h-16 bg-background-subtle rounded" />
            <div className="h-16 bg-background-subtle rounded" />
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className={cn('rounded-lg border border-destructive/30 bg-background-elevated p-5', className)}>
        <p className="text-sm text-destructive">Tuoterooleja ei voitu ladata</p>
      </div>
    )
  }

  return (
    <div className={cn('rounded-lg border border-card-border bg-background-elevated p-5', className)}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Star className="w-5 h-5 text-primary" />
          <h3 className="font-semibold text-foreground">Tuoteroolit</h3>
          <span className="text-[10px] px-1.5 py-0.5 bg-primary/10 text-primary rounded">
            90 pv
          </span>
          {calculatedAt && (
            <span className="text-[10px] text-foreground-muted">
              · {formatCalculatedDate(calculatedAt)}
            </span>
          )}
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
      {roles.length === 0 ? (
        <div className="text-center py-4">
          <Package className="w-8 h-8 text-foreground-muted mx-auto mb-2" />
          <p className="text-sm text-foreground-muted">Ei tuoterooleja tälle jaksolle</p>
          <p className="text-xs text-foreground-muted mt-1">
            Aja calculate_product_roles.cjs laskeaksesi roolit
          </p>
        </div>
      ) : (
        <>
          {/* Summary stats */}
          <div className="grid grid-cols-3 gap-3 p-3 bg-background rounded-lg border border-card-border mb-4">
            <div>
              <p className="text-xs text-foreground-muted">Tuotteita</p>
              <p className="text-lg font-semibold text-foreground">{totals.products}</p>
            </div>
            <div>
              <p className="text-xs text-foreground-muted">Myynti yht.</p>
              <p className="text-lg font-semibold text-foreground">
                {totals.revenue.toLocaleString('sv-SE', { maximumFractionDigits: 0 })} {currencySymbol}
              </p>
            </div>
            <div>
              <p className="text-xs text-foreground-muted">Kpl yht.</p>
              <p className="text-lg font-semibold text-foreground">{totals.units}</p>
            </div>
          </div>

          {/* Distribution bar */}
          <RoleDistributionBar roles={roles} totals={totals} />

          {/* Role rows */}
          <div className="space-y-2">
            {roles.map((roleData) => (
              <RoleRow
                key={roleData.role}
                role={roleData.role}
                data={roleData}
                isExpanded={expandedRole === roleData.role}
                onToggle={() => toggleRole(roleData.role)}
                currencySymbol={currencySymbol}
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

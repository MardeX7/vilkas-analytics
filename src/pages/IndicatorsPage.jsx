/**
 * KPI Dashboard (formerly IndicatorsPage)
 *
 * Indeksipohjainen analytiikkanäkymä.
 * 4 pääindeksiä (0-100): Core, PPI, SPI, OI
 *
 * Versio: 2.0 - KPI Index Engine
 */

import { useState } from 'react'
import { RefreshCw, AlertTriangle, TrendingUp, TrendingDown, Minus, ChevronRight, Package, Search, Truck, DollarSign } from 'lucide-react'
import { useKPIDashboard } from '@/hooks/useKPIDashboard'

// Index icons
const INDEX_ICONS = {
  overall: DollarSign,
  core: DollarSign,
  ppi: Package,
  spi: Search,
  oi: Truck
}

// Index colors
const INDEX_COLORS = {
  overall: 'cyan',
  core: 'emerald',
  ppi: 'violet',
  spi: 'amber',
  oi: 'blue'
}

export function IndicatorsPage() {
  const [granularity, setGranularity] = useState('week')
  const [selectedIndex, setSelectedIndex] = useState(null)

  const {
    dashboard,
    indexes,
    alerts,
    topDrivers,
    capitalTraps,
    isLoading,
    error,
    hasData,
    refresh,
    triggerCalculation
  } = useKPIDashboard({ granularity })

  // Overall index (first in array)
  const overallIndex = indexes.find(i => i.id === 'overall')
  const subIndexes = indexes.filter(i => i.id !== 'overall')

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="animate-pulse flex flex-col items-center gap-4">
          <div className="w-20 h-20 rounded-full bg-slate-800" />
          <div className="w-40 h-4 rounded bg-slate-800" />
          <p className="text-slate-500 text-sm">Ladataan indeksejä...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-950">
      <div className="max-w-7xl mx-auto px-6 py-8">

        {/* Header */}
        <div className="flex items-center justify-between mb-10">
          <div>
            <h1 className="text-2xl font-semibold text-white">
              KPI Dashboard
            </h1>
            <p className="text-slate-500 text-sm mt-1">
              Liiketoiminnan indeksit viikko/kuukausitasolla
            </p>
          </div>

          <div className="flex items-center gap-4">
            {/* Granularity Toggle */}
            <div className="flex bg-slate-900 rounded-xl p-1">
              <button
                onClick={() => setGranularity('week')}
                className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${
                  granularity === 'week'
                    ? 'bg-cyan-600 text-white shadow-sm'
                    : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                Viikko
              </button>
              <button
                onClick={() => setGranularity('month')}
                className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${
                  granularity === 'month'
                    ? 'bg-cyan-600 text-white shadow-sm'
                    : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                Kuukausi
              </button>
            </div>

            {/* Refresh */}
            <button
              onClick={refresh}
              className="p-2.5 rounded-xl bg-slate-900 text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              title="Päivitä"
            >
              <RefreshCw className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-4 mb-8">
            <p className="text-red-400 text-sm">{error.message}</p>
          </div>
        )}

        {/* No Data State */}
        {!hasData && !isLoading && (
          <NoDataState onCalculate={triggerCalculation} />
        )}

        {/* Main Dashboard */}
        {hasData && (
          <>
            {/* Hero: Overall Index + Alerts */}
            <div className="grid grid-cols-12 gap-6 mb-10">

              {/* Overall Index - Large */}
              <div className="col-span-12 lg:col-span-5">
                <OverallIndexCard index={overallIndex} alerts={alerts} />
              </div>

              {/* 4 Sub-Indexes */}
              <div className="col-span-12 lg:col-span-7 grid grid-cols-2 gap-4">
                {subIndexes.map(index => (
                  <IndexCard
                    key={index.id}
                    index={index}
                    onClick={() => setSelectedIndex(index.id)}
                    isSelected={selectedIndex === index.id}
                  />
                ))}
              </div>
            </div>

            {/* Alerts Banner */}
            {alerts.length > 0 && (
              <AlertsBanner alerts={alerts} />
            )}

            {/* Index Detail (if selected) */}
            {selectedIndex && (
              <IndexDetail
                index={indexes.find(i => i.id === selectedIndex)}
                onClose={() => setSelectedIndex(null)}
              />
            )}

            {/* Products Section */}
            <div className="grid grid-cols-12 gap-6 mt-10">

              {/* Top Profit Drivers */}
              <div className="col-span-12 lg:col-span-6">
                <ProductsCard
                  title="Top Profit Drivers"
                  subtitle="Kannattavimmat tuotteet"
                  products={topDrivers}
                  type="drivers"
                />
              </div>

              {/* Capital Traps */}
              <div className="col-span-12 lg:col-span-6">
                <ProductsCard
                  title="Capital Traps"
                  subtitle="Tuotteet joissa pääoma jumissa"
                  products={capitalTraps}
                  type="traps"
                />
              </div>
            </div>

            {/* Period Info */}
            {dashboard?.period && (
              <div className="mt-10 text-center">
                <p className="text-slate-600 text-sm">
                  Jakso: {dashboard.period.start} – {dashboard.period.end}
                  {dashboard.calculated_at && (
                    <span className="ml-2">
                      | Laskettu: {new Date(dashboard.calculated_at).toLocaleString('fi-FI')}
                    </span>
                  )}
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

/**
 * Overall Index Card - Large hero display
 */
function OverallIndexCard({ index, alerts }) {
  if (!index) return null

  const { value, delta, interpretation } = index

  const getColorClass = (level) => {
    switch (level) {
      case 'excellent': return 'text-emerald-400'
      case 'good': return 'text-green-400'
      case 'fair': return 'text-amber-400'
      case 'poor': return 'text-orange-400'
      case 'critical': return 'text-red-400'
      default: return 'text-slate-400'
    }
  }

  const getBgGradient = (level) => {
    switch (level) {
      case 'excellent': return 'from-emerald-500/10 to-emerald-500/5'
      case 'good': return 'from-green-500/10 to-green-500/5'
      case 'fair': return 'from-amber-500/10 to-amber-500/5'
      case 'poor': return 'from-orange-500/10 to-orange-500/5'
      case 'critical': return 'from-red-500/10 to-red-500/5'
      default: return 'from-slate-800 to-slate-900'
    }
  }

  return (
    <div className={`bg-gradient-to-br ${getBgGradient(interpretation?.level)} rounded-3xl p-8 h-full`}>
      <div className="flex items-center justify-between mb-6">
        <p className="text-slate-400 text-sm font-medium">Kokonaisindeksi</p>
        {alerts.length > 0 && (
          <div className="flex items-center gap-1.5 bg-amber-500/20 text-amber-400 px-2 py-1 rounded-lg">
            <AlertTriangle className="w-3.5 h-3.5" />
            <span className="text-xs font-medium">{alerts.length}</span>
          </div>
        )}
      </div>

      <div className="flex items-end gap-4 mb-4">
        <span className={`text-8xl font-bold ${getColorClass(interpretation?.level)}`}>
          {value ?? '—'}
        </span>
      </div>

      <div className="flex items-center gap-3 mb-6">
        <span className={`text-lg font-semibold ${getColorClass(interpretation?.level)}`}>
          {interpretation?.label}
        </span>
        {delta !== 0 && (
          <DeltaBadge delta={delta} />
        )}
      </div>

      {/* Index Gauge */}
      <div className="mt-6">
        <div className="h-3 bg-slate-800 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              interpretation?.level === 'excellent' ? 'bg-emerald-500' :
              interpretation?.level === 'good' ? 'bg-green-500' :
              interpretation?.level === 'fair' ? 'bg-amber-500' :
              interpretation?.level === 'poor' ? 'bg-orange-500' : 'bg-red-500'
            }`}
            style={{ width: `${value || 0}%` }}
          />
        </div>
        <div className="flex justify-between mt-2 text-xs text-slate-600">
          <span>0</span>
          <span>50</span>
          <span>100</span>
        </div>
      </div>
    </div>
  )
}

/**
 * Index Card - Sub-index display
 */
function IndexCard({ index, onClick, isSelected }) {
  if (!index) return null

  const { id, name, value, delta, interpretation } = index
  const Icon = INDEX_ICONS[id] || DollarSign
  const color = INDEX_COLORS[id] || 'slate'

  const getColorClasses = (color, level) => {
    if (level === 'critical' || level === 'poor') {
      return {
        text: 'text-red-400',
        bg: 'bg-red-500/10',
        border: 'border-red-500/20'
      }
    }

    const colors = {
      emerald: { text: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' },
      violet: { text: 'text-violet-400', bg: 'bg-violet-500/10', border: 'border-violet-500/20' },
      amber: { text: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/20' },
      blue: { text: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/20' },
      cyan: { text: 'text-cyan-400', bg: 'bg-cyan-500/10', border: 'border-cyan-500/20' }
    }
    return colors[color] || colors.cyan
  }

  const colorClasses = getColorClasses(color, interpretation?.level)

  return (
    <div
      onClick={onClick}
      className={`
        group relative overflow-hidden cursor-pointer
        bg-slate-900/50 hover:bg-slate-900
        border ${isSelected ? 'border-cyan-500' : 'border-slate-800/50 hover:border-slate-700'}
        rounded-2xl p-5 transition-all duration-200
      `}
    >
      {/* Icon */}
      <div className={`w-10 h-10 rounded-xl ${colorClasses.bg} flex items-center justify-center mb-4`}>
        <Icon className={`w-5 h-5 ${colorClasses.text}`} />
      </div>

      {/* Title */}
      <p className="text-slate-400 text-sm font-medium mb-2">{name}</p>

      {/* Value */}
      <div className="flex items-baseline gap-2 mb-2">
        <span className="text-4xl font-bold text-white">
          {value ?? '—'}
        </span>
      </div>

      {/* Delta & Status */}
      <div className="flex items-center gap-2">
        <DeltaBadge delta={delta} />
        <span className={`text-xs ${colorClasses.text}`}>
          {interpretation?.label}
        </span>
      </div>

      {/* Expand icon */}
      <ChevronRight className="absolute top-5 right-5 w-4 h-4 text-slate-600 group-hover:text-slate-400 transition-colors" />
    </div>
  )
}

/**
 * Delta Badge
 */
function DeltaBadge({ delta }) {
  if (delta === 0 || delta === null || delta === undefined) {
    return (
      <span className="flex items-center gap-1 text-slate-500 text-sm">
        <Minus className="w-3 h-3" />
        <span>0</span>
      </span>
    )
  }

  const isPositive = delta > 0
  const Icon = isPositive ? TrendingUp : TrendingDown

  return (
    <span className={`flex items-center gap-1 text-sm font-medium ${
      isPositive ? 'text-emerald-400' : 'text-red-400'
    }`}>
      <Icon className="w-3.5 h-3.5" />
      <span>{isPositive ? '+' : ''}{delta.toFixed(0)}</span>
    </span>
  )
}

/**
 * Alerts Banner
 */
function AlertsBanner({ alerts }) {
  return (
    <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-4 mb-6">
      <div className="flex items-center gap-3">
        <AlertTriangle className="w-5 h-5 text-amber-400" />
        <div>
          <p className="text-amber-400 font-medium text-sm">
            {alerts.length} hälytystä vaatii huomiota
          </p>
          <p className="text-amber-400/70 text-xs mt-0.5">
            {alerts.slice(0, 3).map(a => a.replace(/_/g, ' ')).join(', ')}
            {alerts.length > 3 && ` +${alerts.length - 3} muuta`}
          </p>
        </div>
      </div>
    </div>
  )
}

/**
 * Index Detail Panel
 */
function IndexDetail({ index, onClose }) {
  if (!index) return null

  const { id, name, description, components } = index
  const Icon = INDEX_ICONS[id] || DollarSign

  // Laske kuinka monta komponenttia on "Ei dataa" -tilassa
  const missingComponents = components
    ? Object.values(components).filter(c => c.available === false || (c.index === null && c.value === 0))
    : []
  const totalComponents = components ? Object.keys(components).length : 0
  const hasMissingData = missingComponents.length > 0

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 mb-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Icon className="w-6 h-6 text-cyan-400" />
          <div>
            <h3 className="text-lg font-semibold text-white">{name}</h3>
            <p className="text-slate-500 text-sm">{description}</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="text-slate-500 hover:text-white text-sm"
        >
          Sulje
        </button>
      </div>

      {/* Data Quality Banner */}
      {hasMissingData && (
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 mb-4">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-amber-400 text-sm font-medium">
                {missingComponents.length}/{totalComponents} komponenttia ilman dataa
              </p>
              <p className="text-amber-400/70 text-xs mt-0.5">
                Indeksi lasketaan vain saatavilla olevien komponenttien perusteella.
                Puuttuvat mittarit eivät vaikuta tulokseen negatiivisesti.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Components Breakdown */}
      {components && Object.keys(components).length > 0 && (
        <div className="space-y-3">
          <p className="text-slate-400 text-sm font-medium mb-3">Komponentit</p>
          {Object.entries(components).map(([key, comp]) => (
            <ComponentBar key={key} name={key} component={comp} />
          ))}
        </div>
      )}

      {/* No components */}
      {(!components || Object.keys(components).length === 0) && (
        <p className="text-slate-500 text-sm">Komponenttitiedot eivät ole vielä saatavilla.</p>
      )}
    </div>
  )
}

/**
 * Component metadata for tooltips and display
 */
const COMPONENT_META = {
  // Core Index components
  gross_profit: {
    label: 'Myyntikate',
    tooltip: 'Myyntikate euroissa. Korkeampi = parempi.',
    valueFormat: (v) => `€${v?.toLocaleString('fi-FI') ?? '—'}`,
    unit: '€'
  },
  aov: {
    label: 'Keskitilaus',
    tooltip: 'Keskimääräinen tilauksen arvo (AOV). Korkeampi = parempi.',
    valueFormat: (v) => `€${v?.toFixed(0) ?? '—'}`,
    unit: '€'
  },
  repeat_rate: {
    label: 'Palautuvuus',
    tooltip: 'Kuinka moni asiakas tilaa uudelleen samalla jaksolla.',
    valueFormat: (v) => `${v?.toFixed(1) ?? '—'}%`,
    unit: '%'
  },
  trend: {
    label: 'Trendi',
    tooltip: 'Myynnin kehityssuunta edelliseen jaksoon verrattuna.',
    valueFormat: (v) => v > 0 ? `+${v?.toFixed(0)}%` : `${v?.toFixed(0) ?? '—'}%`,
    unit: '%'
  },
  stock: {
    label: 'Varastotilanne',
    tooltip: 'Tuotteiden saatavuus. 100 = kaikki tuotteet varastossa, 0 = kaikki loppu.',
    valueFormat: (v) => `${v?.toFixed(0) ?? '—'}% saatavilla`,
    unit: '% saatavilla'
  },
  // SPI components
  clicks_trend: {
    label: 'Klikkauskehitys',
    tooltip: 'Google-hakutulosten klikkausten kehitys.',
    valueFormat: (v) => v > 0 ? `+${v?.toFixed(0)}%` : `${v?.toFixed(0) ?? '—'}%`,
    unit: '%'
  },
  position: {
    label: 'Hakusijoitus',
    tooltip: 'Keskimääräinen sijoitus Google-hauissa. Pienempi = parempi (1 = paras).',
    valueFormat: (v) => `#${v?.toFixed(1) ?? '—'}`,
    unit: '#'
  },
  nonbrand: {
    label: 'Non-brand',
    tooltip: 'Kuinka suuri osa hauista ei sisällä brändinimeä. Optimi 40-70%.',
    valueFormat: (v) => `${v?.toFixed(0) ?? '—'}%`,
    unit: '%'
  },
  rising: {
    label: 'Nousevat haut',
    tooltip: 'Hakutermit joiden näkyvyys on kasvussa.',
    valueFormat: (v) => `${v ?? '—'} kpl`,
    unit: 'kpl'
  },
  // OI components
  fulfillment: {
    label: 'Toimitusaika',
    tooltip: 'Keskimääräinen aika tilauksesta lähetykseen. Nopeampi = parempi. (Vaatii dispatched_on -datan ePages-kaupasta)',
    valueFormat: (v) => v === 0 ? 'Ei dataa' : `${v?.toFixed(1) ?? '—'} päivää`,
    unit: 'pv'
  },
  dispatch_rate: {
    label: 'Lähetetty',
    tooltip: 'Kuinka suuri osa tilauksista on merkitty lähetetyksi. (Vaatii status-datan ePages-kaupasta)',
    valueFormat: (v) => v === 0 ? 'Ei dataa' : `${v?.toFixed(0) ?? '—'}%`,
    unit: '%'
  },
  // PPI components
  margin: {
    label: 'Myyntikate',
    tooltip: 'Keskimääräinen myyntikate-%. Vaatii tuotteiden ostohintojen syöttämisen (cost_price).',
    valueFormat: (v) => `${v?.toFixed(1) ?? '—'}%`,
    unit: '%'
  }
}

/**
 * Component Bar with tooltip
 * Näyttää "Ei dataa" jos komponentilla ei ole saatavilla olevaa dataa
 */
function ComponentBar({ name, component }) {
  if (!component) return null

  const { index, value, weight, available, reason } = component
  const meta = COMPONENT_META[name] || {
    label: name.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
    tooltip: '',
    valueFormat: (v) => v?.toFixed(1) ?? '—',
    unit: ''
  }

  // Jos data ei ole saatavilla, näytä "Ei dataa" -tila
  const isDataMissing = available === false || (index === null && value === 0)

  const displayValue = isDataMissing ? 'Ei dataa' : meta.valueFormat(value)

  // Status text based on index
  const getStatusText = (idx) => {
    if (idx === null || idx === undefined) return 'Ei dataa'
    if (idx >= 80) return 'Erinomainen'
    if (idx >= 60) return 'Hyvä'
    if (idx >= 40) return 'Kohtalainen'
    if (idx >= 20) return 'Heikko'
    return 'Kriittinen'
  }

  return (
    <div className="group relative flex items-center gap-4">
      {/* Label with tooltip trigger */}
      <div
        className={`w-32 text-sm truncate cursor-help ${isDataMissing ? 'text-slate-600' : 'text-slate-400'}`}
        title={meta.tooltip}
      >
        {meta.label}
      </div>

      {/* Progress bar tai "Ei dataa" -tila */}
      {isDataMissing ? (
        <div className="flex-1 flex items-center">
          <div className="flex-1 h-2 bg-slate-800/30 rounded-full" style={{ backgroundImage: 'repeating-linear-gradient(90deg, transparent, transparent 4px, rgba(100,116,139,0.15) 4px, rgba(100,116,139,0.15) 8px)' }} />
          <span className="ml-2 text-slate-600 text-xs whitespace-nowrap">Ei dataa</span>
        </div>
      ) : (
        <div className="flex-1 h-2 bg-slate-800 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-300 ${
              index >= 60 ? 'bg-emerald-500' :
              index >= 40 ? 'bg-amber-500' : 'bg-red-500'
            }`}
            style={{ width: `${index || 0}%` }}
          />
        </div>
      )}

      {/* Index score */}
      <div className={`w-12 text-right text-sm font-medium ${isDataMissing ? 'text-slate-600' : 'text-slate-300'}`}>
        {isDataMissing ? '—' : (index?.toFixed(0) ?? '—')}
      </div>

      {/* Weight */}
      <div className={`w-16 text-right text-xs ${isDataMissing ? 'text-slate-700' : 'text-slate-600'}`}>
        ({(weight * 100).toFixed(0)}%)
      </div>

      {/* Tooltip on hover */}
      <div className="absolute left-0 bottom-full mb-2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
        <div className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 shadow-xl min-w-[200px]">
          <p className="text-white text-sm font-medium mb-1">{meta.label}</p>
          <p className="text-slate-400 text-xs mb-2">{meta.tooltip}</p>
          {isDataMissing && reason && (
            <p className="text-amber-400/80 text-xs mb-2 italic">⚠️ {reason}</p>
          )}
          <div className="flex justify-between items-center pt-1 border-t border-slate-700">
            <span className={`text-sm ${isDataMissing ? 'text-slate-500' : 'text-cyan-400'}`}>{displayValue}</span>
            <span className={`text-xs ${
              isDataMissing ? 'text-slate-600' :
              index >= 60 ? 'text-emerald-400' :
              index >= 40 ? 'text-amber-400' : 'text-red-400'
            }`}>
              {getStatusText(index)}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * Products Card
 */
function ProductsCard({ title, subtitle, products, type }) {
  if (!products || products.length === 0) {
    return (
      <div className="bg-slate-900/50 border border-slate-800/50 rounded-2xl p-6">
        <h3 className="text-lg font-semibold text-white mb-1">{title}</h3>
        <p className="text-slate-500 text-sm mb-4">{subtitle}</p>
        <p className="text-slate-600 text-sm">Ei dataa vielä saatavilla.</p>
      </div>
    )
  }

  return (
    <div className="bg-slate-900/50 border border-slate-800/50 rounded-2xl p-6">
      <h3 className="text-lg font-semibold text-white mb-1">{title}</h3>
      <p className="text-slate-500 text-sm mb-4">{subtitle}</p>

      <div className="space-y-3">
        {products.slice(0, 5).map((product, i) => (
          <div key={product.product_id || i} className="flex items-center gap-3">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold ${
              type === 'drivers' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'
            }`}>
              {i + 1}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white text-sm truncate">
                {product.products?.name || product.product_name || 'N/A'}
              </p>
              <p className="text-slate-500 text-xs">
                {product.products?.product_number || product.sku || ''}
              </p>
            </div>
            <div className="text-right">
              {type === 'drivers' ? (
                <p className="text-emerald-400 text-sm font-medium">
                  {product.total_score?.toFixed(0) ?? '—'} pts
                </p>
              ) : (
                <p className="text-red-400 text-sm font-medium">
                  {product.stock_days?.toFixed(0) ?? '—'} pv
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * No Data State
 */
function NoDataState({ onCalculate }) {
  const [isCalculating, setIsCalculating] = useState(false)

  const handleCalculate = async () => {
    setIsCalculating(true)
    try {
      await onCalculate()
    } catch (error) {
      console.error('Calculation failed:', error)
    } finally {
      setIsCalculating(false)
    }
  }

  return (
    <div className="text-center py-20">
      <div className="w-24 h-24 rounded-full bg-slate-900 mx-auto mb-6 flex items-center justify-center">
        <span className="text-4xl">📊</span>
      </div>
      <h2 className="text-xl font-semibold text-white mb-2">
        KPI-indeksit eivät ole vielä valmiita
      </h2>
      <p className="text-slate-500 mb-6 max-w-md mx-auto">
        Laske ensimmäiset indeksit käynnistämällä KPI-laskenta.
        Tämä voi kestää muutaman sekunnin.
      </p>
      <button
        onClick={handleCalculate}
        disabled={isCalculating}
        className={`px-6 py-3 rounded-xl font-medium transition-colors ${
          isCalculating
            ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
            : 'bg-cyan-600 text-white hover:bg-cyan-700'
        }`}
      >
        {isCalculating ? (
          <span className="flex items-center gap-2">
            <RefreshCw className="w-4 h-4 animate-spin" />
            Lasketaan...
          </span>
        ) : (
          'Laske KPI-indeksit'
        )}
      </button>
    </div>
  )
}

export default IndicatorsPage

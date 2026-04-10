import { usePasteInventory } from '@/hooks/usePasteInventory'
import { useTranslation } from '@/lib/i18n'
import { MetricCard, MetricCardGroup } from '@/components/MetricCard'
import { Button } from '@/components/ui/button'
import {
  Palette,
  RefreshCw,
  Loader2,
  AlertTriangle,
  Upload,
  TrendingUp,
  Archive,
  BarChart3,
  Package,
  Search,
  Download,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useCurrentShop } from '@/config/storeConfig'
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip,
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  BarChart, Bar,
} from 'recharts'
import { useState, useRef } from 'react'
import { exportToCSV } from '@/lib/csvExport'

// Format currency
function formatCurrency(value, currency) {
  return new Intl.NumberFormat('fi-FI', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value)
}

function formatNumber(value) {
  return new Intl.NumberFormat('fi-FI').format(value)
}

const COLORS = {
  A: '#00b4e9',
  B: '#2dd4bf',
  C: '#64748b',
  categories: ['#00b4e9', '#2dd4bf', '#fded12', '#d82c32', '#8b5cf6', '#f472b6', '#06b6d4', '#84cc16'],
}

const PASTE_COLUMNS = {
  all: [
    { key: 'external_id', label: 'ID' },
    { key: 'name', label: 'Nimi' },
    { key: 'category_prefix', label: 'Kategoria' },
    { key: 'stock_level', label: 'Saldo' },
    { key: 'list_price', label: 'Hinta (alv0)' },
    { key: 'stockValue', label: 'Varastoarvo' },
    { key: 'consumedQty90d', label: 'Kulutus 90pv' },
    { key: 'dailyConsumption', label: 'Pv-kulutus' },
    { key: 'daysUntilStockout', label: 'Riittopäivät' },
    { key: 'turnoverRate', label: 'Kiertonopeus' },
    { key: 'abcClass', label: 'ABC' },
  ],
}

export function PasteInventoryPage() {
  const { t } = useTranslation()
  const { currency } = useCurrentShop()
  const fmtCurrency = (value) => formatCurrency(value, currency)

  const {
    summary, products, categories, alerts, topConsumers, deadStock,
    abcAnalysis, valueHistory, monthlyOrders,
    lastSyncedAt, loading, error, syncing, importing,
    refresh, syncFromCSV, importOrders,
  } = usePasteInventory()

  const [searchTerm, setSearchTerm] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [sortBy, setSortBy] = useState('name')
  const [sortDesc, setSortDesc] = useState(false)
  const [importResult, setImportResult] = useState(null)
  const fileInputRef = useRef(null)

  // Handle XML file upload
  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    try {
      const text = await file.text()
      const result = await importOrders(text)
      setImportResult(result)
      // Clear after 8 seconds
      setTimeout(() => setImportResult(null), 8000)
    } catch (err) {
      // error is set in hook
    }
    // Reset file input
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background-dark flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto mb-4" />
          <p className="text-foreground-muted">{t('common.loading')}</p>
        </div>
      </div>
    )
  }

  // Filtered and sorted products
  const filteredProducts = products
    .filter(p => {
      if (searchTerm && !p.name.toLowerCase().includes(searchTerm.toLowerCase()) &&
          !p.external_id.toLowerCase().includes(searchTerm.toLowerCase())) return false
      if (categoryFilter && p.category_prefix !== categoryFilter) return false
      return true
    })
    .sort((a, b) => {
      const aVal = a[sortBy] ?? ''
      const bVal = b[sortBy] ?? ''
      const cmp = typeof aVal === 'number' ? aVal - bVal : String(aVal).localeCompare(String(bVal))
      return sortDesc ? -cmp : cmp
    })

  // Unique categories for filter
  const uniqueCategories = [...new Set(products.map(p => p.category_prefix).filter(Boolean))].sort()

  // ABC pie data
  const abcPieData = [
    { name: 'A', value: abcAnalysis.A.stockValue, count: abcAnalysis.A.count },
    { name: 'B', value: abcAnalysis.B.stockValue, count: abcAnalysis.B.count },
    { name: 'C', value: abcAnalysis.C.stockValue, count: abcAnalysis.C.count },
  ].filter(d => d.value > 0)

  // Category consumption pie data
  const categoryPieData = categories.slice(0, 8).map((cat, i) => ({
    name: cat.name,
    value: cat.consumption,
    color: COLORS.categories[i % COLORS.categories.length],
  }))

  const handleSort = (col) => {
    if (sortBy === col) {
      setSortDesc(!sortDesc)
    } else {
      setSortBy(col)
      setSortDesc(col !== 'name')
    }
  }

  return (
    <div className="min-h-screen bg-background-dark">
      <main className="container mx-auto px-4 py-6 max-w-7xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Palette className="w-6 h-6 text-primary" />
            <div>
              <h1 className="text-xl font-bold text-foreground">Sävytysvarasto</h1>
              <p className="text-sm text-foreground-muted">
                Sävytyspastojen varasto ja kulutusseuranta
                {lastSyncedAt && (
                  <span className="ml-2 text-xs">
                    — Päivitetty {new Date(lastSyncedAt).toLocaleDateString('fi-FI')}
                  </span>
                )}
              </p>
            </div>
          </div>

          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={syncFromCSV}
              disabled={syncing}
              className="gap-2"
            >
              <RefreshCw className={cn('w-4 h-4', syncing && 'animate-spin')} />
              Päivitä saldot
            </Button>

            <label>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xml"
                className="hidden"
                onChange={handleFileUpload}
                disabled={importing}
              />
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                disabled={importing}
                onClick={() => fileInputRef.current?.click()}
                asChild={false}
              >
                <Upload className={cn('w-4 h-4', importing && 'animate-spin')} />
                Tuo tilaukset
              </Button>
            </label>
          </div>
        </div>

        {/* Import result message */}
        {importResult && (
          <div className="mb-4 p-3 bg-success/10 border border-success/30 rounded-xl text-sm text-success">
            Tuotu {importResult.orders_found} tilausta, {importResult.inserted} riviä.
            {importResult.duplicates_skipped > 0 && ` ${importResult.duplicates_skipped} duplikaattia ohitettu.`}
          </div>
        )}

        {error && (
          <div className="mb-6 p-4 bg-destructive/10 border border-destructive/30 rounded-xl">
            <p className="text-destructive text-sm">{error}</p>
          </div>
        )}

        {/* KPI Cards */}
        <MetricCardGroup className="mb-8">
          <MetricCard
            label="Varastoarvo"
            value={summary.totalValue}
            suffix="€"
            subValue="Hankintahinnoin (alv 0%)"
          />
          <MetricCard
            label="Tuotteita varastossa"
            value={summary.inStock}
            subValue={`${summary.totalProducts} tuotetta yhteensä`}
          />
          <MetricCard
            label="Kriittiset"
            value={summary.lowStockCount}
            subValue="Riitto ≤ 14 päivää"
            className={summary.lowStockCount > 0 ? 'border-warning/30' : ''}
          />
          <MetricCard
            label="Keskim. riitto"
            value={summary.avgDaysLeft}
            suffix="pv"
            subValue="Kuluttavien tuotteiden keskiarvo"
          />
        </MetricCardGroup>

        {/* Alerts */}
        {alerts.length > 0 && (
          <div className="mb-8 bg-card rounded-xl border border-card-border p-5">
            <div className="flex items-center gap-2 mb-4">
              <AlertTriangle className="w-5 h-5 text-warning" />
              <h2 className="text-base font-semibold text-foreground">Hälytykset</h2>
              <span className="text-xs text-foreground-muted">— Riitto ≤ 14 päivää</span>
            </div>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {alerts.map(p => (
                <div
                  key={p.external_id}
                  className={cn(
                    'flex items-center justify-between px-3 py-2 rounded-lg border',
                    p.daysUntilStockout <= 7
                      ? 'bg-destructive/10 border-destructive/30'
                      : 'bg-warning/10 border-warning/30'
                  )}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{p.name}</p>
                    <p className="text-xs text-foreground-muted">{p.category_prefix}</p>
                  </div>
                  <div className="flex items-center gap-4 text-sm">
                    <span className="text-foreground-muted">Saldo: <span className="font-medium text-foreground">{p.stock_level}</span></span>
                    <span className="text-foreground-muted">Kulutus/pv: <span className="font-medium text-foreground">{p.dailyConsumption}</span></span>
                    <span className={cn(
                      'font-bold',
                      p.daysUntilStockout <= 7 ? 'text-destructive' : 'text-warning'
                    )}>
                      {p.daysUntilStockout} pv
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Charts row: Category consumption + ABC Analysis */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          {/* Category consumption */}
          <div className="bg-card rounded-xl border border-card-border p-5">
            <div className="flex items-center gap-2 mb-4">
              <BarChart3 className="w-5 h-5 text-primary" />
              <h2 className="text-base font-semibold text-foreground">Kulutus kategorioittain</h2>
            </div>
            {categoryPieData.length > 0 ? (
              <div className="flex items-center gap-4">
                <ResponsiveContainer width="50%" height={200}>
                  <PieChart>
                    <Pie
                      data={categoryPieData}
                      cx="50%" cy="50%"
                      innerRadius={40} outerRadius={80}
                      dataKey="value"
                    >
                      {categoryPieData.map((entry, i) => (
                        <Cell key={i} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value) => `${formatNumber(value)} kpl`} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex-1 space-y-1.5">
                  {categoryPieData.map((cat, i) => (
                    <div key={cat.name} className="flex items-center gap-2 text-xs">
                      <div className="w-3 h-3 rounded-sm flex-shrink-0" style={{ backgroundColor: cat.color }} />
                      <span className="text-foreground truncate">{cat.name}</span>
                      <span className="ml-auto text-foreground-muted">{formatNumber(cat.value)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-sm text-foreground-muted">Ei kulutustietoa vielä</p>
            )}
          </div>

          {/* ABC Analysis */}
          <div className="bg-card rounded-xl border border-card-border p-5">
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp className="w-5 h-5 text-primary" />
              <h2 className="text-base font-semibold text-foreground">ABC-analyysi</h2>
              <span className="text-xs text-foreground-muted">— Kulutusarvon mukaan</span>
            </div>
            {abcPieData.length > 0 ? (
              <div className="flex items-center gap-4">
                <ResponsiveContainer width="50%" height={200}>
                  <PieChart>
                    <Pie
                      data={abcPieData}
                      cx="50%" cy="50%"
                      innerRadius={40} outerRadius={80}
                      dataKey="value"
                    >
                      {abcPieData.map((entry) => (
                        <Cell key={entry.name} fill={COLORS[entry.name]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value) => fmtCurrency(value)} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex-1 space-y-2">
                  {['A', 'B', 'C'].map(cls => (
                    <div key={cls} className="flex items-center gap-2 text-sm">
                      <div className="w-3 h-3 rounded-sm flex-shrink-0" style={{ backgroundColor: COLORS[cls] }} />
                      <span className="font-medium text-foreground">{cls}</span>
                      <span className="text-foreground-muted">
                        {abcAnalysis[cls].count} tuotetta
                      </span>
                      <span className="ml-auto text-foreground-muted">
                        {fmtCurrency(abcAnalysis[cls].stockValue)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-sm text-foreground-muted">Ei tarpeeksi dataa</p>
            )}
          </div>
        </div>

        {/* Monthly orders chart */}
        {monthlyOrders.length > 0 && (
          <div className="mb-8 bg-card rounded-xl border border-card-border p-5">
            <div className="flex items-center gap-2 mb-4">
              <BarChart3 className="w-5 h-5 text-primary" />
              <h2 className="text-base font-semibold text-foreground">Kuukausittainen menekki</h2>
            </div>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={monthlyOrders}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis
                  dataKey="month"
                  tick={{ fill: '#94a3b8', fontSize: 12 }}
                  tickFormatter={(v) => {
                    const [y, m] = v.split('-')
                    return `${m}/${y.slice(2)}`
                  }}
                />
                <YAxis tick={{ fill: '#94a3b8', fontSize: 12 }} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }}
                  labelStyle={{ color: '#f1f5f9' }}
                  formatter={(value, name) => [
                    name === 'quantity' ? `${formatNumber(value)} kpl` : fmtCurrency(value),
                    name === 'quantity' ? 'Määrä' : 'Arvo',
                  ]}
                  labelFormatter={(v) => {
                    const [y, m] = v.split('-')
                    const months = ['', 'Tammi', 'Helmi', 'Maalis', 'Huhti', 'Touko', 'Kesä', 'Heinä', 'Elo', 'Syys', 'Loka', 'Marras', 'Joulu']
                    return `${months[parseInt(m)]} ${y}`
                  }}
                />
                <Bar dataKey="quantity" fill="#00b4e9" radius={[4, 4, 0, 0]} name="quantity" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Value history chart */}
        {valueHistory.length > 1 && (
          <div className="mb-8 bg-card rounded-xl border border-card-border p-5">
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp className="w-5 h-5 text-primary" />
              <h2 className="text-base font-semibold text-foreground">Varastoarvon kehitys</h2>
            </div>
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={valueHistory}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis
                  dataKey="date"
                  tick={{ fill: '#94a3b8', fontSize: 12 }}
                  tickFormatter={(v) => new Date(v).toLocaleDateString('fi-FI', { day: 'numeric', month: 'numeric' })}
                />
                <YAxis tick={{ fill: '#94a3b8', fontSize: 12 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }}
                  labelStyle={{ color: '#f1f5f9' }}
                  formatter={(value) => [fmtCurrency(value), 'Varastoarvo']}
                  labelFormatter={(v) => new Date(v).toLocaleDateString('fi-FI')}
                />
                <Line type="monotone" dataKey="totalValue" stroke="#00b4e9" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Top consumers + Dead stock */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          {/* Top consumers */}
          <div className="bg-card rounded-xl border border-card-border p-5">
            <div className="flex items-center gap-2 mb-4">
              <Package className="w-5 h-5 text-primary" />
              <h2 className="text-base font-semibold text-foreground">Top kuluttajat</h2>
              <span className="text-xs text-foreground-muted">— 90 päivää</span>
            </div>
            {topConsumers.length > 0 ? (
              <div className="space-y-2 max-h-72 overflow-y-auto">
                {topConsumers.map(p => (
                  <div key={p.external_id} className="flex items-center justify-between px-3 py-2 rounded-lg bg-background-subtle">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground truncate">{p.name}</p>
                      <p className="text-xs text-foreground-muted">{p.category_prefix}</p>
                    </div>
                    <div className="flex items-center gap-3 text-sm">
                      <span className="text-primary font-medium">{p.consumedQty90d} kpl</span>
                      <span className="text-foreground-muted">Saldo: {p.stock_level}</span>
                      {p.daysUntilStockout <= 14 && (
                        <span className="text-destructive font-medium">{p.daysUntilStockout}pv</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-foreground-muted">Ei kulutustietoa vielä. Tuo tilausdata XML-tiedostosta.</p>
            )}
          </div>

          {/* Dead stock */}
          <div className="bg-card rounded-xl border border-card-border p-5">
            <div className="flex items-center gap-2 mb-4">
              <Archive className="w-5 h-5 text-foreground-muted" />
              <h2 className="text-base font-semibold text-foreground">Kuollut varasto</h2>
              <span className="text-xs text-foreground-muted">— Ei menekkiä 90pv</span>
            </div>
            {deadStock.length > 0 ? (
              <>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {deadStock.map(p => (
                    <div key={p.external_id} className="flex items-center justify-between px-3 py-2 rounded-lg bg-background-subtle">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-foreground truncate">{p.name}</p>
                        <p className="text-xs text-foreground-muted">{p.category_prefix}</p>
                      </div>
                      <div className="flex items-center gap-3 text-sm">
                        <span className="text-foreground-muted">Saldo: {p.stock_level}</span>
                        <span className="text-foreground-muted">{fmtCurrency(p.stockValue)}</span>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-4 pt-3 border-t border-card-border text-sm text-foreground-muted">
                  Sidottu pääoma: <span className="font-medium text-foreground">{fmtCurrency(deadStock.reduce((s, p) => s + p.stockValue, 0))}</span>
                </div>
              </>
            ) : (
              <p className="text-sm text-foreground-muted">Ei kuollutta varastoa</p>
            )}
          </div>
        </div>

        {/* All products table */}
        <div className="bg-card rounded-xl border border-card-border p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Package className="w-5 h-5 text-primary" />
              <h2 className="text-base font-semibold text-foreground">Kaikki tuotteet</h2>
              <span className="text-xs text-foreground-muted">({filteredProducts.length})</span>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={() => exportToCSV(filteredProducts, PASTE_COLUMNS.all, 'savytysvarasto')}
            >
              <Download className="w-4 h-4" />
              CSV
            </Button>
          </div>

          {/* Filters */}
          <div className="flex gap-3 mb-4">
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground-muted" />
              <input
                type="text"
                placeholder="Hae nimellä tai ID:llä..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-sm bg-background-subtle border border-card-border rounded-lg text-foreground placeholder:text-foreground-muted focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="px-3 py-2 text-sm bg-background-subtle border border-card-border rounded-lg text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="">Kaikki kategoriat</option>
              {uniqueCategories.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>

          {/* Table */}
          <div className="overflow-x-auto max-h-96 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-card">
                <tr className="text-left text-foreground-muted border-b border-card-border">
                  {[
                    { key: 'name', label: 'Nimi' },
                    { key: 'category_prefix', label: 'Kategoria' },
                    { key: 'stock_level', label: 'Saldo' },
                    { key: 'list_price', label: 'Hinta' },
                    { key: 'stockValue', label: 'Arvo' },
                    { key: 'consumedQty90d', label: 'Kulutus 90pv' },
                    { key: 'daysUntilStockout', label: 'Riitto' },
                    { key: 'turnoverRate', label: 'Kierto' },
                  ].map(col => (
                    <th
                      key={col.key}
                      className="pb-2 pr-3 cursor-pointer hover:text-foreground transition-colors"
                      onClick={() => handleSort(col.key)}
                    >
                      {col.label}
                      {sortBy === col.key && (sortDesc ? ' ↓' : ' ↑')}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredProducts.slice(0, 100).map(p => (
                  <tr key={p.external_id} className="border-b border-card-border/50 hover:bg-background-subtle transition-colors">
                    <td className="py-2 pr-3 font-medium text-foreground">{p.name}</td>
                    <td className="py-2 pr-3 text-foreground-muted">{p.category_prefix}</td>
                    <td className={cn('py-2 pr-3', p.stock_level <= 0 ? 'text-destructive font-medium' : 'text-foreground')}>
                      {p.stock_level}
                    </td>
                    <td className="py-2 pr-3 text-foreground-muted">
                      {p.list_price ? `${p.list_price.toFixed(2)} €` : '—'}
                    </td>
                    <td className="py-2 pr-3 text-foreground">{fmtCurrency(p.stockValue)}</td>
                    <td className="py-2 pr-3 text-foreground">{p.consumedQty90d || '—'}</td>
                    <td className={cn('py-2 pr-3 font-medium',
                      p.daysUntilStockout <= 7 ? 'text-destructive' :
                      p.daysUntilStockout <= 14 ? 'text-warning' :
                      p.daysUntilStockout >= 999 ? 'text-foreground-muted' : 'text-foreground'
                    )}>
                      {p.daysUntilStockout >= 999 ? '—' : `${p.daysUntilStockout} pv`}
                    </td>
                    <td className="py-2 pr-3 text-foreground-muted">{p.turnoverRate > 0 ? p.turnoverRate : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filteredProducts.length > 100 && (
              <p className="text-xs text-foreground-muted mt-2 text-center">
                Näytetään 100/{filteredProducts.length} tuotetta. Käytä hakua rajaamiseen.
              </p>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}

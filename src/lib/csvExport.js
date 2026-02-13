/**
 * CSV Export Utility
 *
 * Converts data arrays to CSV and triggers download
 */

/**
 * Convert array of objects to CSV string
 * @param {Array} data - Array of objects to convert
 * @param {Array} columns - Column definitions: [{ key: 'fieldName', label: 'Column Header' }]
 * @returns {string} CSV formatted string
 */
export function arrayToCSV(data, columns) {
  if (!data || data.length === 0) return ''

  // Header row
  const headers = columns.map(col => `"${col.label}"`)

  // Data rows
  const rows = data.map(row => {
    return columns.map(col => {
      let value = row[col.key]

      // Handle null/undefined
      if (value === null || value === undefined) {
        value = ''
      }

      // Format numbers
      if (typeof value === 'number') {
        // Round to 2 decimals for floats
        if (!Number.isInteger(value)) {
          value = Math.round(value * 100) / 100
        }
      }

      // Escape quotes and wrap in quotes
      const stringValue = String(value).replace(/"/g, '""')
      return `"${stringValue}"`
    }).join(';') // Use semicolon for European Excel compatibility
  })

  return [headers.join(';'), ...rows].join('\n')
}

/**
 * Trigger CSV file download
 * @param {string} csvContent - CSV string content
 * @param {string} filename - Name for the downloaded file
 */
export function downloadCSV(csvContent, filename) {
  // Add BOM for Excel UTF-8 compatibility
  const BOM = '\uFEFF'
  const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' })

  const link = document.createElement('a')
  const url = URL.createObjectURL(blob)

  link.setAttribute('href', url)
  link.setAttribute('download', filename)
  link.style.visibility = 'hidden'

  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)

  URL.revokeObjectURL(url)
}

/**
 * Export data to CSV file
 * @param {Array} data - Array of objects to export
 * @param {Array} columns - Column definitions
 * @param {string} filename - Filename (without .csv extension)
 */
export function exportToCSV(data, columns, filename) {
  const csv = arrayToCSV(data, columns)
  const date = new Date().toISOString().split('T')[0]
  downloadCSV(csv, `${filename}_${date}.csv`)
}

// Pre-defined column configurations for inventory data
export const INVENTORY_COLUMNS = {
  reorderAlerts: [
    { key: 'product_number', label: 'Tuotenumero' },
    { key: 'name', label: 'Tuotenimi' },
    { key: 'stock_level', label: 'Saldo' },
    { key: 'min_stock_level', label: 'Min. saldo' },
    { key: 'salesLast30Days', label: 'Myynti 30pv' },
    { key: 'dailyVelocity', label: 'Päivänopeus' },
    { key: 'daysUntilStockout', label: 'Päiviä jäljellä' },
    { key: 'cost_price', label: 'Ostohinta' },
    { key: 'price_amount', label: 'Myyntihinta' },
    { key: 'stockValue', label: 'Varastoarvo' }
  ],

  topSellersAtRisk: [
    { key: 'product_number', label: 'Tuotenumero' },
    { key: 'name', label: 'Tuotenimi' },
    { key: 'stock_level', label: 'Saldo' },
    { key: 'salesLast30Days', label: 'Myynti 30pv' },
    { key: 'dailyVelocity', label: 'Päivänopeus' },
    { key: 'daysUntilStockout', label: 'Päiviä jäljellä' },
    { key: 'revenue30d', label: 'Liikevaihto 30pv' }
  ],

  slowMovers: [
    { key: 'product_number', label: 'Tuotenumero' },
    { key: 'name', label: 'Tuotenimi' },
    { key: 'stock_level', label: 'Saldo' },
    { key: 'salesLast30Days', label: 'Myynti 30pv' },
    { key: 'stockValue', label: 'Varastoarvo' },
    { key: 'cost_price', label: 'Ostohinta' },
    { key: 'price_amount', label: 'Myyntihinta' },
    { key: 'turnoverRate', label: 'Kiertonopeus' }
  ],

  stockoutHistory: [
    { key: 'product_number', label: 'Tuotenumero' },
    { key: 'name', label: 'Tuotenimi' },
    { key: 'salesLast30Days', label: 'Myynti 30pv' },
    { key: 'dailyVelocity', label: 'Päivänopeus' },
    { key: 'estimatedLostSales', label: 'Arvioitu menetys' },
    { key: 'price_amount', label: 'Myyntihinta' }
  ],

  orderRecommendations: [
    { key: 'product_number', label: 'Tuotenumero' },
    { key: 'name', label: 'Tuotenimi' },
    { key: 'stock_level', label: 'Nykyinen saldo' },
    { key: 'optimalStock', label: 'Optimi saldo' },
    { key: 'orderQty', label: 'Tilausmäärä' },
    { key: 'orderValue', label: 'Tilausarvo' },
    { key: 'daysUntilStockout', label: 'Päiviä jäljellä' },
    { key: 'urgency', label: 'Kiireellisyys' },
    { key: 'cost_price', label: 'Ostohinta' }
  ],

  allProducts: [
    { key: 'product_number', label: 'Tuotenumero' },
    { key: 'name', label: 'Tuotenimi' },
    { key: 'stock_level', label: 'Saldo' },
    { key: 'min_stock_level', label: 'Min. saldo' },
    { key: 'cost_price', label: 'Ostohinta' },
    { key: 'price_amount', label: 'Myyntihinta' },
    { key: 'stockValue', label: 'Varastoarvo' },
    { key: 'salesLast30Days', label: 'Myynti 30pv' },
    { key: 'dailyVelocity', label: 'Päivänopeus' },
    { key: 'daysUntilStockout', label: 'Päiviä jäljellä' },
    { key: 'turnoverRate', label: 'Kiertonopeus' },
    { key: 'abcClass', label: 'ABC-luokka' },
    { key: 'category', label: 'Kategoria' }
  ]
}

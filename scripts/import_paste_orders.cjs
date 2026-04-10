/**
 * Import paste orders from XML files
 *
 * Reads ePages order export XML files from docs/ folder and imports into paste_orders table.
 * Handles all 4 XML files covering March 2025 - April 2026.
 *
 * Usage:
 *   node scripts/import_paste_orders.cjs
 */

const { supabase, printProjectInfo } = require('./db.cjs')
const fs = require('fs')
const path = require('path')

// Automaalit.net shop_id (from shops table)
const AUTOMAALIT_SHOP_ID = '9355ace7-3548-4023-91c8-5e9c14003c31'

// XML files to import (oldest first)
const XML_FILES = [
  'Tilaukset(3).xml',         // 3/2025 – 6/2025
  'Tilaukset(2).xml',         // 6/2025 – 9/2025
  'Tilaukset(1) copy.xml',    // 9/2025 – 12/2025
  'Tilaukset(1).xml',         // 1/2026 – 4/2026
]

/**
 * Extract text content from an XML tag
 */
function extractTag(xml, tagName) {
  const match = xml.match(new RegExp(`<${tagName}>([^<]*)</${tagName}>`))
  return match ? match[1].trim() : null
}

/**
 * Parse ePages order export XML
 */
function parseOrdersXML(xmlText) {
  const lineItems = []
  const orderMatches = xmlText.match(/<Order>[\s\S]*?<\/Order>/g) || []

  for (const orderXml of orderMatches) {
    const orderNumber = extractTag(orderXml, 'OrderNumber')
    const creationDate = extractTag(orderXml, 'CreationDate')

    if (!orderNumber || !creationDate) continue

    // Match <LineItem> but not <LineItemShipping> or <LineItemPayment>
    const liMatches = orderXml.match(/<LineItem>[\s\S]*?<\/LineItem>/g) || []

    for (const liXml of liMatches) {
      const externalId = extractTag(liXml, 'Id')
      const name = extractTag(liXml, 'Name')
      const quantity = parseInt(extractTag(liXml, 'Quantity')) || 1
      const unitPrice = parseFloat(extractTag(liXml, 'UnitPrice')) || 0
      const totalPrice = parseFloat(extractTag(liXml, 'TotalPrice')) || 0

      if (!externalId) continue

      lineItems.push({
        shop_id: AUTOMAALIT_SHOP_ID,
        order_number: orderNumber,
        order_date: creationDate,
        external_id: externalId,
        product_name: name || externalId,
        quantity,
        unit_price: unitPrice,
        total_price: totalPrice,
      })
    }
  }

  return { lineItems, orderCount: orderMatches.length }
}

async function main() {
  printProjectInfo()
  console.log('📦 Importing paste orders from XML files...\n')

  let totalOrders = 0
  let totalLineItems = 0
  let totalInserted = 0
  let totalErrors = 0

  for (const filename of XML_FILES) {
    const filePath = path.join(__dirname, '..', 'docs', filename)

    if (!fs.existsSync(filePath)) {
      console.log(`⚠️  File not found: ${filename}, skipping`)
      continue
    }

    console.log(`📄 Processing: ${filename}`)
    const xmlText = fs.readFileSync(filePath, 'utf-8')
    const { lineItems, orderCount } = parseOrdersXML(xmlText)

    console.log(`   Orders: ${orderCount}, Line items: ${lineItems.length}`)
    totalOrders += orderCount
    totalLineItems += lineItems.length

    if (lineItems.length === 0) continue

    // Upsert in batches
    const batchSize = 200
    for (let i = 0; i < lineItems.length; i += batchSize) {
      const batch = lineItems.slice(i, i + batchSize)
      const { data, error } = await supabase
        .from('paste_orders')
        .upsert(batch, {
          onConflict: 'shop_id,order_number,external_id',
          ignoreDuplicates: true,
        })
        .select('id')

      if (error) {
        console.error(`   ❌ Batch error at ${i}: ${error.message}`)
        totalErrors++
      } else {
        totalInserted += data?.length || 0
      }
    }

    // Show date range
    const dates = lineItems.map(li => li.order_date).sort()
    console.log(`   Date range: ${dates[0]?.split('T')[0]} → ${dates[dates.length - 1]?.split('T')[0]}`)
    console.log(`   ✅ Done\n`)
  }

  console.log('═══════════════════════════════════')
  console.log(`📊 Import Summary:`)
  console.log(`   Files processed: ${XML_FILES.length}`)
  console.log(`   Total orders:    ${totalOrders}`)
  console.log(`   Total line items: ${totalLineItems}`)
  console.log(`   Inserted:        ${totalInserted}`)
  console.log(`   Duplicates:      ${totalLineItems - totalInserted}`)
  console.log(`   Errors:          ${totalErrors}`)
  console.log('═══════════════════════════════════')
}

main().catch(err => {
  console.error('❌ Fatal error:', err.message)
  process.exit(1)
})

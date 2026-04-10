/**
 * Paste Orders XML Import
 *
 * Receives XML order data from frontend upload, parses it, and stores in paste_orders.
 * Called from PasteInventoryPage when user uploads an XML export file.
 *
 * XML format: ePages order export with <Order> elements containing <LineItem> elements.
 * Each LineItem has: Id, Name, Quantity, UnitPrice, TotalPrice
 * Each Order has: OrderNumber, CreationDate
 *
 * Duplicate protection via UNIQUE(shop_id, order_number, external_id)
 */

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

const AUTOMAALIT_SHOP_ID = '9355ace7-3548-4023-91c8-5e9c14003c31'

export const config = {
  maxDuration: 60,
}

/**
 * Simple XML parser for ePages order export
 * No external dependencies - uses regex-based extraction
 */
function parseOrdersXML(xmlText) {
  const orders = []
  // Match each <Order>...</Order> block
  const orderMatches = xmlText.match(/<Order>[\s\S]*?<\/Order>/g) || []

  for (const orderXml of orderMatches) {
    const orderNumber = extractTag(orderXml, 'OrderNumber')
    const creationDate = extractTag(orderXml, 'CreationDate')

    if (!orderNumber || !creationDate) continue

    // Match each <LineItem>...</LineItem> (but not LineItemShipping or LineItemPayment)
    const lineItemMatches = orderXml.match(/<LineItem>[\s\S]*?<\/LineItem>/g) || []

    for (const liXml of lineItemMatches) {
      const externalId = extractTag(liXml, 'Id')
      const name = extractTag(liXml, 'Name')
      const quantity = parseInt(extractTag(liXml, 'Quantity')) || 1
      const unitPrice = parseFloat(extractTag(liXml, 'UnitPrice')) || 0
      const totalPrice = parseFloat(extractTag(liXml, 'TotalPrice')) || 0

      if (!externalId) continue

      orders.push({
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

  return orders
}

function extractTag(xml, tagName) {
  const match = xml.match(new RegExp(`<${tagName}>([^<]*)</${tagName}>`))
  return match ? match[1].trim() : null
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // Auth: require valid Supabase JWT
  const authHeader = req.headers.authorization
  const token = authHeader?.replace('Bearer ', '')

  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  if (token) {
    const { data: { user }, error } = await supabase.auth.getUser(token)
    if (error || !user) {
      return res.status(401).json({ error: 'Unauthorized' })
    }
    // Verify user has access to Automaalit shop
    const { data: membership } = await supabase
      .from('shop_members')
      .select('role')
      .eq('shop_id', AUTOMAALIT_SHOP_ID)
      .eq('user_id', user.id)
      .single()

    if (!membership) {
      return res.status(403).json({ error: 'No access to this shop' })
    }
  } else {
    // Also accept CRON_SECRET for script usage
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return res.status(401).json({ error: 'Unauthorized' })
    }
  }

  console.log('📦 Starting paste orders XML import:', new Date().toISOString())

  const results = {
    started_at: new Date().toISOString(),
    orders_found: 0,
    line_items_found: 0,
    inserted: 0,
    duplicates_skipped: 0,
    errors: [],
  }

  try {
    const xmlText = typeof req.body === 'string' ? req.body : req.body?.xml
    if (!xmlText) {
      return res.status(400).json({ error: 'No XML data provided. Send XML in request body or as "xml" field.' })
    }

    // Parse XML
    const lineItems = parseOrdersXML(xmlText)
    const uniqueOrders = new Set(lineItems.map(li => li.order_number))
    results.orders_found = uniqueOrders.size
    results.line_items_found = lineItems.length

    console.log(`📊 Parsed ${uniqueOrders.size} orders, ${lineItems.length} line items`)

    if (lineItems.length === 0) {
      return res.status(200).json({ ...results, message: 'No line items found in XML' })
    }

    // Upsert in batches
    const records = lineItems.map(li => ({
      shop_id: AUTOMAALIT_SHOP_ID,
      ...li,
    }))

    const batchSize = 200
    for (let i = 0; i < records.length; i += batchSize) {
      const batch = records.slice(i, i + batchSize)
      const { data, error } = await supabase
        .from('paste_orders')
        .upsert(batch, {
          onConflict: 'shop_id,order_number,external_id',
          ignoreDuplicates: true,
        })
        .select('id')

      if (error) {
        console.error(`Upsert error at batch ${i}:`, error.message)
        results.errors.push(`Batch ${i}: ${error.message}`)
      } else {
        results.inserted += data?.length || batch.length
      }
    }

    results.duplicates_skipped = results.line_items_found - results.inserted
    results.completed_at = new Date().toISOString()

    console.log(`✅ Import complete: ${results.inserted} inserted, ${results.duplicates_skipped} duplicates skipped`)

    return res.status(200).json(results)

  } catch (error) {
    console.error('❌ Paste orders import failed:', error.message)
    results.errors.push(error.message)
    results.completed_at = new Date().toISOString()
    return res.status(500).json(results)
  }
}

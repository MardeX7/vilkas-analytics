/**
 * Low Stock Alert - Slack Cron Job
 *
 * Runs every day at 05:30 UTC (07:30 Sweden time)
 * Sends alert for products with low stock that are actively selling
 *
 * Shows:
 * - Products with stock <= 3 that have been sold in last 90 days
 * - Prioritized by sales velocity (fastest selling first)
 * - Includes estimated days until out of stock
 *
 * ID: STORE_ID = a28836f6-9487-4b67-9194-e907eaf94b69
 */

import { createClient } from '@supabase/supabase-js'
import {
  sendToSlack,
  formatNumber,
  header,
  section,
  context,
  divider
} from '../lib/slack.js'

const STORE_ID = 'a28836f6-9487-4b67-9194-e907eaf94b69'
const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL
const LOW_STOCK_THRESHOLD = 3

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

export const config = {
  maxDuration: 60,
}

/**
 * Fetch low stock products that are actively selling
 */
async function fetchLowStockProducts(supabase) {
  const ninetyDaysAgo = new Date()
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90)

  // Get products with low stock
  const { data: products } = await supabase
    .from('products')
    .select('product_number, name, stock_level, price_amount')
    .eq('store_id', STORE_ID)
    .eq('for_sale', true)
    .not('stock_level', 'is', null)
    .lte('stock_level', LOW_STOCK_THRESHOLD)

  if (!products || products.length === 0) {
    return []
  }

  // Get recent orders to check which products are actively selling
  const { data: orders } = await supabase
    .from('orders')
    .select('id')
    .eq('store_id', STORE_ID)
    .neq('status', 'cancelled')
    .gte('creation_date', ninetyDaysAgo.toISOString())

  if (!orders || orders.length === 0) {
    // No recent orders, just return low stock products
    return products.map(p => ({ ...p, soldQty: 0 }))
  }

  const orderIds = orders.map(o => o.id)

  // Get line items for these orders
  const { data: items } = await supabase
    .from('order_line_items')
    .select('product_number, quantity')
    .in('order_id', orderIds)

  // Calculate sales per product
  const sales = {}
  items?.forEach(item => {
    if (!item.product_number) return
    sales[item.product_number] = (sales[item.product_number] || 0) + (item.quantity || 1)
  })

  // Merge with products and filter to only actively selling
  const lowStockProducts = products
    .map(p => ({
      ...p,
      soldQty: sales[p.product_number] || 0
    }))
    .filter(p => p.soldQty > 0) // Only products that have been sold
    .sort((a, b) => {
      // Sort by urgency: out of stock first, then by days until out
      if (a.stock_level <= 0 && b.stock_level > 0) return -1
      if (a.stock_level > 0 && b.stock_level <= 0) return 1

      // Then by days until out of stock (lower = more urgent)
      const aDays = a.stock_level / (a.soldQty / 90)
      const bDays = b.stock_level / (b.soldQty / 90)
      return aDays - bDays
    })

  return lowStockProducts
}

/**
 * Build Slack message
 */
function buildLowStockSlackMessage(products) {
  const blocks = [
    header(`:rotating_light: Lagervarning - Aktiva produkter`)
  ]

  if (products.length === 0) {
    blocks.push(section(`:white_check_mark: Inga aktiva produkter har kritiskt lågt lager!`))
    blocks.push(divider())
    blocks.push(context(`:link: <https://vilkas-analytics.vercel.app/inventory|Öppna Lagervy>`))
    return { blocks }
  }

  // Categorize
  const outOfStock = products.filter(p => p.stock_level <= 0)
  const critical = products.filter(p => p.stock_level > 0)

  // Summary
  blocks.push(section(`*${products.length} aktiva produkter* behöver påfyllning\n:x: ${outOfStock.length} slut | :warning: ${critical.length} kritiskt låg`))

  // Format product line
  const formatProduct = (p) => {
    const shortName = p.name.length > 30 ? p.name.substring(0, 28) + '..' : p.name
    const dailySales = p.soldQty / 90
    const daysLeft = p.stock_level > 0 ? Math.floor(p.stock_level / dailySales) : 0
    const daysText = daysLeft > 0 ? `~${daysLeft}d kvar` : ''
    return `\`${p.product_number}\` ${shortName}\nLager: *${p.stock_level}* | Sålt: ${p.soldQty}/90d ${daysText}`
  }

  // Out of stock
  if (outOfStock.length > 0) {
    blocks.push(divider())
    blocks.push(section(`:x: *SLUT I LAGER* (säljer aktivt!)`))

    const outText = outOfStock.slice(0, 8).map(p => {
      const shortName = p.name.length > 35 ? p.name.substring(0, 33) + '..' : p.name
      return `:red_circle: ${shortName}\n   Sålt ${p.soldQty} st senaste 90 dagarna`
    }).join('\n\n')

    blocks.push(section(outText))

    if (outOfStock.length > 8) {
      blocks.push(section(`_...och ${outOfStock.length - 8} till_`))
    }
  }

  // Critical low stock
  if (critical.length > 0) {
    blocks.push(divider())
    blocks.push(section(`:warning: *KRITISKT LÅG (1-${LOW_STOCK_THRESHOLD} st)*`))

    const critText = critical.slice(0, 10).map(p => {
      const shortName = p.name.length > 30 ? p.name.substring(0, 28) + '..' : p.name
      const dailySales = p.soldQty / 90
      const daysLeft = Math.floor(p.stock_level / dailySales)
      return `:warning: ${shortName} | *${p.stock_level} st* (~${daysLeft}d)`
    }).join('\n')

    blocks.push(section(critText))

    if (critical.length > 10) {
      blocks.push(section(`_...och ${critical.length - 10} till_`))
    }
  }

  blocks.push(divider())
  blocks.push(context(`:link: <https://vilkas-analytics.vercel.app/inventory|Öppna Lagervy>`))

  return { blocks }
}

/**
 * Main handler
 */
export default async function handler(req, res) {
  const authHeader = req.headers.authorization
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  console.log('Starting low stock alert:', new Date().toISOString())

  if (!supabaseUrl || !supabaseServiceKey) {
    return res.status(500).json({ error: 'Missing Supabase credentials' })
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  try {
    const products = await fetchLowStockProducts(supabase)

    console.log(`Found ${products.length} low stock products that are actively selling`)

    const message = buildLowStockSlackMessage(products)
    const slackResult = await sendToSlack(SLACK_WEBHOOK_URL, message)

    if (!slackResult.success) {
      console.error('Slack send failed:', slackResult.error)
      return res.status(200).json({
        success: false,
        productsCount: products.length,
        slackError: slackResult.error
      })
    }

    return res.status(200).json({
      success: true,
      productsCount: products.length,
      outOfStock: products.filter(p => p.stock_level <= 0).length,
      lowStock: products.filter(p => p.stock_level > 0).length,
      slackSent: true
    })

  } catch (error) {
    console.error('Low stock alert error:', error)
    return res.status(500).json({ error: error.message })
  }
}

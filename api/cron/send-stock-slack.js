/**
 * Stock Status Report - Slack Cron Job
 *
 * Runs every day at 05:15 UTC (07:15 Sweden time)
 * Sends top sellers stock status to #billackering-eu
 *
 * Shows:
 * - Top 10 products by sales (last 30 days)
 * - Current stock level for each
 * - Warnings for low stock (< 5) or out of stock (0)
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

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

export const config = {
  maxDuration: 30,
}

/**
 * Fetch top sellers with stock levels
 */
async function fetchTopSellersStock(supabase) {
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

  // Get orders from last 30 days
  const { data: orders } = await supabase
    .from('orders')
    .select('id')
    .eq('store_id', STORE_ID)
    .neq('status', 'cancelled')
    .gte('creation_date', thirtyDaysAgo.toISOString())

  if (!orders || orders.length === 0) {
    return []
  }

  const orderIds = orders.map(o => o.id)

  // Get line items
  const { data: items } = await supabase
    .from('order_line_items')
    .select('product_number, product_name, quantity')
    .in('order_id', orderIds)

  // Aggregate sales by product
  const sales = {}
  items?.forEach(item => {
    const sku = item.product_number
    if (!sku) return

    if (!sales[sku]) {
      sales[sku] = {
        sku,
        name: item.product_name || sku,
        soldQty: 0
      }
    }
    sales[sku].soldQty += item.quantity || 1
  })

  // Sort by quantity sold
  const topSellers = Object.values(sales)
    .sort((a, b) => b.soldQty - a.soldQty)
    .slice(0, 15)

  // Get stock levels for top sellers
  const skus = topSellers.map(p => p.sku)
  const { data: products } = await supabase
    .from('products')
    .select('product_number, stock_level, name')
    .eq('store_id', STORE_ID)
    .in('product_number', skus)

  // Create stock map
  const stockMap = new Map()
  products?.forEach(p => {
    stockMap.set(p.product_number, {
      stock: p.stock_level,
      name: p.name
    })
  })

  // Merge with sales data - only include products WITH stock data
  return topSellers
    .map(p => {
      const stockInfo = stockMap.get(p.sku)
      return {
        ...p,
        name: stockInfo?.name || p.name,
        stock: stockInfo?.stock ?? null
      }
    })
    .filter(p => p.stock !== null) // Skip products without stock data
}

/**
 * Get stock status and emoji
 */
function getStockStatus(stock, soldQty) {
  if (stock === null || stock === undefined) {
    return { status: 'unknown', emoji: ':grey_question:' }
  }
  if (stock <= 0) {
    return { status: 'out', emoji: ':x:' }
  }
  // Calculate days of stock based on daily sales rate
  const dailySales = soldQty / 30
  const daysOfStock = dailySales > 0 ? Math.floor(stock / dailySales) : 999

  if (daysOfStock <= 7) {
    return { status: 'critical', emoji: ':rotating_light:' }
  }
  if (daysOfStock <= 14) {
    return { status: 'low', emoji: ':warning:' }
  }
  return { status: 'ok', emoji: ':white_check_mark:' }
}

/**
 * Build Slack message
 */
function buildStockSlackMessage(products) {
  const blocks = [
    header(`:package: Top-produkters lagerstatus`)
  ]

  if (products.length === 0) {
    blocks.push(section(`Ingen försäljningsdata tillgänglig.`))
    return { blocks }
  }

  // Categorize products
  const outOfStock = products.filter(p => p.stock !== null && p.stock <= 0)
  const critical = products.filter(p => {
    if (p.stock === null || p.stock <= 0) return false
    const days = p.stock / (p.soldQty / 30)
    return days <= 7
  })
  const low = products.filter(p => {
    if (p.stock === null || p.stock <= 0) return false
    const days = p.stock / (p.soldQty / 30)
    return days > 7 && days <= 14
  })
  const ok = products.filter(p => {
    if (p.stock === null) return false
    if (p.stock <= 0) return false
    const days = p.stock / (p.soldQty / 30)
    return days > 14
  })
  // Products without stock data are already filtered out

  // Summary
  const summaryParts = []
  if (outOfStock.length > 0) summaryParts.push(`:x: ${outOfStock.length} slut`)
  if (critical.length > 0) summaryParts.push(`:rotating_light: ${critical.length} kritisk`)
  if (low.length > 0) summaryParts.push(`:warning: ${low.length} låg`)
  if (ok.length > 0) summaryParts.push(`:white_check_mark: ${ok.length} OK`)

  blocks.push(section(`*Topp 15 produkter (30 dagar)*\n${summaryParts.join(' | ')}`))

  // Format product line
  const formatProduct = (p) => {
    const { emoji } = getStockStatus(p.stock, p.soldQty)
    const shortName = p.name.length > 25 ? p.name.substring(0, 23) + '..' : p.name
    const stockText = p.stock !== null ? `${p.stock} st` : '?'
    const daysText = p.stock !== null && p.soldQty > 0
      ? `(${Math.floor(p.stock / (p.soldQty / 30))}d)`
      : ''
    return `${emoji} ${shortName} | Lager: ${stockText} ${daysText}`
  }

  // Out of stock (if any)
  if (outOfStock.length > 0) {
    blocks.push(divider())
    blocks.push(section(`:x: *SLUT I LAGER*`))
    blocks.push(section(outOfStock.map(formatProduct).join('\n')))
  }

  // Critical (if any)
  if (critical.length > 0) {
    blocks.push(divider())
    blocks.push(section(`:rotating_light: *KRITISK (<7 dagars lager)*`))
    blocks.push(section(critical.map(formatProduct).join('\n')))
  }

  // Low (if any)
  if (low.length > 0) {
    blocks.push(divider())
    blocks.push(section(`:warning: *LÅG (7-14 dagars lager)*`))
    blocks.push(section(low.map(formatProduct).join('\n')))
  }

  // OK products (summary only if many)
  if (ok.length > 0) {
    blocks.push(divider())
    if (ok.length <= 5) {
      blocks.push(section(`:white_check_mark: *OK (>14 dagars lager)*`))
      blocks.push(section(ok.map(formatProduct).join('\n')))
    } else {
      blocks.push(section(`:white_check_mark: *OK (>14 dagars lager):* ${ok.length} produkter`))
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

  console.log('Starting stock status report:', new Date().toISOString())

  if (!supabaseUrl || !supabaseServiceKey) {
    return res.status(500).json({ error: 'Missing Supabase credentials' })
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  try {
    const products = await fetchTopSellersStock(supabase)

    console.log(`Found ${products.length} top selling products`)

    const message = buildStockSlackMessage(products)
    const slackResult = await sendToSlack(SLACK_WEBHOOK_URL, message)

    if (!slackResult.success) {
      console.error('Slack send failed:', slackResult.error)
      return res.status(200).json({
        success: false,
        productsCount: products.length,
        slackError: slackResult.error
      })
    }

    // Count statuses
    const outOfStock = products.filter(p => p.stock !== null && p.stock <= 0).length
    const lowStock = products.filter(p => {
      if (p.stock === null || p.stock <= 0) return false
      return p.stock / (p.soldQty / 30) <= 14
    }).length

    return res.status(200).json({
      success: true,
      productsCount: products.length,
      outOfStock,
      lowStock,
      slackSent: true
    })

  } catch (error) {
    console.error('Stock report error:', error)
    return res.status(500).json({ error: error.message })
  }
}

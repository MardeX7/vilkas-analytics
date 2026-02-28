/**
 * Morning Brief - Unified Slack Report
 *
 * Runs daily at 06:30 UTC (08:30 Finland / 07:30 Sweden)
 * AFTER sync-data (06:00) so all data is fresh
 *
 * Combines:
 * 1. New orders since yesterday 15:00 UTC (16:00 Swedish time)
 * 2. Daily sales summary (yesterday)
 * 3. Stock warnings (out of stock + critical low)
 *
 * Replaces: send-orders-slack, send-stock-slack, send-lowstock-slack, send-daily-slack
 *
 * ID: STORE_ID = a28836f6-9487-4b67-9194-e907eaf94b69
 */

import { createClient } from '@supabase/supabase-js'
import {
  sendToSlack,
  formatNumber,
  calculateChange,
  formatChange,
  getWeekdayName,
  header,
  section,
  sectionFields,
  context,
  divider
} from '../lib/slack.js'

const STORE_ID = 'a28836f6-9487-4b67-9194-e907eaf94b69'

// Bundle/package products don't have their own stock (composed of other products)
const BUNDLE_NAME_PATTERN = /paket|paketet|bundle/i
function isBundle(product) {
  return BUNDLE_NAME_PATTERN.test(product?.name || '')
}
const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

export const config = {
  maxDuration: 60,
}

// ============================================
// 1. ORDERS - New orders since yesterday 15:00 UTC
// ============================================
async function fetchNewOrders(supabase) {
  const now = new Date()
  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  // Use UTC hours explicitly to avoid timezone issues on server
  yesterday.setUTCHours(15, 0, 0, 0) // 15:00 UTC = 16:00 CET

  const { data: orders, error } = await supabase
    .from('orders')
    .select('order_number, creation_date, grand_total, billing_company, billing_city, currency')
    .eq('store_id', STORE_ID)
    .neq('status', 'cancelled')
    .gte('creation_date', yesterday.toISOString())
    .order('grand_total', { ascending: false })

  if (error) {
    console.error('Error fetching orders:', error.message)
    return []
  }
  return orders || []
}

// ============================================
// 2. DAILY SALES - Yesterday's summary
// ============================================
async function fetchDailySales(supabase, yesterdayStr) {
  const { data: sales } = await supabase
    .from('v_daily_sales')
    .select('total_revenue, order_count, unique_customers, avg_order_value, currency')
    .eq('store_id', STORE_ID)
    .eq('sale_date', yesterdayStr)
    .maybeSingle()

  // Rolling 7-day average (7 days before yesterday)
  const weekAgoEnd = new Date(yesterdayStr)
  weekAgoEnd.setDate(weekAgoEnd.getDate() - 1)
  const weekAgoStart = new Date(yesterdayStr)
  weekAgoStart.setDate(weekAgoStart.getDate() - 7)

  const { data: prev7Days } = await supabase
    .from('v_daily_sales')
    .select('total_revenue, order_count')
    .eq('store_id', STORE_ID)
    .gte('sale_date', weekAgoStart.toISOString().split('T')[0])
    .lte('sale_date', weekAgoEnd.toISOString().split('T')[0])

  const daysWithData = prev7Days?.length || 0
  const avgRevenue = daysWithData > 0
    ? prev7Days.reduce((sum, d) => sum + (d.total_revenue || 0), 0) / daysWithData
    : 0
  const avgOrders = daysWithData > 0
    ? prev7Days.reduce((sum, d) => sum + (d.order_count || 0), 0) / daysWithData
    : 0

  // Gross margin
  const margin = await calculateGrossMargin(supabase, yesterdayStr)

  return {
    revenue: sales?.total_revenue || 0,
    orders: sales?.order_count || 0,
    customers: sales?.unique_customers || 0,
    aov: sales?.avg_order_value || 0,
    currency: sales?.currency || 'SEK',
    marginPercent: margin.marginPercent,
    grossProfit: margin.grossProfit,
    prevRevenue: avgRevenue,
    prevOrders: avgOrders
  }
}

async function calculateGrossMargin(supabase, dateStr) {
  const { data: orders } = await supabase
    .from('orders')
    .select('id, grand_total, order_line_items (quantity, total_price, product_number)')
    .eq('store_id', STORE_ID)
    .neq('status', 'cancelled')
    .gte('creation_date', `${dateStr}T00:00:00`)
    .lte('creation_date', `${dateStr}T23:59:59`)

  if (!orders || orders.length === 0) return { grossProfit: 0, marginPercent: 0 }

  const productNumbers = new Set()
  orders.forEach(o => o.order_line_items?.forEach(i => {
    if (i.product_number) productNumbers.add(i.product_number)
  }))

  if (productNumbers.size === 0) return { grossProfit: 0, marginPercent: 0 }

  const { data: products } = await supabase
    .from('products')
    .select('product_number, cost_price')
    .eq('store_id', STORE_ID)
    .in('product_number', Array.from(productNumbers))

  const costMap = new Map()
  products?.forEach(p => { if (p.cost_price) costMap.set(p.product_number, p.cost_price) })

  let totalRevenue = 0, totalCost = 0
  orders.forEach(o => o.order_line_items?.forEach(item => {
    totalRevenue += item.total_price || 0
    totalCost += (costMap.get(item.product_number) || 0) * (item.quantity || 1)
  }))

  const grossProfit = totalRevenue - totalCost
  return { grossProfit, marginPercent: totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0 }
}

// ============================================
// 3. STOCK WARNINGS - Out of stock + critical
// ============================================
async function fetchStockWarnings(supabase) {
  // Get products that are for sale with low/no stock
  const { data: products } = await supabase
    .from('products')
    .select('product_number, name, stock_level')
    .eq('store_id', STORE_ID)
    .eq('for_sale', true)
    .not('stock_level', 'is', null)
    .lte('stock_level', 3)

  if (!products || products.length === 0) return { outOfStock: 0, criticalLow: 0, topItems: [] }

  // Check which ones are actively selling (last 90 days)
  const ninetyDaysAgo = new Date()
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90)

  const { data: orders } = await supabase
    .from('orders')
    .select('id')
    .eq('store_id', STORE_ID)
    .neq('status', 'cancelled')
    .gte('creation_date', ninetyDaysAgo.toISOString())

  const orderIds = orders?.map(o => o.id) || []

  let salesMap = new Map()
  if (orderIds.length > 0) {
    const { data: items } = await supabase
      .from('order_line_items')
      .select('product_number, quantity')
      .in('order_id', orderIds)

    items?.forEach(i => {
      if (i.product_number) {
        salesMap.set(i.product_number, (salesMap.get(i.product_number) || 0) + (i.quantity || 1))
      }
    })
  }

  // Only include products that are actively selling and not bundles/packages
  const activeProducts = products
    .filter(p => salesMap.has(p.product_number) && !isBundle(p))
    .map(p => ({
      ...p,
      soldQty: salesMap.get(p.product_number) || 0,
      daysLeft: p.stock_level > 0 ? Math.floor(p.stock_level / ((salesMap.get(p.product_number) || 1) / 90)) : 0
    }))
    .sort((a, b) => a.daysLeft - b.daysLeft)

  const outOfStock = activeProducts.filter(p => p.stock_level <= 0)
  const criticalLow = activeProducts.filter(p => p.stock_level > 0)

  // Top 5 most urgent items for brief display
  const topItems = activeProducts.slice(0, 5).map(p => {
    const shortName = p.name.length > 30 ? p.name.substring(0, 28) + '..' : p.name
    const emoji = p.stock_level <= 0 ? ':red_circle:' : ':warning:'
    const stockText = p.stock_level <= 0 ? 'slut' : `${p.stock_level} st (~${p.daysLeft}d)`
    return `${emoji} ${shortName} | ${stockText}`
  })

  return {
    outOfStock: outOfStock.length,
    criticalLow: criticalLow.length,
    totalActive: activeProducts.length,
    topItems
  }
}

// ============================================
// BUILD MESSAGE
// ============================================
function buildMorningBrief(ordersData, salesData, stockData, yesterdayStr) {
  const yesterdayDate = new Date(yesterdayStr)
  const weekday = getWeekdayName(yesterdayDate)
  const currency = salesData.currency || 'SEK'
  const dateDisplay = yesterdayStr

  const blocks = [
    header(`:sunrise: Aamubrief ${dateDisplay} (${weekday})`)
  ]

  // --- SECTION 1: New Orders ---
  blocks.push(divider())
  if (ordersData.length === 0) {
    blocks.push(section(`:package: *Nya ordrar sedan igår kl 16*\n:zzz: Inga nya ordrar`))
  } else {
    const totalValue = ordersData.reduce((sum, o) => sum + (o.grand_total || 0), 0)
    blocks.push(section(
      `:package: *Nya ordrar sedan igår kl 16*\n` +
      `*${ordersData.length} ordrar* totalt *${formatNumber(Math.round(totalValue))} ${currency}*`
    ))

    // Show top 5 orders
    const orderLines = ordersData.slice(0, 5).map(o => {
      const customer = o.billing_company || o.billing_city || 'Okänd'
      const shortCustomer = customer.length > 20 ? customer.substring(0, 18) + '..' : customer
      return `\`#${o.order_number}\` ${formatNumber(Math.round(o.grand_total))} ${currency} - ${shortCustomer}`
    })
    blocks.push(section(orderLines.join('\n')))

    if (ordersData.length > 5) {
      blocks.push(context(`_...och ${ordersData.length - 5} till_`))
    }
  }

  // --- SECTION 2: Daily Sales Summary ---
  blocks.push(divider())

  const revenueChange = calculateChange(salesData.revenue, salesData.prevRevenue)
  const ordersChange = calculateChange(salesData.orders, salesData.prevOrders)
  const revFmt = formatChange(revenueChange)
  const ordFmt = formatChange(ordersChange)

  const revCompare = revenueChange !== null ? ` ${revFmt.emoji} ${revFmt.text} vs 7d snitt` : ''
  const ordCompare = ordersChange !== null ? ` ${ordFmt.emoji} ${ordFmt.text} vs 7d snitt` : ''

  blocks.push(sectionFields([
    `*Omsättning*\n${formatNumber(Math.round(salesData.revenue))} ${currency}${revCompare}`,
    `*Beställningar*\n${salesData.orders} st${ordCompare}`
  ]))

  blocks.push(sectionFields([
    `*Bruttomarginal*\n${formatNumber(salesData.marginPercent, 1)}% (${formatNumber(Math.round(salesData.grossProfit))} ${currency})`,
    `*Snittorder*\n${formatNumber(Math.round(salesData.aov))} ${currency}`
  ]))

  // --- SECTION 3: Stock Warnings (only if issues exist) ---
  if (stockData.outOfStock > 0 || stockData.criticalLow > 0) {
    blocks.push(divider())

    const stockParts = []
    if (stockData.outOfStock > 0) stockParts.push(`:x: ${stockData.outOfStock} slut`)
    if (stockData.criticalLow > 0) stockParts.push(`:warning: ${stockData.criticalLow} kritiskt låg`)

    blocks.push(section(
      `:rotating_light: *Lagervarning* (${stockData.totalActive} aktiva)\n${stockParts.join(' | ')}`
    ))

    if (stockData.topItems.length > 0) {
      blocks.push(section(stockData.topItems.join('\n')))
    }

    blocks.push(context(`<https://vilkas-analytics.vercel.app/inventory|Se alla i Lagervy>`))
  }

  // --- FOOTER ---
  blocks.push(divider())
  blocks.push(context(`:link: <https://vilkas-analytics.vercel.app|Öppna Vilkas Analytics>`))

  return { blocks }
}

// ============================================
// MAIN HANDLER
// ============================================
export default async function handler(req, res) {
  const authHeader = req.headers.authorization
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  console.log('Starting morning brief:', new Date().toISOString())

  if (!supabaseUrl || !supabaseServiceKey) {
    return res.status(500).json({ error: 'Missing Supabase credentials' })
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  const now = new Date()
  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  const yesterdayStr = yesterday.toISOString().split('T')[0]

  try {
    // Fetch all data in parallel
    const [ordersData, salesData, stockData] = await Promise.all([
      fetchNewOrders(supabase),
      fetchDailySales(supabase, yesterdayStr),
      fetchStockWarnings(supabase)
    ])

    console.log(`Morning brief: ${ordersData.length} orders, ${salesData.revenue} revenue, ${stockData.outOfStock} out of stock`)

    const message = buildMorningBrief(ordersData, salesData, stockData, yesterdayStr)
    const slackResult = await sendToSlack(SLACK_WEBHOOK_URL, message)

    if (!slackResult.success) {
      console.error('Slack send failed:', slackResult.error)
      return res.status(200).json({ success: false, slackError: slackResult.error })
    }

    return res.status(200).json({
      success: true,
      orders: ordersData.length,
      revenue: salesData.revenue,
      stockWarnings: stockData.outOfStock + stockData.criticalLow,
      slackSent: true
    })

  } catch (error) {
    console.error('Morning brief error:', error)
    return res.status(500).json({ error: error.message })
  }
}

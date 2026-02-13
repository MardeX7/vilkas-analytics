/**
 * Daily Slack Report Cron Job
 *
 * Runs every day at 06:30 UTC (08:30 Finland time)
 * Sends yesterday's sales summary to #billackering-eu Slack channel
 *
 * Content:
 * - Revenue (omsattning)
 * - Order count (bestallningar)
 * - Gross margin % and amount (bruttomarginal)
 * - Average order value (snittorder)
 * - New customers (nya kunder)
 * - Unique customers (unika kunder)
 * - Comparison to same weekday last week
 *
 * ID Mapping (Billackering.eu):
 *   STORE_ID = a28836f6-9487-4b67-9194-e907eaf94b69 (orders, products)
 */

import { createClient } from '@supabase/supabase-js'
import {
  sendToSlack,
  formatNumber,
  calculateChange,
  formatChange,
  getWeekdayName,
  header,
  sectionFields,
  context,
  divider
} from '../lib/slack.js'

// Configuration
const STORE_ID = 'a28836f6-9487-4b67-9194-e907eaf94b69'
const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

export const config = {
  maxDuration: 30, // 30 seconds max
}

/**
 * Fetch daily report data
 */
async function fetchDailyReportData(supabase, yesterday) {
  // 1. Sales from v_daily_sales (revenue, orders, unique_customers)
  const { data: todaySales, error: salesError } = await supabase
    .from('v_daily_sales')
    .select('total_revenue, order_count, unique_customers, avg_order_value, currency')
    .eq('store_id', STORE_ID)
    .eq('sale_date', yesterday)
    .maybeSingle()

  if (salesError) {
    console.error('Error fetching sales:', salesError.message)
  }

  // 2. Gross margin calculation
  const marginData = await calculateGrossMargin(supabase, yesterday)

  // 3. Same weekday last week comparison
  const lastWeekDate = new Date(yesterday)
  lastWeekDate.setDate(lastWeekDate.getDate() - 7)
  const lastWeekDateStr = lastWeekDate.toISOString().split('T')[0]

  const { data: lastWeekSales } = await supabase
    .from('v_daily_sales')
    .select('total_revenue, order_count, unique_customers')
    .eq('store_id', STORE_ID)
    .eq('sale_date', lastWeekDateStr)
    .maybeSingle()

  // 4. New customers calculation
  const newCustomersCount = await calculateNewCustomers(supabase, yesterday)

  return {
    yesterday: {
      revenue: todaySales?.total_revenue || 0,
      orders: todaySales?.order_count || 0,
      customers: todaySales?.unique_customers || 0,
      aov: todaySales?.avg_order_value || 0,
      currency: todaySales?.currency || 'SEK',
      grossProfit: marginData.grossProfit,
      marginPercent: marginData.marginPercent,
      newCustomers: newCustomersCount
    },
    lastWeek: {
      revenue: lastWeekSales?.total_revenue || 0,
      orders: lastWeekSales?.order_count || 0,
      customers: lastWeekSales?.unique_customers || 0
    }
  }
}

/**
 * Calculate gross margin for a specific date
 */
async function calculateGrossMargin(supabase, dateStr) {
  // Fetch orders with line items for the date
  const startOfDay = `${dateStr}T00:00:00`
  const endOfDay = `${dateStr}T23:59:59`

  const { data: orders, error: ordersError } = await supabase
    .from('orders')
    .select(`
      id, grand_total,
      order_line_items (quantity, total_price, product_number)
    `)
    .eq('store_id', STORE_ID)
    .neq('status', 'cancelled')
    .gte('creation_date', startOfDay)
    .lte('creation_date', endOfDay)

  if (ordersError || !orders || orders.length === 0) {
    return { grossProfit: 0, marginPercent: 0 }
  }

  // Get all product numbers from line items
  const productNumbers = new Set()
  orders.forEach(o => {
    o.order_line_items?.forEach(item => {
      if (item.product_number) productNumbers.add(item.product_number)
    })
  })

  if (productNumbers.size === 0) {
    return { grossProfit: 0, marginPercent: 0 }
  }

  // Get cost prices for products
  const { data: products } = await supabase
    .from('products')
    .select('product_number, cost_price')
    .eq('store_id', STORE_ID)
    .in('product_number', Array.from(productNumbers))

  // Build cost map
  const costMap = new Map()
  products?.forEach(p => {
    if (p.cost_price && p.product_number) {
      costMap.set(p.product_number, p.cost_price)
    }
  })

  // Calculate totals
  let totalRevenue = 0
  let totalCost = 0

  orders.forEach(o => {
    o.order_line_items?.forEach(item => {
      const qty = item.quantity || 1
      const price = item.total_price || 0
      const costPrice = costMap.get(item.product_number) || 0

      totalRevenue += price
      totalCost += costPrice * qty
    })
  })

  const grossProfit = totalRevenue - totalCost
  const marginPercent = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0

  return { grossProfit, marginPercent }
}

/**
 * Calculate new customers for a specific date
 */
async function calculateNewCustomers(supabase, dateStr) {
  const startOfDay = `${dateStr}T00:00:00`
  const endOfDay = `${dateStr}T23:59:59`

  // Get emails from yesterday's orders
  const { data: yesterdayOrders } = await supabase
    .from('orders')
    .select('billing_email')
    .eq('store_id', STORE_ID)
    .neq('status', 'cancelled')
    .gte('creation_date', startOfDay)
    .lte('creation_date', endOfDay)

  if (!yesterdayOrders || yesterdayOrders.length === 0) {
    return 0
  }

  const yesterdayEmails = new Set(
    yesterdayOrders.map(o => o.billing_email?.toLowerCase()).filter(Boolean)
  )

  if (yesterdayEmails.size === 0) {
    return 0
  }

  // Get emails from previous orders (before yesterday)
  const { data: previousOrders } = await supabase
    .from('orders')
    .select('billing_email')
    .eq('store_id', STORE_ID)
    .neq('status', 'cancelled')
    .lt('creation_date', startOfDay)

  const previousEmails = new Set(
    previousOrders?.map(o => o.billing_email?.toLowerCase()).filter(Boolean) || []
  )

  // Count emails that are new (not in previous orders)
  const newCustomers = [...yesterdayEmails].filter(e => !previousEmails.has(e)).length

  return newCustomers
}

/**
 * Build Slack message blocks
 */
function buildDailySlackMessage(data, yesterday) {
  const { yesterday: today, lastWeek } = data
  const yesterdayDate = new Date(yesterday)
  const weekday = getWeekdayName(yesterdayDate)
  const currency = today.currency || 'SEK'

  // Calculate changes
  const revenueChange = calculateChange(today.revenue, lastWeek.revenue)
  const ordersChange = calculateChange(today.orders, lastWeek.orders)
  const revenueChangeFormatted = formatChange(revenueChange)
  const ordersChangeFormatted = formatChange(ordersChange)

  // Format comparison text
  const revenueComparison = revenueChange !== null
    ? `${revenueChangeFormatted.emoji} ${revenueChangeFormatted.text} vs forra ${weekday}`
    : ''
  const ordersComparison = ordersChange !== null
    ? `${ordersChangeFormatted.emoji} ${ordersChangeFormatted.text} vs forra ${weekday}`
    : ''

  const blocks = [
    header(`:bar_chart: Dagsrapport ${yesterday} (${weekday})`),

    // Revenue and Orders
    sectionFields([
      `*Omsattning*\n${formatNumber(Math.round(today.revenue))} ${currency}\n${revenueComparison}`,
      `*Bestallningar*\n${today.orders} st\n${ordersComparison}`
    ]),

    // Margin and AOV
    sectionFields([
      `*Bruttomarginal*\n${formatNumber(today.marginPercent, 1)}% (${formatNumber(Math.round(today.grossProfit))} ${currency})`,
      `*Snittorder*\n${formatNumber(Math.round(today.aov))} ${currency}`
    ]),

    // Customers
    sectionFields([
      `*Nya kunder*\n${today.newCustomers} st`,
      `*Unika kunder*\n${today.customers} st`
    ]),

    divider(),

    context(`:link: <https://vilkas-analytics.vercel.app|Oppna Vilkas Analytics>`)
  ]

  return { blocks }
}

/**
 * Main handler
 */
export default async function handler(req, res) {
  // Verify cron secret (optional)
  const authHeader = req.headers.authorization
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    console.log('Unauthorized cron request')
    return res.status(401).json({ error: 'Unauthorized' })
  }

  console.log('Starting daily Slack report:', new Date().toISOString())

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Missing Supabase credentials')
    return res.status(500).json({ error: 'Missing Supabase credentials' })
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  // Calculate yesterday's date
  const now = new Date()
  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  const yesterdayStr = yesterday.toISOString().split('T')[0]

  try {
    // Fetch data
    const reportData = await fetchDailyReportData(supabase, yesterdayStr)

    console.log('Daily report data:', JSON.stringify(reportData, null, 2))

    // Build Slack message
    const message = buildDailySlackMessage(reportData, yesterdayStr)

    // Send to Slack
    const slackResult = await sendToSlack(SLACK_WEBHOOK_URL, message)

    if (!slackResult.success) {
      console.error('Failed to send Slack message:', slackResult.error)
      return res.status(200).json({
        success: false,
        date: yesterdayStr,
        data: reportData,
        slackError: slackResult.error
      })
    }

    console.log('Daily Slack report sent successfully')

    return res.status(200).json({
      success: true,
      date: yesterdayStr,
      data: reportData,
      slackSent: true
    })

  } catch (error) {
    console.error('Daily report error:', error)
    return res.status(500).json({
      error: error.message,
      date: yesterdayStr
    })
  }
}

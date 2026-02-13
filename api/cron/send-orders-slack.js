/**
 * Morning Orders Report - Slack Cron Job
 *
 * Runs every day at 05:00 UTC (07:00 Sweden time)
 * Sends NEW orders since yesterday 16:00 to #billackering-eu
 *
 * Shows:
 * - Orders that came in after Pia left (16:00 yesterday)
 * - Sorted by value (largest first)
 * - Summary with total count and value
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
 * Fetch orders since yesterday 16:00 (after Pia left)
 */
async function fetchNewOrders(supabase) {
  // Yesterday at 16:00 Swedish time (UTC+1 in winter, UTC+2 in summer)
  // Using UTC+1 as safe default
  const now = new Date()
  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  yesterday.setHours(15, 0, 0, 0) // 15:00 UTC = 16:00 Swedish time

  const { data: orders, error } = await supabase
    .from('orders')
    .select(`
      order_number,
      creation_date,
      grand_total,
      billing_company,
      billing_city,
      billing_email,
      currency
    `)
    .eq('store_id', STORE_ID)
    .neq('status', 'cancelled')
    .gte('creation_date', yesterday.toISOString())
    .order('grand_total', { ascending: false }) // Largest first

  if (error) {
    console.error('Error fetching orders:', error.message)
    return []
  }

  return orders || []
}

/**
 * Count line items for an order
 */
async function countOrderItems(supabase, orders) {
  if (!orders.length) return new Map()

  // Get order IDs by order_number
  const orderNumbers = orders.map(o => o.order_number)

  const { data: orderData } = await supabase
    .from('orders')
    .select('id, order_number')
    .eq('store_id', STORE_ID)
    .in('order_number', orderNumbers)

  if (!orderData) return new Map()

  const orderIds = orderData.map(o => o.id)
  const orderIdToNumber = new Map(orderData.map(o => [o.id, o.order_number]))

  // Count items per order
  const { data: items } = await supabase
    .from('order_line_items')
    .select('order_id, quantity')
    .in('order_id', orderIds)

  const itemCounts = new Map()
  items?.forEach(item => {
    const orderNum = orderIdToNumber.get(item.order_id)
    if (orderNum) {
      const current = itemCounts.get(orderNum) || 0
      itemCounts.set(orderNum, current + (item.quantity || 1))
    }
  })

  return itemCounts
}

/**
 * Build Slack message for overnight orders
 */
function buildOrdersSlackMessage(orders, itemCounts) {
  const now = new Date()
  const today = now.toISOString().split('T')[0]
  const currency = orders[0]?.currency || 'SEK'

  // Calculate totals
  const totalOrders = orders.length
  const totalValue = orders.reduce((sum, o) => sum + (o.grand_total || 0), 0)
  const totalItems = Array.from(itemCounts.values()).reduce((sum, count) => sum + count, 0)

  // Format order line
  const formatOrder = (o) => {
    const customer = o.billing_company || o.billing_city || 'Okand'
    const shortCustomer = customer.length > 20 ? customer.substring(0, 18) + '..' : customer
    const items = itemCounts.get(o.order_number) || 0
    const time = new Date(o.creation_date).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })
    return `\`#${o.order_number}\` ${formatNumber(Math.round(o.grand_total))} ${currency} - ${shortCustomer}${items > 0 ? ` (${items} st)` : ''}`
  }

  const blocks = [
    header(`:sunrise: Nya ordrar sedan igår kl 16`)
  ]

  if (totalOrders === 0) {
    blocks.push(section(`:zzz: Inga nya ordrar inatt!`))
  } else {
    blocks.push(section(`*${totalOrders} nya ordrar*\nTotalt: *${formatNumber(Math.round(totalValue))} ${currency}*${totalItems > 0 ? ` | ${totalItems} produkter` : ''}`))

    blocks.push(divider())

    // Show orders (max 15)
    const ordersList = orders.slice(0, 15).map(o => formatOrder(o)).join('\n')
    blocks.push(section(ordersList))

    if (orders.length > 15) {
      blocks.push(section(`_...och ${orders.length - 15} till_`))
    }
  }

  blocks.push(divider())
  blocks.push(context(`:link: <https://vilkas-analytics.vercel.app|Öppna Vilkas Analytics>`))

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

  console.log('Starting morning orders report:', new Date().toISOString())

  if (!supabaseUrl || !supabaseServiceKey) {
    return res.status(500).json({ error: 'Missing Supabase credentials' })
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  try {
    // Fetch new orders since yesterday 16:00
    const orders = await fetchNewOrders(supabase)

    // Count items per order
    const itemCounts = await countOrderItems(supabase, orders)

    console.log(`Found ${orders.length} new orders since yesterday 16:00`)

    // Build and send message
    const message = buildOrdersSlackMessage(orders, itemCounts)
    const slackResult = await sendToSlack(SLACK_WEBHOOK_URL, message)

    if (!slackResult.success) {
      console.error('Slack send failed:', slackResult.error)
      return res.status(200).json({
        success: false,
        ordersCount: orders.length,
        slackError: slackResult.error
      })
    }

    return res.status(200).json({
      success: true,
      ordersCount: orders.length,
      totalValue: orders.reduce((sum, o) => sum + o.grand_total, 0),
      slackSent: true
    })

  } catch (error) {
    console.error('Orders report error:', error)
    return res.status(500).json({ error: error.message })
  }
}

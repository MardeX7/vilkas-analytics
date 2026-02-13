/**
 * Reorder Suggestions - Slack Cron Job
 *
 * Runs every Monday at 06:00 UTC (08:00 Sweden time)
 * Sends weekly procurement suggestions to #billackering-eu
 *
 * Shows:
 * - Products to reorder based on sales velocity
 * - Estimated days of stock remaining
 * - Suggested order quantity (2 weeks of stock)
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

// Reorder when less than 14 days of stock
const REORDER_THRESHOLD_DAYS = 14
// Suggest ordering enough for 30 days
const TARGET_STOCK_DAYS = 30

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

export const config = {
  maxDuration: 60,
}

/**
 * Fetch products that need reordering
 */
async function fetchReorderProducts(supabase) {
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

  // Get all active products with stock data
  const { data: products } = await supabase
    .from('products')
    .select('product_number, name, stock_level, price_amount, cost_price')
    .eq('store_id', STORE_ID)
    .eq('for_sale', true)
    .not('stock_level', 'is', null)

  if (!products || products.length === 0) {
    return []
  }

  // Get recent orders
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
    .select('product_number, quantity')
    .in('order_id', orderIds)

  // Calculate sales per product (last 30 days)
  const sales = {}
  items?.forEach(item => {
    if (!item.product_number) return
    sales[item.product_number] = (sales[item.product_number] || 0) + (item.quantity || 1)
  })

  // Calculate reorder needs
  const reorderProducts = products
    .map(p => {
      const soldQty = sales[p.product_number] || 0
      const dailySales = soldQty / 30
      const daysOfStock = dailySales > 0 ? p.stock_level / dailySales : 999
      const suggestedOrder = dailySales > 0
        ? Math.ceil((TARGET_STOCK_DAYS * dailySales) - p.stock_level)
        : 0

      return {
        ...p,
        soldQty,
        dailySales,
        daysOfStock: Math.floor(daysOfStock),
        suggestedOrder: Math.max(0, suggestedOrder)
      }
    })
    .filter(p => p.soldQty > 0 && p.daysOfStock <= REORDER_THRESHOLD_DAYS)
    .sort((a, b) => a.daysOfStock - b.daysOfStock) // Most urgent first

  return reorderProducts
}

/**
 * Build Slack message
 */
function buildReorderSlackMessage(products) {
  const blocks = [
    header(`:shopping_cart: Veckans inköpslista`)
  ]

  if (products.length === 0) {
    blocks.push(section(`:white_check_mark: Inga produkter behöver beställas denna vecka!`))
    blocks.push(divider())
    blocks.push(context(`:link: <https://vilkas-analytics.vercel.app/inventory|Öppna Lagervy>`))
    return { blocks }
  }

  // Categorize by urgency
  const urgent = products.filter(p => p.daysOfStock <= 3)
  const soon = products.filter(p => p.daysOfStock > 3 && p.daysOfStock <= 7)
  const plan = products.filter(p => p.daysOfStock > 7)

  // Summary
  const totalItems = products.reduce((sum, p) => sum + p.suggestedOrder, 0)
  blocks.push(section(`*${products.length} produkter* att beställa\n:rotating_light: ${urgent.length} akut | :warning: ${soon.length} snart | :calendar: ${plan.length} planera`))

  // Format product line
  const formatProduct = (p) => {
    const shortName = p.name.length > 28 ? p.name.substring(0, 26) + '..' : p.name
    return `*${shortName}*\nLager: ${p.stock_level} | ~${p.daysOfStock}d | Beställ: *${p.suggestedOrder} st*`
  }

  // Urgent (0-3 days)
  if (urgent.length > 0) {
    blocks.push(divider())
    blocks.push(section(`:rotating_light: *AKUT (0-3 dagar)*`))

    const urgentText = urgent.slice(0, 8).map(p => {
      const shortName = p.name.length > 30 ? p.name.substring(0, 28) + '..' : p.name
      const daysText = p.daysOfStock <= 0 ? 'SLUT' : `${p.daysOfStock}d`
      return `:red_circle: ${shortName}\n   Lager: *${p.stock_level}* (${daysText}) → Beställ *${p.suggestedOrder} st*`
    }).join('\n\n')

    blocks.push(section(urgentText))
  }

  // Soon (4-7 days)
  if (soon.length > 0) {
    blocks.push(divider())
    blocks.push(section(`:warning: *SNART (4-7 dagar)*`))

    const soonText = soon.slice(0, 8).map(p => {
      const shortName = p.name.length > 30 ? p.name.substring(0, 28) + '..' : p.name
      return `:large_orange_circle: ${shortName} | ${p.stock_level} st (~${p.daysOfStock}d) → *${p.suggestedOrder} st*`
    }).join('\n')

    blocks.push(section(soonText))
  }

  // Plan (8-14 days)
  if (plan.length > 0) {
    blocks.push(divider())
    blocks.push(section(`:calendar: *PLANERA (8-14 dagar)*`))

    const planText = plan.slice(0, 8).map(p => {
      const shortName = p.name.length > 30 ? p.name.substring(0, 28) + '..' : p.name
      return `:large_blue_circle: ${shortName} | ${p.stock_level} st (~${p.daysOfStock}d) → *${p.suggestedOrder} st*`
    }).join('\n')

    blocks.push(section(planText))

    if (plan.length > 8) {
      blocks.push(section(`_...och ${plan.length - 8} till_`))
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

  console.log('Starting reorder suggestions:', new Date().toISOString())

  if (!supabaseUrl || !supabaseServiceKey) {
    return res.status(500).json({ error: 'Missing Supabase credentials' })
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  try {
    const products = await fetchReorderProducts(supabase)

    console.log(`Found ${products.length} products that need reordering`)

    const message = buildReorderSlackMessage(products)
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
      urgent: products.filter(p => p.daysOfStock <= 3).length,
      soon: products.filter(p => p.daysOfStock > 3 && p.daysOfStock <= 7).length,
      plan: products.filter(p => p.daysOfStock > 7).length,
      slackSent: true
    })

  } catch (error) {
    console.error('Reorder suggestions error:', error)
    return res.status(500).json({ error: error.message })
  }
}

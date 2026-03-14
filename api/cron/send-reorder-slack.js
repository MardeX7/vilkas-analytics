/**
 * Reorder Suggestions - Slack Cron Job (Multi-tenant)
 *
 * Runs every Monday at 06:30 UTC
 * Sends weekly procurement suggestions per shop
 *
 * Shows:
 * - Products to reorder based on sales velocity
 * - Estimated days of stock remaining
 * - Suggested order quantity (2 weeks of stock)
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

// Reorder when less than 14 days of stock
const REORDER_THRESHOLD_DAYS = 14
// Suggest ordering enough for 30 days
const TARGET_STOCK_DAYS = 30

// Bundle/package products don't have own stock — skip them
const BUNDLE_NAME_PATTERN = /paket|paketet|bundle/i
function isBundle(product) {
  return BUNDLE_NAME_PATTERN.test(product?.name || '')
}

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

export const config = {
  maxDuration: 120,
}

/**
 * Fetch products that need reordering for a specific store
 */
async function fetchReorderProducts(supabase, storeId) {
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

  const { data: products } = await supabase
    .from('products')
    .select('product_number, name, stock_level, price_amount, cost_price')
    .eq('store_id', storeId)
    .eq('for_sale', true)
    .not('stock_level', 'is', null)

  if (!products || products.length === 0) return []

  const { data: orders } = await supabase
    .from('orders')
    .select('id')
    .eq('store_id', storeId)
    .neq('status', 'cancelled')
    .gte('creation_date', thirtyDaysAgo.toISOString())

  if (!orders || orders.length === 0) return []

  const orderIds = orders.map(o => o.id)

  const { data: items } = await supabase
    .from('order_line_items')
    .select('product_number, quantity')
    .in('order_id', orderIds)

  const sales = {}
  items?.forEach(item => {
    if (!item.product_number) return
    sales[item.product_number] = (sales[item.product_number] || 0) + (item.quantity || 1)
  })

  const reorderProducts = products
    .filter(p => !isBundle(p))
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
    .sort((a, b) => a.daysOfStock - b.daysOfStock)

  return reorderProducts
}

/**
 * Build Slack message
 */
function buildReorderSlackMessage(products, shopName, language = 'fi') {
  const isFi = language === 'fi'

  const blocks = [
    header(`:shopping_cart: ${isFi ? 'Viikon tilauslista' : 'Veckans beställningslista'} – ${shopName}`)
  ]

  if (products.length === 0) {
    blocks.push(section(`:white_check_mark: ${isFi ? 'Ei tuotteita tilattavaksi tällä viikolla!' : 'Inga produkter att beställa denna vecka!'}`))
    blocks.push(divider())
    blocks.push(context(`:link: <https://vilkas-analytics.vercel.app/inventory|${isFi ? 'Avaa Varastonäkymä' : 'Öppna Lageröversikt'}>`))
    return { blocks }
  }

  const urgent = products.filter(p => p.daysOfStock <= 3)
  const soon = products.filter(p => p.daysOfStock > 3 && p.daysOfStock <= 7)
  const plan = products.filter(p => p.daysOfStock > 7)

  const unit = isFi ? 'kpl' : 'st'
  const summaryText = isFi
    ? `*${products.length} tuotetta* tilattavaksi\n:rotating_light: ${urgent.length} kiireellinen | :warning: ${soon.length} pian | :calendar: ${plan.length} suunnittele`
    : `*${products.length} produkter* att beställa\n:rotating_light: ${urgent.length} brådskande | :warning: ${soon.length} snart | :calendar: ${plan.length} planera`

  blocks.push(section(summaryText))

  if (urgent.length > 0) {
    blocks.push(divider())
    blocks.push(section(`:rotating_light: *${isFi ? 'KIIREELLINEN (0-3 päivää)' : 'BRÅDSKANDE (0-3 dagar)'}*`))

    const urgentText = urgent.slice(0, 8).map(p => {
      const shortName = p.name.length > 30 ? p.name.substring(0, 28) + '..' : p.name
      const outLabel = isFi ? 'LOPPU' : 'SLUT'
      const daysLabel = isFi ? 'pv' : 'd'
      const daysText = p.daysOfStock <= 0 ? outLabel : `${p.daysOfStock}${daysLabel}`
      const stockLabel = isFi ? 'Varasto' : 'Lager'
      const orderLabel = isFi ? 'Tilaa' : 'Beställ'
      return `:red_circle: ${shortName}\n   ${stockLabel}: *${p.stock_level}* (${daysText}) → ${orderLabel} *${p.suggestedOrder} ${unit}*`
    }).join('\n\n')

    blocks.push(section(urgentText))
  }

  if (soon.length > 0) {
    blocks.push(divider())
    blocks.push(section(`:warning: *${isFi ? 'PIAN (4-7 päivää)' : 'SNART (4-7 dagar)'}*`))

    const daysLabel = isFi ? 'pv' : 'd'
    const soonText = soon.slice(0, 8).map(p => {
      const shortName = p.name.length > 30 ? p.name.substring(0, 28) + '..' : p.name
      return `:large_orange_circle: ${shortName} | ${p.stock_level} ${unit} (~${p.daysOfStock}${daysLabel}) → *${p.suggestedOrder} ${unit}*`
    }).join('\n')

    blocks.push(section(soonText))
  }

  if (plan.length > 0) {
    blocks.push(divider())
    blocks.push(section(`:calendar: *${isFi ? 'SUUNNITTELE (8-14 päivää)' : 'PLANERA (8-14 dagar)'}*`))

    const daysLabel = isFi ? 'pv' : 'd'
    const planText = plan.slice(0, 8).map(p => {
      const shortName = p.name.length > 30 ? p.name.substring(0, 28) + '..' : p.name
      return `:large_blue_circle: ${shortName} | ${p.stock_level} ${unit} (~${p.daysOfStock}${daysLabel}) → *${p.suggestedOrder} ${unit}*`
    }).join('\n')

    blocks.push(section(planText))

    if (plan.length > 8) {
      blocks.push(section(`_...${isFi ? 'ja' : 'och'} ${plan.length - 8} ${isFi ? 'lisää' : 'till'}_`))
    }
  }

  blocks.push(divider())
  blocks.push(context(`:link: <https://vilkas-analytics.vercel.app/inventory|${isFi ? 'Avaa Varastonäkymä' : 'Öppna Lageröversikt'}>`))

  return { blocks }
}

/**
 * Main handler (Multi-tenant)
 */
export default async function handler(req, res) {
  const authHeader = req.headers.authorization
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  console.log('Starting reorder suggestions (multi-tenant):', new Date().toISOString())

  if (!supabaseUrl || !supabaseServiceKey) {
    return res.status(500).json({ error: 'Missing Supabase credentials' })
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  // Fetch all shops
  const { data: shops, error: shopsError } = await supabase
    .from('shops')
    .select('id, name, store_id, currency, slack_webhook_url')

  if (shopsError || !shops?.length) {
    console.error('Failed to fetch shops:', shopsError?.message)
    return res.status(500).json({ error: 'No shops found' })
  }

  const results = []

  for (const shop of shops) {
    const webhookUrl = shop.slack_webhook_url || process.env.SLACK_WEBHOOK_URL
    if (!webhookUrl) {
      results.push({ shop: shop.name, skipped: true, reason: 'no webhook' })
      continue
    }

    const storeId = shop.store_id
    if (!storeId) {
      results.push({ shop: shop.name, skipped: true, reason: 'no store_id' })
      continue
    }

    try {
      console.log(`Processing reorder suggestions for ${shop.name}`)

      const products = await fetchReorderProducts(supabase, storeId)

      console.log(`${shop.name}: ${products.length} products need reordering`)

      const language = shop.currency === 'SEK' ? 'sv' : 'fi'
      const message = buildReorderSlackMessage(products, shop.name, language)
      const slackResult = await sendToSlack(webhookUrl, message)

      results.push({
        shop: shop.name,
        success: slackResult.success,
        productsCount: products.length,
        urgent: products.filter(p => p.daysOfStock <= 3).length,
        soon: products.filter(p => p.daysOfStock > 3 && p.daysOfStock <= 7).length,
        plan: products.filter(p => p.daysOfStock > 7).length,
        slackError: slackResult.error || null
      })
    } catch (error) {
      console.error(`Reorder error for ${shop.name}:`, error)
      results.push({ shop: shop.name, success: false, error: error.message })
    }
  }

  return res.status(200).json({ success: true, results })
}

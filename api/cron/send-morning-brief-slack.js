/**
 * Morning Brief - Unified Slack Report (Multi-tenant)
 *
 * Runs daily at 06:15 UTC
 * AFTER sync-data (06:00) so all data is fresh
 *
 * Sections:
 * 1. Yesterday's sales & orders + YoY comparison
 * 2. 7-day rolling totals + YoY comparison
 * 3. Stock warnings (out of stock + critical)
 * 4. New vs returning customers
 * 5. New orders since yesterday 16:00
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

// Bundle/package products don't have their own stock (composed of other products)
const BUNDLE_NAME_PATTERN = /paket|paketet|bundle/i
function isBundle(product) {
  return BUNDLE_NAME_PATTERN.test(product?.name || '')
}

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

export const config = {
  maxDuration: 120,
}

function getCurrencySymbol(currency) {
  return currency === 'SEK' ? 'kr' : '€'
}

function getLanguage(currency) {
  return currency === 'SEK' ? 'sv' : 'fi'
}

// ============================================
// 1. YESTERDAY'S SALES + YoY
// ============================================
async function fetchDailySalesYoY(supabase, storeId, yesterdayStr) {
  const lastYearDate = new Date(yesterdayStr)
  lastYearDate.setFullYear(lastYearDate.getFullYear() - 1)
  const lastYearStr = lastYearDate.toISOString().split('T')[0]

  const [current, lastYear] = await Promise.all([
    supabase
      .from('v_daily_sales')
      .select('total_revenue, order_count')
      .eq('store_id', storeId)
      .eq('sale_date', yesterdayStr)
      .maybeSingle(),
    supabase
      .from('v_daily_sales')
      .select('total_revenue, order_count')
      .eq('store_id', storeId)
      .eq('sale_date', lastYearStr)
      .maybeSingle()
  ])

  return {
    revenue: current.data?.total_revenue || 0,
    orders: current.data?.order_count || 0,
    lyRevenue: lastYear.data?.total_revenue || 0,
    lyOrders: lastYear.data?.order_count || 0,
    lastYearDate: lastYearStr
  }
}

// ============================================
// 2. 7-DAY ROLLING TOTALS + YoY
// ============================================
async function fetchWeeklyTotalsYoY(supabase, storeId, yesterdayStr) {
  const weekEnd = new Date(yesterdayStr)
  const weekStart = new Date(yesterdayStr)
  weekStart.setDate(weekStart.getDate() - 6)
  const weekStartStr = weekStart.toISOString().split('T')[0]

  // Same 7-day window last year
  const lyWeekEnd = new Date(weekEnd)
  lyWeekEnd.setFullYear(lyWeekEnd.getFullYear() - 1)
  const lyWeekStart = new Date(weekStart)
  lyWeekStart.setFullYear(lyWeekStart.getFullYear() - 1)
  const lyWeekStartStr = lyWeekStart.toISOString().split('T')[0]
  const lyWeekEndStr = lyWeekEnd.toISOString().split('T')[0]

  const [current, lastYear] = await Promise.all([
    supabase
      .from('v_daily_sales')
      .select('total_revenue, order_count')
      .eq('store_id', storeId)
      .gte('sale_date', weekStartStr)
      .lte('sale_date', yesterdayStr),
    supabase
      .from('v_daily_sales')
      .select('total_revenue, order_count')
      .eq('store_id', storeId)
      .gte('sale_date', lyWeekStartStr)
      .lte('sale_date', lyWeekEndStr)
  ])

  const sum = (rows) => ({
    revenue: rows?.reduce((s, d) => s + (d.total_revenue || 0), 0) || 0,
    orders: rows?.reduce((s, d) => s + (d.order_count || 0), 0) || 0
  })

  return {
    ...sum(current.data),
    ly: sum(lastYear.data),
    periodStart: weekStartStr
  }
}

// ============================================
// 3. STOCK WARNINGS
// ============================================
async function fetchStockWarnings(supabase, storeId) {
  const { data: products } = await supabase
    .from('products')
    .select('product_number, name, stock_level')
    .eq('store_id', storeId)
    .eq('for_sale', true)
    .not('stock_level', 'is', null)
    .lte('stock_level', 3)

  if (!products || products.length === 0) return { outOfStock: 0, criticalLow: 0, topItems: [] }

  const ninetyDaysAgo = new Date()
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90)

  const { data: orders } = await supabase
    .from('orders')
    .select('id')
    .eq('store_id', storeId)
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

  const topItems = activeProducts.slice(0, 5).map(p => {
    const shortName = p.name.length > 30 ? p.name.substring(0, 28) + '..' : p.name
    const emoji = p.stock_level <= 0 ? ':red_circle:' : ':warning:'
    const stockText = p.stock_level <= 0 ? 'loppu' : `${p.stock_level} kpl (~${p.daysLeft}pv)`
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
// 4. NEW VS RETURNING CUSTOMERS
// ============================================
async function fetchCustomerMetrics(supabase, storeId, yesterdayStr) {
  const { data: yesterdayOrders } = await supabase
    .from('orders')
    .select('customer_id')
    .eq('store_id', storeId)
    .neq('status', 'cancelled')
    .gte('creation_date', `${yesterdayStr}T00:00:00`)
    .lte('creation_date', `${yesterdayStr}T23:59:59`)

  if (!yesterdayOrders || yesterdayOrders.length === 0) {
    return { newCustomers: 0, returningCustomers: 0, total: 0 }
  }

  const customerIds = [...new Set(yesterdayOrders.map(o => o.customer_id).filter(Boolean))]

  if (customerIds.length === 0) {
    return { newCustomers: 0, returningCustomers: 0, total: 0 }
  }

  // Find which of yesterday's customers have ordered before
  const { data: priorOrders } = await supabase
    .from('orders')
    .select('customer_id')
    .eq('store_id', storeId)
    .neq('status', 'cancelled')
    .lt('creation_date', `${yesterdayStr}T00:00:00`)
    .in('customer_id', customerIds)

  const returningIds = new Set(priorOrders?.map(o => o.customer_id) || [])
  const returningCustomers = customerIds.filter(id => returningIds.has(id)).length
  const newCustomers = customerIds.length - returningCustomers

  return { newCustomers, returningCustomers, total: customerIds.length }
}

// ============================================
// 5. NEW ORDERS SINCE 16:00
// ============================================
async function fetchNewOrders(supabase, storeId) {
  const now = new Date()
  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  yesterday.setUTCHours(14, 0, 0, 0) // ~16:00 Finnish time (EET = UTC+2)

  const { data: orders } = await supabase
    .from('orders')
    .select('order_number, creation_date, grand_total, billing_company, billing_city')
    .eq('store_id', storeId)
    .neq('status', 'cancelled')
    .gte('creation_date', yesterday.toISOString())
    .order('grand_total', { ascending: false })

  return orders || []
}

// ============================================
// BUILD MESSAGE
// ============================================
function buildMorningBrief(dailyData, weeklyData, stockData, customerData, ordersData, yesterdayStr, shopName, currency) {
  const yesterdayDate = new Date(yesterdayStr)
  const lang = getLanguage(currency)
  const weekday = getWeekdayName(yesterdayDate, lang)
  const cs = getCurrencySymbol(currency)

  const blocks = [
    header(`:sunrise: Aamubrief ${shopName} ${yesterdayStr} (${weekday})`)
  ]

  // --- SECTION 1: Yesterday's Sales + YoY ---
  blocks.push(divider())
  blocks.push(section(':chart_with_upwards_trend: *Eilisen myynti*'))

  const revYoY = calculateChange(dailyData.revenue, dailyData.lyRevenue)
  const ordYoY = calculateChange(dailyData.orders, dailyData.lyOrders)
  const revYoYFmt = formatChange(revYoY)
  const ordYoYFmt = formatChange(ordYoY)

  const revYoYText = dailyData.lyRevenue > 0
    ? `\n_Viime vuosi: ${formatNumber(Math.round(dailyData.lyRevenue))} ${cs}_ ${revYoYFmt.emoji} ${revYoYFmt.text}`
    : ''
  const ordYoYText = dailyData.lyOrders > 0
    ? `\n_Viime vuosi: ${formatNumber(dailyData.lyOrders)} kpl_ ${ordYoYFmt.emoji} ${ordYoYFmt.text}`
    : ''

  blocks.push(sectionFields([
    `*Myynti*\n${formatNumber(Math.round(dailyData.revenue))} ${cs}${revYoYText}`,
    `*Tilaukset*\n${dailyData.orders} kpl${ordYoYText}`
  ]))

  // --- SECTION 2: 7-day Rolling Totals + YoY ---
  blocks.push(divider())

  const periodStartDate = new Date(weeklyData.periodStart)
  const periodStartDisplay = `${periodStartDate.getDate()}.${periodStartDate.getMonth() + 1}.`
  const periodEndDate = new Date(yesterdayStr)
  const periodEndDisplay = `${periodEndDate.getDate()}.${periodEndDate.getMonth() + 1}.`

  blocks.push(section(`:bar_chart: *7pv yhteensä* (${periodStartDisplay}\u2013${periodEndDisplay})`))

  const weekRevYoY = calculateChange(weeklyData.revenue, weeklyData.ly.revenue)
  const weekOrdYoY = calculateChange(weeklyData.orders, weeklyData.ly.orders)
  const weekRevFmt = formatChange(weekRevYoY)
  const weekOrdFmt = formatChange(weekOrdYoY)

  const weekRevYoYText = weeklyData.ly.revenue > 0
    ? `\n_Viime vuosi: ${formatNumber(Math.round(weeklyData.ly.revenue))} ${cs}_ ${weekRevFmt.emoji} ${weekRevFmt.text}`
    : ''
  const weekOrdYoYText = weeklyData.ly.orders > 0
    ? `\n_Viime vuosi: ${formatNumber(weeklyData.ly.orders)} kpl_ ${weekOrdFmt.emoji} ${weekOrdFmt.text}`
    : ''

  blocks.push(sectionFields([
    `*Myynti*\n${formatNumber(Math.round(weeklyData.revenue))} ${cs}${weekRevYoYText}`,
    `*Tilaukset*\n${weeklyData.orders} kpl${weekOrdYoYText}`
  ]))

  // --- SECTION 3: Stock Warnings ---
  if (stockData.outOfStock > 0 || stockData.criticalLow > 0) {
    blocks.push(divider())

    const stockParts = []
    if (stockData.outOfStock > 0) stockParts.push(`:x: ${stockData.outOfStock} loppu`)
    if (stockData.criticalLow > 0) stockParts.push(`:warning: ${stockData.criticalLow} kriittinen`)

    blocks.push(section(
      `:rotating_light: *Varastovaroitus*\n${stockParts.join(' | ')}`
    ))

    if (stockData.topItems.length > 0) {
      blocks.push(section(stockData.topItems.join('\n')))
    }
  }

  // --- SECTION 4: Customer Metrics ---
  if (customerData.total > 0) {
    blocks.push(divider())
    blocks.push(section(
      `:busts_in_silhouette: *Eilisen asiakkaat*\n` +
      `:new: ${customerData.newCustomers} uutta | :repeat: ${customerData.returningCustomers} palaavaa`
    ))
  }

  // --- SECTION 5: New Orders since 16:00 ---
  blocks.push(divider())
  if (ordersData.length === 0) {
    blocks.push(section(`:package: *Tilaukset klo 16 jälkeen*\n:zzz: Ei uusia tilauksia`))
  } else {
    const totalValue = ordersData.reduce((sum, o) => sum + (o.grand_total || 0), 0)
    blocks.push(section(
      `:package: *Tilaukset klo 16 jälkeen*\n` +
      `*${ordersData.length} tilausta* yhteensä *${formatNumber(Math.round(totalValue))} ${cs}*`
    ))

    const orderLines = ordersData.slice(0, 5).map(o => {
      const customer = o.billing_company || o.billing_city || ''
      const shortCustomer = customer.length > 20 ? customer.substring(0, 18) + '..' : customer
      return `\`#${o.order_number}\` ${formatNumber(Math.round(o.grand_total))} ${cs} - ${shortCustomer}`
    })
    blocks.push(section(orderLines.join('\n')))

    if (ordersData.length > 5) {
      blocks.push(context(`_...ja ${ordersData.length - 5} lisää_`))
    }
  }

  // --- FOOTER ---
  blocks.push(divider())
  blocks.push(context(`:link: <https://vilkas-analytics.vercel.app|Avaa Vilkas Analytics>`))

  return { blocks }
}

// ============================================
// MAIN HANDLER (Multi-tenant)
// ============================================
export default async function handler(req, res) {
  const authHeader = req.headers.authorization
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  console.log('Starting morning brief (multi-tenant):', new Date().toISOString())

  if (!supabaseUrl || !supabaseServiceKey) {
    return res.status(500).json({ error: 'Missing Supabase credentials' })
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  // Fetch all shops with their store_id and webhook
  const { data: shops, error: shopsError } = await supabase
    .from('shops')
    .select('id, name, store_id, currency, slack_webhook_url')

  if (shopsError || !shops?.length) {
    console.error('Failed to fetch shops:', shopsError?.message)
    return res.status(500).json({ error: 'No shops found' })
  }

  const now = new Date()
  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  const yesterdayStr = yesterday.toISOString().split('T')[0]

  const results = []

  for (const shop of shops) {
    const webhookUrl = shop.slack_webhook_url || process.env.SLACK_WEBHOOK_URL
    if (!webhookUrl) {
      console.log(`Skipping ${shop.name}: no Slack webhook configured`)
      results.push({ shop: shop.name, skipped: true, reason: 'no webhook' })
      continue
    }

    const storeId = shop.store_id
    if (!storeId) {
      console.log(`Skipping ${shop.name}: no store_id`)
      results.push({ shop: shop.name, skipped: true, reason: 'no store_id' })
      continue
    }

    try {
      console.log(`Processing morning brief for ${shop.name} (store: ${storeId})`)

      const [dailyData, weeklyData, stockData, customerData, ordersData] = await Promise.all([
        fetchDailySalesYoY(supabase, storeId, yesterdayStr),
        fetchWeeklyTotalsYoY(supabase, storeId, yesterdayStr),
        fetchStockWarnings(supabase, storeId),
        fetchCustomerMetrics(supabase, storeId, yesterdayStr),
        fetchNewOrders(supabase, storeId)
      ])

      console.log(`${shop.name}: rev=${dailyData.revenue}, orders=${dailyData.orders}, stock=${stockData.outOfStock} OOS, customers=${customerData.total} (${customerData.newCustomers} new)`)

      const message = buildMorningBrief(dailyData, weeklyData, stockData, customerData, ordersData, yesterdayStr, shop.name, shop.currency)
      const slackResult = await sendToSlack(webhookUrl, message)

      results.push({
        shop: shop.name,
        success: slackResult.success,
        revenue: dailyData.revenue,
        orders: dailyData.orders,
        stockWarnings: stockData.outOfStock + stockData.criticalLow,
        newCustomers: customerData.newCustomers,
        returningCustomers: customerData.returningCustomers,
        slackError: slackResult.error || null
      })
    } catch (error) {
      console.error(`Morning brief error for ${shop.name}:`, error)
      results.push({ shop: shop.name, success: false, error: error.message })
    }
  }

  return res.status(200).json({ success: true, results })
}

/**
 * Weekly Slack Report Cron Job (Multi-tenant)
 *
 * Runs every Monday at 07:30 UTC (09:30 Finland time)
 * Sends weekly analysis summary to each shop's Slack channel
 *
 * Content:
 * - Growth Engine Index (0-100) + change
 * - AI-generated summary
 * - Top 5 key points (positive/negative/warning)
 * - Top 3 action recommendations
 */

import { createClient } from '@supabase/supabase-js'
import {
  sendToSlack,
  formatNumber,
  getISOWeek,
  header,
  section,
  sectionFields,
  context,
  divider
} from '../lib/slack.js'

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

export const config = {
  maxDuration: 120,
}

/**
 * Fetch weekly report data for a specific shop
 */
async function fetchWeeklyReportData(supabase, storeId, shopId, week, year) {
  // 1. Weekly analysis (from weekly_analyses table) - uses shop_id
  const { data: analysis } = await supabase
    .from('weekly_analyses')
    .select('*')
    .eq('store_id', shopId)
    .eq('week_number', week)
    .eq('year', year)
    .maybeSingle()

  // 2. Growth Engine snapshots (latest 2 for comparison) - uses store_id
  const { data: snapshots } = await supabase
    .from('growth_engine_snapshots')
    .select('*')
    .eq('store_id', storeId)
    .order('period_end', { ascending: false })
    .limit(2)

  // 3. Action recommendations - uses shop_id
  const { data: recommendations } = await supabase
    .from('action_recommendations')
    .select('recommendations')
    .eq('store_id', shopId)
    .eq('week_number', week)
    .eq('year', year)
    .maybeSingle()

  // Try previous week if current week has no analysis
  let weekAnalysis = analysis?.analysis_content
  let weekRecommendations = recommendations?.recommendations

  if (!weekAnalysis) {
    const prevWeek = week === 1 ? 52 : week - 1
    const prevYear = week === 1 ? year - 1 : year

    const { data: prevAnalysis } = await supabase
      .from('weekly_analyses')
      .select('*')
      .eq('store_id', shopId)
      .eq('week_number', prevWeek)
      .eq('year', prevYear)
      .maybeSingle()

    weekAnalysis = prevAnalysis?.analysis_content

    if (!weekRecommendations) {
      const { data: prevRecs } = await supabase
        .from('action_recommendations')
        .select('recommendations')
        .eq('store_id', shopId)
        .eq('week_number', prevWeek)
        .eq('year', prevYear)
        .maybeSingle()

      weekRecommendations = prevRecs?.recommendations
    }
  }

  return {
    analysis: weekAnalysis || null,
    currentSnapshot: snapshots?.[0] || null,
    previousSnapshot: snapshots?.[1] || null,
    recommendations: weekRecommendations || []
  }
}

function getBulletEmoji(type) {
  const emojis = { positive: ':white_check_mark:', negative: ':x:', warning: ':warning:', info: ':information_source:' }
  return emojis[type] || ':small_blue_diamond:'
}

function getImpactEmoji(impact) {
  const emojis = { high: ':fire:', medium: ':zap:', low: ':bulb:' }
  return emojis[impact] || ':bulb:'
}

function getIndexLevelEmoji(level) {
  const emojis = { excellent: ':star:', good: ':white_check_mark:', needs_work: ':warning:', poor: ':x:' }
  return emojis[level] || ':question:'
}

/**
 * Build Slack message blocks for weekly report
 */
function buildWeeklySlackMessage(data, week, year, shopName) {
  const { analysis, currentSnapshot, previousSnapshot, recommendations } = data

  const currentIndex = currentSnapshot?.overall_index
  const previousIndex = previousSnapshot?.overall_index
  const indexChange = (currentIndex !== null && previousIndex !== null)
    ? currentIndex - previousIndex
    : null

  const indexEmoji = indexChange !== null
    ? (indexChange >= 0 ? ':arrow_up:' : ':arrow_down:')
    : ''

  const levelEmoji = getIndexLevelEmoji(currentSnapshot?.index_level)

  const indexDisplay = currentIndex !== null
    ? `\`${formatNumber(currentIndex, 0)}/100\``
    : 'N/A'
  const indexChangeDisplay = indexChange !== null
    ? ` (${indexChange >= 0 ? '+' : ''}${formatNumber(indexChange, 0)} ${indexEmoji})`
    : ''

  const summary = analysis?.summary || 'Ei yhteenvetoa tälle viikolle.'

  const bullets = analysis?.bullets || []
  const bulletText = bullets.slice(0, 5).map(b => {
    const emoji = getBulletEmoji(b.type)
    return `${emoji} ${b.text}`
  }).join('\n') || 'Ei yksityiskohtia saatavilla.'

  const topRecs = (recommendations || []).slice(0, 3)
  const recsText = topRecs.length > 0
    ? topRecs.map((rec, i) => {
        const emoji = getImpactEmoji(rec.impact)
        return `${i + 1}. ${emoji} *${rec.title}*\n    _${rec.why || rec.description || ''}_`
      }).join('\n')
    : 'Ei suosituksia saatavilla.'

  const blocks = [
    header(`:calendar: Viikkoraportti ${shopName} vk${week}/${year}`),

    section(`*Growth Engine -indeksi* ${levelEmoji}\n${indexDisplay}${indexChangeDisplay}`),

    divider(),

    section(`*Yhteenveto*\n${summary}`),

    section(`*Tärkeimmät havainnot*\n${bulletText}`),

    divider(),

    section(`*:dart: Top 3 toimenpiteet*\n${recsText}`),

    divider(),

    context(`:link: <https://vilkas-analytics.vercel.app|Avaa Vilkas Analytics> | <https://vilkas-analytics.vercel.app/insights|Katso koko analyysi>`)
  ]

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

  console.log('Starting weekly Slack report (multi-tenant):', new Date().toISOString())

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

  const now = new Date()
  const { week, year } = getISOWeek(now)

  const results = []

  for (const shop of shops) {
    const webhookUrl = shop.slack_webhook_url || process.env.SLACK_WEBHOOK_URL
    if (!webhookUrl) {
      results.push({ shop: shop.name, skipped: true, reason: 'no webhook' })
      continue
    }

    const storeId = shop.store_id
    const shopId = shop.id
    if (!storeId) {
      results.push({ shop: shop.name, skipped: true, reason: 'no store_id' })
      continue
    }

    try {
      console.log(`Processing weekly report for ${shop.name}`)

      const reportData = await fetchWeeklyReportData(supabase, storeId, shopId, week, year)

      console.log(`${shop.name} weekly: analysis=${!!reportData.analysis}, snapshot=${!!reportData.currentSnapshot}, recs=${reportData.recommendations?.length || 0}`)

      const message = buildWeeklySlackMessage(reportData, week, year, shop.name)
      const slackResult = await sendToSlack(webhookUrl, message)

      results.push({
        shop: shop.name,
        success: slackResult.success,
        week,
        year,
        hasAnalysis: !!reportData.analysis,
        hasSnapshot: !!reportData.currentSnapshot,
        slackError: slackResult.error || null
      })
    } catch (error) {
      console.error(`Weekly report error for ${shop.name}:`, error)
      results.push({ shop: shop.name, success: false, error: error.message })
    }
  }

  return res.status(200).json({ success: true, week, year, results })
}

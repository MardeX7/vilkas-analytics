/**
 * Weekly Slack Report Cron Job
 *
 * Runs every Monday at 07:30 UTC (09:30 Finland time)
 * Sends weekly analysis summary to #billackering-eu Slack channel
 *
 * Content:
 * - Growth Engine Index (0-100) + change
 * - AI-generated summary
 * - Top 5 key points (positive/negative/warning)
 * - Top 3 action recommendations
 *
 * ID Mapping (Billackering.eu):
 *   STORE_ID = a28836f6-9487-4b67-9194-e907eaf94b69 (growth_engine_snapshots)
 *   SHOP_ID = 3b93e9b1-d64c-4686-a14a-bec535495f71 (weekly_analyses, action_recommendations)
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

// Configuration
const STORE_ID = 'a28836f6-9487-4b67-9194-e907eaf94b69'
const SHOP_ID = '3b93e9b1-d64c-4686-a14a-bec535495f71'
const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

export const config = {
  maxDuration: 60, // 60 seconds max
}

/**
 * Fetch weekly report data
 */
async function fetchWeeklyReportData(supabase, week, year) {
  // 1. Weekly analysis (from weekly_analyses table) - uses SHOP_ID
  const { data: analysis } = await supabase
    .from('weekly_analyses')
    .select('*')
    .eq('store_id', SHOP_ID)
    .eq('week_number', week)
    .eq('year', year)
    .maybeSingle()

  // 2. Growth Engine snapshots (latest 2 for comparison) - uses STORE_ID
  const { data: snapshots } = await supabase
    .from('growth_engine_snapshots')
    .select('*')
    .eq('store_id', STORE_ID)
    .order('period_end', { ascending: false })
    .limit(2)

  // 3. Action recommendations - uses SHOP_ID
  const { data: recommendations } = await supabase
    .from('action_recommendations')
    .select('recommendations')
    .eq('store_id', SHOP_ID)
    .eq('week_number', week)
    .eq('year', year)
    .maybeSingle()

  // Try previous week if current week has no analysis
  let weekAnalysis = analysis?.analysis_content
  let weekRecommendations = recommendations?.recommendations

  if (!weekAnalysis) {
    // Try previous week
    const prevWeek = week === 1 ? 52 : week - 1
    const prevYear = week === 1 ? year - 1 : year

    const { data: prevAnalysis } = await supabase
      .from('weekly_analyses')
      .select('*')
      .eq('store_id', SHOP_ID)
      .eq('week_number', prevWeek)
      .eq('year', prevYear)
      .maybeSingle()

    weekAnalysis = prevAnalysis?.analysis_content

    if (!weekRecommendations) {
      const { data: prevRecs } = await supabase
        .from('action_recommendations')
        .select('recommendations')
        .eq('store_id', SHOP_ID)
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

/**
 * Get emoji for bullet type
 */
function getBulletEmoji(type) {
  const emojis = {
    positive: ':white_check_mark:',
    negative: ':x:',
    warning: ':warning:',
    info: ':information_source:'
  }
  return emojis[type] || ':small_blue_diamond:'
}

/**
 * Get emoji for impact level
 */
function getImpactEmoji(impact) {
  const emojis = {
    high: ':fire:',
    medium: ':zap:',
    low: ':bulb:'
  }
  return emojis[impact] || ':bulb:'
}

/**
 * Get emoji for index level
 */
function getIndexLevelEmoji(level) {
  const emojis = {
    excellent: ':star:',
    good: ':white_check_mark:',
    needs_work: ':warning:',
    poor: ':x:'
  }
  return emojis[level] || ':question:'
}

/**
 * Build Slack message blocks for weekly report
 */
function buildWeeklySlackMessage(data, week, year) {
  const { analysis, currentSnapshot, previousSnapshot, recommendations } = data

  // Calculate index change
  const currentIndex = currentSnapshot?.overall_index
  const previousIndex = previousSnapshot?.overall_index
  const indexChange = (currentIndex !== null && previousIndex !== null)
    ? currentIndex - previousIndex
    : null

  const indexEmoji = indexChange !== null
    ? (indexChange >= 0 ? ':arrow_up:' : ':arrow_down:')
    : ''

  const levelEmoji = getIndexLevelEmoji(currentSnapshot?.index_level)

  // Build index display
  const indexDisplay = currentIndex !== null
    ? `\`${formatNumber(currentIndex, 0)}/100\``
    : 'N/A'
  const indexChangeDisplay = indexChange !== null
    ? ` (${indexChange >= 0 ? '+' : ''}${formatNumber(indexChange, 0)} ${indexEmoji})`
    : ''

  // Build summary
  const summary = analysis?.summary || 'Ingen sammanfattning tillganglig for denna vecka.'

  // Build analysis bullets (top 5)
  const bullets = analysis?.bullets || []
  const bulletText = bullets.slice(0, 5).map(b => {
    const emoji = getBulletEmoji(b.type)
    return `${emoji} ${b.text}`
  }).join('\n') || 'Inga detaljer tillgangliga.'

  // Build recommendations (top 3)
  const topRecs = (recommendations || []).slice(0, 3)
  const recsText = topRecs.length > 0
    ? topRecs.map((rec, i) => {
        const emoji = getImpactEmoji(rec.impact)
        return `${i + 1}. ${emoji} *${rec.title}*\n    _${rec.why || rec.description || ''}_`
      }).join('\n')
    : 'Inga rekommendationer tillgangliga.'

  const blocks = [
    header(`:calendar: Veckorapport v${week}/${year}`),

    // Growth Engine Index
    section(`*Growth Engine Index* ${levelEmoji}\n${indexDisplay}${indexChangeDisplay}`),

    divider(),

    // Summary
    section(`*Sammanfattning*\n${summary}`),

    // Key points
    section(`*Viktiga punkter*\n${bulletText}`),

    divider(),

    // Top 3 Recommendations
    section(`*:dart: Topp 3 atgarder*\n${recsText}`),

    divider(),

    context(`:link: <https://vilkas-analytics.vercel.app|Oppna Vilkas Analytics> | <https://vilkas-analytics.vercel.app/insights|Se full analys>`)
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

  console.log('Starting weekly Slack report:', new Date().toISOString())

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Missing Supabase credentials')
    return res.status(500).json({ error: 'Missing Supabase credentials' })
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  // Get current week number
  const now = new Date()
  const { week, year } = getISOWeek(now)

  try {
    // Fetch data
    const reportData = await fetchWeeklyReportData(supabase, week, year)

    console.log('Weekly report data:', JSON.stringify({
      week,
      year,
      hasAnalysis: !!reportData.analysis,
      hasSnapshot: !!reportData.currentSnapshot,
      recommendationsCount: reportData.recommendations?.length || 0
    }, null, 2))

    // Build Slack message
    const message = buildWeeklySlackMessage(reportData, week, year)

    // Send to Slack
    const slackResult = await sendToSlack(SLACK_WEBHOOK_URL, message)

    if (!slackResult.success) {
      console.error('Failed to send Slack message:', slackResult.error)
      return res.status(200).json({
        success: false,
        week,
        year,
        data: {
          hasAnalysis: !!reportData.analysis,
          hasSnapshot: !!reportData.currentSnapshot,
          recommendationsCount: reportData.recommendations?.length || 0
        },
        slackError: slackResult.error
      })
    }

    console.log('Weekly Slack report sent successfully')

    return res.status(200).json({
      success: true,
      week,
      year,
      data: {
        hasAnalysis: !!reportData.analysis,
        hasSnapshot: !!reportData.currentSnapshot,
        indexLevel: reportData.currentSnapshot?.index_level,
        overallIndex: reportData.currentSnapshot?.overall_index,
        recommendationsCount: reportData.recommendations?.length || 0
      },
      slackSent: true
    })

  } catch (error) {
    console.error('Weekly report error:', error)
    return res.status(500).json({
      error: error.message,
      week,
      year
    })
  }
}

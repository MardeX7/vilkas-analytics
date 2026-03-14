/**
 * Generate Weekly Analyses Cron Job (Multi-tenant)
 *
 * Runs every Monday at 07:15 UTC
 * AFTER save-growth-snapshot (07:00) and BEFORE send-weekly-slack (07:30)
 *
 * Generates AI analysis + action recommendations for each shop's previous week,
 * so that the weekly Slack report has content to display.
 */

import OpenAI from 'openai'
import { createClient } from '@supabase/supabase-js'
import { getISOWeek, fetchContextData, buildSystemPrompt, buildUserPrompt } from '../generate-analysis.js'

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

export const config = {
  maxDuration: 300,
}

/**
 * Calculate ISO week date range (Monday to Sunday)
 */
function getWeekDateRange(weekNumber, year) {
  const jan1 = new Date(year, 0, 1)
  const daysToMonday = (jan1.getDay() + 6) % 7
  const firstMonday = new Date(jan1)
  firstMonday.setDate(jan1.getDate() - daysToMonday + (weekNumber - 1) * 7)
  const weekEnd = new Date(firstMonday)
  weekEnd.setDate(firstMonday.getDate() + 6)
  return {
    startDate: firstMonday.toISOString().split('T')[0],
    endDate: weekEnd.toISOString().split('T')[0]
  }
}

export default async function handler(req, res) {
  const authHeader = req.headers.authorization
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  console.log('Starting weekly analysis generation (multi-tenant):', new Date().toISOString())

  if (!supabaseUrl || !supabaseServiceKey) {
    return res.status(500).json({ error: 'Missing Supabase credentials' })
  }

  if (!process.env.DEEPSEEK_API_KEY) {
    return res.status(500).json({ error: 'Missing DEEPSEEK_API_KEY' })
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey)
  const deepseek = new OpenAI({
    apiKey: process.env.DEEPSEEK_API_KEY,
    baseURL: 'https://api.deepseek.com'
  })

  // Fetch all shops
  const { data: shops, error: shopsError } = await supabase
    .from('shops')
    .select('id, name, store_id, currency')

  if (shopsError || !shops?.length) {
    console.error('Failed to fetch shops:', shopsError?.message)
    return res.status(500).json({ error: 'No shops found' })
  }

  // Determine the previous week (the one just completed)
  const now = new Date()
  const lastWeekDate = new Date(now)
  lastWeekDate.setDate(now.getDate() - 7)
  const { week: targetWeek, year: targetYear } = getISOWeek(lastWeekDate)
  const dateRange = getWeekDateRange(targetWeek, targetYear)

  console.log(`Generating analyses for week ${targetWeek}/${targetYear} (${dateRange.startDate} - ${dateRange.endDate})`)

  const results = []

  for (const shop of shops) {
    const storeId = shop.store_id
    const shopId = shop.id
    if (!storeId) {
      results.push({ shop: shop.name, skipped: true, reason: 'no store_id' })
      continue
    }

    try {
      // Check if analysis already exists for this week
      const { data: existing } = await supabase
        .from('weekly_analyses')
        .select('id')
        .eq('store_id', shopId)
        .eq('year', targetYear)
        .eq('week_number', targetWeek)
        .maybeSingle()

      if (existing) {
        console.log(`${shop.name}: analysis already exists for week ${targetWeek}, skipping`)
        results.push({ shop: shop.name, skipped: true, reason: 'already exists' })
        continue
      }

      console.log(`${shop.name}: generating analysis...`)

      const language = shop.currency === 'SEK' ? 'sv' : 'fi'
      const currencySymbol = shop.currency === 'SEK' ? 'kr' : '€'

      // Fetch context data
      const contextData = await fetchContextData(dateRange, storeId, shopId)

      // Build prompts
      const systemPrompt = buildSystemPrompt(language, false)
      const userPrompt = buildUserPrompt(contextData, targetWeek, targetYear, language, false, currencySymbol)

      // Call Deepseek
      const response = await deepseek.chat.completions.create({
        model: 'deepseek-chat',
        max_tokens: 2000,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ]
      })

      // Parse response
      let analysisContent
      try {
        let responseText = response.choices[0].message.content
        responseText = responseText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '')
        const jsonMatch = responseText.match(/\{[\s\S]*\}/)
        if (jsonMatch) {
          analysisContent = JSON.parse(jsonMatch[0])
        } else {
          analysisContent = {
            summary: responseText.substring(0, 200),
            bullets: [{ type: 'info', text: responseText }],
            full_analysis: responseText,
            key_metrics: null
          }
        }
      } catch (parseError) {
        console.error(`${shop.name}: failed to parse AI response:`, parseError.message)
        const fallbackText = response.choices[0].message.content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '')
        analysisContent = {
          summary: fallbackText.substring(0, 200),
          bullets: [{ type: 'info', text: fallbackText }],
          full_analysis: fallbackText,
          key_metrics: null
        }
      }

      analysisContent.language = language

      // Save analysis
      const { error: saveError } = await supabase
        .from('weekly_analyses')
        .insert({
          store_id: shopId,
          year: targetYear,
          week_number: targetWeek,
          month_number: null,
          analysis_content: analysisContent,
          model_used: 'deepseek-chat',
          tokens_used: response.usage?.completion_tokens || null,
          generated_at: new Date().toISOString()
        })

      if (saveError) {
        console.error(`${shop.name}: failed to save analysis:`, saveError.message)
        results.push({ shop: shop.name, success: false, error: saveError.message })
        continue
      }

      // Save action recommendations if generated
      if (analysisContent.action_recommendations?.length > 0) {
        const { error: recError } = await supabase
          .from('action_recommendations')
          .insert({
            store_id: shopId,
            year: targetYear,
            week_number: targetWeek,
            month_number: null,
            recommendations: analysisContent.action_recommendations
          })
        if (recError) console.error(`${shop.name}: failed to save recommendations:`, recError.message)
      }

      console.log(`${shop.name}: analysis generated successfully`)
      results.push({
        shop: shop.name,
        success: true,
        hasSummary: !!analysisContent.summary,
        bulletCount: analysisContent.bullets?.length || 0,
        recCount: analysisContent.action_recommendations?.length || 0
      })

    } catch (error) {
      console.error(`${shop.name} analysis error:`, error.message)
      results.push({ shop: shop.name, success: false, error: error.message })
    }
  }

  return res.status(200).json({
    success: true,
    week: targetWeek,
    year: targetYear,
    results
  })
}

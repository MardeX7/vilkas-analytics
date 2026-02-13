/**
 * API: Generate Action Recommendations
 *
 * POST /api/generate-recommendations
 *
 * Generoi AI-pohjaiset toimenpidesuositukset perustuen
 * kaupan dataan (myynti, varasto, SEO, trendit).
 *
 * Käyttää Deepseek API:a.
 */

import OpenAI from 'openai'
import { createClient } from '@supabase/supabase-js'

// Initialize clients
const deepseek = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY,
  baseURL: 'https://api.deepseek.com'
})

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// Store IDs
const STORE_ID = 'a28836f6-9487-4b67-9194-e907eaf94b69'
const SHOP_ID = '3b93e9b1-d64c-4686-a14a-bec535495f71'

/**
 * Get ISO week number
 */
function getISOWeek(date) {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + 4 - (d.getDay() || 7))
  const yearStart = new Date(d.getFullYear(), 0, 1)
  const weekNumber = Math.ceil((((d - yearStart) / 86400000) + 1) / 7)
  return { week: weekNumber, year: d.getFullYear() }
}

/**
 * Fetch context data for recommendations
 */
async function fetchContextData() {
  const now = new Date()
  const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000)
  const startDate = thirtyDaysAgo.toISOString().split('T')[0]
  const endDate = now.toISOString().split('T')[0]

  // Fetch recent orders
  const { data: orders } = await supabase
    .from('orders')
    .select('id, grand_total, creation_date')
    .gte('creation_date', startDate)
    .lte('creation_date', endDate + 'T23:59:59')
    .order('creation_date', { ascending: false })
    .limit(100)

  // Fetch low stock products
  const { data: lowStock } = await supabase
    .from('products')
    .select('name, stock_level, product_number')
    .lte('stock_level', 5)
    .gt('stock_level', -1) // Only products with stock tracking
    .limit(20)

  // Fetch top GSC keywords
  const { data: gscData } = await supabase
    .from('gsc_search_analytics')
    .select('query, clicks, impressions, position')
    .eq('store_id', STORE_ID)
    .gte('date', startDate)
    .order('clicks', { ascending: false })
    .limit(20)

  // Fetch GA4 daily summary
  const { data: ga4Data } = await supabase
    .from('v_ga4_daily_summary')
    .select('*')
    .eq('store_id', STORE_ID)
    .gte('date', startDate)
    .order('date', { ascending: false })
    .limit(30)

  // Calculate metrics
  const totalRevenue = orders?.reduce((sum, o) => sum + (o.grand_total || 0), 0) || 0
  const orderCount = orders?.length || 0
  const avgOrderValue = orderCount > 0 ? totalRevenue / orderCount : 0
  const totalSessions = ga4Data?.reduce((sum, d) => sum + (d.total_sessions || 0), 0) || 0
  const conversionRate = totalSessions > 0 ? (orderCount / totalSessions) * 100 : 0

  // Out of stock count
  const outOfStock = lowStock?.filter(p => p.stock_level === 0).length || 0

  // Top and worst performing keywords
  const topKeywords = gscData?.slice(0, 5) || []
  const lowPositionKeywords = gscData?.filter(k => k.position > 20 && k.impressions > 50) || []

  return {
    period: `${startDate} - ${endDate}`,
    revenue: totalRevenue,
    orderCount,
    avgOrderValue,
    conversionRate,
    sessions: totalSessions,
    outOfStockProducts: outOfStock,
    lowStockProducts: lowStock?.length || 0,
    topKeywords,
    lowPositionKeywords: lowPositionKeywords.slice(0, 5)
  }
}

/**
 * Generate recommendations using AI
 */
async function generateRecommendations(context, language = 'fi') {
  const isFi = language === 'fi'

  const systemPrompt = isFi
    ? `Olet Emma, verkkokaupan analyytikko. Generoi 3-5 konkreettista toimenpidesuositusta perustuen annettuun dataan.

Jokainen suositus on JSON-objekti kentillä:
- id: uniikki tunniste (rec_1, rec_2, jne.)
- title: lyhyt otsikko (max 60 merkkiä)
- why: selitys miksi tämä on tärkeää (max 150 merkkiä)
- timeframe: "immediate" (heti), "short" (1-2 vko), "long" (2-4 vko)
- effort: "small" (pieni), "medium" (keskikokoinen), "large" (suuri)
- impact: "high", "medium", "low"
- metric: "sales", "margin", "conversion", "inventory", "seo"
- expected_result: mitä odotetaan tapahtuvan (max 100 merkkiä)

Priorisoi:
1. Hälyttävät ongelmat (varasto loppu, iso lasku)
2. Helppoja voittoja (quick wins)
3. Kasvumahdollisuuksia

Vastaa VAIN JSON-arrayna, ei muuta tekstiä.`
    : `Du är Emma, en e-handelsanalytiker. Generera 3-5 konkreta åtgärdsrekommendationer baserat på given data.

Varje rekommendation är ett JSON-objekt med fält:
- id: unikt ID (rec_1, rec_2, etc.)
- title: kort rubrik (max 60 tecken)
- why: förklaring varför detta är viktigt (max 150 tecken)
- timeframe: "immediate" (nu), "short" (1-2 v), "long" (2-4 v)
- effort: "small", "medium", "large"
- impact: "high", "medium", "low"
- metric: "sales", "margin", "conversion", "inventory", "seo"
- expected_result: vad som förväntas hända (max 100 tecken)

Svara ENDAST med JSON-array, ingen annan text.`

  const userPrompt = isFi
    ? `Kaupan data viimeiseltä 30 päivältä:

- Liikevaihto: ${context.revenue.toFixed(2)}€
- Tilauksia: ${context.orderCount}
- Keskiostos: ${context.avgOrderValue.toFixed(2)}€
- Konversio: ${context.conversionRate.toFixed(2)}%
- Sessioita: ${context.sessions}
- Loppu varastosta: ${context.outOfStockProducts} tuotetta
- Vähän varastossa: ${context.lowStockProducts} tuotetta

SEO:
- Top avainsanat: ${context.topKeywords.map(k => `"${k.query}" (${k.clicks} klikkiä, pos ${k.position.toFixed(1)})`).join(', ')}
- Heikot positiot: ${context.lowPositionKeywords.map(k => `"${k.query}" (pos ${k.position.toFixed(1)})`).join(', ')}

Generoi 3-5 priorisointua toimenpidesuositusta JSON-arrayna.`
    : `Butikens data senaste 30 dagar:

- Omsättning: ${context.revenue.toFixed(2)}€
- Beställningar: ${context.orderCount}
- Genomsnittlig order: ${context.avgOrderValue.toFixed(2)}€
- Konvertering: ${context.conversionRate.toFixed(2)}%
- Sessioner: ${context.sessions}
- Slut i lager: ${context.outOfStockProducts} produkter
- Lågt lager: ${context.lowStockProducts} produkter

SEO:
- Topp nyckelord: ${context.topKeywords.map(k => `"${k.query}" (${k.clicks} klick, pos ${k.position.toFixed(1)})`).join(', ')}
- Svaga positioner: ${context.lowPositionKeywords.map(k => `"${k.query}" (pos ${k.position.toFixed(1)})`).join(', ')}

Generera 3-5 prioriterade åtgärdsrekommendationer som JSON-array.`

  try {
    const response = await deepseek.chat.completions.create({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.7,
      max_tokens: 2000
    })

    const content = response.choices[0]?.message?.content || '[]'

    // Parse JSON from response
    const jsonMatch = content.match(/\[[\s\S]*\]/)
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0])
    }

    return []
  } catch (err) {
    console.error('AI generation failed:', err)
    throw err
  }
}

/**
 * Save recommendations to database
 */
async function saveRecommendations(recommendations, week, year) {
  const { data, error } = await supabase
    .from('action_recommendations')
    .upsert({
      store_id: SHOP_ID,
      week_number: week,
      year: year,
      recommendations: recommendations,
      generated_at: new Date().toISOString()
    }, {
      onConflict: 'store_id,year,week_number'
    })
    .select()
    .single()

  if (error) {
    console.error('Failed to save recommendations:', error)
    throw error
  }

  return data
}

/**
 * Main handler
 */
export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { language = 'fi' } = req.body

    // Get current week
    const { week, year } = getISOWeek(new Date())

    console.log(`Generating recommendations for week ${week}/${year}`)

    // Fetch context data
    const context = await fetchContextData()
    console.log('Context:', context)

    // Generate recommendations
    const recommendations = await generateRecommendations(context, language)
    console.log('Generated:', recommendations.length, 'recommendations')

    // Save to database
    const saved = await saveRecommendations(recommendations, week, year)

    return res.status(200).json({
      success: true,
      week,
      year,
      recommendations: saved.recommendations,
      generated_at: saved.generated_at
    })

  } catch (err) {
    console.error('Generate recommendations error:', err)
    return res.status(500).json({
      error: err.message || 'Failed to generate recommendations'
    })
  }
}

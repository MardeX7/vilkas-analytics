/**
 * API: Generate Weekly Analysis
 *
 * POST /api/generate-analysis
 *
 * Generoi viikkoanalyysin Deepseek AI:n avulla käyttäen kaikkea saatavilla olevaa dataa.
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

// Store IDs are now passed from request (multi-tenant)
// STORE_ID: orders, products, gsc_*, ga4_tokens, views (v_*)
// SHOP_ID: shops.id FK tables (weekly_analyses, growth_engine_snapshots, merchant_goals, etc.)

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
 * Fetch all context data for analysis - SAME AS EMMA!
 * NOTE: Different tables use different store IDs!
 * - STORE_ID: v_daily_sales, products, v_gsc_daily_summary, orders, etc.
 * - SHOP_ID: merchant_goals, context_notes, order_items (shops FK)
 */
async function fetchContextData(dateRange, STORE_ID, SHOP_ID) {
  const endDate = dateRange?.endDate || new Date().toISOString().split('T')[0]
  const startDate = dateRange?.startDate || new Date(new Date().setDate(new Date().getDate() - 7)).toISOString().split('T')[0]

  // Calculate YoY comparison dates (same period last year)
  const startDateObj = new Date(startDate)
  const endDateObj = new Date(endDate)
  const yoyStartDate = new Date(startDateObj)
  yoyStartDate.setFullYear(yoyStartDate.getFullYear() - 1)
  const yoyEndDate = new Date(endDateObj)
  yoyEndDate.setFullYear(yoyEndDate.getFullYear() - 1)
  const yoyStart = yoyStartDate.toISOString().split('T')[0]
  const yoyEnd = yoyEndDate.toISOString().split('T')[0]

  // Parallel fetch of all data sources - using correct ID for each table!
  const [
    salesData,
    salesDataYoY,
    growthSnapshot,
    goals,
    notes,
    gscData,
    lowStockProducts,
    topProducts,
    gscTopQueries,
    customerSegments,
    indicators,
    productRoles
  ] = await Promise.all([
    // Sales summary - current period - uses STORE_ID
    supabase
      .from('v_daily_sales')
      .select('*')
      .eq('store_id', STORE_ID)
      .gte('sale_date', startDate)
      .lte('sale_date', endDate),

    // Sales summary - YoY comparison (same period last year) - uses STORE_ID
    supabase
      .from('v_daily_sales')
      .select('*')
      .eq('store_id', STORE_ID)
      .gte('sale_date', yoyStart)
      .lte('sale_date', yoyEnd),

    // Latest Growth Engine snapshots - uses STORE_ID
    supabase
      .from('growth_engine_snapshots')
      .select('*')
      .eq('store_id', STORE_ID)
      .order('period_end', { ascending: false })
      .limit(2),

    // Active goals - uses SHOP_ID
    supabase
      .from('merchant_goals')
      .select('*')
      .eq('store_id', SHOP_ID)
      .eq('is_active', true),

    // Context notes - uses SHOP_ID
    supabase
      .from('context_notes')
      .select('*')
      .eq('store_id', SHOP_ID)
      .order('start_date', { ascending: false })
      .limit(5),

    // GSC summary - uses STORE_ID
    supabase
      .from('v_gsc_daily_summary')
      .select('*')
      .eq('store_id', STORE_ID)
      .gte('date', startDate)
      .lte('date', endDate),

    // Low stock products - uses STORE_ID
    supabase
      .from('products')
      .select('name, product_number, stock_level, price_amount')
      .eq('store_id', STORE_ID)
      .eq('for_sale', true)
      .lte('stock_level', 5)
      .order('stock_level', { ascending: true })
      .limit(20),

    // Top products - uses STORE_ID
    supabase
      .from('v_top_products')
      .select('*')
      .eq('store_id', STORE_ID)
      .gte('sale_date', startDate)
      .lte('sale_date', endDate)
      .limit(10),

    // GSC top queries - uses STORE_ID
    supabase
      .from('gsc_search_analytics')
      .select('query, clicks, impressions, ctr, position')
      .eq('store_id', STORE_ID)
      .gte('date', startDate)
      .lte('date', endDate)
      .order('clicks', { ascending: false })
      .limit(15),

    // Customer segments - uses STORE_ID
    supabase.rpc('get_customer_segment_summary', {
      p_store_id: STORE_ID,
      p_start_date: startDate,
      p_end_date: endDate
    }),

    // Latest indicators - uses STORE_ID
    supabase
      .from('indicators')
      .select('*')
      .eq('store_id', STORE_ID)
      .order('updated_at', { ascending: false })
      .limit(10),

    // Product roles - uses STORE_ID
    supabase.rpc('get_product_roles_summary', {
      p_store_id: STORE_ID,
      p_start_date: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      p_end_date: endDate
    })
  ])

  // Fetch customer analytics (B2B/B2C, LTV, return rate)
  let customerAnalytics = null
  let inventoryMetrics = null

  try {
    const { data: allOrders } = await supabase
      .from('orders')
      .select('id, billing_email, is_b2b, is_b2b_soft, creation_date, grand_total')
      .eq('store_id', STORE_ID)
      .neq('status', 'cancelled')
      .order('creation_date', { ascending: true })
      .limit(5000)

    if (allOrders && allOrders.length > 0) {
      const customerMap = {}
      allOrders.forEach(order => {
        const email = (order.billing_email || '').toLowerCase()
        if (email) {
          if (!customerMap[email]) {
            customerMap[email] = { orders: 0, revenue: 0, isB2B: order.is_b2b || order.is_b2b_soft }
          }
          customerMap[email].orders++
          customerMap[email].revenue += order.grand_total || 0
        }
      })

      const customers = Object.values(customerMap)
      const b2bCustomers = customers.filter(c => c.isB2B)
      const b2cCustomers = customers.filter(c => !c.isB2B)
      const returningCust = customers.filter(c => c.orders > 1)

      const b2bOrders = allOrders.filter(o => o.is_b2b || o.is_b2b_soft)
      const b2cOrders = allOrders.filter(o => !o.is_b2b && !o.is_b2b_soft)
      const b2bRevenue = b2bOrders.reduce((sum, o) => sum + (o.grand_total || 0), 0)
      const b2cRevenue = b2cOrders.reduce((sum, o) => sum + (o.grand_total || 0), 0)

      customerAnalytics = {
        uniqueCustomers: customers.length,
        returnRate: customers.length > 0 ? Math.round((returningCust.length / customers.length) * 100) : 0,
        b2b: {
          orders: b2bOrders.length,
          revenue: b2bRevenue,
          aov: b2bOrders.length > 0 ? Math.round(b2bRevenue / b2bOrders.length) : 0,
          customers: b2bCustomers.length,
          percentage: Math.round((b2bOrders.length / allOrders.length) * 100),
          ltv: b2bCustomers.length > 0 ? Math.round(b2bCustomers.reduce((sum, c) => sum + c.revenue, 0) / b2bCustomers.length) : 0
        },
        b2c: {
          orders: b2cOrders.length,
          revenue: b2cRevenue,
          aov: b2cOrders.length > 0 ? Math.round(b2cRevenue / b2cOrders.length) : 0,
          customers: b2cCustomers.length,
          percentage: Math.round((b2cOrders.length / allOrders.length) * 100),
          ltv: b2cCustomers.length > 0 ? Math.round(b2cCustomers.reduce((sum, c) => sum + c.revenue, 0) / b2cCustomers.length) : 0
        }
      }
    }
  } catch (err) {
    console.error('Customer analytics fetch error:', err)
  }

  // Inventory turnover metrics
  try {
    const { data: products } = await supabase
      .from('products')
      .select('id, name, product_number, stock_level, cost_price, price_amount, for_sale')
      .eq('store_id', STORE_ID)
      .eq('for_sale', true)

    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    const { data: salesVelocity } = await supabase
      .from('order_line_items')
      .select(`product_number, quantity, orders!inner(creation_date, status, store_id)`)
      .eq('orders.store_id', STORE_ID)
      .gte('orders.creation_date', thirtyDaysAgo.toISOString().split('T')[0])
      .neq('orders.status', 'cancelled')

    const salesByProduct = {}
    if (salesVelocity) {
      salesVelocity.forEach(item => {
        const sku = item.product_number
        if (sku) salesByProduct[sku] = (salesByProduct[sku] || 0) + (item.quantity || 1)
      })
    }

    if (products && products.length > 0) {
      const enrichedProducts = products.map(p => {
        const salesLast30Days = salesByProduct[p.product_number] || 0
        const dailyVelocity = salesLast30Days / 30
        const annualizedSales = dailyVelocity * 365
        const turnoverRate = p.stock_level > 0 ? annualizedSales / p.stock_level : 0
        const unitCost = p.cost_price || (p.price_amount ? p.price_amount * 0.6 : 0)
        const stockValue = (p.stock_level || 0) * unitCost
        return { ...p, salesLast30Days, turnoverRate: Math.round(turnoverRate * 10) / 10, stockValue }
      })

      const productsWithTurnover = enrichedProducts.filter(p => p.turnoverRate > 0)
      const avgTurnover = productsWithTurnover.length > 0
        ? productsWithTurnover.reduce((sum, p) => sum + p.turnoverRate, 0) / productsWithTurnover.length
        : 0

      inventoryMetrics = {
        avgTurnover: Math.round(avgTurnover * 10) / 10,
        totalStockValue: Math.round(enrichedProducts.reduce((sum, p) => sum + p.stockValue, 0)),
        productsWithStock: enrichedProducts.filter(p => p.stock_level > 0).length,
        fastMovers: [...productsWithTurnover].sort((a, b) => b.turnoverRate - a.turnoverRate).slice(0, 5).map(p => ({ name: p.name, turnover: p.turnoverRate, sales30d: p.salesLast30Days })),
        slowMovers: [...productsWithTurnover].filter(p => p.stockValue > 100).sort((a, b) => a.turnoverRate - b.turnoverRate).slice(0, 5).map(p => ({ name: p.name, turnover: p.turnoverRate, stockValue: Math.round(p.stockValue) }))
      }
    }
  } catch (err) {
    console.error('Inventory metrics fetch error:', err)
  }

  // Calculate totals - current period
  const sales = salesData.data || []
  const totalRevenue = sales.reduce((sum, d) => sum + (parseFloat(d.total_revenue) || 0), 0)
  const totalOrders = sales.reduce((sum, d) => sum + (d.order_count || 0), 0)

  // Calculate totals - YoY comparison period
  const salesYoY = salesDataYoY.data || []
  const totalRevenueYoY = salesYoY.reduce((sum, d) => sum + (parseFloat(d.total_revenue) || 0), 0)
  const totalOrdersYoY = salesYoY.reduce((sum, d) => sum + (d.order_count || 0), 0)

  const gsc = gscData.data || []
  const gscClicks = gsc.reduce((sum, d) => sum + (d.total_clicks || 0), 0)
  const gscImpressions = gsc.reduce((sum, d) => sum + (d.total_impressions || 0), 0)

  // Calculate YoY changes
  const revenueChangeYoY = totalRevenueYoY > 0 ? ((totalRevenue - totalRevenueYoY) / totalRevenueYoY * 100).toFixed(1) : null
  const ordersChangeYoY = totalOrdersYoY > 0 ? ((totalOrders - totalOrdersYoY) / totalOrdersYoY * 100).toFixed(1) : null

  return {
    sales,
    salesSummary: {
      revenue: totalRevenue,
      orders: totalOrders,
      aov: totalOrders > 0 ? totalRevenue / totalOrders : 0,
      // YoY comparison
      revenueYoY: totalRevenueYoY,
      ordersYoY: totalOrdersYoY,
      aovYoY: totalOrdersYoY > 0 ? totalRevenueYoY / totalOrdersYoY : 0,
      revenueChangeYoY,
      ordersChangeYoY
    },
    growthSnapshots: growthSnapshot.data || [],
    goals: goals.data || [],
    contextNotes: notes.data || [],
    gsc,
    gscSummary: { clicks: gscClicks, impressions: gscImpressions, ctr: gscImpressions > 0 ? ((gscClicks / gscImpressions) * 100).toFixed(2) : 0 },
    gscTopQueries: gscTopQueries.data || [],
    lowStockProducts: lowStockProducts.data || [],
    topProducts: topProducts.data || [],
    customerSegments: customerSegments.data || [],
    indicators: indicators.data || [],
    productRoles: productRoles.data || [],
    customerAnalytics,
    inventoryMetrics
  }
}

/**
 * Build system prompt for Emma (Finnish or Swedish)
 * @param {string} language - 'fi' or 'sv'
 * @param {boolean} isMonthly - true for monthly analysis, false for weekly
 */
function buildSystemPrompt(language, isMonthly = false) {
  const periodFi = isMonthly ? 'kuukauden' : 'viikon'
  const periodSv = isMonthly ? 'månadens' : 'veckans'
  const summaryFi = isMonthly ? 'kuukauden' : 'viikon'
  const summarySv = isMonthly ? 'månaden' : 'veckan'

  if (language === 'fi') {
    return `Olet Emma, kokenut data-analyytikko verkkokaupan liiketoiminnalle. Vastaa AINA suomeksi. Käytä "sinä"-muotoa.

TEHTÄVÄSI:
Analysoi ${periodFi} data ja anna tiivis, oivaltava yhteenveto joka auttaa kauppiasta ymmärtämään:
1. Mikä muuttui olennaisesti ${isMonthly ? 'tässä kuussa' : 'tällä viikolla'}
2. Mikä vaikutti tulokseen eniten
3. Ovatko muutokset kausiluonteisia vai poikkeamia

TYYLI:
- Ammattimainen mutta ystävällinen
- Suora ja konkreettinen - ei turhia sanoja
- Keskity "miksi" eikä vain "mitä"
- Anna 5-10 kohtaa, priorisoi tärkeimmät ensin
- Käytä lukuja ja prosentteja väitteiden tueksi
- Max 1-2 emojia per vastaus (📈📉⚠️✨)

FORMAATTI:
Palauta JSON seuraavalla rakenteella:
{
  "summary": "Yksi lause joka tiivistää ${summaryFi}",
  "bullets": [
    { "type": "positive|negative|warning|info", "text": "Kohta 1" },
    { "type": "positive|negative|warning|info", "text": "Kohta 2" }
  ],
  "full_analysis": "Pidempi analyysiteksti (2-3 kappaletta)",
  "key_metrics": {
    "overall_index": { "current": 64, "previous": 58, "change": 10 },
    "biggest_impact": "sales_efficiency|demand_growth|traffic_quality|product_leverage",
    "is_seasonal": true|false
  }
}

TÄRKEÄÄ:
- Perusta KAIKKI väitteet VAIN annettuun dataan
- ÄLÄ KOSKAAN keksi lukuja, prosentteja tai vertailuja joita ei ole annettu
- Jos vertailudataa (edellinen kuukausi/vuosi) EI OLE annettu, ÄLÄ mainitse vertailuja
- Jos dataa puuttuu, sano se rehellisesti: "Vertailudataa ei ole saatavilla"
- Käytä VAIN promptissa annettuja lukuja

Sisällytä MYÖS action_recommendations (3-5 kpl) JSON:iin:
"action_recommendations": [
  {
    "id": "rec_1",
    "title": "Toimenpide 1",
    "why": "Selitys miksi",
    "timeframe": "immediate|short|long",
    "effort": "small|medium|large",
    "impact": "high|medium|low",
    "metric": "sales|margin|conversion|inventory|seo",
    "expected_result": "+10% myynti"
  }
]`
  }

  // Swedish (default)
  return `Du är Emma, en erfaren data-analytiker för e-handelsföretag. Svara ALLTID på svenska. Använd "du" (informellt tilltal).

DITT UPPDRAG:
Analysera ${periodSv} data och ge en koncis, insiktsfull sammanfattning som hjälper butiksägaren att förstå:
1. Vad som förändrades väsentligt ${isMonthly ? 'denna månad' : 'denna vecka'}
2. Vad som påverkade resultatet mest
3. Om förändringarna är säsongsbetonade eller avvikelser

STIL:
- Professionell men vänlig
- Direkt och konkret - inga tomma ord
- Fokusera på "varför" inte bara "vad"
- Ge 5-10 punkter, prioritera det viktigaste först
- Använd siffror och procent för att stödja påståenden
- Max 1-2 emoji per svar (📈📉⚠️✨)

FORMAT:
Returnera JSON med följande struktur:
{
  "summary": "En mening som sammanfattar ${summarySv}",
  "bullets": [
    { "type": "positive|negative|warning|info", "text": "Punkt 1" },
    { "type": "positive|negative|warning|info", "text": "Punkt 2" }
  ],
  "full_analysis": "Längre analystext (2-3 stycken)",
  "key_metrics": {
    "overall_index": { "current": 64, "previous": 58, "change": 10 },
    "biggest_impact": "sales_efficiency|demand_growth|traffic_quality|product_leverage",
    "is_seasonal": true|false
  }
}

VIKTIGT:
- Basera ALLA påståenden på data som ges
- Om data saknas, säg det ärligt
- Jämför alltid med YoY (Year-over-Year) för att justera för säsong

Inkludera OCKSÅ action_recommendations (3-5 st) i JSON:
"action_recommendations": [
  {
    "id": "rec_1",
    "title": "Åtgärd 1",
    "why": "Förklaring varför",
    "timeframe": "immediate|short|long",
    "effort": "small|medium|large",
    "impact": "high|medium|low",
    "metric": "sales|margin|conversion|inventory|seo",
    "expected_result": "+10% försäljning"
  }
]`
}

/**
 * Build user prompt with FULL context data (same as Emma!)
 * @param {object} contextData - All context data
 * @param {number} periodNumber - Week number (1-53) or month number (1-12)
 * @param {number} year - Year
 * @param {string} language - 'fi' or 'sv'
 * @param {boolean} isMonthly - true for monthly, false for weekly
 */
function buildUserPrompt(contextData, periodNumber, year, language = 'fi', isMonthly = false, currencySymbol = '€') {
  const {
    salesSummary, growthSnapshots, goals, contextNotes, gscSummary, gscTopQueries,
    lowStockProducts, topProducts, customerSegments, productRoles,
    customerAnalytics, inventoryMetrics
  } = contextData

  const currentSnapshot = growthSnapshots[0] || {}
  const previousSnapshot = growthSnapshots[1] || {}
  const isFi = language === 'fi'

  // Month names for display
  const monthNamesFi = ['tammikuu', 'helmikuu', 'maaliskuu', 'huhtikuu', 'toukokuu', 'kesäkuu', 'heinäkuu', 'elokuu', 'syyskuu', 'lokakuu', 'marraskuu', 'joulukuu']
  const monthNamesSv = ['januari', 'februari', 'mars', 'april', 'maj', 'juni', 'juli', 'augusti', 'september', 'oktober', 'november', 'december']

  // Build comprehensive prompt
  let prompt
  if (isMonthly) {
    const monthName = isFi ? monthNamesFi[periodNumber - 1] : monthNamesSv[periodNumber - 1]
    prompt = isFi
      ? `Analysoi ${monthName} ${year} tälle verkkokaupalle. Tämä on KATTAVA kuukausiyhteenveto.\n\n`
      : `Analysera ${monthName} ${year} för denna e-handelsbutik. Detta är en OMFATTANDE månadsöversikt.\n\n`
  } else {
    prompt = isFi
      ? `Analysoi viikko ${periodNumber}/${year} tälle verkkokaupalle. Tämä on KATTAVA viikkoyhteenveto.\n\n`
      : `Analysera vecka ${periodNumber}/${year} för denna e-handelsbutik. Detta är en OMFATTANDE veckoöversikt.\n\n`
  }

  // 1. SALES with YoY comparison
  prompt += isFi ? `## MYYNTIDATA\n` : `## FÖRSÄLJNINGSDATA\n`
  prompt += isFi ? `### Nykyinen jakso:\n` : `### Nuvarande period:\n`
  prompt += isFi
    ? `- Liikevaihto: ${Math.round(salesSummary.revenue).toLocaleString()} ${currencySymbol}\n`
    : `- Omsättning: ${Math.round(salesSummary.revenue).toLocaleString()} ${currencySymbol}\n`
  prompt += isFi
    ? `- Tilaukset: ${salesSummary.orders}\n`
    : `- Ordrar: ${salesSummary.orders}\n`
  prompt += isFi
    ? `- Keskiostos (AOV): ${Math.round(salesSummary.aov)} ${currencySymbol}\n`
    : `- Snittorder (AOV): ${Math.round(salesSummary.aov)} ${currencySymbol}\n`

  // YoY comparison
  if (salesSummary.revenueYoY > 0) {
    prompt += isFi ? `\n### Viime vuosi sama jakso:\n` : `\n### Förra året samma period:\n`
    prompt += isFi
      ? `- Liikevaihto: ${Math.round(salesSummary.revenueYoY).toLocaleString()} ${currencySymbol}\n`
      : `- Omsättning: ${Math.round(salesSummary.revenueYoY).toLocaleString()} ${currencySymbol}\n`
    prompt += isFi
      ? `- Tilaukset: ${salesSummary.ordersYoY}\n`
      : `- Ordrar: ${salesSummary.ordersYoY}\n`
    prompt += isFi
      ? `- Keskiostos (AOV): ${Math.round(salesSummary.aovYoY)} ${currencySymbol}\n`
      : `- Snittorder (AOV): ${Math.round(salesSummary.aovYoY)} ${currencySymbol}\n`

    prompt += isFi ? `\n### YoY muutos:\n` : `\n### YoY förändring:\n`
    const revenueChange = parseFloat(salesSummary.revenueChangeYoY)
    const ordersChange = parseFloat(salesSummary.ordersChangeYoY)
    prompt += isFi
      ? `- Liikevaihto: ${revenueChange > 0 ? '+' : ''}${salesSummary.revenueChangeYoY}%\n`
      : `- Omsättning: ${revenueChange > 0 ? '+' : ''}${salesSummary.revenueChangeYoY}%\n`
    prompt += isFi
      ? `- Tilaukset: ${ordersChange > 0 ? '+' : ''}${salesSummary.ordersChangeYoY}%\n`
      : `- Ordrar: ${ordersChange > 0 ? '+' : ''}${salesSummary.ordersChangeYoY}%\n`
  } else {
    prompt += isFi
      ? `\n(Viime vuoden vertailudataa ei saatavilla)\n`
      : `\n(Förra årets jämförelsedata inte tillgänglig)\n`
  }
  prompt += '\n'

  // 2. GROWTH ENGINE
  prompt += `## GROWTH ENGINE INDEKSI\n`
  prompt += isFi ? `Nykyinen jakso:\n` : `Nuvarande period:\n`
  prompt += `- Kokonaisindeksi: ${currentSnapshot.overall_index || 'N/A'}/100\n`
  prompt += isFi
    ? `- Kysynnän kasvu: ${currentSnapshot.demand_growth_score || 'N/A'}/100\n`
    : `- Efterfrågetillväxt: ${currentSnapshot.demand_growth_score || 'N/A'}/100\n`
  prompt += isFi
    ? `- Liikenteen laatu: ${currentSnapshot.traffic_quality_score || 'N/A'}/100\n`
    : `- Trafikkvalitet: ${currentSnapshot.traffic_quality_score || 'N/A'}/100\n`
  prompt += isFi
    ? `- Myynnin tehokkuus: ${currentSnapshot.sales_efficiency_score || 'N/A'}/100\n`
    : `- Försäljningseffektivitet: ${currentSnapshot.sales_efficiency_score || 'N/A'}/100\n`
  prompt += isFi
    ? `- Sivuston näkyvyys: ${currentSnapshot.product_leverage_score || 'N/A'}/100\n`
    : `- Webbplatssynlighet: ${currentSnapshot.product_leverage_score || 'N/A'}/100\n`
  prompt += isFi
    ? `\nEdellinen jakso: Kokonaisindeksi ${previousSnapshot.overall_index || 'N/A'}/100\n\n`
    : `\nFöregående period: Overall Index ${previousSnapshot.overall_index || 'N/A'}/100\n\n`

  // 3. GOALS
  prompt += isFi ? `## AKTIIVISET TAVOITTEET\n` : `## AKTIVA MÅL\n`
  if (goals.length > 0) {
    goals.forEach(g => {
      prompt += `- ${g.goal_type}: ${g.current_value || 0}/${g.target_value} (${g.progress_percent || 0}%)\n`
    })
  } else {
    prompt += isFi ? `Ei aktiivisia tavoitteita\n` : `Inga aktiva mål\n`
  }
  prompt += '\n'

  // 4. GSC
  prompt += isFi ? `## HAKUKONENÄKYVYYS (GSC)\n` : `## SÖKMOTORSYNLIGHET (GSC)\n`
  prompt += isFi
    ? `- Klikkaukset: ${gscSummary.clicks.toLocaleString()}\n`
    : `- Klick: ${gscSummary.clicks.toLocaleString()}\n`
  prompt += isFi
    ? `- Näytöt: ${gscSummary.impressions.toLocaleString()}\n`
    : `- Visningar: ${gscSummary.impressions.toLocaleString()}\n`
  prompt += `- CTR: ${gscSummary.ctr}%\n\n`

  // 5. TOP SEARCH QUERIES
  if (gscTopQueries.length > 0) {
    prompt += isFi ? `## TOP HAKUSANAT\n` : `## TOPP SÖKORD\n`
    gscTopQueries.slice(0, 10).forEach(q => {
      prompt += `- "${q.query}": ${q.clicks} klikkausta, pos ${parseFloat(q.position).toFixed(1)}\n`
    })
    prompt += '\n'
  }

  // 6. TOP PRODUCTS
  if (topProducts.length > 0) {
    prompt += isFi ? `## TOP TUOTTEET\n` : `## TOPP PRODUKTER\n`
    topProducts.slice(0, 5).forEach(p => {
      prompt += `- ${p.product_name}: ${p.total_quantity} kpl, ${Math.round(parseFloat(p.total_revenue || 0)).toLocaleString()} ${currencySymbol}\n`
    })
    prompt += '\n'
  }

  // 7. CUSTOMER ANALYTICS
  if (customerAnalytics) {
    prompt += isFi ? `## ASIAKASANALYYSI\n` : `## KUNDANALYS\n`
    prompt += isFi
      ? `- Uniikkeja asiakkaita: ${customerAnalytics.uniqueCustomers}\n`
      : `- Unika kunder: ${customerAnalytics.uniqueCustomers}\n`
    prompt += isFi
      ? `- Palaavien osuus: ${customerAnalytics.returnRate}%\n\n`
      : `- Återkommande: ${customerAnalytics.returnRate}%\n\n`

    const { b2b, b2c } = customerAnalytics
    prompt += `B2B:\n`
    prompt += isFi
      ? `- ${b2b.orders} tilausta (${b2b.percentage}%), ${Math.round(b2b.revenue).toLocaleString()} ${currencySymbol}\n`
      : `- ${b2b.orders} ordrar (${b2b.percentage}%), ${Math.round(b2b.revenue).toLocaleString()} ${currencySymbol}\n`
    prompt += `- AOV: ${b2b.aov} ${currencySymbol}, LTV: ${b2b.ltv} ${currencySymbol}\n\n`

    prompt += `B2C:\n`
    prompt += isFi
      ? `- ${b2c.orders} tilausta (${b2c.percentage}%), ${Math.round(b2c.revenue).toLocaleString()} ${currencySymbol}\n`
      : `- ${b2c.orders} ordrar (${b2c.percentage}%), ${Math.round(b2c.revenue).toLocaleString()} ${currencySymbol}\n`
    prompt += `- AOV: ${b2c.aov} ${currencySymbol}, LTV: ${b2c.ltv} ${currencySymbol}\n\n`
  }

  // 8. PRODUCT ROLES
  if (productRoles && productRoles.length > 0) {
    prompt += isFi ? `## TUOTEROOLIT (90 pv)\n` : `## PRODUKTROLLER (90d)\n`
    const roleLabels = {
      hero: isFi ? 'Veturit' : 'Dragare',
      anchor: isFi ? 'Ankkurit' : 'Ankare',
      filler: isFi ? 'Täyttäjät' : 'Fyllare',
      longtail: isFi ? 'Häntä' : 'Svans'
    }
    productRoles.forEach(role => {
      const label = roleLabels[role.role] || role.role
      const revenue = parseFloat(role.total_revenue || 0)
      const units = parseInt(role.total_units || 0)
      const products = parseInt(role.product_count || 0)
      prompt += `- ${label}: ${products} tuotetta, ${Math.round(revenue).toLocaleString()} kr, ${units} kpl\n`
    })
    prompt += '\n'
  }

  // 9. INVENTORY METRICS
  if (inventoryMetrics) {
    prompt += isFi ? `## VARASTON KIERTONOPEUS\n` : `## LAGEROMSÄTTNING\n`
    prompt += isFi
      ? `- Keskikiertonopeus: ${inventoryMetrics.avgTurnover}x/vuosi\n`
      : `- Genomsnittlig omsättning: ${inventoryMetrics.avgTurnover}x/år\n`
    prompt += isFi
      ? `- Varaston arvo: ${inventoryMetrics.totalStockValue.toLocaleString()} ${currencySymbol}\n`
      : `- Lagervärde: ${inventoryMetrics.totalStockValue.toLocaleString()} ${currencySymbol}\n`
    prompt += isFi
      ? `- Tuotteita varastossa: ${inventoryMetrics.productsWithStock}\n\n`
      : `- Produkter i lager: ${inventoryMetrics.productsWithStock}\n\n`

    if (inventoryMetrics.fastMovers?.length > 0) {
      prompt += isFi ? `Nopeimmin liikkuvat:\n` : `Snabbast rörliga:\n`
      inventoryMetrics.fastMovers.forEach(p => {
        prompt += `- ${p.name}: ${p.turnover}x, ${p.sales30d} myyty/30pv\n`
      })
      prompt += '\n'
    }

    if (inventoryMetrics.slowMovers?.length > 0) {
      prompt += isFi ? `Hitaasti liikkuvat (varastoriski):\n` : `Långsamt rörliga (lagerrisk):\n`
      inventoryMetrics.slowMovers.forEach(p => {
        prompt += `- ${p.name}: ${p.turnover}x, arvo ${p.stockValue} ${currencySymbol}\n`
      })
      prompt += '\n'
    }
  }

  // 10. LOW STOCK ALERTS
  if (lowStockProducts.length > 0) {
    const outOfStock = lowStockProducts.filter(p => p.stock_level <= 0)
    const lowStock = lowStockProducts.filter(p => p.stock_level > 0 && p.stock_level <= 5)

    if (outOfStock.length > 0) {
      prompt += isFi ? `## ⚠️ LOPPUNEET TUOTTEET\n` : `## ⚠️ SLUTSÅLDA PRODUKTER\n`
      outOfStock.forEach(p => {
        prompt += `- ${p.name}: LOPPUNUT\n`
      })
      prompt += '\n'
    }

    if (lowStock.length > 0) {
      prompt += isFi ? `## ⚠️ ALHAINEN VARASTO\n` : `## ⚠️ LÅG LAGERNIVÅ\n`
      lowStock.forEach(p => {
        prompt += `- ${p.name}: ${p.stock_level} kpl jäljellä\n`
      })
      prompt += '\n'
    }
  }

  // 11. CONTEXT NOTES
  if (contextNotes.length > 0) {
    prompt += isFi ? `## KONTEKSTIMUISTIINPANOT\n` : `## KONTEXTNOTERINGAR\n`
    contextNotes.forEach(n => {
      prompt += `- ${n.title} (${n.note_type})\n`
    })
    prompt += '\n'
  }

  if (isMonthly) {
    prompt += isFi
      ? `\nGeneroi nyt KATTAVA kuukausianalyysi tämän datan pohjalta. Huomioi kaikki yllä olevat tiedot.`
      : `\nGenerera nu en OMFATTANDE månadsanalys baserad på denna data. Beakta all information ovan.`
  } else {
    prompt += isFi
      ? `\nGeneroi nyt KATTAVA viikkoanalyysi tämän datan pohjalta. Huomioi kaikki yllä olevat tiedot.`
      : `\nGenerera nu en OMFATTANDE veckoanalys baserad på denna data. Beakta all information ovan.`
  }

  return prompt
}

/**
 * Main handler
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { week_number, month_number, year, date_range, language = 'fi', granularity = 'week', store_id, shop_id } = req.body

    // Resolve store IDs - from request or fall back to looking up from shops table
    let STORE_ID, SHOP_ID
    if (store_id && shop_id) {
      STORE_ID = store_id
      SHOP_ID = shop_id
    } else if (store_id) {
      STORE_ID = store_id
      const { data: shop } = await supabase.from('shops').select('id').eq('store_id', store_id).maybeSingle()
      SHOP_ID = shop?.id || store_id
    } else if (shop_id) {
      SHOP_ID = shop_id
      const { data: shop } = await supabase.from('shops').select('store_id').eq('id', shop_id).maybeSingle()
      STORE_ID = shop?.store_id || shop_id
    } else {
      // Fallback: get first shop
      const { data: shop } = await supabase.from('shops').select('id, store_id').limit(1).single()
      STORE_ID = shop?.store_id
      SHOP_ID = shop?.id
    }

    const isMonthly = granularity === 'month'

    // Get week/month/year if not provided
    const now = new Date()
    const { week, year: currentYear } = getISOWeek(now)
    const currentMonth = now.getMonth() + 1 // 1-indexed

    const targetWeek = isMonthly ? null : (week_number || week)
    const targetMonth = isMonthly ? (month_number || currentMonth) : null
    const targetYear = year || currentYear

    // Calculate correct date range for the target period
    let effectiveDateRange = date_range
    if (isMonthly && targetMonth && targetYear) {
      // For monthly: first and last day of the month
      const firstDay = new Date(targetYear, targetMonth - 1, 1)
      const lastDay = new Date(targetYear, targetMonth, 0) // Day 0 of next month = last day of this month
      effectiveDateRange = {
        startDate: firstDay.toISOString().split('T')[0],
        endDate: lastDay.toISOString().split('T')[0]
      }
      console.log(`Monthly analysis for ${targetMonth}/${targetYear}: ${effectiveDateRange.startDate} - ${effectiveDateRange.endDate}`)
    } else if (!isMonthly && targetWeek && targetYear) {
      // For weekly: calculate week start (Monday) and end (Sunday)
      const jan1 = new Date(targetYear, 0, 1)
      const daysToMonday = (jan1.getDay() + 6) % 7 // Days from Monday
      const firstMonday = new Date(jan1)
      firstMonday.setDate(jan1.getDate() - daysToMonday + (targetWeek - 1) * 7)
      const weekEnd = new Date(firstMonday)
      weekEnd.setDate(firstMonday.getDate() + 6)
      effectiveDateRange = {
        startDate: firstMonday.toISOString().split('T')[0],
        endDate: weekEnd.toISOString().split('T')[0]
      }
      console.log(`Weekly analysis for week ${targetWeek}/${targetYear}: ${effectiveDateRange.startDate} - ${effectiveDateRange.endDate}`)
    }

    // Fetch all context data with correct date range
    const contextData = await fetchContextData(effectiveDateRange, STORE_ID, SHOP_ID)

    // Look up currency for this store
    const { data: shopInfo } = await supabase.from('shops').select('currency').eq('store_id', STORE_ID).maybeSingle()
    const currencySymbol = shopInfo?.currency === 'SEK' ? 'kr' : '€'

    // Build prompts with correct language and granularity
    const systemPrompt = buildSystemPrompt(language, isMonthly)
    const periodNumber = isMonthly ? targetMonth : targetWeek
    const userPrompt = buildUserPrompt(contextData, periodNumber, targetYear, language, isMonthly, currencySymbol)

    // Call Deepseek API (OpenAI-compatible)
    const response = await deepseek.chat.completions.create({
      model: 'deepseek-chat',
      max_tokens: 2000,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ]
    })

    // Parse response (OpenAI format)
    let analysisContent
    try {
      let responseText = response.choices[0].message.content

      // Strip markdown code block markers (```json ... ```)
      responseText = responseText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '')

      // Try to extract JSON from response
      const jsonMatch = responseText.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        analysisContent = JSON.parse(jsonMatch[0])
      } else {
        // Fallback: create structure from text
        analysisContent = {
          summary: responseText.substring(0, 200),
          bullets: [{ type: 'info', text: responseText }],
          full_analysis: responseText,
          key_metrics: null
        }
      }
    } catch (parseError) {
      console.error('Failed to parse AI response:', parseError)
      let fallbackText = response.choices[0].message.content
      // Also strip markdown from fallback
      fallbackText = fallbackText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '')
      analysisContent = {
        summary: fallbackText.substring(0, 200),
        bullets: [{ type: 'info', text: fallbackText }],
        full_analysis: fallbackText,
        key_metrics: null
      }
    }

    // Add language to content
    analysisContent.language = language

    // Save analysis to database - uses SHOP_ID (FK to shops)
    // Use manual check-then-insert/update for partial unique indexes
    let savedAnalysis = null
    let saveError = null

    // First, check if record exists
    let existingQuery = supabase
      .from('weekly_analyses')
      .select('id')
      .eq('store_id', SHOP_ID)
      .eq('year', targetYear)

    if (isMonthly) {
      existingQuery = existingQuery.eq('month_number', targetMonth).is('week_number', null)
    } else {
      existingQuery = existingQuery.eq('week_number', targetWeek)
    }

    const { data: existing } = await existingQuery.single()

    const analysisData = {
      store_id: SHOP_ID,
      year: targetYear,
      week_number: isMonthly ? null : targetWeek,
      month_number: isMonthly ? targetMonth : null,
      analysis_content: analysisContent,
      model_used: 'deepseek-chat',
      tokens_used: response.usage?.completion_tokens || null,
      generated_at: new Date().toISOString()
    }

    if (existing?.id) {
      // Update existing record
      const { data, error } = await supabase
        .from('weekly_analyses')
        .update(analysisData)
        .eq('id', existing.id)
        .select()
        .single()
      savedAnalysis = data
      saveError = error
    } else {
      // Insert new record
      const { data, error } = await supabase
        .from('weekly_analyses')
        .insert(analysisData)
        .select()
        .single()
      savedAnalysis = data
      saveError = error
    }

    if (saveError) {
      console.error('Failed to save analysis:', saveError.message)
    }

    // Also save action recommendations if they were generated - uses SHOP_ID
    if (analysisContent.action_recommendations?.length > 0) {
      // Check if recommendation exists
      let existingRecQuery = supabase
        .from('action_recommendations')
        .select('id')
        .eq('store_id', SHOP_ID)
        .eq('year', targetYear)

      if (isMonthly) {
        existingRecQuery = existingRecQuery.eq('month_number', targetMonth).is('week_number', null)
      } else {
        existingRecQuery = existingRecQuery.eq('week_number', targetWeek)
      }

      const { data: existingRec } = await existingRecQuery.single()

      const recData = {
        store_id: SHOP_ID,
        year: targetYear,
        week_number: isMonthly ? null : targetWeek,
        month_number: isMonthly ? targetMonth : null,
        recommendations: analysisContent.action_recommendations
      }

      if (existingRec?.id) {
        const { error: recError } = await supabase
          .from('action_recommendations')
          .update(recData)
          .eq('id', existingRec.id)
        if (recError) console.error('Failed to update recommendations:', recError)
      } else {
        const { error: recError } = await supabase
          .from('action_recommendations')
          .insert(recData)
        if (recError) console.error('Failed to insert recommendations:', recError)
      }
    }

    return res.status(200).json({
      id: savedAnalysis?.id,
      week_number: isMonthly ? null : targetWeek,
      month_number: isMonthly ? targetMonth : null,
      year: targetYear,
      analysis_content: analysisContent,
      recommendations: analysisContent.action_recommendations || [],
      generated_at: new Date().toISOString()
    })

  } catch (error) {
    console.error('Generate analysis error:', error)
    return res.status(500).json({
      error: error.message || 'Failed to generate analysis'
    })
  }
}

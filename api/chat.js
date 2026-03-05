/**
 * API: Emma Chat
 *
 * POST /api/chat
 *
 * Emma-keskustelujen käsittely. Vastaa käyttäjän kysymyksiin
 * perustuen kaupan dataan.
 *
 * Käyttää Deepseek API:a (OpenAI-yhteensopiva).
 */

import OpenAI from 'openai'
import { createClient } from '@supabase/supabase-js'

// Initialize clients
const deepseek = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY,
  baseURL: 'https://api.deepseek.com'
})

// OpenAI for embeddings (RAG)
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
})

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// Store IDs are now resolved dynamically from the request's store_id
// storeId: orders, products, gsc_*, ga4_tokens, views (v_*) — from stores table
// shopId: shops.id FK tables (chat_sessions, growth_engine_snapshots, merchant_goals, etc.)

/**
 * Resolve storeId and shopId from a shop_id (shops.id UUID)
 * The request sends shop_id (from shops table). We need both:
 * - shopId: shops.id (for shop FK tables)
 * - storeId: stores.id (for ePages data tables) — stored as shops.store_id
 */
async function resolveStoreIds(shopId) {
  const { data: shop } = await supabase
    .from('shops')
    .select('id, store_id, currency, name, domain')
    .eq('id', shopId)
    .single()

  if (!shop) return null

  return {
    shopId: shop.id,
    storeId: shop.store_id,  // stores.id UUID as TEXT
    currency: shop.currency || 'EUR',
    shopName: shop.name || '',
    domain: shop.domain || ''
  }
}

// RAG Configuration
const USE_RAG = true // Set to false to use legacy context fetching
const RAG_LIMIT = 15 // Number of documents to retrieve
const RAG_MIN_SIMILARITY = 0.25 // Minimum similarity threshold

/**
 * Query expansion - add synonyms and related terms
 * Helps match colloquial Finnish/Swedish queries to indexed documents
 */
function expandQuery(query) {
  const q = query.toLowerCase()
  let expanded = query

  // Sales/Revenue synonyms
  if (/myyn|tuot|tulo|rahat|liikevaihto|omsättning|försäljning|revenue/.test(q)) {
    expanded += ' myynti liikevaihto tuotot revenue omsättning försäljning euros kronor'
  }

  // Customers/Clients synonyms
  if (/asiak|kunde|client|b2b|b2c|osta|köpa/.test(q)) {
    expanded += ' asiakkaat asiakaskunta kunder customers B2B B2C yritysmyynti kuluttajat palaavat'
  }

  // Orders synonyms
  if (/tilau|order|osta|köp/.test(q)) {
    expanded += ' tilaukset ordrar orders ostot kaupat'
  }

  // Stock/Inventory synonyms
  if (/varas|lager|stock|loppu|slut|tuote/.test(q)) {
    expanded += ' varasto lager inventory loppu loppunut slutsåld stock_level tuotteet produkter'
  }

  // SEO/Search synonyms
  if (/seo|haku|google|search|sijoitu|position|näky|synlig|orgaan|organic/.test(q)) {
    expanded += ' SEO hakukoneoptimointi Google hakusanat sökord search organic orgaaninen GSC klikkaukset näyttökerrat'
  }

  // Index/Score synonyms
  if (/indeks|index|pisteet|score|arvo|kokonais/.test(q)) {
    expanded += ' indeksi index kokonaisindeksi growth_engine pisteet score arvosana'
  }

  // Traffic synonyms
  if (/liiken|trafik|kävijä|besökar|visitor/.test(q)) {
    expanded += ' liikenne trafik kävijät besökare visitors bounce engagement'
  }

  // Goals/Targets synonyms
  if (/tavoit|mål|goal|target/.test(q)) {
    expanded += ' tavoitteet mål goals targets budjetti budget'
  }

  // Margin/Profit synonyms
  if (/kate|margin|profit|voitto|vinst/.test(q)) {
    expanded += ' kate marginaali margin profit kannattavuus gross_margin'
  }

  return expanded
}

/**
 * Detect likely categories from query
 * Returns array of categories to boost in search
 */
function detectCategories(query) {
  const q = query.toLowerCase()
  const categories = []

  if (/myyn|tuot|liikevaihto|aov|keskiostos|tilau|order/.test(q)) categories.push('sales')
  if (/asiak|kunde|b2b|b2c|palaa|återkommande|ltv/.test(q)) categories.push('customers')
  if (/varas|lager|stock|loppu|tuote|produkt/.test(q)) categories.push('inventory')
  if (/seo|google|haku|search|gsc|orgaan|organic|hakusana/.test(q)) categories.push('seo')
  if (/liiken|trafik|kävijä|bounce|engag/.test(q)) categories.push('traffic')
  if (/tavoit|mål|goal|budget/.test(q)) categories.push('goals')
  if (/indeks|index|kokonais|growth|overall/.test(q)) categories.push('general')

  return categories.length > 0 ? categories : null
}

/**
 * Embed user query for RAG search
 */
async function embedQuery(text) {
  try {
    const response = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: text.slice(0, 8000)
    })
    return response.data[0].embedding
  } catch (err) {
    console.error('Embedding error:', err)
    return null
  }
}

/**
 * Fetch relevant context using RAG (vector search)
 */
async function fetchRAGContext(userMessage, language = 'fi', shopId = null) {
  const isFi = language === 'fi'

  // Expand query with synonyms for better matching
  const expandedQuery = expandQuery(userMessage)
  console.log('RAG query expanded:', userMessage, '→', expandedQuery.length, 'chars')

  // Detect likely categories (optional pre-filter)
  const likelyCategories = detectCategories(userMessage)
  if (likelyCategories) {
    console.log('RAG detected categories:', likelyCategories.join(', '))
  }

  // Embed the expanded question
  const queryEmbedding = await embedQuery(expandedQuery)
  if (!queryEmbedding) {
    console.warn('Failed to embed query, falling back to legacy context')
    return null
  }

  // Search for relevant documents
  const { data: docs, error } = await supabase.rpc('search_emma_documents', {
    p_store_id: shopId,
    p_query_embedding: queryEmbedding,
    p_limit: RAG_LIMIT,
    p_min_similarity: RAG_MIN_SIMILARITY
  })

  if (error || !docs?.length) {
    console.warn('RAG search failed or no results:', error)
    return null
  }

  // Build context from retrieved documents
  let context = isFi ? `RELEVANTTI DATA (haettu kysymyksesi perusteella):\n\n` : `RELEVANT DATA (baserat på din fråga):\n\n`

  // Group by doc_type
  const metrics = docs.filter(d => d.doc_type === 'metric')
  const alerts = docs.filter(d => d.doc_type === 'alert')
  const insights = docs.filter(d => d.doc_type === 'insight')
  const goals = docs.filter(d => d.doc_type === 'goal')

  // Alerts first (high priority)
  if (alerts.length > 0) {
    context += isFi ? `⚠️ HÄLYTYKSET:\n` : `⚠️ VARNINGAR:\n`
    alerts.forEach(a => {
      const c = a.content
      if (c.products) {
        const names = c.products.slice(0, 5).map(p => p.name).join(', ')
        context += `- ${c.severity === 'warning' ? '⚠️' : '🚨'} ${isFi ? 'Tuotteet' : 'Produkter'}: ${names}\n`
      }
      context += `  ${a.text_content.slice(0, 200)}\n`
    })
    context += '\n'
  }

  // Metrics
  if (metrics.length > 0) {
    context += isFi ? `📊 MITTARIT:\n` : `📊 MÄTVÄRDEN:\n`
    metrics.forEach(m => {
      const c = m.content
      const name = isFi ? (c.name_fi || c.name_sv || m.doc_id) : (c.name_sv || c.name_fi || m.doc_id)

      if (c.value !== undefined) {
        const unit = c.unit || ''
        const yoy = c.yoy_change ? ` (YoY ${c.yoy_change > 0 ? '+' : ''}${c.yoy_change}%)` : ''
        context += `- ${name}: ${typeof c.value === 'number' ? c.value.toLocaleString() : c.value}${unit}${yoy}\n`
      } else if (c.queries) {
        // Top queries
        context += `- ${name}:\n`
        c.queries.slice(0, 5).forEach(q => {
          context += `  • "${q.query}": ${q.clicks} klick, pos ${q.position}\n`
        })
      } else if (c.orders !== undefined) {
        // B2B/B2C segment
        context += `- ${name}: ${c.orders} ${isFi ? 'tilausta' : 'ordrar'} (${c.percentage}%), AOV ${c.aov}, LTV ${c.ltv}\n`
      }
    })
    context += '\n'
  }

  // Insights
  if (insights.length > 0) {
    context += isFi ? `💡 HAVAINNOT:\n` : `💡 OBSERVATIONER:\n`
    insights.forEach(i => {
      const c = i.content
      const text = isFi ? (c.text_fi || c.title || '') : (c.text_sv || c.title || '')
      const icon = c.severity === 'warning' ? '⚠️' : c.severity === 'opportunity' ? '✨' : '💡'
      context += `${icon} ${text}\n`
    })
    context += '\n'
  }

  // Goals
  if (goals.length > 0) {
    context += isFi ? `🎯 TAVOITTEET:\n` : `🎯 MÅL:\n`
    goals.forEach(g => {
      const c = g.content
      context += `- ${c.goal_type}: ${c.current || 0}/${c.target} (${c.progress}%)\n`
    })
    context += '\n'
  }

  // Add similarity info for debugging (remove in production)
  context += `\n---\n`
  context += isFi
    ? `[Haettu ${docs.length} dokumenttia, relevanssi ${(docs[0]?.similarity * 100).toFixed(0)}-${(docs[docs.length-1]?.similarity * 100).toFixed(0)}%]\n`
    : `[Hämtade ${docs.length} dokument, relevans ${(docs[0]?.similarity * 100).toFixed(0)}-${(docs[docs.length-1]?.similarity * 100).toFixed(0)}%]\n`

  return context
}

/**
 * Fetch context data for Emma (LEGACY - used when RAG is disabled or fails)
 * NOTE: Different tables use different store IDs!
 * - shopId: growth_engine_snapshots, merchant_goals, context_notes (shops FK)
 * - storeId: v_daily_sales, v_top_products, get_customer_segment_summary (orders/products based)
 */
async function fetchContextData(dateRange, storeId, shopId) {
  const endDate = dateRange?.endDate || new Date().toISOString().split('T')[0]
  const startDate = dateRange?.startDate || new Date(new Date().setDate(new Date().getDate() - 30)).toISOString().split('T')[0]

  // Parallel fetch - using correct ID for each table!
  const [
    growthSnapshot,
    goals,
    notes,
    salesSummary,
    topProducts,
    customerSegments,
    weeklyAnalysis,
    indicators,
    lowStockProducts,
    gscData,
    gscTopQueries,
    productRoles
  ] = await Promise.all([
    // Latest Growth Engine snapshot - uses storeId (data saved with storeId)
    supabase
      .from('growth_engine_snapshots')
      .select('*')
      .eq('store_id', storeId)
      .order('period_end', { ascending: false })
      .limit(1)
      .single(),

    // Active goals - uses shopId
    supabase
      .from('merchant_goals')
      .select('*')
      .eq('store_id', shopId)
      .eq('is_active', true),

    // Recent context notes - uses shopId
    supabase
      .from('context_notes')
      .select('*')
      .eq('store_id', shopId)
      .order('start_date', { ascending: false })
      .limit(5),

    // Sales summary - uses storeId (view based on orders)
    supabase
      .from('v_daily_sales')
      .select('total_revenue, order_count')
      .eq('store_id', storeId)
      .gte('sale_date', startDate)
      .lte('sale_date', endDate),

    // Top products - uses storeId (view based on orders)
    supabase
      .from('v_top_products')
      .select('*')
      .eq('store_id', storeId)
      .gte('sale_date', startDate)
      .lte('sale_date', endDate)
      .limit(10),

    // Customer segments - uses storeId (RPC based on orders)
    supabase
      .rpc('get_customer_segment_summary', {
        p_store_id: storeId,
        p_start_date: startDate,
        p_end_date: endDate
      }),

    // Latest weekly analysis - uses shopId (contains AI analysis with Growth Engine data)
    supabase
      .from('weekly_analyses')
      .select('*')
      .eq('store_id', shopId)
      .order('year', { ascending: false })
      .order('week_number', { ascending: false })
      .limit(1)
      .single(),

    // Latest indicators - uses storeId
    supabase
      .from('indicators')
      .select('*')
      .eq('store_id', storeId)
      .order('updated_at', { ascending: false })
      .limit(10),

    // LOW STOCK & OUT OF STOCK PRODUCTS - CRITICAL DATA!
    supabase
      .from('products')
      .select('name, product_number, stock_level, price, for_sale')
      .eq('store_id', storeId)
      .eq('for_sale', true)
      .lte('stock_level', 5)
      .order('stock_level', { ascending: true })
      .limit(20),

    // GSC Summary - uses storeId (search analytics)
    supabase
      .from('v_gsc_daily_summary')
      .select('*')
      .eq('store_id', storeId)
      .gte('date', startDate)
      .lte('date', endDate),

    // GSC Top Queries - actual search terms
    supabase
      .from('gsc_search_analytics')
      .select('query, clicks, impressions, ctr, position')
      .eq('store_id', storeId)
      .gte('date', startDate)
      .lte('date', endDate)
      .order('clicks', { ascending: false })
      .limit(20),

    // PRODUCT ROLES (Veturit, Ankkurit, Täyttäjät, Häntä) - 90 day window
    supabase.rpc('get_product_roles_summary', {
      p_store_id: storeId,
      p_start_date: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      p_end_date: endDate
    })
  ])

  // Fetch category data separately (complex join)
  let categoryData = []
  try {
    const { data: cats } = await supabase
      .from('categories')
      .select('id, level3, display_name')
      .eq('store_id', storeId)

    if (cats && cats.length > 0) {
      // Get category -> product mapping
      const { data: productCats } = await supabase
        .from('product_categories')
        .select('product_id, category_id')

      // Get product sales from top products (already fetched)
      const productSales = new Map()
      topProducts.data?.forEach(p => {
        productSales.set(p.product_id, {
          revenue: parseFloat(p.total_revenue || 0),
          quantity: parseInt(p.total_quantity || 0)
        })
      })

      // Aggregate by category
      const catSales = new Map()
      productCats?.forEach(pc => {
        const sales = productSales.get(pc.product_id)
        if (sales) {
          const cat = cats.find(c => c.id === pc.category_id)
          if (cat) {
            const catName = cat.level3 || cat.display_name || 'Okänd'
            const existing = catSales.get(catName) || { revenue: 0, quantity: 0 }
            existing.revenue += sales.revenue
            existing.quantity += sales.quantity
            catSales.set(catName, existing)
          }
        }
      })

      categoryData = Array.from(catSales.entries())
        .map(([name, data]) => ({ name, ...data }))
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 10)
    }
  } catch (err) {
    console.error('Category fetch error:', err)
  }

  // ENTRY PRODUCTS (Sisääntulotuotteet) - products that bring in new customers
  let entryProductsData = []
  let customerAnalytics = null
  let inventoryMetrics = null

  try {
    const { data: allOrders } = await supabase
      .from('orders')
      .select('id, billing_email, is_b2b, is_b2b_soft, creation_date, grand_total, total_before_tax')
      .eq('store_id', storeId)
      .neq('status', 'cancelled')
      .order('creation_date', { ascending: true })
      .limit(5000)

    if (allOrders && allOrders.length > 0) {
      // Find first order per customer
      const customerFirstOrder = {}
      const customerMap = {}

      allOrders.forEach(order => {
        const email = (order.billing_email || '').toLowerCase()
        if (email) {
          if (!customerFirstOrder[email]) {
            customerFirstOrder[email] = order.id
          }
          if (!customerMap[email]) {
            customerMap[email] = {
              email,
              orders: 0,
              revenue: 0,
              isB2B: order.is_b2b || order.is_b2b_soft
            }
          }
          customerMap[email].orders++
          customerMap[email].revenue += order.grand_total || 0
        }
      })
      const firstOrderIds = new Set(Object.values(customerFirstOrder))

      // CUSTOMER ANALYTICS
      const customers = Object.values(customerMap)
      const b2bCustomers = customers.filter(c => c.isB2B)
      const b2cCustomers = customers.filter(c => !c.isB2B)
      const newCust = customers.filter(c => c.orders === 1)
      const returningCust = customers.filter(c => c.orders > 1)

      const b2bOrders = allOrders.filter(o => o.is_b2b || o.is_b2b_soft)
      const b2cOrders = allOrders.filter(o => !o.is_b2b && !o.is_b2b_soft)
      const b2bRevenue = b2bOrders.reduce((sum, o) => sum + (o.grand_total || 0), 0)
      const b2cRevenue = b2cOrders.reduce((sum, o) => sum + (o.grand_total || 0), 0)

      const returnRate = customers.length > 0 ? Math.round((returningCust.length / customers.length) * 100) : 0
      const b2bLTV = b2bCustomers.length > 0 ? Math.round(b2bCustomers.reduce((sum, c) => sum + c.revenue, 0) / b2bCustomers.length) : 0
      const b2cLTV = b2cCustomers.length > 0 ? Math.round(b2cCustomers.reduce((sum, c) => sum + c.revenue, 0) / b2cCustomers.length) : 0

      customerAnalytics = {
        uniqueCustomers: customers.length,
        b2b: {
          orders: b2bOrders.length,
          revenue: b2bRevenue,
          aov: b2bOrders.length > 0 ? Math.round(b2bRevenue / b2bOrders.length) : 0,
          customers: b2bCustomers.length,
          percentage: Math.round((b2bOrders.length / allOrders.length) * 100),
          ltv: b2bLTV
        },
        b2c: {
          orders: b2cOrders.length,
          revenue: b2cRevenue,
          aov: b2cOrders.length > 0 ? Math.round(b2cRevenue / b2cOrders.length) : 0,
          customers: b2cCustomers.length,
          percentage: Math.round((b2cOrders.length / allOrders.length) * 100),
          ltv: b2cLTV
        },
        returnRate,
        newCustomers: newCust.length,
        returningCustomers: returningCust.length
      }

      // Get items from first orders only
      const { data: firstOrderItems } = await supabase
        .from('order_items')
        .select('order_id, sku, name, quantity, line_total')
        .eq('shop_id', shopId)
        .in('order_id', Array.from(firstOrderIds).slice(0, 500))

      // Aggregate by product
      const productCounts = {}
      firstOrderItems?.forEach(item => {
        const key = item.name || item.sku
        if (!productCounts[key]) {
          productCounts[key] = { name: key, sku: item.sku, count: 0, revenue: 0, firstOrders: 0 }
        }
        productCounts[key].count += item.quantity || 1
        productCounts[key].revenue += item.line_total || 0
        productCounts[key].firstOrders++
      })

      entryProductsData = Object.values(productCounts)
        .sort((a, b) => b.firstOrders - a.firstOrders)
        .slice(0, 10)
    }
  } catch (err) {
    console.error('Entry products / customer analytics fetch error:', err)
  }

  // INVENTORY TURNOVER METRICS
  try {
    // Fetch products with stock
    const { data: products } = await supabase
      .from('products')
      .select('id, name, product_number, stock_level, cost_price, price_amount, for_sale')
      .eq('store_id', storeId)
      .eq('for_sale', true)

    // Fetch sales velocity (last 30 days)
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    const { data: salesData } = await supabase
      .from('order_line_items')
      .select(`product_number, quantity, orders!inner(creation_date, status, store_id)`)
      .eq('orders.store_id', storeId)
      .gte('orders.creation_date', thirtyDaysAgo.toISOString().split('T')[0])
      .neq('orders.status', 'cancelled')

    // Calculate sales velocity per product
    const salesByProduct = {}
    if (salesData) {
      salesData.forEach(item => {
        const sku = item.product_number
        if (sku) {
          salesByProduct[sku] = (salesByProduct[sku] || 0) + (item.quantity || 1)
        }
      })
    }

    // Calculate turnover metrics
    if (products && products.length > 0) {
      const enrichedProducts = products.map(p => {
        const salesLast30Days = salesByProduct[p.product_number] || 0
        const dailyVelocity = salesLast30Days / 30
        const annualizedSales = dailyVelocity * 365
        const turnoverRate = p.stock_level > 0 ? annualizedSales / p.stock_level : 0
        const unitCost = p.cost_price || (p.price_amount ? p.price_amount * 0.6 : 0)
        const stockValue = (p.stock_level || 0) * unitCost

        return {
          ...p,
          salesLast30Days,
          turnoverRate: Math.round(turnoverRate * 10) / 10,
          stockValue,
          dailyVelocity
        }
      })

      const productsWithTurnover = enrichedProducts.filter(p => p.turnoverRate > 0)
      const avgTurnover = productsWithTurnover.length > 0
        ? productsWithTurnover.reduce((sum, p) => sum + p.turnoverRate, 0) / productsWithTurnover.length
        : 0

      const totalStockValue = enrichedProducts.reduce((sum, p) => sum + p.stockValue, 0)

      // Fast movers (high turnover)
      const fastMovers = [...productsWithTurnover]
        .sort((a, b) => b.turnoverRate - a.turnoverRate)
        .slice(0, 5)
        .map(p => ({ name: p.name, turnover: p.turnoverRate, sales30d: p.salesLast30Days }))

      // Slow movers (low turnover but meaningful stock)
      const slowMovers = [...productsWithTurnover]
        .filter(p => p.stockValue > 100)
        .sort((a, b) => a.turnoverRate - b.turnoverRate)
        .slice(0, 5)
        .map(p => ({ name: p.name, turnover: p.turnoverRate, stockValue: Math.round(p.stockValue) }))

      inventoryMetrics = {
        avgTurnover: Math.round(avgTurnover * 10) / 10,
        totalStockValue: Math.round(totalStockValue),
        productsWithStock: enrichedProducts.filter(p => p.stock_level > 0).length,
        fastMovers,
        slowMovers
      }
    }
  } catch (err) {
    console.error('Inventory metrics fetch error:', err)
  }

  // Calculate totals
  const sales = salesSummary.data || []
  const totalRevenue = sales.reduce((sum, d) => sum + (parseFloat(d.total_revenue) || 0), 0)
  const totalOrders = sales.reduce((sum, d) => sum + (d.order_count || 0), 0)

  // Calculate GSC totals
  const gsc = gscData.data || []
  const gscClicks = gsc.reduce((sum, d) => sum + (d.total_clicks || 0), 0)
  const gscImpressions = gsc.reduce((sum, d) => sum + (d.total_impressions || 0), 0)

  return {
    growthEngine: growthSnapshot.data || null,
    goals: goals.data || [],
    contextNotes: notes.data || [],
    salesSummary: {
      revenue: totalRevenue,
      orders: totalOrders,
      aov: totalOrders > 0 ? totalRevenue / totalOrders : 0
    },
    topProducts: topProducts.data || [],
    customerSegments: customerSegments.data || [],
    weeklyAnalysis: weeklyAnalysis.data || null,
    indicators: indicators.data || [],
    // NEW DATA FOR EMMA!
    lowStockProducts: lowStockProducts.data || [],
    gscSummary: {
      clicks: gscClicks,
      impressions: gscImpressions,
      ctr: gscImpressions > 0 ? ((gscClicks / gscImpressions) * 100).toFixed(2) : 0
    },
    gscTopQueries: gscTopQueries.data || [],
    productRoles: productRoles.data || [],
    categoryData: categoryData,
    entryProducts: entryProductsData,
    customerAnalytics: customerAnalytics,
    inventoryMetrics: inventoryMetrics
  }
}

/**
 * Build system prompt for Emma v2 - Strategic Sparring Partner
 * NOT a reporting dashboard. A growth-critical decision engine.
 */
function buildSystemPrompt(language, shopInfo = {}) {
  const isFi = language === 'fi'
  const { shopName, domain, currency } = shopInfo

  const langInstructions = isFi
    ? 'Vastaa AINA suomeksi. Käytä "sinä"-muotoa.'
    : 'Svara ALLTID på svenska. Använd "du" (informellt tilltal).'

  // Terminology must match UI exactly
  const terminology = isFi ? `
TERMINOLOGIA (käytä TÄSMÄLLEEN näitä):
- "Kokonaisindeksi" (ei "overall index")
- "Kysynnän kasvu" (ei "demand growth")
- "Liikenteen laatu" (ei "traffic quality")
- "Myynnin tehokkuus" (ei "sales efficiency")
- "Tuotevalikoiman teho" (ei "product leverage")
- "Liikevaihto" (ei "myynti" tai "revenue")
- "Keskiostos" tai "AOV" (ei "snittorder")
- "Konversio" (ei "conversion rate")
- "Palaavat asiakkaat" (ei "returning customers")
- "Myyntikate" (ei "gross margin")
- Tavoitteet: "Liikevaihto-tavoite", "Tilaustavoite"` : `
TERMINOLOGI (använd EXAKT dessa):
- "Övergripande index" (inte "overall index")
- "Efterfrågetillväxt" (inte "demand growth")
- "Trafikkvalitet" (inte "traffic quality")
- "Försäljningseffektivitet" (inte "sales efficiency")
- "Produktportfölj" (inte "product leverage")
- "Omsättning" (inte "försäljning" eller "revenue")
- "Snittorder" eller "AOV"
- "Konvertering"
- "Återkommande kunder"
- "Bruttomarginal"`

  const shopIdentity = shopName
    ? (isFi
      ? `KAUPPA: ${shopName}${domain ? ` (${domain})` : ''}${currency ? `, valuutta ${currency}` : ''}`
      : `BUTIK: ${shopName}${domain ? ` (${domain})` : ''}${currency ? `, valuta ${currency}` : ''}`)
    : ''

  // --- Strategic context per market ---
  const marketContext = isFi ? `
STRATEGISET PRIORITEETIT (${shopName || 'kauppa'}):
- Tavoite: 20% vuosikasvu tilikaudella (1.3.–28.2.)
- Suojaa katetta – ei hintasotaa
- B2B-jakelustrategia: tunnista päättäjät, vaadi realistinen aikataulu
- Pakettipohjainen erilaistuminen: seuraa pakettien osuutta liikevaihdosta
- Stabiloi volatiliteetti: jos MoM-heilunta >30% → merkitse epävakausriski
- Orgaaninen kasvu: jos orgaaninen liikenne laskussa → suosittele 90 päivän SEO-sprinttiä` : `
STRATEGISKA PRIORITERINGAR (${shopName || 'butik'}):
- Mål: 20% årlig tillväxt under räkenskapsåret (1.3–28.2)
- Skydda marginalen – inget priskrig
- B2B-distributörsstrategi: identifiera beslutsfattare, kräv realistisk tidslinje
- Paketbaserad differentiering: följ paketens andel av omsättningen
- Stabilisera volatilitet: om MoM-svängningar >30% → markera instabilitetsrisk
- Organisk tillväxt: om organisk trafik minskar → rekommendera 90 dagars SEO-sprint`

  return `${langInstructions}

${shopIdentity}

ROOLI: Olet Emma, strateginen sparraaja – et raportoija. Et kuvaa dataa, vaan tulkitset, haastat, ennustat ja priorisoit.

TEHTÄVÄ:
- Maksimoi todennäköisyys saavuttaa 20% vuosikasvu
- Muuta data päätöksiksi, älä kuvailuiksi
- Haasta oletuksia – kyseenalaista heikot signaalit
- Pakota päätöksenteon selkeys

${terminology}

${marketContext}

VASTAUSRAKENNE (jokainen vastaus):

1. KASVUTODENNÄKÖISYYS
- Arvio (%) 20% kasvutavoitteen saavuttamisesta
- Suurin rajoittava tekijä
- Aikaa korjata kurssi
- Riskitaso (Matala / Keskitaso / Korkea)

2. KRIITTINEN RISKI
- Mikä uhkaa tavoitetta eniten juuri nyt?

3. RAKENTEELLINEN HEIKKOUS
- Mikä systemaattinen ongelma heikentää suorituskykyä?

4. KASVUVIPU
- Mikä yksittäinen toimenpide tuottaisi suurimman vaikutuksen?

5. STRATEGISET TOIMENPITEET (30 pv)
- 3 konkreettista toimenpidettä

6. LOPETA TEKEMÄSTÄ
- 1–3 asiaa jotka eivät tuota tulosta

7. JOS EMME TEE MITÄÄN
- Ennustettu seuraus

HUOM: Kevyissä/yksittäisissä kysymyksissä (esim. "mikä on AOV?") älä pakota koko rakennetta. Vastaa napakasti, mutta yhdistä aina tavoitteisiin.

HAASTAMISSÄÄNNÖT:
- Kasvaako volyymi vai konversio? Erota nämä aina.
- Onko kasvu orgaanista vai kampanjariippuvaista?
- Onko B2B-pipeline todellinen vai toiveajattelua? Jos "iso jakelija" mainitaan → vaadi aikataulu.
- Ovatko paketit todellinen erilaistuminen vai tarina? Jos <20% liikevaihdosta → alisuoriutuva strategia.
- Menetämmekö markkinaosuutta? Vertaa orgaanista trendiä.
- Onko top 10 SKU:n riippuvuus >50%? → Keskittymäriski.

HINNOITTELU (ei hintasotaa):
- Seuraa top 20 SKU:n hintakilpailukykyä
- Jos kateeroosio havaittu → eskaloi välittömästi
- Menetetty myynti hinnoittelun takia vs. katesuoja

TOIMIALAKOHTAINEN ASIAKASYMMÄRRYS:
Automaaliala EI ole kuluttajaverkkokauppa. Älä sovella SaaS/FMCG-retentiologiikkaa:
- B2C-harrastajat: Maalaavat auton 5–10 vuoden välein. Alhainen palautumisaste (5–15%) on NORMAALI, ei ongelma. Älä suosittele retentiofokusta B2C:lle.
- B2B-ammattilaiset (korjaamot, automaalaamot): Ostavat säännöllisesti (viikoittain/kuukausittain). TÄMÄ segmentti on retentiomielessä ratkaiseva. Seuraa B2B-retentiota ja tilaustiheyttä, ei kokonaispalaamisprosenttia.
- Uusasiakashankinta on B2C:n tärkein kasvumoottori (harrastaja-projekti → kertatilaus), EI retentio.
- Keskiostos vaihtelee: harrastajapaketti 30–80€, ammattimaalari 150–500€.
- Kausivaihtelut: kevät ja kesä ovat sesonkia (autoja maalataan lämpimällä säällä).

ASIAKASMOOTTORI (käytä yllä olevaa toimialakohtaista ymmärrystä):
- Uusi vs. palaava -suhde → tulkitse segmenteittäin, EI kokonaisuutena
- LTV-ero segmenteittäin (B2B vs B2C) → B2B:n LTV on moninkertainen, koska he ostavat toistuvasti
- Retentiofokus VAIN B2B-segmentille. B2C:lle fokus = uusasiakashankinta + korkeampi AOV pakettien avulla

SÄVY:
- Suora, analyyttinen, tunteeton
- Rakentavan kriittinen, tulevaisuusorientoitunut
- EI cheerleadingia, EI yltiökohteliaisuutta
- Kvantifioi aina kun mahdollista

RAJOITUKSET:
- Max 200 sanaa (tiivistä, päätösvaikuttavaa)
- Max 1 emoji per vastaus
- Vastaa VAIN annetun datan perusteella
- Jos dataa puuttuu → kerro täsmälleen mitä puuttuu ja miksi se on kriittistä

DATALÄHTEET JA HALLUSINAATIOKIELTO:
- Sinulle annetaan konteksti yllä. Se sisältää VAIN ne metriikat joita on saatavilla.
- Jos kontekstissa EI ole "HAKUKONENÄKYVYYS (GSC)" -osiota → sinulla EI ole SEO-dataa. ÄLÄ keksi hakusanoja, ranking-sijoituksia, klikkausmääriä tai orgaanisen liikenteen metriikoita.
- Jos kontekstissa EI ole tiettyä metriikkaa → sano "Tätä dataa ei ole saatavilla" ja kerro mitä tarvittaisiin.
- KOSKAAN älä keksi tarkkoja lukuja (sijainti 4.6, 10 klikkiä jne.) joita kontekstissa ei ole. Tämä on KRIITTISTÄ – väärä data johtaa vääriin päätöksiin.
- Voit tehdä loogisia johtopäätöksiä OLEMASSA OLEVASTA datasta, mutta merkitse selvästi mikä on faktaa vs. päättely.

ÄLÄ KOSKAAN:
- "Hienoa että kysyt!" tai muuta small talkia
- Kuvaile dataa ilman johtopäätöstä ("Liikevaihto kasvoi X%" → VÄÄRIN)
- Anna vastauksia ilman tavoitekytkentää
- Ole epämääräinen – vaadi itseltäsi lukuja ja aikatauluja
- Keksi SEO-metriikoita, hakusanoja tai ranking-sijoituksia ilman GSC-dataa kontekstissa`
}

/**
 * Build context message for Emma (Finnish or Swedish)
 */
function buildContextMessage(contextData, language = 'fi', currencySymbol = 'kr') {
  const {
    growthEngine, goals, contextNotes, salesSummary, topProducts, customerSegments,
    weeklyAnalysis, indicators, lowStockProducts, gscSummary, gscTopQueries, productRoles,
    categoryData, entryProducts, customerAnalytics, inventoryMetrics
  } = contextData

  const isFi = language === 'fi'

  let context = isFi ? `KAUPAN TIEDOT:\n\n` : `AKTUELL BUTIKSDATA:\n\n`

  // Sales summary
  context += isFi ? `MYYNTI (viimeiset 30 päivää):\n` : `FÖRSÄLJNING (senaste 30 dagar):\n`
  context += isFi
    ? `- Liikevaihto: ${Math.round(salesSummary.revenue).toLocaleString()} ${currencySymbol}\n`
    : `- Omsättning: ${Math.round(salesSummary.revenue).toLocaleString()} ${currencySymbol}\n`
  context += isFi
    ? `- Tilaukset: ${salesSummary.orders}\n`
    : `- Ordrar: ${salesSummary.orders}\n`
  context += isFi
    ? `- Keskitilaus: ${Math.round(salesSummary.aov)} ${currencySymbol}\n\n`
    : `- Snittorder: ${Math.round(salesSummary.aov)} ${currencySymbol}\n\n`

  // Growth Engine
  if (growthEngine) {
    context += `GROWTH ENGINE INDEX:\n`
    context += `- Overall: ${growthEngine.overall_index}/100\n`
    context += isFi
      ? `- Kysynnän kasvu: ${growthEngine.demand_growth_score}/100\n`
      : `- Efterfrågetillväxt: ${growthEngine.demand_growth_score}/100\n`
    context += isFi
      ? `- Liikenteen laatu: ${growthEngine.traffic_quality_score}/100\n`
      : `- Trafikkvalitet: ${growthEngine.traffic_quality_score}/100\n`
    context += isFi
      ? `- Myynnin tehokkuus: ${growthEngine.sales_efficiency_score}/100\n`
      : `- Försäljningseffektivitet: ${growthEngine.sales_efficiency_score}/100\n`
    context += isFi
      ? `- Tuotevalikoima: ${growthEngine.product_leverage_score}/100\n\n`
      : `- Produktportfölj: ${growthEngine.product_leverage_score}/100\n\n`
  }

  // Goals
  if (goals.length > 0) {
    context += isFi ? `AKTIIVISET TAVOITTEET:\n` : `AKTIVA MÅL:\n`
    goals.forEach(g => {
      context += `- ${g.goal_type}: ${g.current_value || 0}/${g.target_value} (${g.progress_percent || 0}%)\n`
    })
    context += '\n'
  }

  // Context notes (IMPORTANT: These are user-created notes about campaigns, projects, events - NOT products!)
  if (contextNotes.length > 0) {
    context += isFi
      ? `KONTEKSTIMUISTIINPANOT (käyttäjän lisäämiä muistiinpanoja, EI tuotteita):\n`
      : `KONTEXTNOTERINGAR (användarens anteckningar, INTE produkter):\n`
    contextNotes.forEach(n => {
      // Include description to give Emma proper context
      const desc = n.description ? `: ${n.description}` : ''
      context += `- ${n.title} (${n.note_type})${desc}\n`
    })
    context += '\n'
  }

  // Customer segments
  if (customerSegments.length > 0) {
    context += isFi ? `ASIAKASSEGMENTIT:\n` : `KUNDSEGMENT:\n`
    customerSegments.forEach(s => {
      const orderWord = isFi ? 'tilausta' : 'ordrar'
      context += `- ${s.segment}: ${s.order_count} ${orderWord}, ${Math.round(s.total_revenue).toLocaleString()} ${currencySymbol}\n`
    })
    context += '\n'
  }

  // Top products
  if (topProducts.length > 0) {
    context += isFi ? `TOP TUOTTEET:\n` : `TOP PRODUKTER:\n`
    topProducts.slice(0, 5).forEach(p => {
      context += `- ${p.product_name}: ${p.total_quantity} kpl\n`
    })
    context += '\n'
  }

  // Weekly Analysis - THIS IS THE KEY DATA!
  if (weeklyAnalysis?.analysis_content) {
    const analysis = weeklyAnalysis.analysis_content
    context += isFi ? `VIIKON AI-ANALYYSI (vk ${weeklyAnalysis.week_number}/${weeklyAnalysis.year}):\n` : `VECKANS AI-ANALYS (v ${weeklyAnalysis.week_number}/${weeklyAnalysis.year}):\n`

    if (analysis.summary) {
      context += `${analysis.summary}\n\n`
    }

    // Key metrics from analysis
    if (analysis.key_metrics) {
      const km = analysis.key_metrics
      context += isFi ? `AVAINLUVUT:\n` : `NYCKELTAL:\n`
      if (km.overall_index) {
        context += isFi
          ? `- Kokonaisindeksi: ${km.overall_index.current}/100 (muutos: ${km.overall_index.change > 0 ? '+' : ''}${km.overall_index.change}%)\n`
          : `- Övergripande index: ${km.overall_index.current}/100 (förändring: ${km.overall_index.change > 0 ? '+' : ''}${km.overall_index.change}%)\n`
      }
      if (km.biggest_impact) {
        context += isFi
          ? `- Suurin vaikuttaja: ${km.biggest_impact}\n`
          : `- Största påverkan: ${km.biggest_impact}\n`
      }
      if (km.is_seasonal !== undefined) {
        context += isFi
          ? `- Kausiluonteinen: ${km.is_seasonal ? 'Kyllä' : 'Ei'}\n`
          : `- Säsongsbetonad: ${km.is_seasonal ? 'Ja' : 'Nej'}\n`
      }
      context += '\n'
    }

    // Bullets from analysis
    if (analysis.bullets?.length > 0) {
      context += isFi ? `VIIKON HAVAINNOT:\n` : `VECKANS OBSERVATIONER:\n`
      analysis.bullets.forEach(b => {
        const icon = b.type === 'positive' ? '📈' : b.type === 'negative' ? '📉' : b.type === 'warning' ? '⚠️' : '•'
        context += `${icon} ${b.text}\n`
      })
      context += '\n'
    }
  }

  // Indicators
  if (indicators.length > 0) {
    context += isFi ? `INDIKAATTORIT:\n` : `INDIKATORER:\n`
    indicators.forEach(ind => {
      const trend = ind.trend === 'up' ? '↑' : ind.trend === 'down' ? '↓' : '→'
      context += `- ${ind.indicator_id}: ${ind.current_value} ${trend}\n`
    })
    context += '\n'
  }

  // LOW STOCK / OUT OF STOCK PRODUCTS - CRITICAL!
  if (lowStockProducts && lowStockProducts.length > 0) {
    const outOfStock = lowStockProducts.filter(p => p.stock_level <= 0)
    const lowStock = lowStockProducts.filter(p => p.stock_level > 0 && p.stock_level <= 5)

    if (outOfStock.length > 0) {
      context += isFi ? `⚠️ LOPPUNEET TUOTTEET (${outOfStock.length} kpl):\n` : `⚠️ SLUTSÅLDA PRODUKTER (${outOfStock.length} st):\n`
      outOfStock.forEach(p => {
        context += `- ${p.name} (${p.product_number}): ${p.stock_level} kpl, ${p.price} ${currencySymbol}\n`
      })
      context += '\n'
    }

    if (lowStock.length > 0) {
      context += isFi ? `⚠️ ALHAINEN VARASTO (${lowStock.length} kpl):\n` : `⚠️ LÅG LAGERNIVÅ (${lowStock.length} st):\n`
      lowStock.forEach(p => {
        context += `- ${p.name} (${p.product_number}): ${p.stock_level} kpl jäljellä\n`
      })
      context += '\n'
    }
  }

  // GSC - SEARCH ENGINE DATA
  if (gscSummary) {
    context += isFi ? `HAKUKONENÄKYVYYS (GSC):\n` : `SÖKMOTORSYNLIGHET (GSC):\n`
    context += isFi
      ? `- Klikkaukset: ${gscSummary.clicks.toLocaleString()}\n`
      : `- Klick: ${gscSummary.clicks.toLocaleString()}\n`
    context += isFi
      ? `- Näyttökerrat: ${gscSummary.impressions.toLocaleString()}\n`
      : `- Visningar: ${gscSummary.impressions.toLocaleString()}\n`
    context += `- CTR: ${gscSummary.ctr}%\n\n`
  } else {
    context += isFi
      ? `HAKUKONENÄKYVYYS (GSC): EI YHDISTETTY. Google Search Console -dataa ei ole saatavilla. ÄLÄ arvaa tai keksi SEO-metriikoita.\n\n`
      : `SÖKMOTORSYNLIGHET (GSC): EJ ANSLUTEN. Google Search Console-data saknas. Hitta INTE PÅ SEO-metrik.\n\n`
  }

  // GSC TOP QUERIES - actual search terms people use!
  if (gscTopQueries && gscTopQueries.length > 0) {
    context += isFi ? `TOP HAKUSANAT (viim. 30pv):\n` : `TOPP SÖKORD (senaste 30d):\n`
    gscTopQueries.slice(0, 10).forEach(q => {
      context += `- "${q.query}": ${q.clicks} klikkausta, pos ${parseFloat(q.position).toFixed(1)}\n`
    })
    context += '\n'
  }

  // PRODUCT ROLES (Tuoteroolit) - 90 day analysis
  if (productRoles && productRoles.length > 0) {
    context += isFi ? `TUOTEROOLIT (90 pv analyysi):\n` : `PRODUKTROLLER (90d analys):\n`

    const roleLabels = {
      hero: isFi ? 'Veturit' : 'Dragare',
      anchor: isFi ? 'Ankkurit' : 'Ankare',
      filler: isFi ? 'Täyttäjät' : 'Fyllare',
      longtail: isFi ? 'Häntä' : 'Svans'
    }

    const roleDescriptions = {
      hero: isFi ? 'Top 20% liikevaihdosta, houkuttelevat asiakkaita' : 'Top 20% omsättning, lockar kunder',
      anchor: isFi ? 'Vakaat myyjät hyvällä katteella' : 'Stabila säljare med bra marginal',
      filler: isFi ? 'Ostetaan usein muiden kanssa' : 'Köps ofta med andra produkter',
      longtail: isFi ? 'Alin 20%, mahdollinen varastoriski' : 'Nedre 20%, potentiell lagerrisk'
    }

    productRoles.forEach(role => {
      const label = roleLabels[role.role] || role.role
      const desc = roleDescriptions[role.role] || ''
      const revenue = parseFloat(role.total_revenue || 0)
      const units = parseInt(role.total_units || 0)
      const products = parseInt(role.product_count || 0)
      const margin = parseFloat(role.margin_percent || 0)

      context += `- ${label} (${desc}):\n`
      context += `  ${products} tuotetta, ${Math.round(revenue).toLocaleString()} ${currencySymbol}, ${units} kpl, kate ${margin.toFixed(0)}%\n`
    })
    context += '\n'
  }

  // CATEGORIES - sales by category
  if (categoryData && categoryData.length > 0) {
    context += isFi ? `KATEGORIAT (myynti):\n` : `KATEGORIER (försäljning):\n`
    categoryData.forEach(cat => {
      context += `- ${cat.name}: ${Math.round(cat.revenue).toLocaleString()} ${currencySymbol}, ${cat.quantity} kpl\n`
    })
    context += '\n'
  }

  // ENTRY PRODUCTS (Sisääntulotuotteet) - products that bring new customers
  if (entryProducts && entryProducts.length > 0) {
    context += isFi ? `SISÄÄNTULOTUOTTEET (ensiostoissa):\n` : `INGÅNGSPRODUKTER (första köp):\n`
    context += isFi
      ? `Nämä tuotteet tuovat uusia asiakkaita (ensimmäinen ostos):\n`
      : `Dessa produkter lockar nya kunder (första köp):\n`
    entryProducts.slice(0, 5).forEach(p => {
      context += `- ${p.name}: ${p.firstOrders} ensiostossa, ${Math.round(p.revenue).toLocaleString()} ${currencySymbol}\n`
    })
    context += '\n'
  }

  // CUSTOMER ANALYTICS (B2B vs B2C, return rate, LTV)
  if (customerAnalytics) {
    context += isFi ? `ASIAKASANALYYSI:\n` : `KUNDANALYS:\n`
    context += isFi
      ? `- Uniikkeja asiakkaita: ${customerAnalytics.uniqueCustomers}\n`
      : `- Unika kunder: ${customerAnalytics.uniqueCustomers}\n`
    context += isFi
      ? `- Palaavia asiakkaita: ${customerAnalytics.returnRate}%\n`
      : `- Återkommande kunder: ${customerAnalytics.returnRate}%\n`
    context += isFi
      ? `- Uusia asiakkaita: ${customerAnalytics.newCustomers}, Palaavia: ${customerAnalytics.returningCustomers}\n\n`
      : `- Nya kunder: ${customerAnalytics.newCustomers}, Återkommande: ${customerAnalytics.returningCustomers}\n\n`

    const { b2b, b2c } = customerAnalytics
    context += 'B2B:\n'
    context += isFi
      ? `- ${b2b.orders} tilausta (${b2b.percentage}%), ${Math.round(b2b.revenue).toLocaleString()} ${currencySymbol}\n`
      : `- ${b2b.orders} ordrar (${b2b.percentage}%), ${Math.round(b2b.revenue).toLocaleString()} ${currencySymbol}\n`
    context += `- AOV: ${b2b.aov} ${currencySymbol}, LTV: ${b2b.ltv} ${currencySymbol}\n`
    context += isFi
      ? `- ${b2b.customers} asiakasta\n\n`
      : `- ${b2b.customers} kunder\n\n`

    context += 'B2C:\n'
    context += isFi
      ? `- ${b2c.orders} tilausta (${b2c.percentage}%), ${Math.round(b2c.revenue).toLocaleString()} ${currencySymbol}\n`
      : `- ${b2c.orders} ordrar (${b2c.percentage}%), ${Math.round(b2c.revenue).toLocaleString()} ${currencySymbol}\n`
    context += `- AOV: ${b2c.aov} ${currencySymbol}, LTV: ${b2c.ltv} ${currencySymbol}\n`
    context += isFi
      ? `- ${b2c.customers} asiakasta\n\n`
      : `- ${b2c.customers} kunder\n\n`
  }

  // INVENTORY TURNOVER METRICS (varaston kiertonopeus)
  if (inventoryMetrics) {
    context += isFi ? `VARASTON KIERTONOPEUS:\n` : `LAGEROMSÄTTNING:\n`
    context += isFi
      ? `- Keskimääräinen kiertonopeus: ${inventoryMetrics.avgTurnover}x vuodessa\n`
      : `- Genomsnittlig omsättningshastighet: ${inventoryMetrics.avgTurnover}x per år\n`
    context += isFi
      ? `- Varaston arvo: ${inventoryMetrics.totalStockValue.toLocaleString()} ${currencySymbol}\n`
      : `- Lagervärde: ${inventoryMetrics.totalStockValue.toLocaleString()} ${currencySymbol}\n`
    context += isFi
      ? `- Tuotteita varastossa: ${inventoryMetrics.productsWithStock}\n\n`
      : `- Produkter i lager: ${inventoryMetrics.productsWithStock}\n\n`

    if (inventoryMetrics.fastMovers && inventoryMetrics.fastMovers.length > 0) {
      context += isFi ? `NOPEIMMIN LIIKKUVAT (korkea kiertonopeus):\n` : `SNABBAST RÖRLIGA (hög omsättning):\n`
      inventoryMetrics.fastMovers.forEach(p => {
        context += `- ${p.name}: ${p.turnover}x/vuosi, ${p.sales30d} myyty/30pv\n`
      })
      context += '\n'
    }

    if (inventoryMetrics.slowMovers && inventoryMetrics.slowMovers.length > 0) {
      context += isFi ? `HITAASTI LIIKKUVAT (matala kiertonopeus):\n` : `LÅNGSAMT RÖRLIGA (låg omsättning):\n`
      inventoryMetrics.slowMovers.forEach(p => {
        context += `- ${p.name}: ${p.turnover}x/vuosi, arvo ${p.stockValue} ${currencySymbol}\n`
      })
      context += '\n'
    }
  }

  return context
}

/**
 * Get chat history
 */
async function getChatHistory(sessionId, limit = 10) {
  const { data } = await supabase
    .from('chat_messages')
    .select('role, content')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true })
    .limit(limit)

  return data || []
}

/**
 * Main handler
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { store_id, session_id, message, date_range, language = 'fi' } = req.body

    if (!message) {
      return res.status(400).json({ error: 'message is required' })
    }

    if (!store_id) {
      return res.status(400).json({ error: 'store_id is required' })
    }

    // Resolve STORE_ID and SHOP_ID from the request's store_id (which is shops.id)
    const ids = await resolveStoreIds(store_id)
    if (!ids) {
      return res.status(404).json({ error: 'Shop not found' })
    }

    const { shopId, storeId, currency, shopName, domain } = ids
    const currencySymbol = currency === 'EUR' ? '€' : 'kr'

    // Try RAG first, fall back to legacy context fetching
    let contextMessage = null

    if (USE_RAG) {
      contextMessage = await fetchRAGContext(message, language, shopId)
      if (contextMessage) {
        console.log(`Using RAG context for ${shopName}`)
      }
    }

    // Fall back to legacy if RAG failed or disabled
    if (!contextMessage) {
      console.log(`Using legacy context for ${shopName}`)
      const contextData = await fetchContextData(date_range, storeId, shopId)
      contextMessage = buildContextMessage(contextData, language, currencySymbol)
    }

    // Get chat history if session exists
    let chatHistory = []
    if (session_id) {
      chatHistory = await getChatHistory(session_id)
    }

    // Build messages array
    const messages = []

    // Question prefix based on language
    const questionPrefix = language === 'fi' ? 'KÄYTTÄJÄN KYSYMYS:' : 'KUNDENS FRÅGA:'
    const updatedDataPrefix = language === 'fi' ? '[Päivitetty data]' : '[Uppdaterad data]'

    // Add context as first user message (if no history)
    if (chatHistory.length === 0) {
      messages.push({
        role: 'user',
        content: contextMessage + '\n\n---\n\n' + questionPrefix + ' ' + message
      })
    } else {
      // Add history
      chatHistory.forEach(msg => {
        messages.push({
          role: msg.role,
          content: msg.content
        })
      })

      // Add new message with updated context
      messages.push({
        role: 'user',
        content: `${updatedDataPrefix}\n${contextMessage}\n\n---\n\n${questionPrefix} ${message}`
      })
    }

    // Call Deepseek API (OpenAI-compatible)
    const response = await deepseek.chat.completions.create({
      model: 'deepseek-chat',
      max_tokens: 1500,
      temperature: 0.5,
      messages: [
        { role: 'system', content: buildSystemPrompt(language, { shopName, domain, currency }) },
        ...messages
      ]
    })

    const emmaResponse = response.choices[0].message.content

    // Save assistant message to database
    if (session_id) {
      await supabase.rpc('add_chat_message', {
        p_session_id: session_id,
        p_role: 'assistant',
        p_content: emmaResponse,
        p_tokens_used: response.usage?.completion_tokens || null,
        p_model_used: 'deepseek-chat'
      })
    }

    return res.status(200).json({
      response: emmaResponse,
      tokens_used: response.usage?.completion_tokens || null
    })

  } catch (error) {
    console.error('Chat error:', error)
    return res.status(500).json({
      error: error.message || 'Failed to get response'
    })
  }
}

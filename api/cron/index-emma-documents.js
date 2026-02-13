/**
 * Cron Job: Index Emma Documents
 *
 * Runs daily at 06:30 (after data sync at 06:00)
 * Indexes all metrics, insights, products into emma_documents with embeddings
 * for RAG-based context retrieval.
 *
 * Schedule: 0 30 6 * * * (vercel.json)
 */

import OpenAI from 'openai'
import { createClient } from '@supabase/supabase-js'

// Initialize OpenAI lazily to ensure env vars are loaded
let openai = null
function getOpenAI() {
  if (!openai) {
    if (!process.env.OPENAI_API_KEY) {
      console.error('OPENAI_API_KEY is not set!')
      return null
    }
    openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  }
  return openai
}

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// Store IDs
const STORE_ID = 'a28836f6-9487-4b67-9194-e907eaf94b69'
const SHOP_ID = '3b93e9b1-d64c-4686-a14a-bec535495f71'

/**
 * Generate embedding for text using OpenAI
 */
async function embedText(text) {
  const client = getOpenAI()
  if (!client) {
    console.error('OpenAI client not available - check OPENAI_API_KEY')
    return null
  }

  try {
    const response = await client.embeddings.create({
      model: 'text-embedding-3-small',
      input: text.slice(0, 8000) // Max 8k tokens
    })
    return response.data[0].embedding
  } catch (err) {
    console.error('Embedding error:', err.message || err)
    return null
  }
}

/**
 * Upsert document with embedding
 */
async function upsertDocument(docType, docId, category, content, textContent, priority = 0) {
  console.log(`  Upserting: ${docType}/${docId}`)

  const embedding = await embedText(textContent)
  if (!embedding) {
    console.error(`  ❌ Failed to embed: ${docType}/${docId}`)
    return { success: false, reason: 'embedding_failed' }
  }

  console.log(`  ✓ Embedding generated: ${embedding.length} dimensions`)

  // Convert embedding array to Supabase-compatible format
  const embeddingString = `[${embedding.join(',')}]`

  const { data, error } = await supabase.rpc('upsert_emma_document', {
    p_store_id: SHOP_ID,
    p_doc_type: docType,
    p_doc_id: docId,
    p_category: category,
    p_content: content,
    p_text_content: textContent,
    p_embedding: embeddingString,
    p_priority: priority
  })

  if (error) {
    console.error(`  ❌ Upsert error for ${docType}/${docId}:`, error.message || error)
    return { success: false, reason: 'upsert_failed', error: error.message }
  }

  console.log(`  ✓ Upserted: ${data}`)
  return { success: true, id: data }
}

/**
 * Index sales metrics
 */
async function indexSalesMetrics() {
  console.log('Indexing sales metrics...')
  let successCount = 0

  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

  // Fetch sales data
  const { data: salesData, error: salesError } = await supabase
    .from('v_daily_sales')
    .select('total_revenue, order_count, sale_date')
    .eq('store_id', STORE_ID)
    .gte('sale_date', thirtyDaysAgo.toISOString().split('T')[0])

  if (salesError) {
    console.error('  Sales data fetch error:', salesError.message)
  }
  if (!salesData?.length) {
    console.log('  No sales data found')
    return 0
  }

  const totalRevenue = salesData.reduce((sum, d) => sum + (parseFloat(d.total_revenue) || 0), 0)
  const totalOrders = salesData.reduce((sum, d) => sum + (d.order_count || 0), 0)
  const aov = totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 0
  const dailyAvg = Math.round(totalRevenue / 30)

  // Revenue metric
  let result = await upsertDocument('metric', 'revenue_30d', 'sales', {
    name_fi: 'Liikevaihto',
    name_sv: 'Omsättning',
    value: Math.round(totalRevenue),
    unit: 'kr',
    period: '30d'
  }, `Liikevaihto (Omsättning): ${Math.round(totalRevenue).toLocaleString()} kr viimeisen 30 päivän aikana. Myynti, tuotot, rahat sisään.`, 10)
  if (result?.success) successCount++

  // Orders metric
  result = await upsertDocument('metric', 'orders_30d', 'sales', {
    name_fi: 'Tilaukset',
    name_sv: 'Ordrar',
    value: totalOrders,
    unit: 'kpl',
    period: '30d'
  }, `Tilaukset (Ordrar): ${totalOrders} tilausta viimeisen 30 päivän aikana. Kuinka monta ostoa, kauppa.`, 9)
  if (result?.success) successCount++

  // AOV metric
  result = await upsertDocument('metric', 'aov_30d', 'sales', {
    name_fi: 'Keskiostos',
    name_sv: 'Snittorder',
    value: aov,
    unit: 'kr',
    period: '30d'
  }, `Keskiostos AOV (Snittorder): ${aov} kr per tilaus. Keskimääräinen ostoskorin arvo.`, 8)
  if (result?.success) successCount++

  // Daily average
  result = await upsertDocument('metric', 'daily_avg_30d', 'sales', {
    name_fi: 'Päivittäinen keskiarvo',
    name_sv: 'Dagligt snitt',
    value: dailyAvg,
    unit: 'kr',
    period: '30d'
  }, `Päivittäinen myynti keskimäärin: ${dailyAvg.toLocaleString()} kr. Kuinka paljon myyntiä syntyy päivässä.`, 5)
  if (result?.success) successCount++

  console.log(`  Sales metrics indexed: ${successCount}/4`)
  return successCount
}

/**
 * Index customer metrics
 */
async function indexCustomerMetrics() {
  console.log('Indexing customer metrics...')

  const { data: orders } = await supabase
    .from('orders')
    .select('id, billing_email, is_b2b, is_b2b_soft, grand_total')
    .eq('store_id', STORE_ID)
    .neq('status', 'cancelled')
    .limit(5000)

  if (!orders?.length) return 0

  // Build customer map
  const customerMap = {}
  orders.forEach(order => {
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
  const returnRate = customers.length > 0 ? Math.round((returningCust.length / customers.length) * 100) : 0

  // B2B metrics
  const b2bOrders = orders.filter(o => o.is_b2b || o.is_b2b_soft)
  const b2cOrders = orders.filter(o => !o.is_b2b && !o.is_b2b_soft)
  const b2bRevenue = b2bOrders.reduce((sum, o) => sum + (o.grand_total || 0), 0)
  const b2cRevenue = b2cOrders.reduce((sum, o) => sum + (o.grand_total || 0), 0)
  const b2bAOV = b2bOrders.length > 0 ? Math.round(b2bRevenue / b2bOrders.length) : 0
  const b2cAOV = b2cOrders.length > 0 ? Math.round(b2cRevenue / b2cOrders.length) : 0
  const b2bLTV = b2bCustomers.length > 0 ? Math.round(b2bCustomers.reduce((s, c) => s + c.revenue, 0) / b2bCustomers.length) : 0
  const b2cLTV = b2cCustomers.length > 0 ? Math.round(b2cCustomers.reduce((s, c) => s + c.revenue, 0) / b2cCustomers.length) : 0

  // Unique customers - enhanced text for better search
  await upsertDocument('metric', 'unique_customers', 'customers', {
    name_fi: 'Uniikit asiakkaat',
    name_sv: 'Unika kunder',
    value: customers.length,
    unit: 'kpl'
  }, `ASIAKKAAT (Kunder, Customers): Yhteensä ${customers.length} uniikkia asiakasta. Keitä mun asiakkaat on? Asiakaskunta, ostajat, tilaajat. Kuinka monta eri asiakasta on tilannut verkkokaupasta.`, 8)

  // Return rate - enhanced text
  await upsertDocument('metric', 'return_rate', 'customers', {
    name_fi: 'Palaavat asiakkaat',
    name_sv: 'Återkommande kunder',
    value: returnRate,
    unit: '%'
  }, `PALAAVAT ASIAKKAAT (Återkommande kunder): ${returnRate}% asiakkaista palaa ostamaan uudelleen. Asiakasuskollisuus, toistuvat ostot, kanta-asiakkaat, retention. Kuinka uskollisia asiakkaat ovat?`, 9)

  // B2B vs B2C comparison - enhanced text
  await upsertDocument('metric', 'b2b_metrics', 'customers', {
    name_fi: 'B2B asiakkaat',
    name_sv: 'B2B kunder',
    orders: b2bOrders.length,
    revenue: Math.round(b2bRevenue),
    aov: b2bAOV,
    ltv: b2bLTV,
    customers: b2bCustomers.length,
    percentage: Math.round((b2bOrders.length / orders.length) * 100)
  }, `B2B ASIAKKAAT (Yritysasiakkaat, Företagskunder): ${b2bOrders.length} tilausta (${Math.round((b2bOrders.length / orders.length) * 100)}%), liikevaihto ${Math.round(b2bRevenue).toLocaleString()} kr, keskiostos AOV ${b2bAOV} kr, elinkaariarvo LTV ${b2bLTV} kr. Yritysmyynti, ammattilaiset, automaalit, korjaamot, B2B-segmentti.`, 7)

  await upsertDocument('metric', 'b2c_metrics', 'customers', {
    name_fi: 'B2C asiakkaat',
    name_sv: 'B2C kunder',
    orders: b2cOrders.length,
    revenue: Math.round(b2cRevenue),
    aov: b2cAOV,
    ltv: b2cLTV,
    customers: b2cCustomers.length,
    percentage: Math.round((b2cOrders.length / orders.length) * 100)
  }, `B2C ASIAKKAAT (Kuluttaja-asiakkaat, Konsumentkunder): ${b2cOrders.length} tilausta (${Math.round((b2cOrders.length / orders.length) * 100)}%), liikevaihto ${Math.round(b2cRevenue).toLocaleString()} kr, keskiostos AOV ${b2cAOV} kr, elinkaariarvo LTV ${b2cLTV} kr. Yksityishenkilöt, kuluttajat, harrastajat, B2C-segmentti.`, 7)

  // B2B vs B2C insight
  if (b2bLTV > b2cLTV * 1.5) {
    await upsertDocument('insight', 'b2b_ltv_higher', 'customers', {
      severity: 'opportunity',
      text_fi: `B2B asiakkaiden LTV (${b2bLTV} kr) on ${Math.round(b2bLTV / b2cLTV)}x korkeampi kuin B2C (${b2cLTV} kr). B2B-markkinointi kannattavaa.`,
      text_sv: `B2B kunders LTV (${b2bLTV} kr) är ${Math.round(b2bLTV / b2cLTV)}x högre än B2C (${b2cLTV} kr).`
    }, `B2B asiakkaiden elinkaariarvo LTV on paljon korkeampi kuin B2C. B2B-markkinointi, ammattilaiset, yritysmyynti kannattavaa. ${b2bLTV} kr vs ${b2cLTV} kr.`, 6)
  }

  console.log('  Customer metrics indexed: 5')
  return 5
}

/**
 * Index inventory metrics
 */
async function indexInventoryMetrics() {
  console.log('Indexing inventory metrics...')

  const { data: products } = await supabase
    .from('products')
    .select('id, name, product_number, stock_level, cost_price, price_amount, for_sale')
    .eq('store_id', STORE_ID)
    .eq('for_sale', true)

  if (!products?.length) return 0

  // Calculate stock value
  const enrichedProducts = products.map(p => {
    const unitCost = p.cost_price || (p.price_amount ? p.price_amount * 0.6 : 0)
    return { ...p, stockValue: (p.stock_level || 0) * unitCost }
  })

  const totalStockValue = enrichedProducts.reduce((sum, p) => sum + p.stockValue, 0)
  const productsInStock = enrichedProducts.filter(p => p.stock_level > 0).length
  const outOfStock = enrichedProducts.filter(p => p.stock_level <= 0)
  const lowStock = enrichedProducts.filter(p => p.stock_level > 0 && p.stock_level <= 5)

  // Stock value
  await upsertDocument('metric', 'stock_value', 'inventory', {
    name_fi: 'Varaston arvo',
    name_sv: 'Lagervärde',
    value: Math.round(totalStockValue),
    unit: 'kr'
  }, `Varaston arvo (Lagervärde): ${Math.round(totalStockValue).toLocaleString()} kr. Kuinka paljon pääomaa on sitoutunut varastoon. Varastoarvo.`, 8)

  // Products in stock
  await upsertDocument('metric', 'products_in_stock', 'inventory', {
    name_fi: 'Tuotteita varastossa',
    name_sv: 'Produkter i lager',
    value: productsInStock,
    unit: 'kpl'
  }, `Tuotteita varastossa: ${productsInStock} tuotetta. Kuinka laaja valikoima on saatavilla.`, 5)

  // Out of stock alert - enhanced text for better search
  if (outOfStock.length > 0) {
    const outOfStockNames = outOfStock.slice(0, 10).map(p => p.name).join(', ')
    await upsertDocument('alert', 'out_of_stock', 'inventory', {
      severity: 'warning',
      count: outOfStock.length,
      products: outOfStock.slice(0, 10).map(p => ({ name: p.name, product_number: p.product_number }))
    }, `LOPPUNEET TUOTTEET - MITÄ ON LOPPU VARASTOSTA? (Slutsålda produkter): ${outOfStock.length} tuotetta loppu. Tuotteet: ${outOfStockNames}. Nämä tuotteet ovat loppuneet varastosta, ei voi myydä. Menetettyä myyntiä, tilaa lisää, varasto tyhjä, out of stock.`, 10)
  }

  // Low stock alert - enhanced text for better search
  if (lowStock.length > 0) {
    const lowStockNames = lowStock.slice(0, 10).map(p => `${p.name} (${p.stock_level})`).join(', ')
    await upsertDocument('alert', 'low_stock', 'inventory', {
      severity: 'warning',
      count: lowStock.length,
      products: lowStock.slice(0, 10).map(p => ({ name: p.name, product_number: p.product_number, stock_level: p.stock_level }))
    }, `ALHAINEN VARASTO - TUOTTEET LOPPUMASSA (Låg lagernivå): ${lowStock.length} tuotetta vähissä. Tuotteet: ${lowStockNames}. Nämä tuotteet loppumassa pian, täydennä varasto, tilaa lisää, low stock warning.`, 9)
  }

  console.log(`  Inventory metrics indexed: ${2 + (outOfStock.length > 0 ? 1 : 0) + (lowStock.length > 0 ? 1 : 0)}`)
  return 4
}

/**
 * Index GSC (SEO) metrics
 */
async function indexGSCMetrics() {
  console.log('Indexing GSC metrics...')

  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

  // GSC summary
  const { data: gscData } = await supabase
    .from('v_gsc_daily_summary')
    .select('*')
    .eq('store_id', STORE_ID)
    .gte('date', thirtyDaysAgo.toISOString().split('T')[0])

  // Top queries
  const { data: queries } = await supabase
    .from('gsc_search_analytics')
    .select('query, clicks, impressions, ctr, position')
    .eq('store_id', STORE_ID)
    .gte('date', thirtyDaysAgo.toISOString().split('T')[0])
    .order('clicks', { ascending: false })
    .limit(30)

  if (!gscData?.length) return 0

  const totalClicks = gscData.reduce((sum, d) => sum + (d.total_clicks || 0), 0)
  const totalImpressions = gscData.reduce((sum, d) => sum + (d.total_impressions || 0), 0)
  const avgCTR = totalImpressions > 0 ? ((totalClicks / totalImpressions) * 100).toFixed(2) : 0

  // Clicks metric
  await upsertDocument('metric', 'gsc_clicks', 'seo', {
    name_fi: 'Klikkaukset (GSC)',
    name_sv: 'Klick (GSC)',
    value: totalClicks,
    unit: 'kpl',
    period: '30d'
  }, `Google-klikkaukset (GSC klick): ${totalClicks.toLocaleString()} viimeisen 30 päivän aikana. Kuinka moni löytää kaupan Googlen kautta. Orgaaninen liikenne, SEO.`, 8)

  // Impressions metric
  await upsertDocument('metric', 'gsc_impressions', 'seo', {
    name_fi: 'Näyttökerrat (GSC)',
    name_sv: 'Visningar (GSC)',
    value: totalImpressions,
    unit: 'kpl',
    period: '30d'
  }, `Google-näytöt (GSC impressions): ${totalImpressions.toLocaleString()}. Kuinka usein kauppa näkyy hakutuloksissa. SEO-näkyvyys.`, 6)

  // CTR metric
  await upsertDocument('metric', 'gsc_ctr', 'seo', {
    name_fi: 'CTR (GSC)',
    name_sv: 'CTR (GSC)',
    value: parseFloat(avgCTR),
    unit: '%',
    period: '30d'
  }, `Google CTR (klikkausprosentti): ${avgCTR}%. Kuinka houkutteleva hakutulos on. Kuinka moni klikkaa hakutuloksesta.`, 7)

  // Top queries
  if (queries?.length > 0) {
    const topQueriesText = queries.slice(0, 15).map(q =>
      `"${q.query}": ${q.clicks} klikkausta, sijainti ${parseFloat(q.position).toFixed(1)}`
    ).join('; ')

    await upsertDocument('metric', 'gsc_top_queries', 'seo', {
      name_fi: 'Top hakusanat',
      name_sv: 'Topp sökord',
      queries: queries.slice(0, 15).map(q => ({
        query: q.query,
        clicks: q.clicks,
        impressions: q.impressions,
        position: parseFloat(q.position).toFixed(1)
      }))
    }, `TOP HAKUSANAT (Google Search Console): ${topQueriesText}. Millä sanoilla asiakkaat löytävät kaupan. SEO-avainsanat.`, 8)
  }

  console.log('  GSC metrics indexed: 4')
  return 4
}

/**
 * Index goals
 */
async function indexGoals() {
  console.log('Indexing goals...')

  const { data: goals } = await supabase
    .from('merchant_goals')
    .select('*')
    .eq('store_id', STORE_ID)
    .eq('is_active', true)

  if (!goals?.length) return 0

  for (const goal of goals) {
    const progressPercent = goal.target_value > 0
      ? Math.round((goal.current_value / goal.target_value) * 100)
      : 0

    await upsertDocument('goal', `goal_${goal.id}`, 'goals', {
      goal_type: goal.goal_type,
      target: goal.target_value,
      current: goal.current_value,
      progress: progressPercent,
      period: goal.period_type,
      is_active: goal.is_active
    }, `TAVOITE ${goal.goal_type}: ${goal.current_value || 0} / ${goal.target_value} (${progressPercent}% valmis). ${goal.goal_type === 'revenue' ? 'Liikevaihto myyntitavoite' : goal.goal_type === 'orders' ? 'Tilaustavoite' : 'Tavoite'}.`, 7)
  }

  console.log(`  Goals indexed: ${goals.length}`)
  return goals.length
}

/**
 * Index context notes
 */
async function indexContextNotes() {
  console.log('Indexing context notes...')

  const { data: notes } = await supabase
    .from('context_notes')
    .select('*')
    .eq('store_id', STORE_ID)
    .order('start_date', { ascending: false })
    .limit(10)

  if (!notes?.length) return 0

  for (const note of notes) {
    await upsertDocument('insight', `note_${note.id}`, 'general', {
      title: note.title,
      description: note.description,
      note_type: note.note_type,
      start_date: note.start_date,
      end_date: note.end_date
    }, `MUISTIINPANO (${note.note_type}): ${note.title}. ${note.description || ''}. Konteksti, kampanja, sesonki, tapahtuma.`, 6)
  }

  console.log(`  Context notes indexed: ${notes.length}`)
  return notes.length
}

/**
 * Index Growth Engine data
 */
async function indexGrowthEngine() {
  console.log('Indexing Growth Engine...')

  const { data: snapshot } = await supabase
    .from('growth_engine_snapshots')
    .select('*')
    .eq('store_id', STORE_ID)
    .order('period_end', { ascending: false })
    .limit(1)
    .single()

  if (!snapshot) return 0

  // Overall index
  await upsertDocument('metric', 'growth_engine_overall', 'general', {
    name_fi: 'Kokonaisindeksi',
    name_sv: 'Totalindex',
    value: snapshot.overall_index,
    unit: '/100'
  }, `Growth Engine kokonaisindeksi: ${snapshot.overall_index}/100. Liiketoiminnan kokonaisarvosana. Yleisindeksi, health score.`, 10)

  // Sub-indices
  await upsertDocument('metric', 'demand_growth_score', 'seo', {
    name_fi: 'Kysynnän kasvu',
    name_sv: 'Efterfrågetillväxt',
    value: snapshot.demand_growth_score,
    unit: '/100'
  }, `Kysynnän kasvu -indeksi: ${snapshot.demand_growth_score}/100. SEO-näkyvyys, orgaaninen kasvu, hakukonenäkyvyys.`, 8)

  await upsertDocument('metric', 'traffic_quality_score', 'traffic', {
    name_fi: 'Liikenteen laatu',
    name_sv: 'Trafikkvalitet',
    value: snapshot.traffic_quality_score,
    unit: '/100'
  }, `Liikenteen laatu -indeksi: ${snapshot.traffic_quality_score}/100. Engagement, bounce rate, kävijöiden laatu.`, 8)

  await upsertDocument('metric', 'sales_efficiency_score', 'sales', {
    name_fi: 'Myynnin tehokkuus',
    name_sv: 'Försäljningseffektivitet',
    value: snapshot.sales_efficiency_score,
    unit: '/100'
  }, `Myynnin tehokkuus -indeksi: ${snapshot.sales_efficiency_score}/100. Konversio, AOV, kate, LTV.`, 9)

  await upsertDocument('metric', 'product_leverage_score', 'inventory', {
    name_fi: 'Tuotevalikoiman teho',
    name_sv: 'Produktportföljens effekt',
    value: snapshot.product_leverage_score,
    unit: '/100'
  }, `Tuotevalikoiman teho -indeksi: ${snapshot.product_leverage_score}/100. Tuotteiden myynti, varaston tehokkuus, ABC-analyysi.`, 8)

  console.log('  Growth Engine indexed: 5')
  return 5
}

/**
 * Index top selling products
 */
async function indexTopProducts() {
  console.log('Indexing top products...')

  // v_top_products is already aggregated, no date filter needed
  const { data: topProducts, error } = await supabase
    .from('v_top_products')
    .select('product_name, product_number, total_revenue, total_quantity')
    .eq('store_id', STORE_ID)
    .order('total_revenue', { ascending: false })
    .limit(15)

  if (error) {
    console.error('  Top products error:', error.message)
    return 0
  }
  if (!topProducts?.length) return 0

  // Top 10 as single document for overview queries
  const top10Names = topProducts.slice(0, 10).map((p, i) =>
    `${i + 1}. ${p.product_name}: ${Math.round(p.total_revenue).toLocaleString()} kr (${p.total_quantity} kpl)`
  ).join('; ')

  await upsertDocument('metric', 'top_products_30d', 'sales', {
    name_fi: 'Myydyimmät tuotteet',
    name_sv: 'Bästsäljande produkter',
    products: topProducts.slice(0, 10).map(p => ({
      name: p.product_name,
      revenue: Math.round(p.total_revenue),
      quantity: p.total_quantity
    }))
  }, `TOP MYYDYIMMÄT TUOTTEET (Bästsäljare, Best sellers) viimeisen 30 päivän aikana: ${top10Names}. Mitkä tuotteet myyvät parhaiten? Parhaat tuotteet, suosituimmat, eniten myyty.`, 9)

  console.log('  Top products indexed: 1')
  return 1
}

/**
 * Index product roles (Hero, Anchor, Filler, Longtail)
 */
async function indexProductRoles() {
  console.log('Indexing product roles...')

  const ninetyDaysAgo = new Date()
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90)

  const { data: roles } = await supabase.rpc('get_product_roles_summary', {
    p_store_id: STORE_ID,
    p_start_date: ninetyDaysAgo.toISOString().split('T')[0],
    p_end_date: new Date().toISOString().split('T')[0]
  })

  if (!roles?.length) return 0

  const roleLabels = {
    hero: { fi: 'Veturit', sv: 'Dragare', desc: 'Top 20% liikevaihdosta, houkuttelevat asiakkaita' },
    anchor: { fi: 'Ankkurit', sv: 'Ankare', desc: 'Vakaat myyjät hyvällä katteella' },
    filler: { fi: 'Täyttäjät', sv: 'Fyllare', desc: 'Ostetaan usein muiden kanssa, lisämyynti' },
    longtail: { fi: 'Häntä', sv: 'Svans', desc: 'Alin 20%, mahdollinen varastoriski' }
  }

  let rolesText = 'TUOTEROOLIT (Produktroller, 90 päivän analyysi): '
  roles.forEach(r => {
    const label = roleLabels[r.role] || { fi: r.role, desc: '' }
    rolesText += `${label.fi}: ${r.product_count} tuotetta, ${Math.round(r.total_revenue).toLocaleString()} kr, kate ${parseFloat(r.margin_percent || 0).toFixed(0)}%; `
  })

  await upsertDocument('metric', 'product_roles', 'inventory', {
    name_fi: 'Tuoteroolit',
    name_sv: 'Produktroller',
    roles: roles.map(r => ({
      role: r.role,
      label_fi: roleLabels[r.role]?.fi || r.role,
      product_count: r.product_count,
      revenue: Math.round(r.total_revenue),
      margin: parseFloat(r.margin_percent || 0).toFixed(1)
    }))
  }, `${rolesText} Veturit vetävät asiakkaita, ankkurit tuovat katetta, täyttäjät lisämyyntiä, häntä sitoo pääomaa. ABC-analyysi, tuotevalikoiman optimointi.`, 7)

  console.log('  Product roles indexed: 1')
  return 1
}

/**
 * Index weekly AI analysis
 */
async function indexWeeklyAnalysis() {
  console.log('Indexing weekly analysis...')

  const { data: analysis } = await supabase
    .from('weekly_analyses')
    .select('*')
    .eq('store_id', SHOP_ID)
    .order('year', { ascending: false })
    .order('week_number', { ascending: false })
    .limit(1)
    .single()

  if (!analysis?.analysis_content) return 0

  const content = analysis.analysis_content
  let analysisText = `VIIKKOANALYYSI (Veckoanalys) viikko ${analysis.week_number}/${analysis.year}: `

  if (content.summary) {
    analysisText += content.summary + ' '
  }

  if (content.bullets?.length > 0) {
    analysisText += 'Havainnot: ' + content.bullets.map(b => b.text).join('; ') + ' '
  }

  if (content.key_metrics) {
    const km = content.key_metrics
    if (km.overall_index) {
      analysisText += `Kokonaisindeksi: ${km.overall_index.current}/100 (muutos ${km.overall_index.change > 0 ? '+' : ''}${km.overall_index.change}%). `
    }
    if (km.biggest_impact) {
      analysisText += `Suurin vaikuttaja: ${km.biggest_impact}. `
    }
  }

  await upsertDocument('insight', 'weekly_analysis', 'general', {
    name_fi: 'Viikkoanalyysi',
    name_sv: 'Veckoanalys',
    week: analysis.week_number,
    year: analysis.year,
    content: content
  }, analysisText + 'AI-generoitu viikkoanalyysi, trendit, muutokset, suositukset.', 8)

  console.log('  Weekly analysis indexed: 1')
  return 1
}

/**
 * Index category performance
 * Note: Simplified version - just lists available categories
 */
async function indexCategories() {
  console.log('Indexing categories...')

  // Get categories with their names
  const { data: categories, error: catError } = await supabase
    .from('categories')
    .select('id, level3, display_name')
    .eq('store_id', STORE_ID)

  if (catError) {
    console.error('  Categories error:', catError.message)
    return 0
  }
  if (!categories?.length) {
    console.log('  No categories found')
    return 0
  }

  // List categories for Emma's knowledge
  const catNames = categories
    .map(c => c.level3 || c.display_name)
    .filter(Boolean)
    .slice(0, 15)
    .join(', ')

  await upsertDocument('metric', 'category_list', 'inventory', {
    name_fi: 'Tuotekategoriat',
    name_sv: 'Produktkategorier',
    count: categories.length,
    categories: categories.slice(0, 15).map(c => c.level3 || c.display_name)
  }, `TUOTEKATEGORIAT (Produktkategorier, Categories): Yhteensä ${categories.length} kategoriaa. Kategoriat: ${catNames}. Tuoteryhmät, valikoima, tuoteluokat verkkokaupassa.`, 5)

  console.log('  Categories indexed: 1')
  return 1
}

/**
 * Main handler
 */
export default async function handler(req, res) {
  console.log('=== Emma Document Indexing Started ===')
  const startTime = Date.now()

  // Diagnostic check
  const hasOpenAIKey = !!process.env.OPENAI_API_KEY
  console.log('OPENAI_API_KEY set:', hasOpenAIKey)

  if (!hasOpenAIKey) {
    return res.status(500).json({
      success: false,
      error: 'OPENAI_API_KEY not configured',
      env_check: {
        openai_key: false,
        supabase_url: !!process.env.VITE_SUPABASE_URL,
        service_role: !!process.env.SUPABASE_SERVICE_ROLE_KEY
      }
    })
  }

  try {
    let totalDocs = 0

    // Index all data sources
    totalDocs += await indexSalesMetrics()
    totalDocs += await indexCustomerMetrics()
    totalDocs += await indexInventoryMetrics()
    totalDocs += await indexGSCMetrics()
    totalDocs += await indexGoals()
    totalDocs += await indexContextNotes()
    totalDocs += await indexGrowthEngine()
    totalDocs += await indexTopProducts()
    totalDocs += await indexProductRoles()
    totalDocs += await indexWeeklyAnalysis()
    totalDocs += await indexCategories()

    // Cleanup old documents (older than 7 days)
    const { data: deleted } = await supabase.rpc('cleanup_emma_documents', {
      p_store_id: SHOP_ID,
      p_older_than: '7 days'
    })

    const duration = ((Date.now() - startTime) / 1000).toFixed(2)
    console.log(`=== Indexing Complete: ${totalDocs} documents, ${duration}s ===`)

    return res.status(200).json({
      success: true,
      documents_indexed: totalDocs,
      documents_deleted: deleted || 0,
      duration_seconds: parseFloat(duration),
      env_check: { openai_key: hasOpenAIKey }
    })

  } catch (error) {
    console.error('Indexing error:', error)
    return res.status(500).json({
      success: false,
      error: error.message
    })
  }
}

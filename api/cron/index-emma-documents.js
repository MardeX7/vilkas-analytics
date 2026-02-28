/**
 * Cron Job: Index Emma Documents (Multi-tenant)
 *
 * Runs daily at 06:45 (after data sync at 06:00)
 * Indexes all metrics, insights, products into emma_documents with embeddings
 * for RAG-based context retrieval. Iterates all shops.
 */

import OpenAI from 'openai'
import { createClient } from '@supabase/supabase-js'

let openai = null
function getOpenAI() {
  if (!openai) {
    if (!process.env.OPENAI_API_KEY) return null
    openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  }
  return openai
}

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export const config = {
  maxDuration: 300,
}

async function embedText(text) {
  const client = getOpenAI()
  if (!client) return null
  try {
    const response = await client.embeddings.create({
      model: 'text-embedding-3-small',
      input: text.slice(0, 8000)
    })
    return response.data[0].embedding
  } catch (err) {
    console.error('Embedding error:', err.message || err)
    return null
  }
}

async function upsertDocument(shopId, docType, docId, category, content, textContent, priority = 0) {
  const embedding = await embedText(textContent)
  if (!embedding) return { success: false, reason: 'embedding_failed' }

  const embeddingString = `[${embedding.join(',')}]`

  const { data, error } = await supabase.rpc('upsert_emma_document', {
    p_store_id: shopId,
    p_doc_type: docType,
    p_doc_id: docId,
    p_category: category,
    p_content: content,
    p_text_content: textContent,
    p_embedding: embeddingString,
    p_priority: priority
  })

  if (error) {
    console.error(`  Upsert error ${docType}/${docId}:`, error.message)
    return { success: false }
  }
  return { success: true }
}

async function indexSalesMetrics(storeId, shopId, currency) {
  const unit = currency === 'EUR' ? '€' : 'kr'
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

  const { data: salesData } = await supabase
    .from('v_daily_sales')
    .select('total_revenue, order_count, sale_date')
    .eq('store_id', storeId)
    .gte('sale_date', thirtyDaysAgo.toISOString().split('T')[0])

  if (!salesData?.length) return 0

  const totalRevenue = salesData.reduce((sum, d) => sum + (parseFloat(d.total_revenue) || 0), 0)
  const totalOrders = salesData.reduce((sum, d) => sum + (d.order_count || 0), 0)
  const aov = totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 0
  const dailyAvg = Math.round(totalRevenue / 30)

  let count = 0
  if ((await upsertDocument(shopId, 'metric', 'revenue_30d', 'sales', { name_fi: 'Liikevaihto', value: Math.round(totalRevenue), unit, period: '30d' }, `Liikevaihto: ${Math.round(totalRevenue).toLocaleString()} ${unit} viimeisen 30 päivän aikana. Myynti, tuotot.`, 10)).success) count++
  if ((await upsertDocument(shopId, 'metric', 'orders_30d', 'sales', { name_fi: 'Tilaukset', value: totalOrders, unit: 'kpl', period: '30d' }, `Tilaukset: ${totalOrders} tilausta viimeisen 30 päivän aikana.`, 9)).success) count++
  if ((await upsertDocument(shopId, 'metric', 'aov_30d', 'sales', { name_fi: 'Keskiostos', value: aov, unit, period: '30d' }, `Keskiostos AOV: ${aov} ${unit} per tilaus.`, 8)).success) count++
  if ((await upsertDocument(shopId, 'metric', 'daily_avg_30d', 'sales', { name_fi: 'Päivittäinen keskiarvo', value: dailyAvg, unit, period: '30d' }, `Päivittäinen myynti keskimäärin: ${dailyAvg.toLocaleString()} ${unit}.`, 5)).success) count++

  return count
}

async function indexCustomerMetrics(storeId, shopId, currency) {
  const unit = currency === 'EUR' ? '€' : 'kr'
  const { data: orders } = await supabase
    .from('orders')
    .select('id, billing_email, is_b2b, is_b2b_soft, grand_total')
    .eq('store_id', storeId)
    .neq('status', 'cancelled')
    .limit(5000)

  if (!orders?.length) return 0

  const customerMap = {}
  orders.forEach(order => {
    const email = (order.billing_email || '').toLowerCase()
    if (email) {
      if (!customerMap[email]) customerMap[email] = { orders: 0, revenue: 0, isB2B: order.is_b2b || order.is_b2b_soft }
      customerMap[email].orders++
      customerMap[email].revenue += order.grand_total || 0
    }
  })

  const customers = Object.values(customerMap)
  const b2bCustomers = customers.filter(c => c.isB2B)
  const b2cCustomers = customers.filter(c => !c.isB2B)
  const returningCust = customers.filter(c => c.orders > 1)
  const returnRate = customers.length > 0 ? Math.round((returningCust.length / customers.length) * 100) : 0

  const b2bOrders = orders.filter(o => o.is_b2b || o.is_b2b_soft)
  const b2cOrders = orders.filter(o => !o.is_b2b && !o.is_b2b_soft)
  const b2bRevenue = b2bOrders.reduce((sum, o) => sum + (o.grand_total || 0), 0)
  const b2cRevenue = b2cOrders.reduce((sum, o) => sum + (o.grand_total || 0), 0)
  const b2bAOV = b2bOrders.length > 0 ? Math.round(b2bRevenue / b2bOrders.length) : 0
  const b2cAOV = b2cOrders.length > 0 ? Math.round(b2cRevenue / b2cOrders.length) : 0
  const b2bLTV = b2bCustomers.length > 0 ? Math.round(b2bCustomers.reduce((s, c) => s + c.revenue, 0) / b2bCustomers.length) : 0
  const b2cLTV = b2cCustomers.length > 0 ? Math.round(b2cCustomers.reduce((s, c) => s + c.revenue, 0) / b2cCustomers.length) : 0

  await upsertDocument(shopId, 'metric', 'unique_customers', 'customers', { name_fi: 'Uniikit asiakkaat', value: customers.length, unit: 'kpl' }, `ASIAKKAAT: Yhteensä ${customers.length} uniikkia asiakasta. Asiakaskunta, ostajat.`, 8)
  await upsertDocument(shopId, 'metric', 'return_rate', 'customers', { name_fi: 'Palaavat asiakkaat', value: returnRate, unit: '%' }, `PALAAVAT ASIAKKAAT: ${returnRate}% asiakkaista palaa ostamaan uudelleen. Asiakasuskollisuus, retention.`, 9)
  await upsertDocument(shopId, 'metric', 'b2b_metrics', 'customers', { name_fi: 'B2B asiakkaat', orders: b2bOrders.length, revenue: Math.round(b2bRevenue), aov: b2bAOV, ltv: b2bLTV, customers: b2bCustomers.length }, `B2B ASIAKKAAT: ${b2bOrders.length} tilausta (${Math.round((b2bOrders.length / orders.length) * 100)}%), liikevaihto ${Math.round(b2bRevenue).toLocaleString()} ${unit}, AOV ${b2bAOV} ${unit}, LTV ${b2bLTV} ${unit}.`, 7)
  await upsertDocument(shopId, 'metric', 'b2c_metrics', 'customers', { name_fi: 'B2C asiakkaat', orders: b2cOrders.length, revenue: Math.round(b2cRevenue), aov: b2cAOV, ltv: b2cLTV, customers: b2cCustomers.length }, `B2C ASIAKKAAT: ${b2cOrders.length} tilausta (${Math.round((b2cOrders.length / orders.length) * 100)}%), liikevaihto ${Math.round(b2cRevenue).toLocaleString()} ${unit}, AOV ${b2cAOV} ${unit}, LTV ${b2cLTV} ${unit}.`, 7)

  if (b2bLTV > b2cLTV * 1.5) {
    await upsertDocument(shopId, 'insight', 'b2b_ltv_higher', 'customers', { severity: 'opportunity' }, `B2B asiakkaiden LTV (${b2bLTV} ${unit}) on ${Math.round(b2bLTV / b2cLTV)}x korkeampi kuin B2C (${b2cLTV} ${unit}). B2B-markkinointi kannattavaa.`, 6)
  }

  return 5
}

async function indexInventoryMetrics(storeId, shopId, currency) {
  const unit = currency === 'EUR' ? '€' : 'kr'
  const { data: products } = await supabase.from('products').select('id, name, product_number, stock_level, cost_price, price_amount, for_sale').eq('store_id', storeId).eq('for_sale', true)
  if (!products?.length) return 0

  const enriched = products.map(p => ({ ...p, stockValue: (p.stock_level || 0) * (p.cost_price || (p.price_amount ? p.price_amount * 0.6 : 0)) }))
  const totalStockValue = enriched.reduce((sum, p) => sum + p.stockValue, 0)
  const outOfStock = enriched.filter(p => p.stock_level <= 0)
  const lowStock = enriched.filter(p => p.stock_level > 0 && p.stock_level <= 5)

  await upsertDocument(shopId, 'metric', 'stock_value', 'inventory', { name_fi: 'Varaston arvo', value: Math.round(totalStockValue), unit }, `Varaston arvo: ${Math.round(totalStockValue).toLocaleString()} ${unit}.`, 8)
  await upsertDocument(shopId, 'metric', 'products_in_stock', 'inventory', { name_fi: 'Tuotteita varastossa', value: enriched.filter(p => p.stock_level > 0).length, unit: 'kpl' }, `Tuotteita varastossa: ${enriched.filter(p => p.stock_level > 0).length} tuotetta.`, 5)

  if (outOfStock.length > 0) {
    await upsertDocument(shopId, 'alert', 'out_of_stock', 'inventory', { severity: 'warning', count: outOfStock.length, products: outOfStock.slice(0, 10).map(p => ({ name: p.name, product_number: p.product_number })) }, `LOPPUNEET TUOTTEET: ${outOfStock.length} tuotetta loppu. ${outOfStock.slice(0, 10).map(p => p.name).join(', ')}.`, 10)
  }

  if (lowStock.length > 0) {
    await upsertDocument(shopId, 'alert', 'low_stock', 'inventory', { severity: 'warning', count: lowStock.length }, `ALHAINEN VARASTO: ${lowStock.length} tuotetta vähissä. ${lowStock.slice(0, 10).map(p => `${p.name} (${p.stock_level})`).join(', ')}.`, 9)
  }

  return 4
}

async function indexGSCMetrics(storeId, shopId) {
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

  const { data: gscData } = await supabase.from('v_gsc_daily_summary').select('*').eq('store_id', storeId).gte('date', thirtyDaysAgo.toISOString().split('T')[0])
  const { data: queries } = await supabase.from('gsc_search_analytics').select('query, clicks, impressions, ctr, position').eq('store_id', storeId).gte('date', thirtyDaysAgo.toISOString().split('T')[0]).order('clicks', { ascending: false }).limit(30)

  if (!gscData?.length) return 0

  const totalClicks = gscData.reduce((sum, d) => sum + (d.total_clicks || 0), 0)
  const totalImpressions = gscData.reduce((sum, d) => sum + (d.total_impressions || 0), 0)
  const avgCTR = totalImpressions > 0 ? ((totalClicks / totalImpressions) * 100).toFixed(2) : 0

  await upsertDocument(shopId, 'metric', 'gsc_clicks', 'seo', { name_fi: 'Klikkaukset (GSC)', value: totalClicks, unit: 'kpl', period: '30d' }, `Google-klikkaukset (GSC): ${totalClicks.toLocaleString()} viimeisen 30 päivän aikana. Orgaaninen liikenne, SEO.`, 8)
  await upsertDocument(shopId, 'metric', 'gsc_impressions', 'seo', { name_fi: 'Näyttökerrat (GSC)', value: totalImpressions, unit: 'kpl', period: '30d' }, `Google-näytöt (GSC): ${totalImpressions.toLocaleString()}. SEO-näkyvyys.`, 6)
  await upsertDocument(shopId, 'metric', 'gsc_ctr', 'seo', { name_fi: 'CTR (GSC)', value: parseFloat(avgCTR), unit: '%', period: '30d' }, `Google CTR: ${avgCTR}%.`, 7)

  if (queries?.length > 0) {
    const topQueriesText = queries.slice(0, 15).map(q => `"${q.query}": ${q.clicks} klikkausta, sijainti ${parseFloat(q.position).toFixed(1)}`).join('; ')
    await upsertDocument(shopId, 'metric', 'gsc_top_queries', 'seo', { name_fi: 'Top hakusanat', queries: queries.slice(0, 15).map(q => ({ query: q.query, clicks: q.clicks, position: parseFloat(q.position).toFixed(1) })) }, `TOP HAKUSANAT: ${topQueriesText}.`, 8)
  }

  return 4
}

async function indexGoals(storeId, shopId) {
  const { data: goals } = await supabase.from('merchant_goals').select('*').eq('store_id', storeId).eq('is_active', true)
  if (!goals?.length) return 0

  for (const goal of goals) {
    const progressPercent = goal.target_value > 0 ? Math.round((goal.current_value / goal.target_value) * 100) : 0
    await upsertDocument(shopId, 'goal', `goal_${goal.id}`, 'goals', { goal_type: goal.goal_type, target: goal.target_value, current: goal.current_value, progress: progressPercent }, `TAVOITE ${goal.goal_type}: ${goal.current_value || 0} / ${goal.target_value} (${progressPercent}% valmis).`, 7)
  }
  return goals.length
}

async function indexContextNotes(storeId, shopId) {
  const { data: notes } = await supabase.from('context_notes').select('*').eq('store_id', storeId).order('start_date', { ascending: false }).limit(10)
  if (!notes?.length) return 0

  for (const note of notes) {
    await upsertDocument(shopId, 'insight', `note_${note.id}`, 'general', { title: note.title, description: note.description, note_type: note.note_type }, `MUISTIINPANO (${note.note_type}): ${note.title}. ${note.description || ''}.`, 6)
  }
  return notes.length
}

async function indexGrowthEngine(storeId, shopId) {
  const { data: snapshot } = await supabase.from('growth_engine_snapshots').select('*').eq('store_id', storeId).order('period_end', { ascending: false }).limit(1).maybeSingle()
  if (!snapshot) return 0

  await upsertDocument(shopId, 'metric', 'growth_engine_overall', 'general', { name_fi: 'Kokonaisindeksi', value: snapshot.overall_index, unit: '/100' }, `Growth Engine kokonaisindeksi: ${snapshot.overall_index}/100. Liiketoiminnan kokonaisarvosana.`, 10)
  await upsertDocument(shopId, 'metric', 'demand_growth_score', 'seo', { name_fi: 'Kysynnän kasvu', value: snapshot.demand_growth_score, unit: '/100' }, `Kysynnän kasvu: ${snapshot.demand_growth_score}/100. SEO-näkyvyys, orgaaninen kasvu.`, 8)
  await upsertDocument(shopId, 'metric', 'traffic_quality_score', 'traffic', { name_fi: 'Liikenteen laatu', value: snapshot.traffic_quality_score, unit: '/100' }, `Liikenteen laatu: ${snapshot.traffic_quality_score}/100. Engagement, bounce rate.`, 8)
  await upsertDocument(shopId, 'metric', 'sales_efficiency_score', 'sales', { name_fi: 'Myynnin tehokkuus', value: snapshot.sales_efficiency_score, unit: '/100' }, `Myynnin tehokkuus: ${snapshot.sales_efficiency_score}/100. Konversio, AOV, kate.`, 9)
  await upsertDocument(shopId, 'metric', 'product_leverage_score', 'inventory', { name_fi: 'Tuotevalikoiman teho', value: snapshot.product_leverage_score, unit: '/100' }, `Tuotevalikoiman teho: ${snapshot.product_leverage_score}/100.`, 8)

  return 5
}

async function indexTopProducts(storeId, shopId, currency) {
  const unit = currency === 'EUR' ? '€' : 'kr'
  const { data: topProducts } = await supabase.from('v_top_products').select('product_name, product_number, total_revenue, total_quantity').eq('store_id', storeId).order('total_revenue', { ascending: false }).limit(15)
  if (!topProducts?.length) return 0

  const top10Names = topProducts.slice(0, 10).map((p, i) => `${i + 1}. ${p.product_name}: ${Math.round(p.total_revenue).toLocaleString()} ${unit} (${p.total_quantity} kpl)`).join('; ')
  await upsertDocument(shopId, 'metric', 'top_products_30d', 'sales', { name_fi: 'Myydyimmät tuotteet', products: topProducts.slice(0, 10).map(p => ({ name: p.product_name, revenue: Math.round(p.total_revenue), quantity: p.total_quantity })) }, `TOP MYYDYIMMÄT TUOTTEET: ${top10Names}. Parhaat tuotteet, suosituimmat.`, 9)
  return 1
}

async function indexProductRoles(storeId, shopId) {
  const ninetyDaysAgo = new Date()
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90)
  const { data: roles } = await supabase.rpc('get_product_roles_summary', { p_store_id: storeId, p_start_date: ninetyDaysAgo.toISOString().split('T')[0], p_end_date: new Date().toISOString().split('T')[0] })
  if (!roles?.length) return 0

  const roleLabels = { hero: 'Veturit', anchor: 'Ankkurit', filler: 'Täyttäjät', longtail: 'Häntä' }
  let rolesText = 'TUOTEROOLIT: '
  roles.forEach(r => { rolesText += `${roleLabels[r.role] || r.role}: ${r.product_count} tuotetta, ${Math.round(r.total_revenue).toLocaleString()}, kate ${parseFloat(r.margin_percent || 0).toFixed(0)}%; ` })

  await upsertDocument(shopId, 'metric', 'product_roles', 'inventory', { name_fi: 'Tuoteroolit', roles: roles.map(r => ({ role: r.role, label_fi: roleLabels[r.role] || r.role, product_count: r.product_count, revenue: Math.round(r.total_revenue), margin: parseFloat(r.margin_percent || 0).toFixed(1) })) }, rolesText, 7)
  return 1
}

async function indexWeeklyAnalysis(shopId) {
  const { data: analysis } = await supabase.from('weekly_analyses').select('*').eq('store_id', shopId).order('year', { ascending: false }).order('week_number', { ascending: false }).limit(1).maybeSingle()
  if (!analysis?.analysis_content) return 0

  const content = analysis.analysis_content
  let analysisText = `VIIKKOANALYYSI viikko ${analysis.week_number}/${analysis.year}: `
  if (content.summary) analysisText += content.summary + ' '
  if (content.bullets?.length > 0) analysisText += 'Havainnot: ' + content.bullets.map(b => b.text).join('; ') + ' '

  await upsertDocument(shopId, 'insight', 'weekly_analysis', 'general', { name_fi: 'Viikkoanalyysi', week: analysis.week_number, year: analysis.year, content }, analysisText + 'AI-generoitu viikkoanalyysi.', 8)
  return 1
}

async function indexCategories(storeId, shopId) {
  const { data: categories } = await supabase.from('categories').select('id, level3, display_name').eq('store_id', storeId)
  if (!categories?.length) return 0

  const catNames = categories.map(c => c.level3 || c.display_name).filter(Boolean).slice(0, 15).join(', ')
  await upsertDocument(shopId, 'metric', 'category_list', 'inventory', { name_fi: 'Tuotekategoriat', count: categories.length, categories: categories.slice(0, 15).map(c => c.level3 || c.display_name) }, `TUOTEKATEGORIAT: ${categories.length} kategoriaa. ${catNames}.`, 5)
  return 1
}

/**
 * Main handler (Multi-tenant)
 */
export default async function handler(req, res) {
  console.log('=== Emma Document Indexing Started (Multi-tenant) ===')
  const startTime = Date.now()

  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({ success: false, error: 'OPENAI_API_KEY not configured' })
  }

  // Fetch all shops
  const { data: shops, error: shopsError } = await supabase
    .from('shops')
    .select('id, name, store_id, currency')

  if (shopsError || !shops?.length) {
    return res.status(500).json({ error: 'No shops found' })
  }

  const results = []

  for (const shop of shops) {
    const storeId = shop.store_id
    const shopId = shop.id
    const currency = shop.currency || 'EUR'

    if (!storeId) {
      results.push({ shop: shop.name, skipped: true })
      continue
    }

    console.log(`\nIndexing ${shop.name}...`)
    let totalDocs = 0

    try {
      totalDocs += await indexSalesMetrics(storeId, shopId, currency)
      totalDocs += await indexCustomerMetrics(storeId, shopId, currency)
      totalDocs += await indexInventoryMetrics(storeId, shopId, currency)
      totalDocs += await indexGSCMetrics(storeId, shopId)
      totalDocs += await indexGoals(storeId, shopId)
      totalDocs += await indexContextNotes(storeId, shopId)
      totalDocs += await indexGrowthEngine(storeId, shopId)
      totalDocs += await indexTopProducts(storeId, shopId, currency)
      totalDocs += await indexProductRoles(storeId, shopId)
      totalDocs += await indexWeeklyAnalysis(shopId)
      totalDocs += await indexCategories(storeId, shopId)

      const { data: deleted } = await supabase.rpc('cleanup_emma_documents', {
        p_store_id: shopId,
        p_older_than: '7 days'
      })

      console.log(`${shop.name}: ${totalDocs} documents indexed`)
      results.push({ shop: shop.name, success: true, documents: totalDocs, deleted: deleted || 0 })
    } catch (error) {
      console.error(`${shop.name} error:`, error.message)
      results.push({ shop: shop.name, success: false, error: error.message, documents: totalDocs })
    }
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(2)
  console.log(`=== Indexing Complete: ${duration}s ===`)

  return res.status(200).json({ success: true, duration_seconds: parseFloat(duration), results })
}

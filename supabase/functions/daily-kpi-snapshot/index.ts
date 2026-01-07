/**
 * Daily KPI Snapshot Edge Function
 *
 * Suoritetaan päivittäin (cron) tai manuaalisesti.
 * Luo:
 * 1. Varastosnapshotit (inventory_snapshots)
 * 2. KPI-indeksit (kpi_index_snapshots)
 *
 * Kutsutapa:
 * - POST /functions/v1/daily-kpi-snapshot
 * - Body: { "store_id": "uuid", "granularity": "week" }
 *
 * Cron: Supabase Dashboard -> Database -> Extensions -> pg_cron
 * tai ulkoinen cron (n8n, GitHub Actions, etc.)
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface KPIRequest {
  store_id?: string
  granularity?: 'week' | 'month'
  skip_inventory?: boolean
}

serve(async (req) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Parse request
    let body: KPIRequest = {}
    if (req.method === 'POST') {
      try {
        body = await req.json()
      } catch {
        // Empty body is OK
      }
    }

    const granularity = body.granularity || 'week'
    const skipInventory = body.skip_inventory || false

    console.log('Starting KPI snapshot calculation', { store_id: body.store_id, granularity, skipInventory })

    const results: Record<string, unknown> = {}

    // 1. Varastosnapshot (jos ei ohitettu)
    if (!skipInventory) {
      console.log('Creating inventory snapshots...')
      const { data: inventoryResult, error: inventoryError } = await supabase
        .rpc('create_daily_inventory_snapshot', { p_store_id: body.store_id || null })

      if (inventoryError) {
        console.error('Inventory snapshot error:', inventoryError)
        results.inventory = { error: inventoryError.message }
      } else {
        results.inventory = { rows_affected: inventoryResult }
        console.log(`Inventory snapshots created: ${inventoryResult} rows`)
      }
    }

    // 2. Hae kaupat joille lasketaan KPI:t
    let storeIds: string[] = []

    if (body.store_id) {
      storeIds = [body.store_id]
    } else {
      // Hae kaikki kaupat
      const { data: stores, error: storesError } = await supabase
        .from('stores')
        .select('id')

      if (storesError) {
        throw new Error(`Failed to fetch stores: ${storesError.message}`)
      }

      storeIds = stores?.map((s: { id: string }) => s.id) || []
    }

    console.log(`Processing ${storeIds.length} stores`)

    // 3. Laske KPI:t jokaiselle kaupalle
    const kpiResults: Record<string, unknown>[] = []

    for (const storeId of storeIds) {
      console.log(`Calculating KPI for store: ${storeId}`)

      try {
        const kpiResult = await calculateKPISnapshot(supabase, storeId, granularity)
        kpiResults.push({ store_id: storeId, success: true, ...kpiResult })
      } catch (error) {
        console.error(`KPI calculation failed for store ${storeId}:`, error)
        kpiResults.push({ store_id: storeId, success: false, error: String(error) })
      }
    }

    results.kpi = kpiResults

    // 4. Generoi AI-konteksti
    for (const storeId of storeIds) {
      try {
        const { data: aiContext, error: aiError } = await supabase
          .rpc('generate_ai_context', { p_store_id: storeId, p_granularity: granularity })

        if (aiError) {
          console.error(`AI context generation failed for ${storeId}:`, aiError)
        } else {
          console.log(`AI context generated for ${storeId}`)
        }
      } catch (error) {
        console.error(`AI context error for ${storeId}:`, error)
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        timestamp: new Date().toISOString(),
        granularity,
        results
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    )

  } catch (error) {
    console.error('Edge function error:', error)

    return new Response(
      JSON.stringify({
        success: false,
        error: String(error),
        timestamp: new Date().toISOString()
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    )
  }
})

/**
 * Laskee KPI-indeksit yhdelle kaupalle
 */
async function calculateKPISnapshot(
  supabase: ReturnType<typeof createClient>,
  storeId: string,
  granularity: 'week' | 'month'
): Promise<Record<string, unknown>> {
  const periodEnd = new Date()
  const periodStart = new Date()

  if (granularity === 'week') {
    periodStart.setDate(periodStart.getDate() - 6)
  } else {
    periodStart.setDate(1) // Kuukauden alku
  }

  const periodEndStr = periodEnd.toISOString().split('T')[0]
  const periodStartStr = periodStart.toISOString().split('T')[0]

  // 1. Hae raakametriikat
  const { data: coreMetrics, error: coreError } = await supabase
    .rpc('calculate_core_metrics', {
      p_store_id: storeId,
      p_period_start: periodStartStr,
      p_period_end: periodEndStr
    })

  if (coreError) {
    throw new Error(`Core metrics error: ${coreError.message}`)
  }

  const { data: seoMetrics, error: seoError } = await supabase
    .rpc('calculate_seo_metrics', {
      p_store_id: storeId,
      p_period_start: periodStartStr,
      p_period_end: periodEndStr
    })

  if (seoError) {
    console.warn(`SEO metrics error (continuing): ${seoError.message}`)
  }

  const { data: opMetrics, error: opError } = await supabase
    .rpc('calculate_operational_metrics', {
      p_store_id: storeId,
      p_period_start: periodStartStr,
      p_period_end: periodEndStr
    })

  if (opError) {
    console.warn(`Operational metrics error (continuing): ${opError.message}`)
  }

  // 2. Hae historiadata normalisointia varten
  const { data: revenueHistory } = await supabase
    .rpc('get_history_array', { p_store_id: storeId, p_metric: 'revenue', p_days: 90 })
  const { data: aovHistory } = await supabase
    .rpc('get_history_array', { p_store_id: storeId, p_metric: 'aov', p_days: 90 })
  const { data: profitHistory } = await supabase
    .rpc('get_history_array', { p_store_id: storeId, p_metric: 'gross_profit', p_days: 90 })

  // 3. Laske indeksit

  // CORE INDEX
  const grossProfitIndex = normalizeToIndex(coreMetrics.gross_profit, profitHistory || [], true)
  const aovIndex = normalizeToIndex(coreMetrics.aov, aovHistory || [], true)
  const repeatIndex = Math.max(0, Math.min(100, coreMetrics.repeat_rate * 2)) // 0-50% -> 0-100
  const stockIndex = Math.max(0, Math.min(100, 100 - (coreMetrics.out_of_stock_percent * 5)))

  // Trendi: tarvitaan edellisen jakson data
  const trendIndex = 50 // TODO: laske trendi

  const coreIndex = Math.round(
    grossProfitIndex * 0.30 +
    aovIndex * 0.20 +
    repeatIndex * 0.20 +
    trendIndex * 0.20 +
    stockIndex * 0.10
  )

  // SEO PERFORMANCE INDEX
  let spiIndex = 50
  let spiComponents = {}
  if (seoMetrics) {
    const clicksTrendIndex = 50 // TODO
    const positionIndex = Math.max(0, Math.min(100, 100 - (seoMetrics.avg_position - 1) * 5))
    const nonBrandIndex = calculateNonBrandIndex(seoMetrics.nonbrand_percent)
    const risingIndex = Math.min(100, seoMetrics.rising_queries_count * 10)

    spiIndex = Math.round(
      clicksTrendIndex * 0.30 +
      positionIndex * 0.30 +
      nonBrandIndex * 0.25 +
      risingIndex * 0.15
    )

    spiComponents = {
      clicks_trend: { value: 0, index: clicksTrendIndex, weight: 0.30 },
      position: { value: seoMetrics.avg_position, index: positionIndex, weight: 0.30 },
      nonbrand: { value: seoMetrics.nonbrand_percent, index: nonBrandIndex, weight: 0.25 },
      rising: { value: seoMetrics.rising_queries_count, index: risingIndex, weight: 0.15 }
    }
  }

  // OPERATIONAL INDEX
  let oiIndex = 50
  let oiComponents = {}
  if (opMetrics) {
    const fulfillmentIndex = Math.max(0, Math.min(100, 100 - ((opMetrics.avg_fulfillment_days - 1) * 16.67)))
    const dispatchIndex = opMetrics.dispatch_rate

    oiIndex = Math.round(
      fulfillmentIndex * 0.50 +
      stockIndex * 0.30 +
      dispatchIndex * 0.20
    )

    oiComponents = {
      fulfillment: { value: opMetrics.avg_fulfillment_days, index: fulfillmentIndex, weight: 0.50 },
      stock: { value: 100 - coreMetrics.out_of_stock_percent, index: stockIndex, weight: 0.30 },
      dispatch_rate: { value: opMetrics.dispatch_rate, index: dispatchIndex, weight: 0.20 }
    }
  }

  // PPI - Product Profitability (yksinkertaistettu aggregaatti)
  // Oletus: 50% marginaali = 100, rajataan 0-100
  const ppiIndex = Math.max(0, Math.min(100, Math.round((coreMetrics.margin_percent / 50) * 100)))

  // Overall
  const overallIndex = Math.round(
    coreIndex * 0.35 +
    ppiIndex * 0.25 +
    spiIndex * 0.20 +
    oiIndex * 0.20
  )

  // 4. Hae edellinen snapshot deltajen laskentaa varten
  const { data: previousSnapshot } = await supabase
    .from('kpi_index_snapshots')
    .select('*')
    .eq('store_id', storeId)
    .eq('granularity', granularity)
    .lt('period_end', periodEndStr)
    .order('period_end', { ascending: false })
    .limit(1)
    .single()

  const deltas = {
    core: previousSnapshot ? coreIndex - previousSnapshot.core_index : 0,
    ppi: previousSnapshot ? ppiIndex - previousSnapshot.product_profitability_index : 0,
    spi: previousSnapshot ? spiIndex - previousSnapshot.seo_performance_index : 0,
    oi: previousSnapshot ? oiIndex - previousSnapshot.operational_index : 0,
    overall: previousSnapshot ? overallIndex - previousSnapshot.overall_index : 0
  }

  // 5. Generoi hälytykset
  const alerts: string[] = []
  if (coreIndex < 40) alerts.push('core_health_warning')
  if (ppiIndex < 40) alerts.push('profitability_warning')
  if (spiIndex < 40) alerts.push('seo_warning')
  if (oiIndex < 40) alerts.push('operational_warning')
  if (coreMetrics.out_of_stock_percent > 10) alerts.push('high_out_of_stock')
  if (deltas.overall < -10) alerts.push('significant_decline')

  // 6. Tallenna snapshot
  const { data: snapshot, error: snapshotError } = await supabase
    .from('kpi_index_snapshots')
    .upsert({
      store_id: storeId,
      period_start: periodStartStr,
      period_end: periodEndStr,
      granularity,
      core_index: coreIndex,
      product_profitability_index: ppiIndex,
      seo_performance_index: spiIndex,
      operational_index: oiIndex,
      overall_index: overallIndex,
      core_index_delta: deltas.core,
      ppi_delta: deltas.ppi,
      spi_delta: deltas.spi,
      oi_delta: deltas.oi,
      overall_delta: deltas.overall,
      raw_metrics: { core: coreMetrics, seo: seoMetrics, operational: opMetrics },
      core_components: {
        gross_profit: { value: coreMetrics.gross_profit, index: grossProfitIndex, weight: 0.30 },
        aov: { value: coreMetrics.aov, index: aovIndex, weight: 0.20 },
        repeat_rate: { value: coreMetrics.repeat_rate, index: repeatIndex, weight: 0.20 },
        trend: { value: 0, index: trendIndex, weight: 0.20 },
        stock: { value: 100 - coreMetrics.out_of_stock_percent, index: stockIndex, weight: 0.10 }
      },
      spi_components: spiComponents,
      oi_components: oiComponents,
      alerts
    }, {
      onConflict: 'store_id,period_end,granularity'
    })
    .select()
    .single()

  if (snapshotError) {
    throw new Error(`Snapshot save error: ${snapshotError.message}`)
  }

  // 7. Logita
  await supabase.from('kpi_calculation_log').insert({
    store_id: storeId,
    calculation_type: 'snapshot',
    period_start: periodStartStr,
    period_end: periodEndStr,
    granularity,
    status: 'completed',
    metrics: {
      indexes: { core: coreIndex, ppi: ppiIndex, spi: spiIndex, oi: oiIndex, overall: overallIndex },
      deltas
    },
    completed_at: new Date().toISOString()
  })

  return {
    snapshot_id: snapshot.id,
    indexes: { core: coreIndex, ppi: ppiIndex, spi: spiIndex, oi: oiIndex, overall: overallIndex },
    deltas,
    alerts
  }
}

/**
 * Normalisoi arvo 0-100 asteikolle historiaan perustuen
 */
function normalizeToIndex(value: number, history: number[], higherIsBetter = true): number {
  if (!history || history.length === 0) return 50

  const sorted = [...history].sort((a, b) => a - b)
  const median = sorted[Math.floor(sorted.length / 2)]
  const mean = history.reduce((a, b) => a + b, 0) / history.length
  const stdDev = Math.sqrt(
    history.reduce((sq, n) => sq + Math.pow(n - mean, 2), 0) / history.length
  )

  const zScore = stdDev > 0 ? (value - median) / stdDev : 0
  let index = 50 + (zScore * 25)

  if (!higherIsBetter) {
    index = 100 - index + 50
  }

  return Math.max(0, Math.min(100, Math.round(index)))
}

/**
 * Laske non-brand indeksi
 * Optimi: 40-70% non-brand
 */
function calculateNonBrandIndex(nonBrandPercent: number): number {
  if (nonBrandPercent >= 40 && nonBrandPercent <= 70) {
    return 100
  } else if (nonBrandPercent < 40) {
    return nonBrandPercent * (100 / 40)
  } else {
    return Math.max(50, 100 - ((nonBrandPercent - 70) * 1.5))
  }
}

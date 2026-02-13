/**
 * Backfill Growth Engine Snapshots
 *
 * Creates historical snapshots for weeks starting from January 2026.
 * Only creates snapshots for periods where we have actual YoY data.
 *
 * Usage:
 *   node scripts/backfill_growth_engine_snapshots.cjs
 */

require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const { execSync } = require('child_process');

// Configuration
const STORE_ID = 'a28836f6-9487-4b67-9194-e907eaf94b69';
const SUPABASE_URL = 'https://tlothekaphtiwvusgwzh.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

/**
 * Get ISO week info for a specific week number and year
 */
function getWeekDates(year, week) {
  const jan4 = new Date(year, 0, 4);
  const dayOfWeek = jan4.getDay() || 7;
  const weekStart = new Date(jan4);
  weekStart.setDate(jan4.getDate() - dayOfWeek + 1 + (week - 1) * 7);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  return {
    start: weekStart.toISOString().split('T')[0],
    end: weekEnd.toISOString().split('T')[0]
  };
}

/**
 * Calculate score from YoY change
 */
function calculateScore(yoyChange) {
  if (yoyChange === null || yoyChange === undefined) return 50;
  if (yoyChange >= 20) return 100;
  if (yoyChange >= 10) return 80;
  if (yoyChange >= 1) return 60;
  if (yoyChange >= 0) return 50;
  if (yoyChange >= -9) return 30;
  return 10;
}

function getIndexLevel(score) {
  if (score >= 80) return 'excellent';
  if (score >= 60) return 'good';
  if (score >= 40) return 'needs_work';
  return 'poor';
}

function safeRound(val, decimals = 1) {
  if (val === null || val === undefined) return null;
  const multiplier = Math.pow(10, decimals);
  return Math.round(val * multiplier) / multiplier;
}

/**
 * Calculate Growth Engine for a specific period
 */
async function calculateGrowthEngine(startDate, endDate) {
  const startDateObj = new Date(startDate);
  const endDateObj = new Date(endDate);
  const prevYearStart = new Date(startDateObj);
  prevYearStart.setFullYear(prevYearStart.getFullYear() - 1);
  const prevYearEnd = new Date(endDateObj);
  prevYearEnd.setFullYear(prevYearEnd.getFullYear() - 1);
  const prevStartStr = prevYearStart.toISOString().split('T')[0];
  const prevEndStr = prevYearEnd.toISOString().split('T')[0];

  // GSC data
  const [{ data: currentGsc }, { data: prevGsc }] = await Promise.all([
    supabase.from('v_gsc_daily_summary').select('total_clicks, total_impressions').eq('store_id', STORE_ID).gte('date', startDate).lte('date', endDate),
    supabase.from('v_gsc_daily_summary').select('total_clicks, total_impressions').eq('store_id', STORE_ID).gte('date', prevStartStr).lte('date', prevEndStr)
  ]);

  const currentClicks = currentGsc?.reduce((s, d) => s + (d.total_clicks || 0), 0) || 0;
  const prevClicks = prevGsc?.reduce((s, d) => s + (d.total_clicks || 0), 0) || 0;
  const clicksYoY = prevClicks > 0 ? ((currentClicks - prevClicks) / prevClicks) * 100 : null;

  const currentImpressions = currentGsc?.reduce((s, d) => s + (d.total_impressions || 0), 0) || 0;
  const prevImpressions = prevGsc?.reduce((s, d) => s + (d.total_impressions || 0), 0) || 0;
  const impressionsYoY = prevImpressions > 0 ? ((currentImpressions - prevImpressions) / prevImpressions) * 100 : null;

  const demandGrowthMetrics = {
    organicClicks: { current: currentClicks, previous: prevClicks, yoyChange: safeRound(clicksYoY), score: calculateScore(clicksYoY) },
    impressions: { current: currentImpressions, previous: prevImpressions, yoyChange: safeRound(impressionsYoY), score: calculateScore(impressionsYoY) },
    top10Keywords: { current: 0, previous: 0, yoyChange: null, score: 50 }
  };
  const demandGrowthScore = Math.round((demandGrowthMetrics.organicClicks.score + demandGrowthMetrics.impressions.score + demandGrowthMetrics.top10Keywords.score) / 3);

  // GA4 data
  const [{ data: currentGA4 }, { data: prevGA4 }] = await Promise.all([
    supabase.from('v_ga4_daily_summary').select('total_sessions, total_engaged_sessions').eq('store_id', STORE_ID).gte('date', startDate).lte('date', endDate),
    supabase.from('v_ga4_daily_summary').select('total_sessions, total_engaged_sessions').eq('store_id', STORE_ID).gte('date', prevStartStr).lte('date', prevEndStr)
  ]);

  const currentSessions = currentGA4?.reduce((s, d) => s + (d.total_sessions || 0), 0) || 0;
  const currentEngaged = currentGA4?.reduce((s, d) => s + (d.total_engaged_sessions || 0), 0) || 0;
  const currentEngagementRate = currentSessions > 0 ? (currentEngaged / currentSessions) * 100 : 0;
  const prevSessions = prevGA4?.reduce((s, d) => s + (d.total_sessions || 0), 0) || 0;
  const prevEngaged = prevGA4?.reduce((s, d) => s + (d.total_engaged_sessions || 0), 0) || 0;
  const prevEngagementRate = prevSessions > 0 ? (prevEngaged / prevSessions) * 100 : 0;
  const engagementYoY = prevEngagementRate > 0 ? ((currentEngagementRate - prevEngagementRate) / prevEngagementRate) * 100 : null;

  const trafficQualityMetrics = {
    engagementRate: { current: safeRound(currentEngagementRate), previous: safeRound(prevEngagementRate), yoyChange: safeRound(engagementYoY), score: calculateScore(engagementYoY) },
    organicShare: { current: null, previous: null, yoyChange: null, score: 50 },
    bounceRate: { current: null, previous: null, yoyChange: null, score: 50 }
  };
  const trafficQualityScore = Math.round((trafficQualityMetrics.engagementRate.score + trafficQualityMetrics.organicShare.score + trafficQualityMetrics.bounceRate.score) / 3);

  // Orders data
  const [{ data: currentOrders }, { data: prevOrders }, { data: products }] = await Promise.all([
    supabase.from('orders').select('id, grand_total, order_line_items (quantity, total_price, product_number)').eq('store_id', STORE_ID).neq('status', 'cancelled').gte('creation_date', startDate).lte('creation_date', endDate + 'T23:59:59'),
    supabase.from('orders').select('id, grand_total, order_line_items (quantity, total_price, product_number)').eq('store_id', STORE_ID).neq('status', 'cancelled').gte('creation_date', prevStartStr).lte('creation_date', prevEndStr + 'T23:59:59'),
    supabase.from('products').select('product_number, cost_price').eq('store_id', STORE_ID)
  ]);

  const costMap = new Map();
  products?.forEach(p => { if (p.product_number && p.cost_price) costMap.set(p.product_number, p.cost_price); });

  const currentOrderCount = currentOrders?.length || 0;
  const currentRevenue = currentOrders?.reduce((s, o) => s + (o.grand_total || 0), 0) || 0;
  const currentAOV = currentOrderCount > 0 ? currentRevenue / currentOrderCount : 0;

  let currentCost = 0;
  currentOrders?.forEach(o => { o.order_line_items?.forEach(item => { currentCost += (costMap.get(item.product_number) || 0) * (item.quantity || 1); }); });
  const currentGrossMargin = currentRevenue > 0 ? ((currentRevenue - currentCost) / currentRevenue) * 100 : 0;
  const currentMarginPerOrder = currentOrderCount > 0 ? (currentRevenue - currentCost) / currentOrderCount : 0;

  const prevOrderCount = prevOrders?.length || 0;
  const prevRevenue = prevOrders?.reduce((s, o) => s + (o.grand_total || 0), 0) || 0;
  const prevAOV = prevOrderCount > 0 ? prevRevenue / prevOrderCount : 0;

  let prevCost = 0;
  prevOrders?.forEach(o => { o.order_line_items?.forEach(item => { prevCost += (costMap.get(item.product_number) || 0) * (item.quantity || 1); }); });
  const prevGrossMargin = prevRevenue > 0 ? ((prevRevenue - prevCost) / prevRevenue) * 100 : 0;
  const prevMarginPerOrder = prevOrderCount > 0 ? (prevRevenue - prevCost) / prevOrderCount : 0;

  const currentConversionRate = currentSessions > 0 ? (currentOrderCount / currentSessions) * 100 : null;
  const prevConversionRate = prevSessions > 0 ? (prevOrderCount / prevSessions) * 100 : null;

  const conversionYoY = (currentConversionRate !== null && prevConversionRate !== null && prevConversionRate > 0) ? ((currentConversionRate - prevConversionRate) / prevConversionRate) * 100 : null;
  const aovYoY = prevAOV > 0 ? ((currentAOV - prevAOV) / prevAOV) * 100 : null;
  const marginYoY = prevGrossMargin > 0 ? ((currentGrossMargin - prevGrossMargin) / prevGrossMargin) * 100 : null;
  const marginPerOrderYoY = prevMarginPerOrder > 0 ? ((currentMarginPerOrder - prevMarginPerOrder) / prevMarginPerOrder) * 100 : null;

  const salesEfficiencyMetrics = {
    conversionRate: { current: safeRound(currentConversionRate, 2), previous: safeRound(prevConversionRate, 2), yoyChange: safeRound(conversionYoY), score: calculateScore(conversionYoY) },
    aov: { current: currentAOV > 0 ? Math.round(currentAOV) : null, previous: prevAOV > 0 ? Math.round(prevAOV) : null, yoyChange: safeRound(aovYoY), score: calculateScore(aovYoY) },
    grossMargin: { current: safeRound(currentGrossMargin), previous: safeRound(prevGrossMargin), yoyChange: safeRound(marginYoY), score: calculateScore(marginYoY) },
    marginPerOrder: { current: currentMarginPerOrder > 0 ? Math.round(currentMarginPerOrder) : null, previous: prevMarginPerOrder > 0 ? Math.round(prevMarginPerOrder) : null, yoyChange: safeRound(marginPerOrderYoY), score: calculateScore(marginPerOrderYoY) },
    returnCustomerShare: { current: null, previous: null, yoyChange: null, score: 50 },
    ltvMultiplier: { current: null, previous: null, yoyChange: null, score: 50 }
  };
  const salesEfficiencyScore = Math.round(Object.values(salesEfficiencyMetrics).reduce((s, m) => s + m.score, 0) / 6);

  // Product leverage (simplified)
  const productLeverageMetrics = {
    top10Share: { current: null, previous: null, yoyChange: null, score: 50 },
    categoryAvgMargin: { current: safeRound(currentGrossMargin), previous: safeRound(prevGrossMargin), yoyChange: safeRound(marginYoY), score: calculateScore(marginYoY) },
    seoStockHealth: { current: null, previous: null, yoyChange: null, score: 50 }
  };
  const productLeverageScore = Math.round((productLeverageMetrics.top10Share.score + productLeverageMetrics.categoryAvgMargin.score + productLeverageMetrics.seoStockHealth.score) / 3);

  const overallIndex = Math.round(
    (demandGrowthScore * 0.25) + (trafficQualityScore * 0.15) + (salesEfficiencyScore * 0.40) + (productLeverageScore * 0.20)
  );

  return {
    overallIndex,
    indexLevel: getIndexLevel(overallIndex),
    demandGrowthScore,
    trafficQualityScore,
    salesEfficiencyScore,
    productLeverageScore,
    demandGrowthMetrics,
    trafficQualityMetrics,
    salesEfficiencyMetrics,
    productLeverageMetrics
  };
}

/**
 * Main function
 */
async function main() {
  console.log('Backfilling Growth Engine snapshots...\n');

  // Weeks to backfill (from Jan 2026)
  const weeksToCreate = [
    { year: 2026, week: 1 },
    { year: 2026, week: 2 },
    { year: 2026, week: 3 }
  ];

  for (const { year, week } of weeksToCreate) {
    const dates = getWeekDates(year, week);
    const periodLabel = `Viikko ${week}/${year}`;

    console.log(`Processing ${periodLabel} (${dates.start} to ${dates.end})...`);

    // Check if exists
    const { data: existing } = await supabase
      .from('growth_engine_snapshots')
      .select('id')
      .eq('store_id', STORE_ID)
      .eq('period_type', 'week')
      .eq('period_end', dates.end)
      .single();

    if (existing) {
      console.log(`  Already exists, skipping.`);
      continue;
    }

    try {
      const result = await calculateGrowthEngine(dates.start, dates.end);

      const { error } = await supabase
        .from('growth_engine_snapshots')
        .insert({
          store_id: STORE_ID,
          period_type: 'week',
          period_start: dates.start,
          period_end: dates.end,
          period_label: periodLabel,
          overall_index: result.overallIndex,
          index_level: result.indexLevel,
          demand_growth_score: result.demandGrowthScore,
          traffic_quality_score: result.trafficQualityScore,
          sales_efficiency_score: result.salesEfficiencyScore,
          product_leverage_score: result.productLeverageScore,
          demand_growth_metrics: result.demandGrowthMetrics,
          traffic_quality_metrics: result.trafficQualityMetrics,
          sales_efficiency_metrics: result.salesEfficiencyMetrics,
          product_leverage_metrics: result.productLeverageMetrics
        });

      if (error) {
        console.log(`  Error: ${error.message}`);
      } else {
        console.log(`  Saved! Index: ${result.overallIndex} (${result.indexLevel})`);
      }
    } catch (err) {
      console.log(`  Error calculating: ${err.message}`);
    }
  }

  console.log('\nBackfill complete!');

  // Show what we have
  const { data: snapshots } = await supabase
    .from('growth_engine_snapshots')
    .select('period_label, period_end, overall_index, index_level')
    .eq('store_id', STORE_ID)
    .order('period_end', { ascending: true });

  console.log('\nCurrent snapshots:');
  snapshots?.forEach(s => {
    console.log(`  ${s.period_label}: ${s.overall_index} (${s.index_level})`);
  });
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});

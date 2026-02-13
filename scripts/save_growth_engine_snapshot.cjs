/**
 * Save Growth Engine Snapshot
 *
 * This script calculates and saves the current Growth Engine index
 * to the growth_engine_snapshots table for historical tracking.
 *
 * Usage:
 *   node scripts/save_growth_engine_snapshot.cjs
 *   node scripts/save_growth_engine_snapshot.cjs --period-type=week
 *   node scripts/save_growth_engine_snapshot.cjs --period-type=month
 *
 * Run via cron every Monday for weekly snapshots.
 */

require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

// Configuration
const STORE_ID = 'a28836f6-9487-4b67-9194-e907eaf94b69';
const SUPABASE_URL = 'https://tlothekaphtiwvusgwzh.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

// Parse command line arguments
const args = process.argv.slice(2);
const periodTypeArg = args.find(a => a.startsWith('--period-type='));
const periodType = periodTypeArg ? periodTypeArg.split('=')[1] : 'week';

/**
 * Get ISO week number and dates
 */
function getISOWeekInfo(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 4 - (d.getDay() || 7));
  const yearStart = new Date(d.getFullYear(), 0, 1);
  const weekNumber = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);

  // Get Monday of this week
  const monday = new Date(date);
  const dayOfWeek = monday.getDay();
  monday.setDate(monday.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));

  // Get Sunday of this week
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  return {
    week: weekNumber,
    year: d.getFullYear(),
    start: monday.toISOString().split('T')[0],
    end: sunday.toISOString().split('T')[0]
  };
}

/**
 * Get month dates
 */
function getMonthInfo(date) {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = d.getMonth();

  const start = new Date(year, month, 1);
  const end = new Date(year, month + 1, 0);

  const monthNames = ['Tammikuu', 'Helmikuu', 'Maaliskuu', 'Huhtikuu', 'Toukokuu', 'Kesäkuu',
    'Heinäkuu', 'Elokuu', 'Syyskuu', 'Lokakuu', 'Marraskuu', 'Joulukuu'];

  return {
    month: month + 1,
    year,
    start: start.toISOString().split('T')[0],
    end: end.toISOString().split('T')[0],
    label: `${monthNames[month]} ${year}`
  };
}

/**
 * Calculate YoY score based on change percentage
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

/**
 * Get index level from score
 */
function getIndexLevel(score) {
  if (score >= 80) return 'excellent';
  if (score >= 60) return 'good';
  if (score >= 40) return 'needs_work';
  return 'poor';
}

/**
 * Safe round helper
 */
function safeRound(val, decimals = 1) {
  if (val === null || val === undefined) return null;
  const multiplier = Math.pow(10, decimals);
  return Math.round(val * multiplier) / multiplier;
}

/**
 * Calculate Growth Engine metrics for a period
 */
async function calculateGrowthEngine(startDate, endDate) {
  console.log(`Calculating Growth Engine for ${startDate} to ${endDate}...`);

  // YoY comparison dates
  const startDateObj = new Date(startDate);
  const endDateObj = new Date(endDate);
  const prevYearStart = new Date(startDateObj);
  prevYearStart.setFullYear(prevYearStart.getFullYear() - 1);
  const prevYearEnd = new Date(endDateObj);
  prevYearEnd.setFullYear(prevYearEnd.getFullYear() - 1);
  const prevStartStr = prevYearStart.toISOString().split('T')[0];
  const prevEndStr = prevYearEnd.toISOString().split('T')[0];

  // ============================================
  // 1. DEMAND GROWTH (GSC data)
  // ============================================
  const [
    { data: currentGscDaily },
    { data: prevGscDaily },
    { data: currentKeywords },
    { data: prevKeywords }
  ] = await Promise.all([
    supabase
      .from('v_gsc_daily_summary')
      .select('total_clicks, total_impressions')
      .eq('store_id', STORE_ID)
      .gte('date', startDate)
      .lte('date', endDate),
    supabase
      .from('v_gsc_daily_summary')
      .select('total_clicks, total_impressions')
      .eq('store_id', STORE_ID)
      .gte('date', prevStartStr)
      .lte('date', prevEndStr),
    supabase
      .from('gsc_search_analytics')
      .select('query, position')
      .eq('store_id', STORE_ID)
      .not('query', 'is', null)
      .gte('date', startDate)
      .lte('date', endDate),
    supabase
      .from('gsc_search_analytics')
      .select('query, position')
      .eq('store_id', STORE_ID)
      .not('query', 'is', null)
      .gte('date', prevStartStr)
      .lte('date', prevEndStr)
  ]);

  const currentClicks = currentGscDaily?.reduce((sum, d) => sum + (d.total_clicks || 0), 0) || 0;
  const prevClicks = prevGscDaily?.reduce((sum, d) => sum + (d.total_clicks || 0), 0) || 0;
  const clicksYoY = prevClicks > 0 ? ((currentClicks - prevClicks) / prevClicks) * 100 : null;

  const currentImpressions = currentGscDaily?.reduce((sum, d) => sum + (d.total_impressions || 0), 0) || 0;
  const prevImpressions = prevGscDaily?.reduce((sum, d) => sum + (d.total_impressions || 0), 0) || 0;
  const impressionsYoY = prevImpressions > 0 ? ((currentImpressions - prevImpressions) / prevImpressions) * 100 : null;

  // Top 10 keywords
  const currentTop10Map = new Map();
  currentKeywords?.forEach(row => {
    if (row.query) {
      const current = currentTop10Map.get(row.query);
      if (!current || row.position < current) {
        currentTop10Map.set(row.query, row.position);
      }
    }
  });
  const currentTop10 = Array.from(currentTop10Map.values()).filter(pos => pos <= 10).length;

  const prevTop10Map = new Map();
  prevKeywords?.forEach(row => {
    if (row.query) {
      const current = prevTop10Map.get(row.query);
      if (!current || row.position < current) {
        prevTop10Map.set(row.query, row.position);
      }
    }
  });
  const prevTop10 = Array.from(prevTop10Map.values()).filter(pos => pos <= 10).length;
  const top10YoY = prevTop10 > 0 ? ((currentTop10 - prevTop10) / prevTop10) * 100 : null;

  const demandGrowthMetrics = {
    organicClicks: { current: currentClicks, previous: prevClicks, yoyChange: safeRound(clicksYoY), score: calculateScore(clicksYoY) },
    impressions: { current: currentImpressions, previous: prevImpressions, yoyChange: safeRound(impressionsYoY), score: calculateScore(impressionsYoY) },
    top10Keywords: { current: currentTop10, previous: prevTop10, yoyChange: safeRound(top10YoY), score: calculateScore(top10YoY) }
  };
  const demandGrowthScore = Math.round(
    (demandGrowthMetrics.organicClicks.score + demandGrowthMetrics.impressions.score + demandGrowthMetrics.top10Keywords.score) / 3
  );

  // ============================================
  // 2. TRAFFIC QUALITY (GA4 data)
  // ============================================
  const [{ data: currentGA4 }, { data: prevGA4 }] = await Promise.all([
    supabase
      .from('v_ga4_daily_summary')
      .select('total_sessions, total_engaged_sessions')
      .eq('store_id', STORE_ID)
      .gte('date', startDate)
      .lte('date', endDate),
    supabase
      .from('v_ga4_daily_summary')
      .select('total_sessions, total_engaged_sessions')
      .eq('store_id', STORE_ID)
      .gte('date', prevStartStr)
      .lte('date', prevEndStr)
  ]);

  const currentSessions = currentGA4?.reduce((sum, d) => sum + (d.total_sessions || 0), 0) || 0;
  const currentEngaged = currentGA4?.reduce((sum, d) => sum + (d.total_engaged_sessions || 0), 0) || 0;
  const currentEngagementRate = currentSessions > 0 ? (currentEngaged / currentSessions) * 100 : 0;

  const prevSessions = prevGA4?.reduce((sum, d) => sum + (d.total_sessions || 0), 0) || 0;
  const prevEngaged = prevGA4?.reduce((sum, d) => sum + (d.total_engaged_sessions || 0), 0) || 0;
  const prevEngagementRate = prevSessions > 0 ? (prevEngaged / prevSessions) * 100 : 0;
  const engagementYoY = prevEngagementRate > 0 ? ((currentEngagementRate - prevEngagementRate) / prevEngagementRate) * 100 : null;

  // Organic share
  let currentOrganicShare = currentSessions > 0 ? Math.min((currentClicks / currentSessions) * 100, 100) : null;
  let prevOrganicShare = prevSessions > 0 ? Math.min((prevClicks / prevSessions) * 100, 100) : null;
  let organicShareYoY = (currentOrganicShare !== null && prevOrganicShare !== null && prevOrganicShare > 0)
    ? ((currentOrganicShare - prevOrganicShare) / prevOrganicShare) * 100
    : null;

  // Bounce rate (inverted)
  const currentBounceRate = currentSessions > 0 ? ((currentSessions - currentEngaged) / currentSessions) * 100 : null;
  const prevBounceRate = prevSessions > 0 ? ((prevSessions - prevEngaged) / prevSessions) * 100 : null;
  const bounceRateYoY = (prevBounceRate !== null && prevBounceRate > 0)
    ? -((currentBounceRate - prevBounceRate) / prevBounceRate) * 100
    : null;

  const trafficQualityMetrics = {
    engagementRate: { current: safeRound(currentEngagementRate), previous: safeRound(prevEngagementRate), yoyChange: safeRound(engagementYoY), score: calculateScore(engagementYoY) },
    organicShare: { current: safeRound(currentOrganicShare), previous: safeRound(prevOrganicShare), yoyChange: safeRound(organicShareYoY), score: calculateScore(organicShareYoY) },
    bounceRate: { current: safeRound(currentBounceRate), previous: safeRound(prevBounceRate), yoyChange: safeRound(bounceRateYoY), score: calculateScore(bounceRateYoY) }
  };
  const trafficQualityScore = Math.round(
    (trafficQualityMetrics.engagementRate.score + trafficQualityMetrics.organicShare.score + trafficQualityMetrics.bounceRate.score) / 3
  );

  // ============================================
  // 3. SALES EFFICIENCY (Orders data)
  // ============================================
  const [
    { data: currentOrders },
    { data: prevOrders },
    { data: products }
  ] = await Promise.all([
    supabase
      .from('orders')
      .select('id, grand_total, billing_email, order_line_items (quantity, total_price, product_number)')
      .eq('store_id', STORE_ID)
      .neq('status', 'cancelled')
      .gte('creation_date', startDate)
      .lte('creation_date', endDate + 'T23:59:59'),
    supabase
      .from('orders')
      .select('id, grand_total, billing_email, order_line_items (quantity, total_price, product_number)')
      .eq('store_id', STORE_ID)
      .neq('status', 'cancelled')
      .gte('creation_date', prevStartStr)
      .lte('creation_date', prevEndStr + 'T23:59:59'),
    supabase
      .from('products')
      .select('product_number, cost_price')
      .eq('store_id', STORE_ID)
  ]);

  // Build cost map
  const costMap = new Map();
  products?.forEach(p => {
    if (p.product_number && p.cost_price) {
      costMap.set(p.product_number, p.cost_price);
    }
  });

  // Current period
  const currentOrderCount = currentOrders?.length || 0;
  const currentRevenue = currentOrders?.reduce((sum, o) => sum + (o.grand_total || 0), 0) || 0;
  const currentAOV = currentOrderCount > 0 ? currentRevenue / currentOrderCount : 0;

  let currentCost = 0;
  currentOrders?.forEach(o => {
    o.order_line_items?.forEach(item => {
      const cost = costMap.get(item.product_number) || 0;
      currentCost += cost * (item.quantity || 1);
    });
  });
  const currentGrossProfit = currentRevenue - currentCost;
  const currentGrossMargin = currentRevenue > 0 ? (currentGrossProfit / currentRevenue) * 100 : 0;
  const currentMarginPerOrder = currentOrderCount > 0 ? currentGrossProfit / currentOrderCount : 0;

  // Previous period
  const prevOrderCount = prevOrders?.length || 0;
  const prevRevenue = prevOrders?.reduce((sum, o) => sum + (o.grand_total || 0), 0) || 0;
  const prevAOV = prevOrderCount > 0 ? prevRevenue / prevOrderCount : 0;

  let prevCost = 0;
  prevOrders?.forEach(o => {
    o.order_line_items?.forEach(item => {
      const cost = costMap.get(item.product_number) || 0;
      prevCost += cost * (item.quantity || 1);
    });
  });
  const prevGrossProfit = prevRevenue - prevCost;
  const prevGrossMargin = prevRevenue > 0 ? (prevGrossProfit / prevRevenue) * 100 : 0;
  const prevMarginPerOrder = prevOrderCount > 0 ? prevGrossProfit / prevOrderCount : 0;

  // Conversion rate
  const currentConversionRate = currentSessions > 0 ? (currentOrderCount / currentSessions) * 100 : null;
  const prevConversionRate = prevSessions > 0 ? (prevOrderCount / prevSessions) * 100 : null;

  // YoY calculations
  const conversionYoY = (currentConversionRate !== null && prevConversionRate !== null && prevConversionRate > 0)
    ? ((currentConversionRate - prevConversionRate) / prevConversionRate) * 100 : null;
  const aovYoY = prevAOV > 0 ? ((currentAOV - prevAOV) / prevAOV) * 100 : null;
  const marginYoY = prevGrossMargin > 0 ? ((currentGrossMargin - prevGrossMargin) / prevGrossMargin) * 100 : null;
  const marginPerOrderYoY = prevMarginPerOrder > 0 ? ((currentMarginPerOrder - prevMarginPerOrder) / prevMarginPerOrder) * 100 : null;

  // Simplified returning customer (use 50 as neutral)
  const returnShareYoY = null;
  const ltvYoY = null;

  const salesEfficiencyMetrics = {
    conversionRate: { current: safeRound(currentConversionRate, 2), previous: safeRound(prevConversionRate, 2), yoyChange: safeRound(conversionYoY), score: calculateScore(conversionYoY) },
    aov: { current: currentAOV > 0 ? Math.round(currentAOV) : null, previous: prevAOV > 0 ? Math.round(prevAOV) : null, yoyChange: safeRound(aovYoY), score: calculateScore(aovYoY) },
    grossMargin: { current: safeRound(currentGrossMargin), previous: safeRound(prevGrossMargin), yoyChange: safeRound(marginYoY), score: calculateScore(marginYoY) },
    marginPerOrder: { current: currentMarginPerOrder > 0 ? Math.round(currentMarginPerOrder) : null, previous: prevMarginPerOrder > 0 ? Math.round(prevMarginPerOrder) : null, yoyChange: safeRound(marginPerOrderYoY), score: calculateScore(marginPerOrderYoY) },
    returnCustomerShare: { current: null, previous: null, yoyChange: null, score: 50 },
    ltvMultiplier: { current: null, previous: null, yoyChange: null, score: 50 }
  };
  const salesEfficiencyScore = Math.round(
    (salesEfficiencyMetrics.conversionRate.score + salesEfficiencyMetrics.aov.score + salesEfficiencyMetrics.grossMargin.score +
     salesEfficiencyMetrics.marginPerOrder.score + salesEfficiencyMetrics.returnCustomerShare.score + salesEfficiencyMetrics.ltvMultiplier.score) / 6
  );

  // ============================================
  // 4. PRODUCT LEVERAGE
  // ============================================
  const productRevenue = new Map();
  currentOrders?.forEach(o => {
    o.order_line_items?.forEach(item => {
      const sku = item.product_number || 'unknown';
      productRevenue.set(sku, (productRevenue.get(sku) || 0) + (item.total_price || 0));
    });
  });
  const sortedProducts = Array.from(productRevenue.entries()).sort((a, b) => b[1] - a[1]);
  const top10Revenue = sortedProducts.slice(0, 10).reduce((sum, [, rev]) => sum + rev, 0);
  const currentTop10Share = currentRevenue > 0 ? (top10Revenue / currentRevenue) * 100 : 0;

  const prevProductRevenue = new Map();
  prevOrders?.forEach(o => {
    o.order_line_items?.forEach(item => {
      const sku = item.product_number || 'unknown';
      prevProductRevenue.set(sku, (prevProductRevenue.get(sku) || 0) + (item.total_price || 0));
    });
  });
  const prevSortedProducts = Array.from(prevProductRevenue.entries()).sort((a, b) => b[1] - a[1]);
  const prevTop10Revenue = prevSortedProducts.slice(0, 10).reduce((sum, [, rev]) => sum + rev, 0);
  const prevTop10Share = prevRevenue > 0 ? (prevTop10Revenue / prevRevenue) * 100 : 0;

  const top10ShareYoY = prevTop10Share > 0 ? ((currentTop10Share - prevTop10Share) / prevTop10Share) * 100 : null;

  // Stock health (simplified)
  const { data: stockData } = await supabase
    .from('products')
    .select('product_number, stock_level')
    .eq('store_id', STORE_ID)
    .eq('for_sale', true);

  const productsWithStock = stockData?.filter(s => (s.stock_level || 0) > 0).length || 0;
  const totalProducts = stockData?.length || 0;
  const currentStockHealth = totalProducts > 0 ? (productsWithStock / totalProducts) * 100 : 100;

  const productLeverageMetrics = {
    top10Share: { current: safeRound(currentTop10Share), previous: safeRound(prevTop10Share), yoyChange: safeRound(top10ShareYoY), score: calculateScore(top10ShareYoY) },
    categoryAvgMargin: { current: safeRound(currentGrossMargin), previous: safeRound(prevGrossMargin), yoyChange: safeRound(marginYoY), score: calculateScore(marginYoY) },
    seoStockHealth: { current: safeRound(currentStockHealth), previous: null, yoyChange: null, score: 50 }
  };
  const productLeverageScore = Math.round(
    (productLeverageMetrics.top10Share.score + productLeverageMetrics.categoryAvgMargin.score + productLeverageMetrics.seoStockHealth.score) / 3
  );

  // ============================================
  // CALCULATE OVERALL INDEX
  // ============================================
  const overallIndex = Math.round(
    (demandGrowthScore * 0.25) +
    (trafficQualityScore * 0.15) +
    (salesEfficiencyScore * 0.40) +
    (productLeverageScore * 0.20)
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
  console.log('='.repeat(60));
  console.log('Growth Engine Snapshot');
  console.log('='.repeat(60));
  console.log(`Period type: ${periodType}`);
  console.log(`Store ID: ${STORE_ID}`);
  console.log('');

  let periodStart, periodEnd, periodLabel;

  if (periodType === 'week') {
    // Use the previous completed week
    const today = new Date();
    const weekInfo = getISOWeekInfo(today);

    // If it's Monday, use last week; otherwise use the week before
    const dayOfWeek = today.getDay();
    let targetDate = new Date(today);

    if (dayOfWeek === 1) {
      // Monday - use last week
      targetDate.setDate(today.getDate() - 7);
    } else {
      // Other day - use the week before last
      targetDate.setDate(today.getDate() - 7 - dayOfWeek + 1);
    }

    const prevWeekInfo = getISOWeekInfo(targetDate);
    periodStart = prevWeekInfo.start;
    periodEnd = prevWeekInfo.end;
    periodLabel = `Viikko ${prevWeekInfo.week}/${prevWeekInfo.year}`;
  } else {
    // Use the previous completed month
    const today = new Date();
    const prevMonth = today.getMonth() === 0 ? 11 : today.getMonth() - 1;
    const prevYear = today.getMonth() === 0 ? today.getFullYear() - 1 : today.getFullYear();

    const monthInfo = getMonthInfo(new Date(prevYear, prevMonth, 15));
    periodStart = monthInfo.start;
    periodEnd = monthInfo.end;
    periodLabel = monthInfo.label;
  }

  console.log(`Period: ${periodLabel}`);
  console.log(`Date range: ${periodStart} to ${periodEnd}`);
  console.log('');

  // Check if snapshot already exists
  const { data: existing } = await supabase
    .from('growth_engine_snapshots')
    .select('id')
    .eq('store_id', STORE_ID)
    .eq('period_type', periodType)
    .eq('period_end', periodEnd)
    .single();

  if (existing) {
    console.log('Snapshot already exists for this period. Updating...');
  }

  // Calculate Growth Engine
  const result = await calculateGrowthEngine(periodStart, periodEnd);

  console.log('');
  console.log('Results:');
  console.log(`  Overall Index: ${result.overallIndex} (${result.indexLevel})`);
  console.log(`  Demand Growth: ${result.demandGrowthScore}`);
  console.log(`  Traffic Quality: ${result.trafficQualityScore}`);
  console.log(`  Sales Efficiency: ${result.salesEfficiencyScore}`);
  console.log(`  Product Leverage: ${result.productLeverageScore}`);
  console.log('');

  // Save to database
  const { data: saved, error } = await supabase
    .from('growth_engine_snapshots')
    .upsert({
      store_id: STORE_ID,
      period_type: periodType,
      period_start: periodStart,
      period_end: periodEnd,
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
    }, {
      onConflict: 'store_id,period_type,period_end'
    })
    .select()
    .single();

  if (error) {
    console.error('Error saving snapshot:', error.message);
    process.exit(1);
  }

  console.log('Snapshot saved successfully!');
  console.log(`ID: ${saved.id}`);
  console.log('='.repeat(60));
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});

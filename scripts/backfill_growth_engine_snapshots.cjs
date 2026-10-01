/**
 * Recalculate stored Growth Engine snapshots with the cron's own logic.
 *
 * The weekly cron (api/cron/save-growth-snapshot.js) writes a week once and never
 * again, so a snapshot computed from wrong data stays wrong: until 2026-10-01 the
 * orders behind every snapshot included rejected ones. This reruns
 * calculateGrowthEngine for every stored weekly row of every shop and updates the
 * row in place (same id, period and label).
 *
 * Dry run by default; prints old and new index per week. Pass --write to update.
 *
 * Usage:
 *   node scripts/backfill_growth_engine_snapshots.cjs [store_id] [--write]
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });
const { createClient } = require('@supabase/supabase-js');

async function main() {
  // Imported after dotenv so the module sees the environment it reads at load time
  const { calculateGrowthEngine } = await import('../api/cron/save-growth-snapshot.js');

  const args = process.argv.slice(2);
  const write = args.includes('--write');
  const onlyStore = args.find(a => !a.startsWith('--'));
  const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  const { data: shops, error: shopsError } = await supabase.from('shops').select('name, store_id');
  if (shopsError) throw shopsError;

  for (const shop of shops) {
    if (!shop.store_id || (onlyStore && shop.store_id !== onlyStore)) continue;

    const { data: rows, error } = await supabase
      .from('growth_engine_snapshots')
      .select('id, period_start, period_end, period_label, overall_index, sales_efficiency_metrics')
      .eq('store_id', shop.store_id)
      .eq('period_type', 'week')
      .order('period_end', { ascending: true });
    if (error) throw error;

    console.log(`\n${write ? 'WRITE' : 'DRY RUN'} ${shop.name}: ${rows.length} weekly snapshots`);
    for (const row of rows) {
      const r = await calculateGrowthEngine(supabase, shop.store_id, row.period_start, row.period_end);
      console.log(`${row.period_label} ${row.period_start}..${row.period_end}  index ${row.overall_index} -> ${r.overallIndex}` +
        `  AOV ${row.sales_efficiency_metrics?.aov?.current} -> ${r.salesEfficiencyMetrics.aov.current}`);

      if (!write) continue;
      const { error: updateError } = await supabase
        .from('growth_engine_snapshots')
        .update({
          overall_index: r.overallIndex,
          index_level: r.indexLevel,
          demand_growth_score: r.demandGrowthScore,
          traffic_quality_score: r.trafficQualityScore,
          sales_efficiency_score: r.salesEfficiencyScore,
          product_leverage_score: r.productLeverageScore,
          demand_growth_metrics: r.demandGrowthMetrics,
          traffic_quality_metrics: r.trafficQualityMetrics,
          sales_efficiency_metrics: r.salesEfficiencyMetrics,
          product_leverage_metrics: r.productLeverageMetrics
        })
        .eq('id', row.id);
      if (updateError) throw updateError;
    }
  }
}

main().catch(e => { console.error(e); process.exit(1); });

/**
 * Verify Goal Revenue Calculation
 *
 * This script verifies that calculate_goal_progress uses orders.grand_total
 * instead of order_line_items.total_price for revenue calculations.
 *
 * Expected: 76,584 kr for January 2026
 * Old (wrong): 72,182 kr (missing shipping, taxes, discounts)
 */

const { supabase, STORE_ID } = require('./db.cjs');

async function verifyGoalCalculation() {
  console.log('🔍 Verifying Goal Revenue Calculation\n');
  console.log('Store ID:', STORE_ID);
  console.log('Period: January 2026\n');

  // 1. Direct query: grand_total (CORRECT)
  console.log('📊 Method 1: Direct grand_total sum (CORRECT)');
  const { data: orders, error: ordersError } = await supabase
    .from('orders')
    .select('grand_total, status')
    .eq('store_id', STORE_ID)
    .gte('creation_date', '2026-01-01')
    .lte('creation_date', '2026-01-31');

  if (ordersError) {
    console.error('❌ Error fetching orders:', ordersError);
    return;
  }

  const nonCancelled = orders.filter(o => o.status !== 'cancelled');
  const grandTotalSum = nonCancelled.reduce((sum, o) => sum + parseFloat(o.grand_total || 0), 0);

  console.log('   Orders:', nonCancelled.length);
  console.log('   Grand total:', grandTotalSum.toLocaleString('sv-SE'), 'kr\n');

  // 2. RPC function result
  console.log('📊 Method 2: calculate_goal_progress RPC');

  const { data: rpcResult, error: rpcError } = await supabase.rpc('calculate_goal_progress', {
    p_store_id: STORE_ID
  });

  if (rpcError) {
    console.error('❌ RPC error:', rpcError);
    return;
  }

  console.log('   Updated', rpcResult, 'goals\n');

  // 3. Check merchant_goals
  const { data: goals, error: goalsError } = await supabase
    .from('merchant_goals')
    .select('goal_type, period_label, current_value, last_calculated_at')
    .eq('store_id', STORE_ID)
    .eq('goal_type', 'revenue')
    .eq('period_label', '2026-01')
    .single();

  if (goalsError) {
    console.error('❌ Error fetching goal:', goalsError);
    return;
  }

  const rpcValue = parseFloat(goals.current_value);
  console.log('   RPC value:', rpcValue.toLocaleString('sv-SE'), 'kr');
  console.log('   Updated:', new Date(goals.last_calculated_at).toLocaleString('sv-SE'));
  console.log('');

  // 4. Compare
  const diff = rpcValue - grandTotalSum;
  const diffPercent = (diff / grandTotalSum * 100).toFixed(2);

  console.log('═'.repeat(60));
  console.log('📊 COMPARISON\n');
  console.log('   Expected (grand_total):     ', grandTotalSum.toLocaleString('sv-SE'), 'kr');
  console.log('   RPC function result:        ', rpcValue.toLocaleString('sv-SE'), 'kr');
  console.log('   Difference:                 ', diff.toLocaleString('sv-SE'), 'kr', `(${diffPercent}%)`);
  console.log('');

  if (Math.abs(diff) < 100) {
    console.log('✅ PASS: Function is using grand_total correctly!');
    console.log('   The migration has been successfully applied.\n');
  } else {
    console.log('❌ FAIL: Function is still using old logic (line_items)');
    console.log('   Expected difference: < 100 kr');
    console.log('   Actual difference:', Math.abs(diff).toLocaleString('sv-SE'), 'kr\n');
    console.log('💡 ACTION REQUIRED:');
    console.log('   1. Open Supabase SQL Editor:');
    console.log('      https://supabase.com/dashboard/project/tlothekaphtiwvusgwzh/sql');
    console.log('   2. Run migration:');
    console.log('      supabase/migrations/20260116_fix_goal_revenue_calculation.sql');
    console.log('   3. Re-run this script to verify\n');
  }

  console.log('═'.repeat(60));
}

verifyGoalCalculation().catch(console.error);

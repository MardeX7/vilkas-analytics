/**
 * Fix inventory snapshot calculation
 * Korjaa RPC-funktion ja poistaa virheelliset 0-arvoiset snapshotit
 */

const { supabase, printProjectInfo } = require('./db.cjs')

async function fixInventorySnapshot() {
  printProjectInfo()

  console.log('\n📦 Fixing inventory snapshot calculation...\n')

  // 1. Poista vanhat virheelliset snapshotit
  console.log('1️⃣ Deleting snapshots with stock_value = 0...')
  const { data: deleted, error: deleteError } = await supabase
    .from('inventory_snapshots')
    .delete()
    .eq('stock_value', 0)
    .select('id')

  if (deleteError) {
    console.error('❌ Delete error:', deleteError.message)
  } else {
    console.log(`   ✅ Deleted ${deleted?.length || 0} bad snapshots`)
  }

  // 2. Tarkista jäljellä olevat snapshotit
  console.log('\n2️⃣ Checking remaining snapshots...')
  const { data: remaining, error: remainError } = await supabase
    .from('inventory_snapshots')
    .select('snapshot_date, stock_value')
    .order('snapshot_date', { ascending: false })
    .limit(10)

  if (remainError) {
    console.error('❌ Query error:', remainError.message)
  } else if (remaining?.length === 0) {
    console.log('   ℹ️ No snapshots remaining (all were 0-value)')
  } else {
    console.log('   Recent snapshots:')
    remaining.forEach(s => {
      console.log(`   ${s.snapshot_date}: ${s.stock_value?.toLocaleString()} kr`)
    })
  }

  // 3. Huomautus RPC-funktion päivityksestä
  console.log('\n3️⃣ RPC function update required!')
  console.log('   ⚠️ Run the following SQL in Supabase Dashboard:')
  console.log('   https://supabase.com/dashboard/project/tlothekaphtiwvusgwzh/sql')
  console.log(`
CREATE OR REPLACE FUNCTION create_daily_inventory_snapshot(
    p_store_id UUID DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_count INTEGER := 0;
BEGIN
    INSERT INTO inventory_snapshots (store_id, product_id, snapshot_date, stock_level, stock_value)
    SELECT
        p.store_id,
        p.id,
        CURRENT_DATE,
        COALESCE(p.stock_level, 0),
        COALESCE(p.stock_level, 0) * COALESCE(p.cost_price, p.price_amount * 0.6, 0)
    FROM products p
    WHERE p.for_sale = true
      AND (p_store_id IS NULL OR p.store_id = p_store_id)
    ON CONFLICT (store_id, product_id, snapshot_date)
    DO UPDATE SET
        stock_level = EXCLUDED.stock_level,
        stock_value = EXCLUDED.stock_value;

    GET DIAGNOSTICS v_count = ROW_COUNT;

    INSERT INTO kpi_calculation_log (store_id, calculation_type, status, metrics, completed_at)
    VALUES (
        COALESCE(p_store_id, '00000000-0000-0000-0000-000000000000'::UUID),
        'inventory_snapshot',
        'completed',
        jsonb_build_object('rows_affected', v_count, 'snapshot_date', CURRENT_DATE),
        NOW()
    );

    RETURN v_count;
END;
$$;
  `)

  console.log('\n✅ Done! After updating RPC, run cron job or wait for 08:00.')
}

fixInventorySnapshot().catch(console.error)

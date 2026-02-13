const { supabase } = require('./db.cjs');

async function checkSchema() {
  // Hae products taulun sarakkeet
  const { data: products, error } = await supabase
    .from('products')
    .select('*')
    .limit(1);

  if (error) {
    console.log('Products error:', error);
    return;
  }

  console.log('=== PRODUCTS TAULUN SARAKKEET ===');
  if (products && products.length > 0) {
    console.log(Object.keys(products[0]));
    console.log('');
    console.log('Esimerkkirivi:');
    console.log(JSON.stringify(products[0], null, 2));
  }

  // Kokeile hakea product_variations taulu
  const { data: variations, error: varErr } = await supabase
    .from('product_variations')
    .select('*')
    .limit(3);

  if (varErr) {
    console.log('');
    console.log('product_variations taulu:', varErr.message);
  } else if (variations && variations.length > 0) {
    console.log('');
    console.log('=== PRODUCT_VARIATIONS TAULU LÖYTYI ===');
    console.log('Sarakkeet:', Object.keys(variations[0]));
    console.log('Esimerkkejä:', variations.length);
    variations.forEach(v => console.log(JSON.stringify(v, null, 2)));
  }

  // Tarkista inventory_snapshots rakenne
  const { data: snapshots, error: snapErr } = await supabase
    .from('inventory_snapshots')
    .select('*')
    .limit(1);

  if (snapErr) {
    console.log('');
    console.log('inventory_snapshots error:', snapErr.message);
  } else if (snapshots && snapshots.length > 0) {
    console.log('');
    console.log('=== INVENTORY_SNAPSHOTS SARAKKEET ===');
    console.log(Object.keys(snapshots[0]));
    console.log('Esimerkki:', JSON.stringify(snapshots[0], null, 2));
  }

  // Tilastot products-taulusta
  const { data: stockStats, error: statsErr } = await supabase
    .from('products')
    .select('stock_level')
    .gt('stock_level', 0)
    .limit(1000);

  if (stockStats) {
    console.log('');
    console.log('=== PRODUCTS SALDOTILASTOT ===');
    console.log('Tuotteita joilla stock_level > 0:', stockStats.length);

    // Näytä muutama esimerkki tuotteista joilla on saldoa
    const { data: withStock } = await supabase
      .from('products')
      .select('id, name, stock_level, price')
      .gt('stock_level', 0)
      .limit(5);

    if (withStock && withStock.length > 0) {
      console.log('');
      console.log('Tuotteita joilla on saldoa:');
      withStock.forEach(p => {
        console.log(`  - ${p.name?.substring(0, 40)}: saldo=${p.stock_level}, hinta=${p.price}`);
      });
    }
  }

  // Tarkista inventory_snapshots viimeisimmät
  const today = new Date().toISOString().split('T')[0];
  const { data: todaySnapshots, error: todayErr } = await supabase
    .from('inventory_snapshots')
    .select('product_id, stock_level, snapshot_date')
    .eq('snapshot_date', today)
    .gt('stock_level', 0)
    .limit(10);

  console.log('');
  console.log('=== TÄMÄN PÄIVÄN SNAPSHOTS (saldo > 0) ===');
  console.log('Päivämäärä:', today);
  if (todayErr) {
    console.log('Error:', todayErr.message);
  } else {
    console.log('Snapshotteja joilla saldo > 0:', todaySnapshots?.length || 0);
    if (todaySnapshots && todaySnapshots.length > 0) {
      todaySnapshots.forEach(s => {
        console.log(`  Product ${s.product_id}: saldo=${s.stock_level}`);
      });
    }
  }
}

checkSchema().catch(console.error);

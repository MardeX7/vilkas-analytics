const { supabase, printProjectInfo } = require('./db.cjs');

async function checkInventoryTables() {
  printProjectInfo();

  console.log('\n📋 Tarkistetaan inventory-taulut...\n');

  const possibleTables = [
    'inventory_snapshots',
    'inventory',
    'product_inventory',
    'stock_snapshots'
  ];

  for (const tableName of possibleTables) {
    const { data, error } = await supabase
      .from(tableName)
      .select('*', { count: 'exact', head: true });

    if (!error) {
      console.log('  ✅', tableName, '- LÖYTYI');
    } else if (error.code === 'PGRST116' || error.message.includes('does not exist')) {
      console.log('  ❌', tableName, '- Ei olemassa');
    } else {
      console.log('  ⚠️', tableName, '- Virhe:', error.message);
    }
  }

  console.log('\n📋 Tarkistetaan kaikki käytettävissä olevat taulut...\n');

  const commonTables = [
    'shops',
    'orders',
    'products',
    'gsc_search_analytics',
    'ga4_ecommerce',
    'ga4_tokens',
    'indicators',
    'indicator_history',
    'alerts'
  ];

  for (const tableName of commonTables) {
    const { error } = await supabase
      .from(tableName)
      .select('*', { count: 'exact', head: true });

    if (!error) {
      console.log('  ✅', tableName);
    } else if (error.code !== 'PGRST116' && !error.message.includes('does not exist')) {
      console.log('  ⚠️', tableName, '-', error.message);
    }
  }
}

checkInventoryTables().catch(console.error);

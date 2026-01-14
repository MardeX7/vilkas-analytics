const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function check() {
  // Try common table names for category mapping
  const possibleNames = [
    'kategori_produkttilldelning',
    'category_product_mapping',
    'product_categories',
    'kategori_produkt',
    'product_category_mapping',
    'categories_products'
  ];

  for (const tableName of possibleNames) {
    const { data, error } = await supabase
      .from(tableName)
      .select('*')
      .limit(3);

    if (!error && data && data.length > 0) {
      console.log('Found table:', tableName);
      console.log('Columns:', Object.keys(data[0]));
      console.log('Sample rows:');
      data.forEach(row => console.log(JSON.stringify(row)));
      return tableName;
    }
  }

  console.log('No category mapping table found with common names.');
  console.log('Checking all public tables...');

  // Get all tables via information_schema
  const { data: allData, error: allError } = await supabase
    .from('information_schema.tables')
    .select('table_name')
    .eq('table_schema', 'public');

  if (allError) {
    console.log('Cannot query information_schema, trying direct query...');
  }
}

check();

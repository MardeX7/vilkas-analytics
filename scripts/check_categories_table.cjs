const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function check() {
  // Check categories table
  const { data: cats, error: catsErr } = await supabase
    .from('categories')
    .select('*')
    .limit(10);

  if (!catsErr && cats) {
    console.log('=== categories table ===');
    console.log('Columns:', Object.keys(cats[0] || {}));
    console.log('Sample rows:');
    cats.forEach(row => console.log(JSON.stringify(row)));
  } else {
    console.log('categories table error:', catsErr?.message);
  }

  // Check product_categories count
  const { count } = await supabase
    .from('product_categories')
    .select('*', { count: 'exact', head: true });
  console.log('\n=== product_categories count:', count);

  // Check products table - get sample with product_number (SKU)
  const { data: prods } = await supabase
    .from('products')
    .select('id, product_number, name')
    .limit(3);
  console.log('\n=== products sample ===');
  prods?.forEach(p => console.log(p.id, '|', p.product_number, '|', p.name?.substring(0, 40)));

  // Check order_items to see how to join
  const { data: items } = await supabase
    .from('order_items')
    .select('sku, name, line_total')
    .limit(3);
  console.log('\n=== order_items sample ===');
  items?.forEach(i => console.log(i.sku, '|', i.name?.substring(0, 40), '|', i.line_total));
}

check();

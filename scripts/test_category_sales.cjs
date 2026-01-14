const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const STORE_ID = 'a28836f6-9487-4b67-9194-e907eaf94b69';
const SHOP_ID = '3b93e9b1-d64c-4686-a14a-bec535495f71';

async function testCategorySales() {
  // 1. Get date range (last 30 days)
  const endDate = new Date().toISOString().split('T')[0];
  const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  console.log('Date range:', startDate, 'to', endDate);

  // 2. Get order IDs for the period
  const { data: orders } = await supabase
    .from('orders')
    .select('id')
    .eq('store_id', STORE_ID)
    .gte('creation_date', startDate)
    .lte('creation_date', endDate + 'T23:59:59')
    .neq('status', 'cancelled');

  console.log('Orders in period:', orders?.length);
  const orderIds = orders?.map(o => o.id) || [];

  // 3. Get order_items for those orders
  const { data: items } = await supabase
    .from('order_items')
    .select('sku, name, quantity, line_total')
    .eq('shop_id', SHOP_ID)
    .in('order_id', orderIds);

  console.log('Order items:', items?.length);
  const totalSales = items?.reduce((sum, i) => sum + (i.line_total || 0), 0);
  console.log('Total sales from order_items:', totalSales, 'kr');

  // 4. Get products with their categories
  const { data: products } = await supabase
    .from('products')
    .select('id, product_number, name, cost_price')
    .eq('store_id', STORE_ID);

  console.log('Products:', products?.length);

  // 5. Get product_categories mappings
  const { data: productCategories } = await supabase
    .from('product_categories')
    .select('product_id, category_id');

  console.log('Product category mappings:', productCategories?.length);

  // 6. Get categories with level3
  const { data: categories } = await supabase
    .from('categories')
    .select('id, level3, display_name')
    .eq('store_id', STORE_ID);

  console.log('Categories:', categories?.length);

  // Build lookup maps
  const skuToProductId = new Map();
  const skuToCost = new Map();
  products?.forEach(p => {
    if (p.product_number) {
      skuToProductId.set(p.product_number, p.id);
      skuToCost.set(p.product_number, p.cost_price || 0);
    }
  });

  const productIdToCategories = new Map();
  productCategories?.forEach(pc => {
    if (!productIdToCategories.has(pc.product_id)) {
      productIdToCategories.set(pc.product_id, []);
    }
    productIdToCategories.get(pc.product_id).push(pc.category_id);
  });

  const categoryIdToLevel3 = new Map();
  categories?.forEach(c => {
    categoryIdToLevel3.set(c.id, c.level3 || c.display_name);
  });

  // 7. Aggregate sales by category (level3)
  const categoryMap = new Map();
  let matchedItems = 0;
  let unmatchedItems = 0;

  items?.forEach(item => {
    const sku = item.sku;
    const revenue = item.line_total || 0;
    const qty = item.quantity || 1;

    const productId = skuToProductId.get(sku);
    if (!productId) {
      unmatchedItems++;
      // Put in "Kategorisoimaton"
      const cat = 'Kategorisoimaton';
      if (!categoryMap.has(cat)) {
        categoryMap.set(cat, { revenue: 0, cost: 0, items: 0, products: new Set() });
      }
      const entry = categoryMap.get(cat);
      entry.revenue += revenue;
      entry.cost += revenue * 0.3; // Estimate 30% cost
      entry.items += qty;
      entry.products.add(sku);
      return;
    }

    matchedItems++;
    const categoryIds = productIdToCategories.get(productId) || [];
    const costPrice = skuToCost.get(sku) || 0;
    const cost = costPrice > 0 ? costPrice * qty : revenue * 0.3;

    if (categoryIds.length === 0) {
      // No category mapping
      const cat = 'Kategorisoimaton';
      if (!categoryMap.has(cat)) {
        categoryMap.set(cat, { revenue: 0, cost: 0, items: 0, products: new Set() });
      }
      const entry = categoryMap.get(cat);
      entry.revenue += revenue;
      entry.cost += cost;
      entry.items += qty;
      entry.products.add(sku);
      return;
    }

    // Split revenue among categories (or use first category)
    // For simplicity, use first category
    const catId = categoryIds[0];
    const catName = categoryIdToLevel3.get(catId) || 'Okänd';

    if (!categoryMap.has(catName)) {
      categoryMap.set(catName, { revenue: 0, cost: 0, items: 0, products: new Set() });
    }
    const entry = categoryMap.get(catName);
    entry.revenue += revenue;
    entry.cost += cost;
    entry.items += qty;
    entry.products.add(sku);
  });

  console.log('\nMatched items:', matchedItems);
  console.log('Unmatched items:', unmatchedItems);

  // 8. Sort and display results
  const results = Array.from(categoryMap.entries())
    .map(([name, data]) => ({
      category: name,
      revenue: data.revenue,
      cost: data.cost,
      profit: data.revenue - data.cost,
      marginPercent: data.revenue > 0 ? ((data.revenue - data.cost) / data.revenue) * 100 : 0,
      items: data.items,
      products: data.products.size
    }))
    .sort((a, b) => b.revenue - a.revenue);

  console.log('\n=== TOP 10 Categories by Revenue ===');
  results.slice(0, 10).forEach((r, i) => {
    console.log(`${i + 1}. ${r.category}: ${Math.round(r.revenue)} kr | Margin: ${r.marginPercent.toFixed(1)}% | Products: ${r.products}`);
  });

  console.log('\n=== BOTTOM 10 Categories by Margin ===');
  const byMargin = [...results].sort((a, b) => a.marginPercent - b.marginPercent);
  byMargin.slice(0, 10).forEach((r, i) => {
    console.log(`${i + 1}. ${r.category}: ${Math.round(r.revenue)} kr | Margin: ${r.marginPercent.toFixed(1)}%`);
  });

  const totalRevenue = results.reduce((sum, r) => sum + r.revenue, 0);
  console.log('\nTotal categorized revenue:', Math.round(totalRevenue), 'kr');
}

testCategorySales();
